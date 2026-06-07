// Timbre → colour mapping.
// Exports:
//   timbreToColor(centroid, tonal)        → { hue, sat, weight }   (pure, no state)
//   circularHueMean(hues, weights)        → hue in [0,1)           (wrap-safe mean)
//   createTimbreSmoother({ tau })         → step(centroid, tonal, dt) → smoothed colour
//   ANCHORS                               → tunable anchor table (single retune point)
//
// Idea: true instrument classification isn't feasible at 60 fps, so we place
// "instrument anchor" points in the (centroid × tonalness) plane and interpolate
// hue/sat between them with inverse-distance (Shepard) weights. Hue is averaged
// circularly (as unit vectors) so blends wrap correctly around the colour wheel.
// `weight` is a confidence that rises near an anchor and with `tonal` content
// (noisy/ambiguous audio → low weight → base palette shows through downstream).
//
// centroid = spectral brightness (0..1, log-normalised), tonal = harmonicity (0..1).

// Anchor table — the single place to retune the timbre→colour mapping.
//   c   = spectral centroid (brightness), 0..1
//   t   = tonalness (harmonicity), 0..1
//   hue = target hue, 0..1   sat = target saturation, 0..1
export const ANCHORS = [
    { name: 'male',    c: 0.20, t: 0.65, hue: 0.60, sat: 0.85 }, // low-warm voice  → blue
    { name: 'female',  c: 0.55, t: 0.55, hue: 0.92, sat: 0.90 }, // breathy-bright  → pink
    { name: 'strings', c: 0.65, t: 0.90, hue: 0.33, sat: 0.85 }, // harmonic-bright → green
    { name: 'perc',    c: 0.85, t: 0.20, hue: 0.10, sat: 0.25 }, // noisy/bright    → near-white
    { name: 'bass',    c: 0.10, t: 0.45, hue: 0.00, sat: 0.80 }, // low/warm        → red
];

const EPS = 1e-4;          // softens the 1/d² singularity at an anchor
const PROX_SCALE = 0.35;   // distance at which proximity confidence ≈ 0.5
const TWO_PI = Math.PI * 2;

function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

// Weighted mean of hues treated as angles on the colour wheel: sum unit vectors,
// take atan2 back. Blends across the 1.0/0.0 seam correctly (0.95 & 0.05 → ~0.0).
export function circularHueMean(hues, weights) {
    let sx = 0, sy = 0;
    for (let i = 0; i < hues.length; i++) {
        const a = TWO_PI * hues[i];
        const w = weights[i];
        sx += w * Math.cos(a);
        sy += w * Math.sin(a);
    }
    if (sx === 0 && sy === 0) return 0;
    let h = Math.atan2(sy, sx) / TWO_PI;
    if (h < 0) h += 1;
    return h;
}

// Pure mapping: (centroid, tonal) → { hue, sat, weight }. No internal state.
export function timbreToColor(centroid, tonal) {
    const c = clamp01(centroid);
    const t = clamp01(tonal);

    const hues = new Array(ANCHORS.length);
    const ws   = new Array(ANCHORS.length);
    let wsum = 0;
    let satAcc = 0;
    let dmin2 = Infinity;

    for (let i = 0; i < ANCHORS.length; i++) {
        const a = ANCHORS[i];
        const dc = c - a.c;
        const dt = t - a.t;
        const d2 = dc * dc + dt * dt;
        const w = 1 / (d2 + EPS);
        hues[i] = a.hue;
        ws[i]   = w;
        wsum   += w;
        satAcc += w * a.sat;
        if (d2 < dmin2) dmin2 = d2;
    }

    const hue = circularHueMean(hues, ws);
    const sat = satAcc / wsum;

    // Confidence: closeness to the nearest anchor × how tonal the sound is.
    const dmin = Math.sqrt(dmin2);
    const proximity = 1 / (1 + (dmin / PROX_SCALE) * (dmin / PROX_SCALE));
    const weight = clamp01(proximity * (0.3 + 0.7 * t));

    return { hue, sat, weight };
}

// Stateful EMA smoother (used per-frame by the draw pipeline). Hue is smoothed
// circularly so it never sweeps the long way round the wheel. τ in seconds; dt is
// the frame delta in seconds (default 1/60). First call snaps to the target.
export function createTimbreSmoother({ tau = 0.25 } = {}) {
    let hx = 1, hy = 0;   // smoothed hue as a unit vector
    let sat = 0.5;
    let weight = 0;
    let inited = false;

    return function step(centroid, tonal, dt = 1 / 60) {
        const target = timbreToColor(centroid, tonal);
        const ta = TWO_PI * target.hue;
        const tx = Math.cos(ta);
        const ty = Math.sin(ta);

        if (!inited) {
            hx = tx; hy = ty;
            sat = target.sat;
            weight = target.weight;
            inited = true;
        } else {
            const alpha = 1 - Math.exp(-dt / tau);
            hx += (tx - hx) * alpha;
            hy += (ty - hy) * alpha;
            sat += (target.sat - sat) * alpha;
            weight += (target.weight - weight) * alpha;
        }

        let hue = Math.atan2(hy, hx) / TWO_PI;
        if (hue < 0) hue += 1;
        return { hue, sat, weight };
    };
}
