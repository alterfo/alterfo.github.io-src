// advanced.js — Advanced mode panel (Task 10)
// Exports: initAdvanced({ canvasWrap }) → { open, close, isOpen }

import {
    getAudioFrame, getCurrentTime, getDuration,
    getBeatTimestamps, seekTo,
} from './audio.js';
import { setParticleParams } from './particles.js';
import { setFeedbackParams } from './feedback.js';
import { setRenderParams, PALETTES } from './render.js';
import { setRecordParams } from './record.js';

const LS_KEY = 'arfluid_advanced_v4';

const PALETTE_NAMES = ['Cyberpunk', 'Fire', 'Ocean', 'Matrix'];

const SLIDERS = [
    { key: 'noiseScale', label: 'Vortex',   min: 1.0,  max: 10.0, step: 0.5,  places: 1 },
    { key: 'noiseSpeed', label: 'Drift',    min: 0.1,  max: 2.0,  step: 0.1,  places: 1 },
    { key: 'decay',      label: 'Trails',   min: 0.88, max: 0.99, step: 0.01, places: 2 },
    { key: 'lifetime',   label: 'Lifetime', min: 60,   max: 600,  step: 30,   places: 0 },
    { key: 'hueScale',   label: 'Hue Spd',  min: 0,    max: 3,    step: 0.1,  places: 1 },
];

const BAND_OPTIONS = ['off', 'sub', 'bass', 'mid', 'high'];

// Named presets — each evokes a different abstract visual mood
const PRESETS = [
    { name: 'Plasma',  noiseScale: 4.0, noiseSpeed: 0.6,  decay: 0.96, lifetime: 240, hueScale: 1.0 },
    { name: 'Vortex',  noiseScale: 7.0, noiseSpeed: 0.4,  decay: 0.97, lifetime: 360, hueScale: 0.5 },
    { name: 'Aurora',  noiseScale: 2.5, noiseSpeed: 0.3,  decay: 0.98, lifetime: 480, hueScale: 0.3 },
    { name: 'Storm',   noiseScale: 6.0, noiseSpeed: 1.5,  decay: 0.93, lifetime: 120, hueScale: 3.0 },
    { name: 'Minimal', noiseScale: 2.0, noiseSpeed: 0.9,  decay: 0.95, lifetime: 180, hueScale: 2.0 },
];

const DEFAULTS = {
    noiseScale: 4.0, noiseSpeed: 0.6, decay: 0.96, lifetime: 240, hueScale: 1.0,
    blendMode: 0, paletteIdx: 0,
    resolution: '1080p', bitrate: 8, codec: 'vp9',
    bindings: { noiseScale: 'off', noiseSpeed: 'off', decay: 'off', lifetime: 'off', hueScale: 'off' },
};

// Interpolate between two flat-12-float palette arrays.
function lerpPalette(a, b, t) {
    return a.map((v, i) => v * (1 - t) + b[i] * t);
}

function flatPalette(idx) {
    return PALETTES[idx].flat();
}

function formatTime(s) {
    const m   = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
}

