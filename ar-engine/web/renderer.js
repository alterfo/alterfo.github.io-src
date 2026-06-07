// renderer.js — WebGPU setup, texture manager, pass manager, render loop.
// Exports: initRenderer, startLoop, stopLoop, getDevice, getTextures,
//          getPasses, getOffscreenCanvas, getOffscreenContext, setOnRecordFrame.

import { getAudioFrame } from './audio.js';

export const SIM_WIDTH  = 960;    // simulation resolution (= display)
export const SIM_HEIGHT = 540;
export const WIDTH  = SIM_WIDTH;  // alias used by pipelines
export const HEIGHT = SIM_HEIGHT;
export const PREVIEW_WIDTH  = 960;   // display canvas resolution
export const PREVIEW_HEIGHT = 540;
export const RECORD_WIDTH  = 1920;   // record/export resolution
export const RECORD_HEIGHT = 1080;

let _device   = null;
let _adapter  = null;
let _canvas   = null;
let _context  = null;
let _presentFormat = null;

let _offscreenCanvas  = null;
let _offscreenContext = null;

let _texMgr  = null;
let _passMgr = null;

let _running    = false;
let _rafId      = null;
let _frameTicks = [];        // fn(frame, timestamp) called each frame before passes
let _onRecordFrame = null;   // fn(offscreenCanvas, timestamp) set by record.js
let _lastFrameTime = 0;

// GPU tier: 'low' | 'mid' | 'high' — set during initRenderer
let _gpuTier = 'mid';

function _detectGpuTier(adapter, info) {
    const desc   = (info?.description ?? info?.renderer ?? '').toLowerCase();
    const vendor = (info?.vendor      ?? '').toLowerCase();

    // Apple Silicon unified memory — treat as high (excellent GPU)
    if (vendor === 'apple' || desc.includes('apple m')) return 'high';

    // Known discrete: NVIDIA / AMD / Intel Arc
    if (vendor === 'nvidia' || desc.includes('nvidia') || desc.includes('geforce') ||
        desc.includes('rtx')  || desc.includes('gtx')) return 'high';
    if (vendor === 'amd' || desc.includes('radeon') || desc.includes('rx ')   ||
        desc.includes('vega') || desc.includes('navi')) return 'high';

    // Known integrated: Intel HD/UHD/Iris
    if (vendor === 'intel' || desc.includes('intel') || desc.includes('uhd') ||
        desc.includes('iris') || desc.includes('hd graphics')) return 'low';

    // Fallback: use maxStorageBufferBindingSize as GPU tier proxy.
    // Discrete GPUs typically expose ≥ 1 GB; integrated cap at 256 MB.
    const maxBuf = adapter.limits.maxStorageBufferBindingSize ?? 0;
    if (maxBuf >= 1_073_741_824) return 'high';   // ≥ 1 GB → discrete
    if (maxBuf <= 268_435_456)   return 'low';    // ≤ 256 MB → integrated

    return 'mid';
}

export function getGpuTier() { return _gpuTier; }

// Particle counts scaled to GPU tier (safe defaults — avoids system hangs on integrated GPUs)
const PARTICLE_COUNTS = { low: 150_000, mid: 300_000, high: 500_000 };
export function getRecommendedParticleCount() { return PARTICLE_COUNTS[_gpuTier]; }

// Idle frame interval: ~20 fps when no audio, full 60 fps when playing
const IDLE_FRAME_MS = 50;

// ---- TextureManager -------------------------------------------------------
// Creates and tracks named GPUTextures; supports ping-pong swap by name.
class TextureManager {
    constructor(device) {
        this._d = device;
        this._t = {};
    }

    create(name, width = WIDTH, height = HEIGHT, format = 'rgba32float', usage = null) {
        const defaultUsage =
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.STORAGE_BINDING  |
            GPUTextureUsage.COPY_SRC         |
            GPUTextureUsage.COPY_DST;
        const tex = this._d.createTexture({
            label: name,
            size: [width, height],
            format,
            usage: usage ?? defaultUsage,
        });
        this._t[name] = tex;
        return tex;
    }

    get(name)    { return this._t[name]; }
    view(name)   { return this._t[name].createView(); }

    swap(a, b)   { [this._t[a], this._t[b]] = [this._t[b], this._t[a]]; }

    destroy() {
        for (const t of Object.values(this._t)) t.destroy();
        this._t = {};
    }
}

// ---- PassManager ----------------------------------------------------------
// Each pass descriptor:
//   { label, pipeline, bindGroupFn, dispatch }
//   dispatch: { type:'compute', x, y, z }
//           | { type:'render',  targetView?, clearValue?, drawCount? }
//
// bindGroupFn() is called each frame so it can reference the current
// ping-pong state from TextureManager.
class PassManager {
    constructor() { this._passes = []; }

    add(pass)  { this._passes.push(pass); return this; }
    clear()    { this._passes = []; }
    get count(){ return this._passes.length; }

    run(encoder, swapTexture) {
        for (const p of this._passes) {
            const bg = typeof p.bindGroupFn === 'function' ? p.bindGroupFn() : (p.bindGroup ?? null);

            if (p.dispatch.type === 'compute') {
                const cp = encoder.beginComputePass({ label: p.label });
                cp.setPipeline(p.pipeline);
                if (bg) cp.setBindGroup(0, bg);
                cp.dispatchWorkgroups(
                    p.dispatch.x,
                    p.dispatch.y,
                    p.dispatch.z ?? 1,
                );
                cp.end();

            } else {
                const view = p.dispatch.targetView ?? swapTexture.createView();
                const rp = encoder.beginRenderPass({
                    label: p.label,
                    colorAttachments: [{
                        view,
                        clearValue: p.dispatch.clearValue ?? { r: 0, g: 0, b: 0, a: 1 },
                        loadOp:  p.dispatch.loadOp ?? 'load',
                        storeOp: 'store',
                    }],
                });
                rp.setPipeline(p.pipeline);
                if (bg) rp.setBindGroup(0, bg);
                if (p.dispatch.drawCount) rp.draw(p.dispatch.drawCount);
                rp.end();
            }
        }
    }
}

