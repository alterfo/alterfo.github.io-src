// Web Audio API → WASM engine bridge.
// Exports: initAudio, loadFile, connectStream, play, pause, resume,
//          isPlaying, setLoop, isLoop, getCurrentTime, getAudioFrame.
// connectStream() uses getDisplayMedia to capture a browser tab's audio —
// used for Yandex Music / Spotify / any tab playing music.

// AudioFrame layout (must match engine.h):
//   [0] energy  [1] sub  [2] bass  [3] mid  [4] high
//   [5] beat_pulse  [6-9] onset[4]  [10] tempo_bpm
const FRAME_FLOATS = 11;

let _eng = null;       // { init, reset, pushSamples, getFrame, mod }
let _framePtr = 0;     // pointer into WASM heap for AudioFrame output
let _samplePtr = 0;    // reusable WASM heap buffer for PCM input
let _sampleLen = 0;

let _audioCtx = null;
let _workletReady = false;
let _captureNode = null;
let _source = null;
let _audioBuffer = null;

let _playing = false;
let _loop     = false;
let _startOffset = 0;
let _startTime = 0;
let _liveNode = null;   // MediaStreamAudioSourceNode when in tab-capture mode

let _currentFrame = _emptyFrame();
let _beatTimestamps = [];
let _prevBeatPulse = 0;

function _emptyFrame() {
    return {
        energy: 0, sub: 0, bass: 0, mid: 0, high: 0,
        beat_pulse: 0, onset: [0, 0, 0, 0], tempo_bpm: 0,
    };
}

// Call once after WASM is loaded. engine = { init, reset, pushSamples, getFrame, mod }.
export async function initAudio(engine) {
    _eng = engine;
    _framePtr = engine.mod._malloc(FRAME_FLOATS * 4);
    engine.init(44100, 2048);
}

// Decode and buffer an audio File object. Returns { name, duration }.
// Creates AudioContext on first call (satisfies autoplay policy — must be called
// from a user gesture handler in the caller before awaiting).
export async function loadFile(file) {
    await _ensureContext();
    _stopSource();
    const ab = await file.arrayBuffer();
    _audioBuffer = await _audioCtx.decodeAudioData(ab);
    if (_eng) _eng.reset();
    _beatTimestamps = [];
    _prevBeatPulse  = 0;
    return { name: file.name, duration: _audioBuffer.duration };
}

// Capture audio from a browser tab via getDisplayMedia.
// The user picks which tab to share (e.g. Yandex Music) in Chrome's dialog.
// Returns { name } where name is the captured stream label.
export async function connectStream() {
    await _ensureContext();
    _stopSource();

    // Chrome requires video:true in the picker; we stop it immediately.
    let stream;
    try {
        stream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: 1, height: 1, frameRate: 1 },
            audio: { echoCancellation: false, noiseSuppression: false, sampleRate: 44100 },
        });
    } catch (e) {
        throw new Error('Cancelled or no permission: ' + e.message);
    }
    stream.getVideoTracks().forEach(t => t.stop());

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
        throw new Error('No audio in stream — in Chrome\'s dialog tick "Share tab audio"');
    }

    if (_eng) _eng.reset();
    _beatTimestamps = [];
    _prevBeatPulse  = 0;
    _audioBuffer    = null;

    _captureNode = new AudioWorkletNode(_audioCtx, 'audio-capture-processor', {
        numberOfInputs: 1, numberOfOutputs: 0,
        channelCount: 2, channelCountMode: 'explicit',
    });
    _captureNode.port.onmessage = _onSamples;

    _liveNode = _audioCtx.createMediaStreamSource(stream);
    _liveNode.connect(_captureNode);

    _startOffset = 0;
    _startTime   = _audioCtx.currentTime;
    _playing     = true;

    audioTracks[0].addEventListener('ended', _stopSource);
    _raf();

    return { name: audioTracks[0].label || 'Live audio' };
}

export function setLoop(v) { _loop = v; }
export function isLoop()   { return _loop; }

export function getDuration() { return _audioBuffer?.duration ?? 0; }
export function getBeatTimestamps() { return _beatTimestamps; }

