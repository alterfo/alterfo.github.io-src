// record.js — Dual-path recording: 960×540 preview canvas + 1920×1080 WebCodecs.
//
// Primary path: VideoEncoder (WebCodecs) → webm-muxer → .webm download.
// Fallback:     MediaRecorder on the preview canvas if VideoEncoder is unsupported.
//
// Exports: initRecord, setRecordParams, startRecording, stopRecording, isRecording

import { getDevice, getOffscreenCanvas, getOffscreenContext,
         setOnRecordFrame, WIDTH, HEIGHT } from './renderer.js';
import { runRenderToTarget } from './render.js';

// webm-muxer: minimal WebM container writer (ESM build from jsDelivr CDN).
// Pinned to 5.0.3 for stability. The ArrayBufferTarget collects the output in memory.
const MUXER_URL = 'https://cdn.jsdelivr.net/npm/webm-muxer@5.0.3/build/webm-muxer.mjs';
let _Muxer = null;
let _ArrayBufferTarget = null;
async function _loadMuxer() {
    if (_Muxer) return;
    const mod = await import(MUXER_URL);
    _Muxer = mod.Muxer;
    _ArrayBufferTarget = mod.ArrayBufferTarget;
}

let _encoder    = null;
let _muxer      = null;
let _target     = null;
let _frameCount = 0;
let _startTime  = 0;
let _fps        = 60;
let _useFallback = false;

// Fallback MediaRecorder state (used only when VideoEncoder is not supported)
let _recorder   = null;
let _chunks     = [];
let _fbCanvas   = null;  // preview canvas reference for captureStream fallback

const _params = { bitrate: 8_000_000, codec: 'vp9', framerate: 60 };

// Codec string mapping: friendly name → VideoEncoder codec string + WebM track codec
const CODEC_MAP = {
    vp9:  { encoder: 'vp09.00.10.08', muxer: 'V_VP9' },
    vp8:  { encoder: 'vp8',           muxer: 'V_VP8' },
    av1:  { encoder: 'av01.0.08M.08', muxer: 'V_AV1' },
    h264: { encoder: 'avc1.42002A',   muxer: 'V_MPEG4/ISO/AVC' },
};

export function initRecord(canvas) {
    // canvas = the preview HTMLCanvasElement; kept for MediaRecorder fallback
    _fbCanvas = canvas;
}

// Called by advanced.js to configure recording options.
export function setRecordParams({ bitrate, codec, framerate } = {}) {
    if (bitrate   !== undefined) _params.bitrate   = bitrate;
    if (codec     !== undefined) _params.codec     = codec;
    if (framerate !== undefined) _params.framerate = framerate;
}

export async function startRecording(fps = 60) {
    if (_encoder || _recorder) return false;
    _fps = fps;
    _frameCount = 0;
    _startTime = performance.now();

    const codecKey  = _params.codec in CODEC_MAP ? _params.codec : 'vp9';
    const codecInfo = CODEC_MAP[codecKey];
    const config    = {
        codec:     codecInfo.encoder,
        width:     WIDTH,
        height:    HEIGHT,
        bitrate:   _params.bitrate,
        framerate: fps,
    };

    let supported = false;
    if (typeof VideoEncoder !== 'undefined') {
        try {
            const result = await VideoEncoder.isConfigSupported(config);
            supported = result.supported;
        } catch (_) { /* ignore */ }
    }

    if (supported) {
        await _loadMuxer();
        _target = new _ArrayBufferTarget();
        _muxer  = new _Muxer({
            target: _target,
            video: {
                codec:     codecInfo.muxer,
                width:     WIDTH,
                height:    HEIGHT,
                frameRate: fps,
            },
        });

        _encoder = new VideoEncoder({
            output: (chunk, meta) => _muxer.addVideoChunk(chunk, meta),
            error:  (e) => console.error('[record] VideoEncoder error:', e),
        });
        _encoder.configure(config);
        _useFallback = false;
        setOnRecordFrame(_onFrame);
        console.log('[record] VideoEncoder started —', codecKey,
            _params.bitrate / 1e6 + 'Mbps', fps + 'fps', WIDTH + '×' + HEIGHT);
    } else {
        // MediaRecorder fallback on the preview canvas
        _useFallback = true;
        if (!_fbCanvas) { console.error('[record] no canvas for fallback'); return false; }
        _chunks = [];
        const mime = _params.codec === 'h264'
            ? 'video/webm;codecs=avc1' : 'video/webm;codecs=vp9';
        const mimeType = MediaRecorder.isTypeSupported(mime) ? mime : 'video/webm';
        const stream = _fbCanvas.captureStream(fps);
        _recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: _params.bitrate,
        });
        _recorder.ondataavailable = e => { if (e.data.size > 0) _chunks.push(e.data); };
        _recorder.start(100);
        console.log('[record] MediaRecorder fallback started —', mimeType);
    }
    return true;
}

// Returns Promise<Blob|null>. Blob is the .webm, null if not recording.
export function stopRecording() {
    return new Promise(async resolve => {
        if (!_encoder && !_recorder) { resolve(null); return; }

        if (_encoder) {
            setOnRecordFrame(null);
            try {
                await _encoder.flush();
            } catch (e) {
                console.warn('[record] flush error:', e);
            }
            _encoder.close();
            _encoder = null;

            _muxer.finalize();
            const { buffer } = _target;
            _muxer  = null;
            _target = null;
            resolve(new Blob([buffer], { type: 'video/webm' }));
        } else {
            _recorder.onstop = () => {
                const blob = new Blob(_chunks, { type: 'video/webm' });
                _chunks = [];
                _recorder = null;
                resolve(blob);
            };
            _recorder.stop();
        }
    });
}

export function isRecording() {
    if (_encoder)  return _encoder.state === 'configured';
    if (_recorder) return _recorder.state === 'recording';
    return false;
}

// Called each animation frame by renderer.js when recording is active.
function _onFrame(offscreenCanvas, timestamp) {
    if (!_encoder || _encoder.state !== 'configured') return;

    const device = getDevice();
    const offCtx = getOffscreenContext();

    // Render full-res frame to the offscreen canvas.
    const recEncoder = device.createCommandEncoder({ label: 'rec-frame' });
    const offTex     = offCtx.getCurrentTexture();
    runRenderToTarget(recEncoder, offTex.createView(), WIDTH, HEIGHT);
    device.queue.submit([recEncoder.finish()]);

    // Capture the rendered HTMLCanvasElement as a VideoFrame.
    const tsUs = Math.round((timestamp - _startTime) * 1000);
    let frame;
    try {
        frame = new VideoFrame(offscreenCanvas, {
            timestamp: tsUs,
            duration:  Math.round(1e6 / _fps),
        });
    } catch (e) {
        console.error('[record] VideoFrame creation failed:', e);
        return;
    }

    // Don't let the encoder queue grow unboundedly (>2 frames = skip).
    if (_encoder.encodeQueueSize <= 2) {
        const keyFrame = _frameCount % Math.round(_fps * 2) === 0;
        _encoder.encode(frame, { keyFrame });
        _frameCount++;
    }
    frame.close();
}
