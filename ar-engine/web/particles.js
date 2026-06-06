// Particle system pipeline: 500k GPU particles driven by 2-octave curl noise.
// Exports: initParticlePipeline(device, texMgr, passMgr) → { tick(frame, time) }
//          setParticleParams({ noiseScale, noiseSpeed, noiseStr, lifetime, speed })

import { SIM_WIDTH, SIM_HEIGHT } from './renderer.js';

export const PARTICLE_COUNT = 500_000;

// 8 floats per particle: pos(2) vel(2) age(1) hue(1) seed(u32) pad(u32)
const PARTICLE_STRIDE = 8 * 4;   // bytes
const UPDATE_UBO_BYTES = 64;      // 16 × f32 — must be 16-byte aligned
const DRAW_UBO_BYTES   = 16;      // 4 × f32

// Defaults (can be overridden from advanced.js via setParticleParams)
let _noiseScale = 3.5;
let _noiseSpeed = 0.18;
let _noiseStr   = 0.0004;
let _lifetime   = 420.0;   // frames
let _speed      = 0.8;

export function setParticleParams({ noiseScale, noiseSpeed, noiseStr, lifetime, speed } = {}) {
    if (noiseScale !== undefined) _noiseScale = noiseScale;
    if (noiseSpeed !== undefined) _noiseSpeed = noiseSpeed;
    if (noiseStr   !== undefined) _noiseStr   = noiseStr;
    if (lifetime   !== undefined) _lifetime   = lifetime;
    if (speed      !== undefined) _speed      = speed;
}

