// Unit tests for the timbre→colour mapping (pure JS, no GPU).
// Run: node --test web/timbre_color.test.mjs   (from ar-engine/)
//  or: node --test timbre_color.test.mjs       (from ar-engine/web/)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    timbreToColor,
    circularHueMean,
    createTimbreSmoother,
    ANCHORS,
} from './timbre_color.js';

// Circular distance between two hues (both in [0,1)); accounts for the 1/0 seam.
function hueDist(a, b) {
    const d = Math.abs(a - b) % 1;
    return Math.min(d, 1 - d);
}

test('female-ish input → hue near pink (0.92)', () => {
    const { hue } = timbreToColor(0.55, 0.55);
    assert.ok(hueDist(hue, 0.92) < 0.05, `hue=${hue} not near 0.92`);
});

test('strings-ish input → hue near green (0.33)', () => {
    const { hue } = timbreToColor(0.65, 0.90);
    assert.ok(hueDist(hue, 0.33) < 0.05, `hue=${hue} not near 0.33`);
});

test('bass-ish input → hue near red (0.0)', () => {
    const { hue } = timbreToColor(0.10, 0.45);
    assert.ok(hueDist(hue, 0.0) < 0.05, `hue=${hue} not near 0.0`);
});

test('circular hue mean wraps across the 1/0 seam', () => {
    // 0.95 and 0.05 straddle the seam: arithmetic mean is 0.5 (wrong, cyan),
    // circular mean must land near 0.0 (red), not 0.5.
    const h = circularHueMean([0.95, 0.05], [1, 1]);
    assert.ok(hueDist(h, 0.0) < 0.02, `circular mean=${h} not near 0.0`);
    assert.ok(hueDist(h, 0.5) > 0.4, `circular mean=${h} wrongly near 0.5`);
});

test('circular hue mean falls back to 0 for empty / zero-weight input', () => {
    // The (sx===0 && sy===0) guard must return a finite hue, not NaN.
    assert.equal(circularHueMean([], []), 0);
    assert.equal(circularHueMean([0.5], [0]), 0);
    assert.equal(circularHueMean([0.2, 0.7], [0, 0]), 0);
});

test('weight is monotonic increasing with tonal (at strings centroid)', () => {
    // At c=0.65, rising tonal moves toward the strings anchor (c0.65,t0.90),
    // so confidence must rise both via proximity and via the tonal factor.
    const c = 0.65;
    const ts = [0.1, 0.3, 0.5, 0.7, 0.9];
    let prev = -Infinity;
    for (const t of ts) {
        const { weight } = timbreToColor(c, t);
        assert.ok(weight > prev, `weight not increasing: t=${t} w=${weight} prev=${prev}`);
        prev = weight;
    }
});

test('outputs are finite and in range for all anchors and corners', () => {
    const samples = [
        ...ANCHORS.map(a => [a.c, a.t]),
        [0, 0], [1, 1], [0, 1], [1, 0], [0.5, 0.5],
        [-1, 2], [2, -1], // out-of-range inputs are clamped, must stay safe
    ];
    for (const [c, t] of samples) {
        const { hue, sat, weight } = timbreToColor(c, t);
        for (const [k, v] of Object.entries({ hue, sat, weight })) {
            assert.ok(Number.isFinite(v), `${k} not finite for (${c},${t})`);
            assert.ok(v >= 0 && v <= 1, `${k}=${v} out of [0,1] for (${c},${t})`);
        }
    }
});

test('input at an anchor returns ~that anchor hue/sat (Shepard singularity)', () => {
    for (const a of ANCHORS) {
        const { hue, sat } = timbreToColor(a.c, a.t);
        assert.ok(hueDist(hue, a.hue) < 0.06, `${a.name}: hue=${hue} vs ${a.hue}`);
        assert.ok(Math.abs(sat - a.sat) < 0.1, `${a.name}: sat=${sat} vs ${a.sat}`);
    }
});

test('smoother first call snaps to the pure mapping', () => {
    const step = createTimbreSmoother({ tau: 0.25 });
    const got = step(0.65, 0.90, 1 / 60);
    const want = timbreToColor(0.65, 0.90);
    assert.ok(hueDist(got.hue, want.hue) < 1e-9, 'hue should snap on first call');
    assert.ok(Math.abs(got.sat - want.sat) < 1e-9, 'sat should snap on first call');
    assert.ok(Math.abs(got.weight - want.weight) < 1e-9, 'weight should snap on first call');
});

test('smoother converges toward the target over time', () => {
    const step = createTimbreSmoother({ tau: 0.25 });
    step(0.10, 0.45, 1 / 60);            // start near bass (red)
    let r;
    for (let i = 0; i < 300; i++) r = step(0.65, 0.90, 1 / 60); // drive to strings
    const want = timbreToColor(0.65, 0.90);
    assert.ok(hueDist(r.hue, want.hue) < 0.01, `converged hue=${r.hue} vs ${want.hue}`);
    assert.ok(Math.abs(r.weight - want.weight) < 0.02, `converged weight=${r.weight}`);
});
