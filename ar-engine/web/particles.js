// Particle system pipeline: 500k GPU particles in a 4-pole vortex field.
// Exports: initParticlePipeline(device, texMgr, passMgr) → { tick(frame, time) }
//          setParticleParams({ noiseScale, noiseSpeed, noiseStr, lifetime, speed })
// Parameter mapping for the vortex system:
//   noiseScale → orbit_str (tangential vortex force, pre-scaled by 0.00005)
//   noiseSpeed → pole_speed (Lissajous frequency multiplier, direct)
//   noiseStr   → shimmer (organic curl-noise perturbation)

import { SIM_WIDTH, SIM_HEIGHT, getRecommendedParticleCount, getGpuTier } from './renderer.js';
import { createTimbreSmoother } from './timbre_color.js';

const _SHADER_VER = '20260608';

// Set at initParticlePipeline() time based on detected GPU tier.
// Exported as let so callers (record.js etc.) can read the live value.
export let PARTICLE_COUNT = 500_000;

const PARTICLE_STRIDE  = 8 * 4;  // bytes per particle (8 floats)
const UPDATE_UBO_BYTES = 112;   // 28 floats: 16 base + 10 live Nova params + 2 pad
const DRAW_UBO_BYTES   = 48;    // 12 floats; added timbre hue/sat/weight (+ padding)

// Live-tunable Nova iris parameters — change from the browser console via
// window.nova.set({ ... }). Defaults reproduce the built-in look.
const _nova = {
    fibers:  1400,    // strand count
    jitter:  0.012,   // per-particle strand spread → line THICKNESS
    curl:    0.8,     // spiral bend scale (1.0 = full base bend)
    amp:     0.9,     // meander bend scale (1.0 = full base meander)
    irisR:   0.30,    // iris radius (limbus) → line LENGTH / iris size
    pupilR:  0.105,   // pupil base radius
    pupilG:  0.045,   // pupil dilation gain (beat reactivity)
    sclera:  0.18,    // fraction of fibers that flow past the limbus (0..1)
    bright:  0.55,    // draw alpha multiplier → brightness / TRANSPARENCY
    flow:    0.7,     // radial streaming speed (lower = calmer outward motion)
    anim:    1.4,     // how alive the fibers are: bend-morph + sway (0 = frozen)
};

// Map friendly aliases (length/thickness/count/transparency...) to internal keys.
const _NOVA_ALIASES = {
    count: 'fibers', n: 'fibers', fibers: 'fibers',
    thickness: 'jitter', jitter: 'jitter', width: 'jitter',
    length: 'irisR', irisR: 'irisR', iris: 'irisR', size: 'irisR',
    curl: 'curl', bend: 'curl', amp: 'amp', meander: 'amp',
    pupil: 'pupilR', pupilR: 'pupilR', pupilGain: 'pupilG', pupilG: 'pupilG',
    sclera: 'sclera', wisps: 'sclera',
    bright: 'bright', brightness: 'bright', alpha: 'bright', opacity: 'bright',
    flow: 'flow', speed: 'flow', streaming: 'flow',
    anim: 'anim', alive: 'anim', living: 'anim', morph: 'anim', life: 'anim',
};

export function setNovaParams(params = {}) {
    for (const [k, v] of Object.entries(params)) {
        const key = _NOVA_ALIASES[k] ?? (k in _nova ? k : null);
        if (key && typeof v === 'number' && isFinite(v)) _nova[key] = v;
        else console.warn('[nova] unknown/invalid param:', k, v);
    }
    return { ..._nova };
}
export function getNovaParams() { return { ..._nova }; }

// Defaults (overridden by advanced.js via setParticleParams)
let _noiseScale   = 4.0;     // Vortex slider: 1–10 → orbit_str = value × 0.00005
let _noiseSpeed   = 0.6;     // Drift slider: Lissajous frequency multiplier
let _noiseStr     = 0.00005; // shimmer: subtle curl-noise perturbation
let _lifetime     = 240.0;   // frames per particle (4 s at 60 fps)
let _speed        = 0.7;
let _chladniMode  = 0;       // 0 = vortex, 1 = Chladni standing-wave
let _novaMode     = 0;       // 1 = radial spiral bloom

