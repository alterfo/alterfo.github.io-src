// Render pipeline: colour map + beat flash + hue drift + blend modes.
// Reads fbB (latest feedback/trails output) → draws fullscreen quad to swap canvas.
// Exports: initRenderPipeline(device, texMgr, passMgr) → { tick(frame, time) }
//          setRenderParams({ palette, blendMode, hueScale })
//          runRenderToTarget(encoder, targetView, width, height)
//          PALETTES — 4 × 4 colour stop arrays [[r,g,b], ...]

import { WIDTH, HEIGHT, PREVIEW_WIDTH, PREVIEW_HEIGHT } from './renderer.js';

// UBO layout (96 bytes = 24 × f32/u32):
//   [0] beat_pulse  [1] hue_shift  [2] blend_mode  [3] width
//   [4] height      [5..7] padding
//   [8..10] c0.rgb [11] c0.w  [12..14] c1.rgb [15] c1.w
//   [16..18] c2.rgb [19] c2.w  [20..22] c3.rgb [23] c3.w
const UBO_BYTES = 96;

// Preset palettes: each is 4 colour stops [[r,g,b], ...]
export const PALETTES = [
    // Cyberpunk: #0a0020 → #8b00ff → #00ffff → white
    [[0.039, 0.000, 0.125], [0.545, 0.000, 1.000], [0.000, 1.000, 1.000], [1.000, 1.000, 1.000]],
    // Fire: dark red → orange-red → amber → white
    [[0.063, 0.000, 0.000], [1.000, 0.267, 0.000], [1.000, 0.667, 0.000], [1.000, 1.000, 1.000]],
    // Ocean: deep navy → blue → sky → pale cyan
    [[0.000, 0.039, 0.063], [0.000, 0.200, 0.353], [0.000, 0.533, 1.000], [0.667, 0.957, 1.000]],
    // Matrix: black green → mid green → bright green → pale green
    [[0.000, 0.063, 0.000], [0.000, 0.220, 0.000], [0.000, 0.800, 0.000], [0.667, 1.000, 0.667]],
    // Chladni: near-black warm → deep amber → gold → pale warm white
    // Evokes sand grains illuminated on a vibrating metal plate.
    [[0.040, 0.020, 0.000], [0.550, 0.300, 0.020], [0.920, 0.680, 0.100], [1.000, 0.960, 0.800]],
    // Nova (iris): near-black → deep slate-blue → cool blue-grey → warm amber-gold
    // Bright collarette particles map to amber; dimmer outer fibers map to slate-blue.
    [[0.000, 0.000, 0.008], [0.020, 0.120, 0.400], [0.050, 0.250, 0.650], [0.850, 0.600, 0.150]],
];

// Module-level state updated by setRenderParams()
let _blendMode  = 0;
let _hueScale   = 1.0;
let _exposure   = 2.8;   // tonemap exposure multiplier
let _gamma      = 0.8;   // gamma curve exponent
let _novaMode_r = 0;     // 1.0 when nova iris mode → enables sclera aura in shader
let _palette    = PALETTES[0].map(c => [...c]).flat(); // 12 floats

let _uboBuf     = null;
let _device     = null;
let _pipeline   = null;
let _makeBG     = null;    // () → GPUBindGroup, refreshed each frame
const _uData    = new ArrayBuffer(UBO_BYTES);
const _uf       = new Float32Array(_uData);
const _uu       = new Uint32Array(_uData);

function _initPalette() {
    // Write default cyberpunk palette into UBO data (indices 8–23)
    _writePaletteFloats(_palette);
}

function _writePaletteFloats(flat12) {
    // flat12: [r0,g0,b0, r1,g1,b1, r2,g2,b2, r3,g3,b3]
    _uf[8]  = flat12[0]; _uf[9]  = flat12[1]; _uf[10] = flat12[2]; _uf[11] = 0;
    _uf[12] = flat12[3]; _uf[13] = flat12[4]; _uf[14] = flat12[5]; _uf[15] = 0;
    _uf[16] = flat12[6]; _uf[17] = flat12[7]; _uf[18] = flat12[8]; _uf[19] = 0;
    _uf[20] = flat12[9]; _uf[21] = flat12[10]; _uf[22] = flat12[11]; _uf[23] = 0;
}