// ---- CSS -------------------------------------------------------------------
function injectStyles() {
    if (document.getElementById('adv-style')) return;
    const style = document.createElement('style');
    style.id = 'adv-style';
    style.textContent = `
        #advanced-panel {
            position: absolute; right: 0; top: 0; width: 280px; height: 100%;
            background: rgba(4, 0, 14, 0.93); border-left: 1px solid #8b00ff;
            overflow-y: auto; overflow-x: hidden;
            transform: translateX(100%); transition: transform 0.22s ease;
            z-index: 10; font-size: 0.76rem; color: #ccc; user-select: none;
        }
        #advanced-panel.open { transform: translateX(0); }
        .adv-header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 10px 12px 8px; border-bottom: 1px solid #2a004a;
            font-size: 0.82rem; letter-spacing: 0.06em; color: #a060ff; font-weight: 600;
        }
        #adv-close {
            background: none; border: none; color: #555; font-size: 1.1rem;
            cursor: pointer; padding: 0 2px; line-height: 1;
        }
        #adv-close:hover { color: #fff; }
        .adv-section {
            padding: 10px 12px 8px; border-bottom: 1px solid #18002e;
        }
        .adv-label {
            font-size: 0.68rem; letter-spacing: 0.08em; color: #6040a0;
            text-transform: uppercase; margin-bottom: 7px;
        }
        #spec-canvas { display: block; width: 100%; border-radius: 3px; }
        .slider-row {
            display: grid; grid-template-columns: 56px 1fr 36px 68px;
            align-items: center; gap: 5px; margin-bottom: 5px;
        }
        .slider-row span:first-child { color: #888; font-size: 0.72rem; }
        .slider-row input[type=range] { width: 100%; accent-color: #8b00ff; }
        .slider-val { color: #c080ff; font-size: 0.72rem; text-align: right; font-variant-numeric: tabular-nums; }
        .bind-sel {
            background: #0d0020; border: 1px solid #2a004a; color: #888;
            border-radius: 3px; font-size: 0.66rem; padding: 2px 2px;
            width: 100%; cursor: pointer;
        }
        .bind-sel:focus { outline: none; border-color: #8b00ff; }
        .preset-row { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 2px; }
        .preset-btn {
            flex: 1; min-width: 50px; padding: 6px 3px;
            background: #0d0020; border: 1px solid #2a004a; color: #888;
            border-radius: 4px; cursor: pointer; font-size: 0.68rem; text-align: center;
            transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .preset-btn.active { background: #1a0035; border-color: #00ffcc; color: #00ffcc; }
        .preset-btn:hover:not(.active) { border-color: #8b00ff; color: #c080ff; }
        .pal-row { display: flex; gap: 5px; flex-wrap: wrap; }
        .pal-btn {
            flex: 1; min-width: 56px; padding: 5px 4px;
            background: #0d0020; border: 1px solid #2a004a; color: #888;
            border-radius: 4px; cursor: pointer; font-size: 0.69rem; text-align: center;
            transition: border-color 0.15s, color 0.15s;
        }
        .pal-btn.active, .pal-btn:hover { border-color: #8b00ff; color: #c080ff; }
        .blend-row { margin-top: 7px; display: flex; align-items: center; gap: 8px; }
        .blend-row select, .exp-sel {
            flex: 1; background: #0d0020; border: 1px solid #2a004a; color: #ccc;
            border-radius: 3px; font-size: 0.73rem; padding: 3px 4px; cursor: pointer;
        }
        .blend-row select:focus, .exp-sel:focus { outline: none; border-color: #8b00ff; }
        .exp-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
        .exp-row span { color: #666; font-size: 0.72rem; min-width: 62px; }
        /* Timeline */
        #adv-timeline {
            position: absolute; bottom: 58px; left: 0; right: 0; height: 26px;
            display: none; cursor: pointer; z-index: 9;
        }
        #adv-timeline.open { display: block; }
        #adv-timeline canvas { display: block; width: 100%; height: 100%; }
    `;
    document.head.appendChild(style);
}