// ---- init -----------------------------------------------------------------
// Call once with the <canvas> element. Returns { device, textures, passes }.
// Throws if WebGPU is not supported.
export async function initRenderer(canvas) {
    _canvas = canvas;

    if (!navigator.gpu) {
        throw new Error('WebGPU not supported — requires Chrome 113+');
    }

    _adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!_adapter) throw new Error('No WebGPU adapter found');

    const requiredFeatures = [];
    if (_adapter.features.has('float32-filterable')) {
        requiredFeatures.push('float32-filterable');
    }

    _device = await _adapter.requestDevice({
        label: 'fluid-engine',
        requiredFeatures,
    });

    _device.addEventListener('uncapturederror', e => {
        console.error('[WebGPU] uncaptured device error:', e.error.message ?? e.error);
    });

    // Canvas (preview) context
    _presentFormat = navigator.gpu.getPreferredCanvasFormat();
    _context = canvas.getContext('webgpu');
    _context.configure({
        device: _device,
        format: _presentFormat,
        alphaMode: 'opaque',
    });

    // Hidden HTMLCanvasElement for the full-res record path.
    // Using HTMLCanvasElement (not OffscreenCanvas) because VideoFrame can only
    // be created from an HTMLCanvasElement with a webgpu context, not OffscreenCanvas.
    _offscreenCanvas = document.createElement('canvas');
    _offscreenCanvas.width  = RECORD_WIDTH;
    _offscreenCanvas.height = RECORD_HEIGHT;
    _offscreenContext = _offscreenCanvas.getContext('webgpu');
    _offscreenContext.configure({
        device: _device,
        format: _presentFormat,
        usage:  GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        alphaMode: 'opaque',
    });

    _texMgr = new TextureManager(_device);
    // Particle draw target: cleared & redrawn each frame, read by feedback
    _texMgr.create('particleDraw', WIDTH, HEIGHT, 'rgba16float',
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
    // Feedback trail ping-pong (trail accumulation with decay)
    _texMgr.create('fbA');
    _texMgr.create('fbB');

    _passMgr = new PassManager();

    const desc = await (_adapter.requestAdapterInfo?.() ?? Promise.resolve(null));
    _gpuTier = _detectGpuTier(_adapter, desc);
    console.log('[renderer] WebGPU ready',
        '| adapter:', desc?.description ?? 'unknown',
        '| format:', _presentFormat,
        '| sim:', WIDTH + '×' + HEIGHT, '| record:', RECORD_WIDTH + '×' + RECORD_HEIGHT,
        '| gpu tier:', _gpuTier, '| particles:', getRecommendedParticleCount());

    return { device: _device, textures: _texMgr, passes: _passMgr };
}

// ---- loop -----------------------------------------------------------------
export function startLoop() {
    if (_running || !_device) return;
    _running = true;
    _rafId = requestAnimationFrame(_frame);
}

export function stopLoop() {
    _running = false;
    if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
}

// ---- accessors (for Tasks 6–12) -------------------------------------------
export function getDevice()           { return _device; }
export function getTextures()         { return _texMgr; }
export function getPasses()           { return _passMgr; }
export function getOffscreenCanvas()  { return _offscreenCanvas; }
export function getOffscreenContext() { return _offscreenContext; }

// Register a per-frame callback: fn(audioFrame, timestampMs).
// Called every frame before passes run — used by rd.js, feedback.js, etc.
export function addFrameTick(fn)      { _frameTicks.push(fn); }

// Record.js registers a callback here when recording is active.
// fn(offscreenCanvas, timestampMs) is called after the main frame is submitted.
export function setOnRecordFrame(fn)  { _onRecordFrame = fn; }

// ---- internal frame -------------------------------------------------------
function _frame(timestamp) {
    if (!_running) return;
    _rafId = requestAnimationFrame(_frame);

    const _frame_data = getAudioFrame();

    // Throttle to ~20 fps when no audio is active to spare GPU/CPU at idle.
    // BUT never throttle while recording — a quiet passage must still emit full-rate
    // record frames, otherwise the encoder starves and the .webm comes out empty/short.
    const recording = _onRecordFrame !== null;
    const idle = !recording && (!_frame_data || _frame_data.energy < 0.005);
    if (idle && timestamp - _lastFrameTime < IDLE_FRAME_MS) return;
    _lastFrameTime = timestamp;

    const _time = timestamp / 1000;      // seconds

    for (const tick of _frameTicks) tick(_frame_data, _time);

    const encoder  = _device.createCommandEncoder({ label: 'frame' });
    const swapTex  = _context.getCurrentTexture();
    const swapView = swapTex.createView();

    // Always clear the swap texture to the background colour (#0a0020).
    // Passes added by Tasks 6–8 layer on top with loadOp:'load'.
    const clearPass = encoder.beginRenderPass({
        label: 'clear-bg',
        colorAttachments: [{
            view: swapView,
            clearValue: { r: 0.039, g: 0, b: 0.125, a: 1 }, // #0a0020
            loadOp:  'clear',
            storeOp: 'store',
        }],
    });
    clearPass.end();

    // Run all registered passes (compute + render) in order.
    _passMgr.run(encoder, swapTex);

    _device.queue.submit([encoder.finish()]);

    // Record path: render to full-res offscreen canvas after the preview frame.
    if (_onRecordFrame) _onRecordFrame(_offscreenCanvas, timestamp);
}