// Called by advanced.js to update palette / blend mode / hue scale / tonemap.
export function setRenderParams({ palette, blendMode, hueScale, exposure, gamma, novaMode } = {}) {
    if (palette    !== undefined) { _palette = palette;   _writePaletteFloats(palette); }
    if (blendMode  !== undefined) _blendMode  = blendMode;
    if (hueScale   !== undefined) _hueScale   = hueScale;
    if (exposure   !== undefined) _exposure   = exposure;
    if (gamma      !== undefined) _gamma      = gamma;
    if (novaMode   !== undefined) _novaMode_r = novaMode;
    if (_uboBuf && _device) {
        _device.queue.writeBuffer(_uboBuf, 0, _uData);
    }
}

function _writeUniforms(beatPulse, hueShift, blendMode) {
    _uf[0] = beatPulse;
    _uf[1] = hueShift;
    _uu[2] = blendMode;
    // Always reset to preview dims before the main render pass.
    // runRenderToTarget() overrides these for the offscreen record pass.
    _uu[3] = PREVIEW_WIDTH;
    _uu[4] = PREVIEW_HEIGHT;
    _uf[5] = _exposure;
    _uf[6] = _gamma;
    _uf[7] = _novaMode_r;
    _device.queue.writeBuffer(_uboBuf, 0, _uData);
}

// Run the render pass to an arbitrary target view at the given dimensions.
// Called by record.js for the full-res offscreen record path.
export function runRenderToTarget(encoder, targetView, width, height) {
    _uu[3] = width;
    _uu[4] = height;
    _device.queue.writeBuffer(_uboBuf, 0, _uData);

    const bg = _makeBG();
    const rp = encoder.beginRenderPass({
        label: 'render-offscreen',
        colorAttachments: [{
            view:       targetView,
            clearValue: { r: 0.039, g: 0, b: 0.125, a: 1 },
            loadOp:  'clear',
            storeOp: 'store',
        }],
    });
    rp.setPipeline(_pipeline);
    rp.setBindGroup(0, bg);
    rp.draw(3);
    rp.end();
}

export async function initRenderPipeline(device, texMgr, passMgr) {
    _device = device;

    const src = await fetch('./shaders/render.wgsl').then(r => r.text());
    const module = device.createShaderModule({ label: 'render', code: src });

    _uboBuf = device.createBuffer({
        label: 'render_uniforms',
        size:  UBO_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    _uu[3] = PREVIEW_WIDTH;
    _uu[4] = PREVIEW_HEIGHT;
    _initPalette();

    // Bind group layout
    const bgl = device.createBindGroupLayout({
        label: 'render_bgl',
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT,
              texture: { sampleType: 'unfilterable-float' } },
        ],
    });

    const presentFormat = navigator.gpu.getPreferredCanvasFormat();

    _pipeline = await device.createRenderPipelineAsync({
        label:  'render',
        layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
        vertex:   { module, entryPoint: 'vs_main' },
        fragment: { module, entryPoint: 'fs_main', targets: [{ format: presentFormat }] },
        primitive: { topology: 'triangle-list' },
    });

    _makeBG = () => device.createBindGroup({
        label:  'render_bg',
        layout: bgl,
        entries: [
            { binding: 0, resource: { buffer: _uboBuf } },
            { binding: 1, resource: texMgr.view('fbB') },
        ],
    });

    passMgr.add({
        label:       'render',
        pipeline:    _pipeline,
        bindGroupFn: _makeBG,
        dispatch:    { type: 'render', drawCount: 3 },
    });

    _writeUniforms(0, 0, 0);

    function tick(frame, time) {
        const beat     = frame?.beat_pulse ?? 0;
        const autoHue  = (Math.sin(time * 0.3927) * 0.5 + 0.5) * 0.08;
        const hueShift = autoHue * _hueScale;
        _writePaletteFloats(_palette);
        _writeUniforms(beat, hueShift, _blendMode);
    }

    console.log('[render] pipeline ready | format:', presentFormat,
        '| UBO:', UBO_BYTES, 'bytes | palette: Cyberpunk');

    return { tick };
}
