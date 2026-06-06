// Gray-Scott reaction-diffusion pipeline.
// Exports: initRDPipeline(device, texMgr, passMgr) → { tick(frame, time) }
//
// Registers 6 compute passes per frame (ping-pong rdA ↔ rdB).
// tick() must be called each frame before the encoder runs.

import { WIDTH, HEIGHT } from './renderer.js';

const RD_ITERATIONS = 3;
const UBO_BYTES     = 64;   // 16 × f32/u32 — see struct RDUniforms in shader

// Default Gray-Scott parameters (branching/coral pattern)
const FEED     = 0.022;
const KILL     = 0.051;
const DU       = 0.2097;
const DV       = 0.1050;
const DT       = 1.0;
const DYE_RAD  = 40.0;
const DYE_STR  = 0.8;

// Baseline overrides (set by advanced.js panel).
let _feedBaseline = FEED;
let _killBaseline = KILL;

// Called by advanced.js to override RD parameters.
export function setRDParams({ feed, kill } = {}) {
    if (feed !== undefined) _feedBaseline = feed;
    if (kill !== undefined) _killBaseline = kill;
}

export async function initRDPipeline(device, texMgr, passMgr) {
    // --- shader ---
    const src = await fetch('./shaders/rd_compute.wgsl').then(r => r.text());
    const module = device.createShaderModule({ label: 'rd_compute', code: src });

    // --- uniform buffer ---
    const uboBuf = device.createBuffer({
        label: 'rd_uniforms',
        size:  UBO_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const uData = new ArrayBuffer(UBO_BYTES);
    const uf    = new Float32Array(uData);
    const uu    = new Uint32Array(uData);

    function _writeUniforms(time, dyeX, dyeY, inject, feed = FEED, kill = KILL) {
        uf[0]  = feed;   uf[1]  = kill;
        uf[2]  = DU;     uf[3]  = DV;
        uf[4]  = dyeX;   uf[5]  = dyeY;
        uf[6]  = DYE_RAD; uf[7] = DYE_STR;
        uf[8]  = time;   uf[9]  = DT;
        uu[10] = WIDTH;  uu[11] = HEIGHT;
        uu[12] = inject ? 1 : 0;
        // [13..15] padding
        device.queue.writeBuffer(uboBuf, 0, uData);
    }

    // --- bind group layout ---
    const bgl = device.createBindGroupLayout({
        label: 'rd_bgl',
        entries: [
            {
                binding:    0,
                visibility: GPUShaderStage.COMPUTE,
                buffer:     { type: 'uniform' },
            },
            {
                binding:    1,
                visibility: GPUShaderStage.COMPUTE,
                texture:    { sampleType: 'unfilterable-float' },
            },
            {
                binding:        2,
                visibility:     GPUShaderStage.COMPUTE,
                storageTexture: { access: 'write-only', format: 'rgba32float' },
            },
        ],
    });

    const pipelineLayout = device.createPipelineLayout({
        label: 'rd_layout',
        bindGroupLayouts: [bgl],
    });

    const pipeline = await device.createComputePipelineAsync({
        label:   'rd_compute',
        layout:  pipelineLayout,
        compute: { module, entryPoint: 'main' },
    });

    // --- seed initial state into rdA ---
    await _seedTexture(device, texMgr.get('rdA'));

    // Pre-build two bind groups (even iterations: A→B, odd: B→A).
    // These are stable across frames — no per-frame bind group allocation.
    const texA = texMgr.get('rdA');
    const texB = texMgr.get('rdB');

    const bgEven = device.createBindGroup({
        label:  'rd_bg_even',
        layout: bgl,
        entries: [
            { binding: 0, resource: { buffer: uboBuf } },
            { binding: 1, resource: texA.createView() },
            { binding: 2, resource: texB.createView() },
        ],
    });

    const bgOdd = device.createBindGroup({
        label:  'rd_bg_odd',
        layout: bgl,
        entries: [
            { binding: 0, resource: { buffer: uboBuf } },
            { binding: 1, resource: texB.createView() },
            { binding: 2, resource: texA.createView() },
        ],
    });

    const wgX = Math.ceil(WIDTH  / 8);
    const wgY = Math.ceil(HEIGHT / 8);

    // Register 6 passes (A→B, B→A, …).  After 6 (even) passes, textureA holds
    // the final result and texMgr.rdA still points at textureA — consistent.
    for (let i = 0; i < RD_ITERATIONS; i++) {
        const bg = i % 2 === 0 ? bgEven : bgOdd;
        passMgr.add({
            label:    `rd_iter_${i}`,
            pipeline,
            bindGroup: bg,
            dispatch: { type: 'compute', x: wgX, y: wgY },
        });
    }

    // Write initial uniforms (no injection)
    _writeUniforms(0, 0.5, 0.5, false);

    // --- per-frame tick ---
    let _prevBeat = 0;

    function tick(frame, time) {
        const beat = frame?.beat_pulse ?? 0;
        // Rising-edge detection: only inject on the frame the beat crosses 0.7
        const doInject = beat > 0.7 && _prevBeat <= 0.7;
        _prevBeat = beat;
        const dyeX = doInject ? Math.random() : 0.5;
        const dyeY = doInject ? Math.random() : 0.5;
        // Audio-reactive RD parameters: bass boosts feed (more pattern growth),
        // high frequencies shift kill rate (finer pattern detail)
        const bass = frame?.bass ?? 0;
        const high = frame?.high ?? 0;
        _writeUniforms(time, dyeX, dyeY, doInject,
            _feedBaseline + bass * 0.015,
            _killBaseline + high * 0.010);
    }

    console.log('[rd] Gray-Scott pipeline ready — feed', FEED, 'kill', KILL,
        '| passes:', RD_ITERATIONS, '| dispatch', wgX + '×' + wgY);

    return { tick };
}

// Fill rdA: U=1, V=0 everywhere; seed V=0.25 in 13 small square patches.
async function _seedTexture(device, texture) {
    const W    = WIDTH;
    const H    = HEIGHT;
    const data = new Float32Array(W * H * 4);

    for (let i = 0; i < W * H; i++) {
        data[i * 4 + 0] = 1.0;  // U — filled with food
        data[i * 4 + 1] = 0.0;  // V — no catalyst yet
        data[i * 4 + 2] = 0.0;
        data[i * 4 + 3] = 1.0;
    }

    // Seed positions (normalised)
    const seeds = [
        [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75],
        [0.50, 0.50], [0.15, 0.50], [0.85, 0.50], [0.50, 0.15],
        [0.50, 0.85], [0.33, 0.33], [0.66, 0.66], [0.33, 0.66],
        [0.66, 0.33],
    ];

    for (const [nx, ny] of seeds) {
        const cx = Math.round(nx * W);
        const cy = Math.round(ny * H);
        for (let dy = -6; dy <= 6; dy++) {
            for (let dx = -6; dx <= 6; dx++) {
                const px = cx + dx;
                const py = cy + dy;
                if (px < 0 || px >= W || py < 0 || py >= H) continue;
                const i = (py * W + px) * 4;
                data[i + 0] = 0.5;
                data[i + 1] = 0.25;
            }
        }
    }

    device.queue.writeTexture(
        { texture },
        data,
        { bytesPerRow: W * 16, rowsPerImage: H },
        { width: W, height: H },
    );
}
