// AudioWorklet processor — runs on the dedicated audio rendering thread.
// Receives audio frames from the Web Audio graph (128 samples per call),
// downmixes to mono, and posts the raw PCM buffer to the main thread for
// WASM engine_push_samples().
class AudioCaptureProcessor extends AudioWorkletProcessor {
    process(inputs) {
        const input = inputs[0];
        if (!input || !input.length) return true;

        const nCh = input.length;
        const len = input[0].length;
        const mono = new Float32Array(len);

        if (nCh === 1) {
            mono.set(input[0]);
        } else {
            const scale = 1.0 / nCh;
            for (let i = 0; i < len; i++) {
                let s = 0;
                for (let c = 0; c < nCh; c++) s += input[c][i];
                mono[i] = s * scale;
            }
        }
        // Transfer ownership — zero-copy hand-off to main thread
        this.port.postMessage(mono.buffer, [mono.buffer]);
        return true;
    }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
