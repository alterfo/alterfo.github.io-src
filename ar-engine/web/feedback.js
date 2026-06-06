// Feedback trail accumulation pipeline.
// Reads particleDraw (this frame's particles) + fbA (previous trail) → fbB.
// formula: fbB = particleDraw + fbA × decay, clamped [0,1]
// After each tick fbA↔fbB are swapped so fbA always holds the latest result.
// render.js reads fbB — which after the swap points to the just-written texture.

import { WIDTH, HEIGHT } from './renderer.js';

const DECAY_NORMAL  = 0.96;   // long beam trails (stadium look)
const DECAY_ON_BEAT = 0.78;   // moderate flush on beat — clears old trails without full reset

let _decayOverride = DECAY_NORMAL;

export function setFeedbackParams({ decayNormal } = {}) {
    if (decayNormal !== undefined) _decayOverride = decayNormal;
}

export async function initFeedbackPipeline(device, texMgr, passMgr) {
    const fbSrc = await fetch('./shaders/feedback.wgsl').then(r => r.text());
    const fbMod = device.createShaderModule({ label: 'feedback', code: fbSrc });

    const wgX = Math.ceil(WIDTH  / 8);
    const wgY = Math.ceil(HEIGHT / 8);

    const fbUbo = device.createBuffer({
        label: 'feedback_uniforms',
        size:  16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const _fbArr = new ArrayBuffer(16);
    const _fbF   = new Float32Array(_fbArr);
    const _fbU   = new Uint32Array(_fbArr);
    _fbU[1] = WIDTH;
    _fbU[2] = HEIGHT;

    function writeFeedbackUniforms(decay) {
        _fbF[0] = decay;
        device.queue.writeBuffer(fbUbo, 0, _fbArr);
    }

    const fbBGL = device.createBindGroupLayout({
        label: 'feedback_bgl',
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
            // binding 1: cur_tex  — particleDraw (rgba16float, unfilterable-float is valid)
            { binding: 1, visibility: GPUShaderStage.COMPUTE,
              texture: { sampleType: 'unfilterable-float' } },
            // binding 2: prev_tex — fbA ping-pong
            { binding: 2, visibility: GPUShaderStage.COMPUTE,
              texture: { sampleType: 'unfilterable-float' } },
            // binding 3: out     — fbB ping-pong (storage write)
            { binding: 3, visibility: GPUShaderStage.COMPUTE,
              storageTexture: { access: 'write-only', format: 'rgba32float' } },
        ],
    });

    const fbPipeline = await device.createComputePipelineAsync({
        label:  'feedback',
        layout: device.createPipelineLayout({ bindGroupLayouts: [fbBGL] }),
        compute: { module: fbMod, entryPoint: 'main' },
    });

    // Pre-build two ping-pong bind groups.
    // bg0: reads fbA → writes fbB  (used on even frames)
    // bg1: reads fbB → writes fbA  (used on odd frames, after swap)
    const pdView = texMgr.get('particleDraw').createView();

    const fbBg0 = device.createBindGroup({
        label:  'feedback_bg0',
        layout: fbBGL,
        entries: [
            { binding: 0, resource: { buffer: fbUbo } },
            { binding: 1, resource: pdView },
            { binding: 2, resource: texMgr.get('fbA').createView() },
            { binding: 3, resource: texMgr.get('fbB').createView() },
        ],
    });

    texMgr.swap('fbA', 'fbB');
    const fbBg1 = device.createBindGroup({
        label:  'feedback_bg1',
        layout: fbBGL,
        entries: [
            { binding: 0, resource: { buffer: fbUbo } },
            { binding: 1, resource: pdView },
            { binding: 2, resource: texMgr.get('fbA').createView() },
            { binding: 3, resource: texMgr.get('fbB').createView() },
        ],
    });
    texMgr.swap('fbA', 'fbB');

    let _swapCount = 0;

    passMgr.add({
        label:       'feedback',
        pipeline:    fbPipeline,
        bindGroupFn: () => _swapCount % 2 === 0 ? fbBg0 : fbBg1,
        dispatch:    { type: 'compute', x: wgX, y: wgY },
    });

    writeFeedbackUniforms(DECAY_NORMAL);

    function tick(frame) {
        texMgr.swap('fbA', 'fbB');
        _swapCount++;

        const beat = frame?.beat_pulse ?? 0;
        // Continuous beat-driven decay: trails shrink on every kick then rebuild.
        // DECAY_NORMAL (0.96) at silence → 0.58 at peak beat → beams "breathe".
        const decay = Math.max(_decayOverride - beat * 0.38, 0.50);
        writeFeedbackUniforms(decay);
    }

    console.log('[feedback] trail accumulation pipeline ready | decay:', DECAY_NORMAL);

    return { tick };
}