// ---- Panel HTML ------------------------------------------------------------
function buildPanelHTML() {
    const sliderRows = SLIDERS.map(s => `
        <div class="slider-row">
            <span>${s.label}</span>
            <input type="range" id="sl-${s.key}"
                min="${s.min}" max="${s.max}" step="${s.step}" value="${DEFAULTS[s.key]}">
            <span class="slider-val" id="sl-val-${s.key}">
                ${Number(DEFAULTS[s.key]).toFixed(s.places)}
            </span>
            <select class="bind-sel" id="bind-${s.key}">
                ${BAND_OPTIONS.map(b => `<option value="${b}">${b}</option>`).join('')}
            </select>
        </div>
    `).join('');

    const palBtns = PALETTE_NAMES.map((n, i) =>
        `<button class="pal-btn" data-idx="${i}">${n}</button>`
    ).join('');

    const presetBtns = PRESETS.map(p =>
        `<button class="preset-btn" data-preset="${p.name}">${p.name}</button>`
    ).join('');

    return `
        <div class="adv-header">
            Advanced
            <button id="adv-close">✕</button>
        </div>
        <div class="adv-section">
            <div class="adv-label">Presets</div>
            <div class="preset-row">${presetBtns}</div>
        </div>
        <div class="adv-section">
            <div class="adv-label">Spectrum</div>
            <canvas id="spec-canvas" width="240" height="72"></canvas>
        </div>
        <div class="adv-section">
            <div class="adv-label">Shader Params</div>
            ${sliderRows}
        </div>
        <div class="adv-section">
            <div class="adv-label">Colour Palette</div>
            <div class="pal-row">${palBtns}</div>
            <div class="blend-row">
                <span style="color:#666;font-size:.72rem;min-width:62px">Blend</span>
                <select id="blend-mode">
                    <option value="0">Normal</option>
                    <option value="1">Screen</option>
                    <option value="2">Difference</option>
                </select>
            </div>
        </div>
        <div class="adv-section">
            <div class="adv-label">Export</div>
            <div class="exp-row">
                <span>Resolution</span>
                <select id="exp-res" class="exp-sel">
                    <option value="720p">720p</option>
                    <option value="1080p" selected>1080p</option>
                    <option value="4k">4K</option>
                </select>
            </div>
            <div class="exp-row">
                <span>Bitrate</span>
                <select id="exp-bitrate" class="exp-sel">
                    <option value="4">4 Mbps</option>
                    <option value="8" selected>8 Mbps</option>
                    <option value="16">16 Mbps</option>
                </select>
            </div>
            <div class="exp-row">
                <span>Codec</span>
                <select id="exp-codec" class="exp-sel">
                    <option value="vp9" selected>VP9</option>
                    <option value="h264">H.264</option>
                </select>
            </div>
        </div>
    `;
}

// ---- Spectrum drawing ------------------------------------------------------
function drawSpectrum(ctx, canvas, frame) {
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const vals   = [frame?.sub ?? 0, frame?.bass ?? 0, frame?.mid ?? 0, frame?.high ?? 0];
    const labels = ['SUB', 'BASS', 'MID', 'HIGH'];
    const colors = ['#8b00ff', '#0088ff', '#00ffcc', '#aaff22'];
    const LABEL_H = 13;
    const barH    = H - LABEL_H;
    const gap     = 6;
    const barW    = (W - gap * 3) / 4;

    for (let i = 0; i < 4; i++) {
        const x = i * (barW + gap);
        const v = Math.min(vals[i] * 2.5, 1.0);
        const h = v * barH;

        // Background track
        ctx.fillStyle = '#0d0020';
        ctx.fillRect(x, 0, barW, barH);

        // Bar
        ctx.fillStyle = colors[i];
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x, barH - h, barW, h);
        ctx.globalAlpha = 1.0;

        // Label
        ctx.fillStyle = '#444';
        ctx.font = '8px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], x + barW / 2, H - 2);
    }
}

// ---- Timeline drawing ------------------------------------------------------
function drawTimeline(canvas, dur, cur, beats) {
    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = 'rgba(4, 0, 14, 0.85)';
    ctx.fillRect(0, 0, W, H);

    if (!dur) return;

    // Beat ticks
    ctx.fillStyle = 'rgba(139, 0, 255, 0.5)';
    for (const t of beats) {
        const x = (t / dur) * W;
        ctx.fillRect(x - 1, 2, 2, H - 4);
    }

    // Progress bar (faint)
    const px = (cur / dur) * W;
    ctx.fillStyle = 'rgba(0, 255, 255, 0.12)';
    ctx.fillRect(0, 0, px, H);

    // Playhead line
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(px - 1, 0, 2, H);

    // Time labels
    ctx.fillStyle = '#555';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(formatTime(cur), 4, H - 4);
    ctx.textAlign = 'right';
    ctx.fillText(formatTime(dur), W - 4, H - 4);
}