// Seek to a specific time in seconds.
export function seekTo(seconds) {
    if (!_audioBuffer) return;
    const offset = Math.max(0, Math.min(seconds, _audioBuffer.duration));
    const wasPlaying = _playing;
    _stopSource();
    _startOffset = offset;
    if (wasPlaying) play(offset);
}

// Start playback from offset seconds. Connects AudioWorklet for sample capture.
export function play(offset = 0) {
    if (!_audioBuffer || !_audioCtx || !_workletReady) return;
    _stopSource();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();

    // Capture node (analysis path — no audio output)
    _captureNode = new AudioWorkletNode(_audioCtx, 'audio-capture-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: _audioBuffer.numberOfChannels,
        channelCountMode: 'explicit',
    });
    _captureNode.port.onmessage = _onSamples;

    // Playback source
    _source = _audioCtx.createBufferSource();
    _source.buffer = _audioBuffer;
    _source.connect(_audioCtx.destination);
    _source.connect(_captureNode);

    _source.start(0, offset);
    _startOffset = offset;
    _startTime   = _audioCtx.currentTime;
    _playing     = true;
    _source.addEventListener('ended', () => {
        if (_loop) { play(0); } else { _playing = false; }
    });
    _raf();
}

// Suspend playback without discarding position.
export function pause() {
    _audioCtx?.suspend();
    _playing = false;
}

// Resume after pause().
export function resume() {
    if (!_audioCtx) return;
    _audioCtx.resume();
    _playing = true;
    _raf();
}

export function isPlaying() { return _playing; }

// Approximate playback position in seconds.
export function getCurrentTime() {
    if (!_audioCtx || !_startTime) return _startOffset;
    return _startOffset + (_audioCtx.currentTime - _startTime);
}

// Returns the most recent AudioFrame object (updated at ~60 fps via rAF).
// renderer.js should call this every frame.
export function getAudioFrame() { return _currentFrame; }

// ---- internals ----

async function _ensureContext() {
    if (_audioCtx) return;
    _audioCtx = new AudioContext({ sampleRate: 44100 });
    await _audioCtx.audioWorklet.addModule('audio-processor.js');
    _workletReady = true;
}

function _stopSource() {
    if (_captureNode) { _captureNode.port.onmessage = null; _captureNode.disconnect(); _captureNode = null; }
    if (_source) {
        try { _source.stop(); } catch (_) {}
        _source.disconnect();
        _source = null;
    }
    if (_liveNode) { _liveNode.disconnect(); _liveNode = null; }
    _playing = false;
}

function _onSamples(e) {
    if (!_eng) return;
    const samples = new Float32Array(e.data);
    const n = samples.length;
    // Grow WASM buffer on demand (128 samples per chunk — rarely needs realloc)
    if (!_samplePtr || _sampleLen < n) {
        if (_samplePtr) _eng.mod._free(_samplePtr);
        _samplePtr = _eng.mod._malloc(n * 4);
        _sampleLen = n;
    }
    _eng.mod.HEAPF32.set(samples, _samplePtr >> 2);
    _eng.pushSamples(_samplePtr, n);
}

function _raf() {
    if (!_playing || !_eng) return;
    _eng.getFrame(_framePtr);
    const F = _eng.mod.HEAPF32;
    const fp = _framePtr >> 2;
    const beatPulse = F[fp + 5];
    // Accumulate beat timestamps on rising edge.
    if (beatPulse > 0.7 && _prevBeatPulse <= 0.7) {
        _beatTimestamps.push(getCurrentTime());
    }
    _prevBeatPulse = beatPulse;
    _currentFrame = {
        energy:     F[fp + 0],
        sub:        F[fp + 1],
        bass:       F[fp + 2],
        mid:        F[fp + 3],
        high:       F[fp + 4],
        beat_pulse: beatPulse,
        onset:      [F[fp + 6], F[fp + 7], F[fp + 8], F[fp + 9]],
        tempo_bpm:  F[fp + 10],
    };
    requestAnimationFrame(_raf);
}