export function setParticleParams({ noiseScale, noiseSpeed, noiseStr, lifetime, speed, chladniMode, novaMode } = {}) {
    if (noiseScale   !== undefined) _noiseScale   = noiseScale;
    if (noiseSpeed   !== undefined) _noiseSpeed   = noiseSpeed;
    if (noiseStr     !== undefined) _noiseStr     = noiseStr;
    if (lifetime     !== undefined) _lifetime     = lifetime;
    if (speed        !== undefined) _speed        = speed;
    if (chladniMode  !== undefined) _chladniMode  = chladniMode;
    if (novaMode     !== undefined) _novaMode     = novaMode;
}

export async function initParticlePipeline(device, texMgr, passMgr) {
    // Scale particle count to detected GPU tier (prevents hang on integrated GPUs).
    PARTICLE_COUNT = getRecommendedParticleCount();

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
    const updateSrc = await fetch(`./shaders/particles_update.wgsl?v=${_SHADER_VER}`).then(r => r.text());
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
    const drawSrc = await fetch(`./shaders/particles_draw.wgsl?v=${_SHADER_VER}`).then(r => r.text());
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
    // Dynamic compute dispatch: Cymatics uses only ¼ of particles (4× faster).
    const _updateDispatch = { type: 'compute', x: Math.ceil(PARTICLE_COUNT / 256) };
    passMgr.add({
        label:     'particles_update',
        pipeline:  updatePipeline,
        bindGroup: updateBG,
        dispatch:  _updateDispatch,
    });

    // Draw dispatch: always PARTICLE_COUNT vertices.
    // Kaleidoscope maps first-quarter particles × 4 quadrants inside the shader.
    const _drawDispatch = {
        type:       'render',
        targetView: particleDrawView,
        loadOp:     'clear',
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
        drawCount:  PARTICLE_COUNT,
    };

    passMgr.add({
        label:     'particles_draw',
        pipeline:  drawPipeline,
        bindGroup: drawBG,
        dispatch:  _drawDispatch,
    });

    // =========================================================================
    // PER-FRAME TICK
    // =========================================================================
    let _prevBeat = 0;
    let _hueBase  = 0;
    let _prevTime = null;                          // seconds; for frame-rate-correct EMA dt
    let _pupilSm  = 0;                             // smoothed Nova pupil drive (anti-jerk)
    const _timbreSmoother = createTimbreSmoother({ tau: 0.25 });

    function tick(frame, time) {
        const energy = frame?.energy     ?? 0;
        const bass   = frame?.bass       ?? 0;
        const mid    = frame?.mid        ?? 0;
        const high   = frame?.high       ?? 0;
        const beat   = frame?.beat_pulse ?? 0;
        const centroid = frame?.centroid ?? 0;
        const tonal    = frame?.tonal    ?? 0;

        // Frame delta for the timbre EMA. Clamp so idle-throttle gaps don't snap colour.
        const dt = _prevTime === null ? 1 / 60 : Math.min(Math.max(time - _prevTime, 1 / 240), 0.1);
        _prevTime = time;
        const timbre = _timbreSmoother(centroid, tonal, dt);

        // Hue drifts continuously; high-frequency content accelerates colour cycling
        _hueBase = (_hueBase + 0.00005 + energy * 0.0002 + high * 0.0007) % 1.0;

        // Smoothed Nova pupil drive: EMA over (beat + bass + energy) so the iris
        // dilates gently instead of snapping open on every kick. τ≈0.22 s rounds off
        // the beat_pulse attack into a soft breathing bump. Passed via the _p2 slot.
        const pupilTarget = Math.min(beat * 0.8 + bass * 0.55 + energy * 0.25, 1.0);
        const aPupil = 1 - Math.exp(-dt / 0.22);
        _pupilSm += (pupilTarget - _pupilSm) * aPupil;

        // Update UBO — layout matches Uniforms struct in particles_update.wgsl
        _updArr[0]  = time;
        _updArr[1]  = _noiseScale * 0.00005;  // orbit_str: slider 1-10 → 0.00005-0.0005
        _updArr[2]  = _noiseSpeed;             // pole_speed: direct
        _updArr[3]  = _noiseStr;               // shimmer
        _updArr[4]  = _speed;
        _updArr[5]  = _lifetime;
        _updArr[6]  = _hueBase;
        _updArr[7]  = bass;
        _updArr[8]  = mid;
        _updArr[9]  = high;
        _updArr[10] = energy;
        _updArr[11] = beat;
        _updArr[12] = _prevBeat;
        _updArr[13] = _chladniMode;
        _updArr[14] = _novaMode;
        _updArr[15] = _pupilSm;                // pupil_drive (smoothed) — Nova iris
        // Live Nova tuning (16..23) — see window.nova.set()
        _updArr[16] = _nova.fibers;
        _updArr[17] = _nova.jitter;
        _updArr[18] = _nova.curl;
        _updArr[19] = _nova.amp;
        _updArr[20] = _nova.irisR;
        _updArr[21] = _nova.pupilR;
        _updArr[22] = _nova.pupilG;
        _updArr[23] = _nova.sclera;
        _updArr[24] = _nova.flow;
        _updArr[25] = _nova.anim;
        device.queue.writeBuffer(updateUbo, 0, _updArr);

        // Cymatics: compute only ¼ of particles + quarter×4 draw = 4× speedup each.
        const isKaleidoscope = _chladniMode > 0.5 ? 1.0 : 0.0;
        const chladniWorkgroups = Math.ceil(PARTICLE_COUNT / 4 / 256);
        _updateDispatch.x = isKaleidoscope ? chladniWorkgroups : Math.ceil(PARTICLE_COUNT / 256);
        // Draw always PARTICLE_COUNT; shader maps quarter×4 for kaleidoscope.
        _drawDispatch.drawCount = PARTICLE_COUNT;

        _drawArr[0] = energy;
        _drawArr[1] = beat;
        _drawArr[2] = mid;
        _drawArr[3] = high;
        _drawArr[4] = isKaleidoscope;
        _drawArr[5] = _novaMode;
        _drawArr[6] = timbre.hue;     // timbre_hue
        _drawArr[7] = timbre.sat;     // timbre_sat
        _drawArr[8] = timbre.weight;  // timbre_weight
        _drawArr[9] = _nova.bright;   // nova_bright (alpha multiplier)
        // [10..11] padding zeros
        device.queue.writeBuffer(drawUbo, 0, _drawArr);

        _prevBeat = beat;
    }

    console.log('[particles] pipeline ready',
        '| tier:', getGpuTier(),
        '| count:', PARTICLE_COUNT,
        '| buf:', (PARTICLE_COUNT * PARTICLE_STRIDE / 1024 / 1024).toFixed(1), 'MB',
        '| workgroups:', Math.ceil(PARTICLE_COUNT / 256));

    return { tick };
}

