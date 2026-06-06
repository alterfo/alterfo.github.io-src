// Particle system pipeline: 500k GPU particles as 6 stadium-style light beams.
// Exports: initParticlePipeline(device, texMgr, passMgr) → { tick(frame, time) }
//          setParticleParams({ noiseScale, noiseSpeed, noiseStr, lifetime, speed })
// Parameter mapping for the emitter-beam system:
//   noiseScale → beam_spread (cone half-angle, radians)
//   noiseSpeed → sweep_scale (sweep amplitude multiplier)
//   noiseStr   → shimmer (organic curl noise on beam particles)

import { SIM_WIDTH, SIM_HEIGHT } from './renderer.js';

export const PARTICLE_COUNT = 500_000;

const PARTICLE_STRIDE = 8 * 4;   // bytes per particle (8 floats)
const UPDATE_UBO_BYTES = 64;
const DRAW_UBO_BYTES   = 16;

// Emitter constants mirrored from WGSL for initial seeding
const _EPOS = [
    [0.08, 0.74], [0.92, 0.74],
    [0.24, 0.96], [0.76, 0.96],
    [0.08, 0.04], [0.92, 0.04],
];
// Base angles = atan2(0.5-ey, 0.5-ex), pointing toward canvas center
const _EBASE  = [-0.540, -2.602, -1.083, -2.059, 0.820, 2.321];
const _EHUE   = [0.06, 0.56, 0.14, 0.64, 0.82, 0.32];
const _BEAM_SPEED = 0.010;
const _DAMPING    = 0.97;

// Defaults (overridden by advanced.js via setParticleParams)
let _noiseScale = 0.08;    // beam_spread: cone half-angle in radians (~4.6°)
let _noiseSpeed = 1.0;     // sweep_scale: sweep amplitude multiplier
let _noiseStr   = 0.00006; // shimmer: curl noise contribution
let _lifetime   = 80.0;    // frames per particle (controls beam length)
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
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
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
            { binding: 0, resource: { buffer: updateUbo   } },
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
            module:     drawMod,
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
            loadOp:     'clear',
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

        // Hue breathes: slow base drift + high-frequency energy accelerates colour cycling
        _hueBase = (_hueBase + 0.00006 + energy * 0.0003 + high * 0.0008) % 1.0;

        // Update UBO — layout matches Uniforms struct in particles_update.wgsl
        _updArr[0]  = time;
        _updArr[1]  = _noiseScale;   // beam_spread
        _updArr[2]  = _noiseSpeed;   // sweep_scale
        _updArr[3]  = _noiseStr;     // shimmer
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

        _drawArr[0] = energy;
        _drawArr[1] = beat;
        _drawArr[2] = mid;
        _drawArr[3] = high;
        device.queue.writeBuffer(drawUbo, 0, _drawArr);

        _prevBeat = beat;
    }

    console.log('[particles] beam pipeline ready',
        '| count:', PARTICLE_COUNT,
        '| buf:', (PARTICLE_COUNT * PARTICLE_STRIDE / 1024 / 1024).toFixed(1), 'MB',
        '| workgroups:', Math.ceil(PARTICLE_COUNT / 256));

    return { tick };
}

// Seed particles directly along beam paths so beams are visible from frame 1.
function _seedBuffer(device, buf) {
    const data = new ArrayBuffer(PARTICLE_COUNT * PARTICLE_STRIDE);
    const f32  = new Float32Array(data);
    const u32  = new Uint32Array(data);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const base  = i * 8;
        const e     = i % 6;
        const [ex, ey] = _EPOS[e];
        const base_angle = _EBASE[e];

        // Random spread within cone; use default spread
        const spread     = (Math.random() - 0.5) * 0.08;
        const emit_angle = base_angle + spread;
        const cos_a = Math.cos(emit_angle);
        const sin_a = Math.sin(emit_angle);

        // Random age → random position along beam (using exact geometric series)
        const age = Math.random();
        const T   = age * _lifetime;   // approximate frames already traveled
        const dist = T > 0
            ? _BEAM_SPEED * _speed * (1 - Math.pow(_DAMPING, T)) / (1 - _DAMPING)
            : 0;

        f32[base + 0] = Math.min(Math.max(ex + cos_a * dist, 0.01), 0.99);
        f32[base + 1] = Math.min(Math.max(ey + sin_a * dist, 0.01), 0.99);
        // Velocity decayed for T frames
        const vel_mag  = _BEAM_SPEED * Math.pow(_DAMPING, T);
        f32[base + 2]  = cos_a * vel_mag;
        f32[base + 3]  = sin_a * vel_mag;
        f32[base + 4]  = age;
        f32[base + 5]  = _EHUE[e] + (Math.random() - 0.5) * 0.04;
        u32[base + 6]  = (Math.random() * 0xffffffff) >>> 0;
        u32[base + 7]  = 0;
    }

    device.queue.writeBuffer(buf, 0, data);
}
