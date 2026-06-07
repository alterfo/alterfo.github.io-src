// record.js — Video recording via the browser-native MediaRecorder API.
//
// No external libraries, NO CDN (project rule). We capture the on-screen preview
// canvas (which is composited every frame) with canvas.captureStream(); MediaRecorder
// muxes it to .webm in-browser. This replaced the old WebCodecs + webm-muxer (CDN)
// path, which produced empty 4 KB files (its first chunk carried a non-zero timestamp
// the muxer rejected, so every chunk was dropped).
//
// Recording resolution = the preview canvas size (960×540). The preview canvas is the
// only reliably-composited surface; capturing the hidden 1920×1080 offscreen canvas is
// not dependable across Chrome versions, so reliability wins over resolution here.
//
// Exports: initRecord, setRecordParams, startRecording, stopRecording, isRecording,
//          getRecordError, getRecordedFrameCount

import { setOnRecordFrame } from './renderer.js';
import { getRecordAudioStream } from './audio.js';

let _recorder    = null;
let _stream      = null;   // combined video+audio stream handed to MediaRecorder
let _videoStream = null;   // canvas captureStream — we own & stop these tracks
let _chunks      = [];
let _fps        = 60;
let _frameCount = 0;
let _lastError  = null;
let _canvas     = null;   // preview canvas (capture source)

const _params = { bitrate: 12_000_000, codec: 'vp9', framerate: 60 };

// codec → candidate MediaRecorder MIME types (first supported one wins). Audio is
// muxed as Opus; the ",opus" variants are tried first so the .webm has sound.
const CODEC_MIME = {
    vp9:  ['video/webm;codecs=vp9,opus',  'video/webm;codecs=vp9'],
    vp8:  ['video/webm;codecs=vp8,opus',  'video/webm;codecs=vp8'],
    av1:  ['video/webm;codecs=av01,opus', 'video/webm;codecs=av01'],
    h264: ['video/webm;codecs=h264,opus', 'video/mp4;codecs=h264,aac', 'video/webm;codecs=h264'],
};

export function initRecord(canvas) {
    _canvas = canvas;
}

// Called by advanced.js to configure recording options.
export function setRecordParams({ bitrate, codec, framerate } = {}) {
    if (bitrate   !== undefined) _params.bitrate   = bitrate;
    if (codec     !== undefined) _params.codec     = codec;
    if (framerate !== undefined) _params.framerate = framerate;
}

function _pickMime(codec) {
    const wanted    = CODEC_MIME[codec] ?? CODEC_MIME.vp9;
    const fallbacks = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus',
                       'video/webm;codecs=vp9', 'video/webm'];
    for (const m of [...wanted, ...fallbacks]) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
    }
    return 'video/webm';
}

export async function startRecording(fps = 60) {
    if (_recorder) return false;
    _fps = fps;
    _frameCount = 0;
    _lastError  = null;
    _chunks     = [];

    if (typeof MediaRecorder === 'undefined') {
        _lastError = new Error('MediaRecorder unsupported');
        return false;
    }
    if (!_canvas) { _lastError = new Error('no canvas to capture'); return false; }

    // Keep the render loop at full frame-rate while recording (renderer.js drops to
    // ~20 fps when idle; a non-null record-frame callback disables that throttle so
    // captureStream samples smooth, non-duplicated frames during quiet passages).
    setOnRecordFrame(_keepAlive);

    try {
        _videoStream = _canvas.captureStream(fps);
    } catch (e) {
        _lastError = e; setOnRecordFrame(null);
        console.error('[record] captureStream failed:', e);
        return false;
    }

    // Mux the playing audio alongside the video: combine the canvas video track with
    // the audio tap's track(s) into one stream. The audio track belongs to audio.js'
    // persistent destination node, so we must NOT stop it on cleanup (only the video).
    const tracks = [..._videoStream.getVideoTracks()];
    let hasAudio = false;
    const audioStream = getRecordAudioStream();
    if (audioStream) {
        for (const tr of audioStream.getAudioTracks()) { tracks.push(tr); hasAudio = true; }
    }
    _stream = new MediaStream(tracks);

    const mimeType = _pickMime(_params.codec);
    try {
        _recorder = new MediaRecorder(_stream, {
            mimeType,
            videoBitsPerSecond: _params.bitrate,
            audioBitsPerSecond: 192_000,
        });
    } catch (e) {
        _lastError = e; setOnRecordFrame(null);
        _videoStream.getTracks().forEach(t => t.stop());
        _videoStream = null; _stream = null;
        console.error('[record] MediaRecorder construct failed:', e);
        return false;
    }
    if (!hasAudio) console.warn('[record] no audio source — recording video only');

    _recorder.ondataavailable = e => { if (e.data && e.data.size > 0) _chunks.push(e.data); };
    _recorder.onerror = e => { if (!_lastError) _lastError = e.error || e;
                               console.error('[record] MediaRecorder error:', e.error || e); };
    // timeslice: emit a chunk every 250 ms so data accumulates and is never lost.
    _recorder.start(250);
    console.log('[record] MediaRecorder started —', mimeType,
        _params.bitrate / 1e6 + 'Mbps', fps + 'fps',
        _canvas.width + '×' + _canvas.height,
        hasAudio ? '| +audio' : '| video-only');
    return true;
}

// Returns Promise<Blob|null>. Blob is the .webm, null if not recording / no data.
export function stopRecording() {
    return new Promise(resolve => {
        if (!_recorder) { resolve(null); return; }
        setOnRecordFrame(null);
        const rec = _recorder;
        rec.onstop = () => {
            const type = rec.mimeType || 'video/webm';
            const blob = _chunks.length ? new Blob(_chunks, { type }) : null;
            console.log('[record] stopped | chunks:', _chunks.length,
                '| bytes:', blob ? blob.size : 0,
                '| error:', _lastError ? (_lastError.message || _lastError) : 'none');
            _chunks   = [];
            _recorder = null;
            // Stop only the canvas video tracks. The audio track is shared with
            // audio.js' persistent tap (used for the next recording) — never stop it.
            if (_videoStream) { _videoStream.getTracks().forEach(t => t.stop()); _videoStream = null; }
            _stream = null;
            resolve(blob);
        };
        try { rec.requestData(); } catch (_) { /* flush remaining */ }
        try { rec.stop(); } catch (e) { if (!_lastError) _lastError = e; rec.onstop(); }
    });
}

// Last recording error (or null). Lets the UI explain a failed recording.
export function getRecordError() { return _lastError; }

// Frames seen by the render loop during the last/current recording.
export function getRecordedFrameCount() { return _frameCount; }

export function isRecording() {
    return _recorder ? _recorder.state === 'recording' : false;
}

// Registered as the renderer's record-frame callback: only disables the idle throttle
// and counts frames. captureStream samples the canvas itself, so nothing to draw here.
function _keepAlive() { _frameCount++; }