// Seed particles at random positions with tiny random velocities.
// The 4 vortex poles will pull them into orbits within ~20 frames.
// Random age offsets spread the respawn events across time so there's
// no frame where all particles die simultaneously.
function _seedBuffer(device, buf) {
    const data = new ArrayBuffer(PARTICLE_COUNT * PARTICLE_STRIDE);
    const f32  = new Float32Array(data);
    const u32  = new Uint32Array(data);

    const defaultOrbitStr = _noiseScale * 0.00005;  // matches tick() scaling

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const base  = i * 8;
        const angle = Math.random() * Math.PI * 2;

        f32[base + 0] = Math.random();  // pos.x
        f32[base + 1] = Math.random();  // pos.y
        // Small random velocity — vortex quickly takes over
        f32[base + 2] = Math.cos(angle) * defaultOrbitStr * 0.4;
        f32[base + 3] = Math.sin(angle) * defaultOrbitStr * 0.4;
        f32[base + 4] = Math.random();  // age: staggered so no mass-respawn event
        // Hue: spread across all 4 pole colours (0.06, 0.16, 0.56, 0.66)
        const poleHues = [0.06, 0.16, 0.56, 0.66];
        f32[base + 5] = poleHues[i % 4] + (Math.random() - 0.5) * 0.05;
        u32[base + 6] = (Math.random() * 0xffffffff) >>> 0;
        u32[base + 7] = 0;
    }

    device.queue.writeBuffer(buf, 0, data);
}