export async function initParticlePipeline(device, texMgr, passMgr) {
    // --- particle storage buffer ---
    const particleBuf = device.createBuffer({
        label: 'particles',
        size:  PARTICLE_COUNT * PARTICLE_STRIDE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    _seedBuffer(device, particleBuf);

    // =========================================================================
    // UPDATE PIPELINE (compute)
    // =========================================================================
    const updateSrc = await fetch('./shaders/particles_update.wgsl').then(r => r.text());
    const updateMod = device.createShaderModule({ label: 'particles_update', code: updateSrc });

    const updateUbo = device.createBuffer({
        label: 'particles_update_ubo',
        size:  UPDATE_UBO_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const _updArr = new Float32Array(UPDATE_UBO_BYTES / 4);

    const updateBGL = device.createBindGroupLayout({
        label: 'particles_update_bgl',
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform'  } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage'  } },
        ],
    });

    const updatePipeline = await device.createComputePipelineAsync({
        label:  'particles_update',
        layout: device.createPipelineLayout({ bindGroupLayouts: [updateBGL] }),
        compute: { module: updateMod, entryPoint: 'main' },
    });

    const updateBG = device.createBindGroup({
        label:  'particles_update_bg',
        layout: updateBGL,
        entries: [
            { binding: 0, resource: { buffer: updateUbo  } },
            { binding: 1, resource: { buffer: particleBuf } },
        ],
    });

    // =========================================================================
    // DRAW PIPELINE (render → particleDraw rgba16float, additive blend)
    // =========================================================================
    const drawSrc = await fetch('./shaders/particles_draw.wgsl').then(r => r.text());
    const drawMod = device.createShaderModule({ label: 'particles_draw', code: drawSrc });

    const drawUbo = device.createBuffer({
        label: 'particles_draw_ubo',
        size:  DRAW_UBO_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const _drawArr = new Float32Array(DRAW_UBO_BYTES / 4);

    const drawBGL = device.createBindGroupLayout({
        label: 'particles_draw_bgl',
        entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
              buffer: { type: 'read-only-storage' } },
            { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
              buffer: { type: 'uniform' } },
        ],
    });

    const drawPipeline = await device.createRenderPipelineAsync({
        label:  'particles_draw',
        layout: device.createPipelineLayout({ bindGroupLayouts: [drawBGL] }),
        vertex:   { module: drawMod, entryPoint: 'vs_main' },
        fragment: {
            module:  drawMod,
            entryPoint: 'fs_main',
            targets: [{
                format: 'rgba16float',
                blend: {
                    color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
                    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
                },
            }],
        },
        primitive: { topology: 'point-list' },
    });

    const drawBG = device.createBindGroup({
        label:  'particles_draw_bg',
        layout: drawBGL,
        entries: [
            { binding: 0, resource: { buffer: particleBuf } },
            { binding: 1, resource: { buffer: drawUbo     } },
        ],
    });

    // Pre-create the view (particleDraw is never swapped)
    const particleDrawView = texMgr.get('particleDraw').createView();

    // =========================================================================
    // REGISTER PASSES
    // =========================================================================
    passMgr.add({
        label:     'particles_update',
        pipeline:  updatePipeline,
        bindGroup: updateBG,
        dispatch:  { type: 'compute', x: Math.ceil(PARTICLE_COUNT / 256) },
    });

    passMgr.add({
        label:     'particles_draw',
        pipeline:  drawPipeline,
        bindGroup: drawBG,
        dispatch:  {
            type:       'render',
            targetView: particleDrawView,
            loadOp:     'clear',                          // clear each frame, accumulate fresh
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
            drawCount:  PARTICLE_COUNT,
        },
    });

    // =========================================================================
    // PER-FRAME TICK
    // =========================================================================
    let _prevBeat = 0;
    let _hueBase  = 0;

    function tick(frame, time) {
        const energy = frame?.energy     ?? 0;
        const bass   = frame?.bass       ?? 0;
        const mid    = frame?.mid        ?? 0;
        const high   = frame?.high       ?? 0;
        const beat   = frame?.beat_pulse ?? 0;

        // Slow hue drift
        _hueBase = (_hueBase + 0.0001 + high * 0.0003) % 1.0;

        // Update UBO for particle positions
        _updArr[0]  = time;
        _updArr[1]  = _noiseScale;
        _updArr[2]  = _noiseSpeed;
        _updArr[3]  = _noiseStr;
        _updArr[4]  = _speed;
        _updArr[5]  = _lifetime;
        _updArr[6]  = _hueBase;
        _updArr[7]  = bass;
        _updArr[8]  = mid;
        _updArr[9]  = high;
        _updArr[10] = energy;
        _updArr[11] = beat;
        _updArr[12] = _prevBeat;
        // [13..15] padding
        device.queue.writeBuffer(updateUbo, 0, _updArr);

        // Update draw UBO
        _drawArr[0] = energy;
        _drawArr[1] = beat;
        _drawArr[2] = mid;
        _drawArr[3] = high;
        device.queue.writeBuffer(drawUbo, 0, _drawArr);

        _prevBeat = beat;
    }

    console.log('[particles] pipeline ready',
        '| count:', PARTICLE_COUNT,
        '| buf:', (PARTICLE_COUNT * PARTICLE_STRIDE / 1024 / 1024).toFixed(1), 'MB',
        '| workgroups:', Math.ceil(PARTICLE_COUNT / 256));

    return { tick };
}

// ---- Seed initial particle state from JS (random pos, zero vel) -------------
function _seedBuffer(device, buf) {
    const data = new ArrayBuffer(PARTICLE_COUNT * PARTICLE_STRIDE);
    const f32  = new Float32Array(data);
    const u32  = new Uint32Array(data);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const base = i * 8;              // 8 elements per particle
        f32[base + 0] = Math.random();   // pos.x
        f32[base + 1] = Math.random();   // pos.y
        f32[base + 2] = 0;              // vel.x
        f32[base + 3] = 0;              // vel.y
        f32[base + 4] = Math.random();  // age (stagger)
        f32[base + 5] = i / PARTICLE_COUNT;  // hue: spread evenly at start
        u32[base + 6] = (Math.random() * 0xffffffff) >>> 0;  // seed
        u32[base + 7] = 0;              // pad
    }

    device.queue.writeBuffer(buf, 0, data);
}