// ---- Main export -----------------------------------------------------------
export function initAdvanced({ canvasWrap, onClose } = {}) {
    injectStyles();

    // Load state from localStorage
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}'); } catch {}
    const state = { ...DEFAULTS, ...saved };
    // Ensure bindings sub-object is present
    if (!state.bindings || typeof state.bindings !== 'object') {
        state.bindings = { ...DEFAULTS.bindings };
    }

    // Palette crossfade state
    let _palA    = flatPalette(state.paletteIdx);  // current rendered palette
    let _palB    = [..._palA];                      // target palette
    let _palT    = 1.0;                             // 0 = start of fade, 1 = done

    function currentPalette() {
        return _palT >= 1.0 ? _palA : lerpPalette(_palA, _palB, _palT);
    }

    // ---- Build DOM ---------------------------------------------------------
    const panel = document.createElement('div');
    panel.id = 'advanced-panel';
    panel.innerHTML = buildPanelHTML();
    canvasWrap.appendChild(panel);

    const tlWrap = document.createElement('div');
    tlWrap.id = 'adv-timeline';
    const tlCanvas = document.createElement('canvas');
    tlCanvas.height = 26;
    tlWrap.appendChild(tlCanvas);
    canvasWrap.appendChild(tlWrap);

    // Resize timeline canvas width to match wrapper
    const tlObs = new ResizeObserver(() => {
        tlCanvas.width = tlWrap.offsetWidth;
    });
    tlObs.observe(tlWrap);

    // ---- Wire sliders ------------------------------------------------------
    for (const s of SLIDERS) {
        const input   = panel.querySelector(`#sl-${s.key}`);
        const valSpan = panel.querySelector(`#sl-val-${s.key}`);
        const bindSel = panel.querySelector(`#bind-${s.key}`);

        input.value    = state[s.key];
        valSpan.textContent = Number(state[s.key]).toFixed(s.places);
        bindSel.value  = state.bindings[s.key] ?? 'off';

        input.addEventListener('input', () => {
            state[s.key] = parseFloat(input.value);
            valSpan.textContent = Number(state[s.key]).toFixed(s.places);
            applyParams();
            save();
        });
        bindSel.addEventListener('change', () => {
            state.bindings[s.key] = bindSel.value;
            save();
        });
    }

    // ---- Preset buttons ----------------------------------------------------
    const presetBtnEls = panel.querySelectorAll('.preset-btn');

    function applyPreset(name) {
        const p = PRESETS.find(pr => pr.name === name);
        if (!p) return;
        // Copy preset values into state
        Object.assign(state, {
            noiseScale: p.noiseScale,
            noiseSpeed: p.noiseSpeed,
            decay:      p.decay,
            lifetime:   p.lifetime,
            hueScale:   p.hueScale,
        });
        // Sync all slider elements to new values
        for (const s of SLIDERS) {
            const input   = panel.querySelector(`#sl-${s.key}`);
            const valSpan = panel.querySelector(`#sl-val-${s.key}`);
            if (input && state[s.key] !== undefined) {
                input.value = state[s.key];
                if (valSpan) valSpan.textContent = Number(state[s.key]).toFixed(s.places);
            }
        }
        presetBtnEls.forEach(b => b.classList.toggle('active', b.dataset.preset === name));
        applyParams();
        save();
    }

    presetBtnEls.forEach(btn => {
        btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
    });

    // Highlight preset if current state matches one exactly
    const matchingPreset = PRESETS.find(p =>
        p.noiseScale === state.noiseScale && p.noiseSpeed === state.noiseSpeed &&
        p.decay === state.decay && p.lifetime === state.lifetime
    );
    if (matchingPreset) {
        panel.querySelector(`[data-preset="${matchingPreset.name}"]`)?.classList.add('active');
    }

    // ---- Blend mode --------------------------------------------------------
    const blendSel = panel.querySelector('#blend-mode');
    blendSel.value = state.blendMode;
    blendSel.addEventListener('change', () => {
        state.blendMode = parseInt(blendSel.value);
        applyParams();
        save();
    });

    // ---- Palette buttons ---------------------------------------------------
    const palBtns = panel.querySelectorAll('.pal-btn');
    palBtns[state.paletteIdx]?.classList.add('active');

    palBtns.forEach((btn, i) => {
        btn.addEventListener('click', () => {
            palBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _palA  = currentPalette();  // freeze current interpolated value
            _palB  = flatPalette(i);
            _palT  = 0.0;
            state.paletteIdx = i;
            save();
        });
    });

    // ---- Export settings ---------------------------------------------------
    const resSel    = panel.querySelector('#exp-res');
    const bitrateSel = panel.querySelector('#exp-bitrate');
    const codecSel  = panel.querySelector('#exp-codec');

    resSel.value     = state.resolution;
    bitrateSel.value = state.bitrate;
    codecSel.value   = state.codec;

    [resSel, bitrateSel, codecSel].forEach(el => {
        el.addEventListener('change', () => {
            state.resolution = resSel.value;
            state.bitrate    = parseInt(bitrateSel.value);
            state.codec      = codecSel.value;
            applyRecordParams();
            save();
        });
    });

    // ---- Close button ------------------------------------------------------
    panel.querySelector('#adv-close').addEventListener('click', () => {
        close();
        if (onClose) onClose();
    });

    // ---- Timeline click → seek --------------------------------------------
    tlWrap.addEventListener('click', e => {
        const dur = getDuration();
        if (!dur) return;
        const rect = tlWrap.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        seekTo(frac * dur);
    });

    // ---- Spectrum canvas ---------------------------------------------------
    const specCanvas = panel.querySelector('#spec-canvas');
    const specCtx    = specCanvas.getContext('2d');

    // ---- rAF loop ----------------------------------------------------------
    let _open  = false;
    let _rafId = null;

    function _loop() {
        if (!_open) return;
        _rafId = requestAnimationFrame(_loop);

        const frame = getAudioFrame();

        // Advance palette crossfade (~0.4 s at 60fps)
        if (_palT < 1.0) {
            _palT = Math.min(1.0, _palT + 0.04);
        }

        // Apply audio-bind modulation + push to pipelines
        applyParamsWithBindings(frame);

        // Spectrum bars
        drawSpectrum(specCtx, specCanvas, frame);

        // Timeline
        const dur   = getDuration();
        const cur   = getCurrentTime();
        const beats = getBeatTimestamps();
        drawTimeline(tlCanvas, dur, cur, beats);
    }

    // ---- Apply helpers -----------------------------------------------------
    function applyParams() {
        setParticleParams({
            noiseScale: state.noiseScale,
            noiseSpeed: state.noiseSpeed,
            lifetime:   state.lifetime,
        });
        setFeedbackParams({ decayNormal: state.decay });
        setRenderParams({
            palette:   currentPalette(),
            blendMode: state.blendMode,
            hueScale:  state.hueScale,
        });
    }

    function applyParamsWithBindings(frame) {
        if (!frame) { applyParams(); return; }

        const bands = {
            sub: frame.sub, bass: frame.bass,
            mid: frame.mid, high: frame.high,
        };

        function effective(s) {
            const band = state.bindings[s.key];
            if (!band || band === 'off') return state[s.key];
            const bv    = bands[band] ?? 0;
            const range = s.max - s.min;
            return Math.max(s.min, Math.min(s.max, state[s.key] + bv * range * 0.4));
        }

        const noiseScale = effective(SLIDERS[0]);
        const noiseSpeed = effective(SLIDERS[1]);
        const decay      = effective(SLIDERS[2]);
        const lifetime   = effective(SLIDERS[3]);
        const hueScale   = effective(SLIDERS[4]);

        setParticleParams({ noiseScale, noiseSpeed, lifetime });
        setFeedbackParams({ decayNormal: decay });
        setRenderParams({
            palette:   currentPalette(),
            blendMode: state.blendMode,
            hueScale,
        });
    }

    function applyRecordParams() {
        setRecordParams({
            bitrate: state.bitrate * 1_000_000,
            codec:   state.codec,
        });
    }

    function save() {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(state));
        } catch {}
    }

    // ---- Public API --------------------------------------------------------
    function open() {
        if (_open) return;
        _open = true;
        panel.classList.add('open');
        tlWrap.classList.add('open');
        applyParams();
        applyRecordParams();
        _rafId = requestAnimationFrame(_loop);
    }

    function close() {
        if (!_open) return;
        _open = false;
        panel.classList.remove('open');
        tlWrap.classList.remove('open');
        if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
        // Reset pipelines to slider baseline (no binding modulation)
        applyParams();
    }

    function isOpen() { return _open; }

    // Apply initial saved state to pipelines
    applyParams();
    applyRecordParams();

    return { open, close, isOpen };
}
