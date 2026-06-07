// Unit tests for the Nova sphere meridian projection (pure JS, no GPU).
// Mirrors the nova_mode geometry in web/shaders/particles_update.wgsl.
// Run: node --test web/nova_project.test.mjs   (from ar-engine/)
//  or: node --test nova_project.test.mjs       (from ar-engine/web/)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novaProject, phiPupil, frontShade, R_SPHERE, ASPECT } from './nova_project.js';

const PI = Math.PI;

test('rim (φ=π/2) → r_screen = R_SPHERE for any meridian', () => {
    for (const theta of [0, 0.7, PI / 2, PI, 4.2, 2 * PI]) {
        const { rScreen } = novaProject(theta, PI / 2);
        assert.ok(Math.abs(rScreen - R_SPHERE) < 1e-9,
            `θ=${theta}: rScreen=${rScreen} ≠ ${R_SPHERE}`);
    }
});

test('pupil edge: r_screen(φ_pupil) ≈ R_pupil', () => {
    for (const rPupil of [0.05, 0.09, 0.15, 0.20]) {
        const ph = phiPupil(rPupil);
        const { rScreen } = novaProject(0, ph);
        assert.ok(Math.abs(rScreen - rPupil) < 1e-9,
            `R_pupil=${rPupil}: rScreen=${rScreen} ≠ ${rPupil}`);
    }
});

test('depth sign: front(+) at rim(0) and back(−)', () => {
    assert.ok(novaProject(0, 0.3).depth > 0, 'front hemisphere depth must be > 0');
    assert.ok(Math.abs(novaProject(0, PI / 2).depth) < 1e-9, 'rim depth must be ~0');
    assert.ok(novaProject(0, PI - 0.3).depth < 0, 'back hemisphere depth must be < 0');
});

test('depth is symmetric about the rim (front φ vs back π−φ)', () => {
    for (const phi of [0.2, 0.6, 1.0, 1.4]) {
        const front = novaProject(0, phi);
        const back = novaProject(0, PI - phi);
        assert.ok(Math.abs(front.rScreen - back.rScreen) < 1e-9,
            `φ=${phi}: front/back screen radius differ`);
        assert.ok(Math.abs(front.depth + back.depth) < 1e-9,
            `φ=${phi}: depths not mirror-opposite`);
    }
});

test('position mapping: θ=0 places point on +x with aspect correction', () => {
    const phi = 0.9;
    const { x, y, rScreen } = novaProject(0, phi, { cx: 0.5, cy: 0.5 });
    assert.ok(Math.abs(x - (0.5 + rScreen / ASPECT)) < 1e-9, `x=${x}`);
    assert.ok(Math.abs(y - 0.5) < 1e-9, `y=${y} should be at centre height`);
});

test('position mapping: θ=π/2 places point on +y (no aspect on y)', () => {
    const phi = 0.9;
    const { x, y, rScreen } = novaProject(PI / 2, phi, { cx: 0.5, cy: 0.5 });
    assert.ok(Math.abs(x - 0.5) < 1e-9, `x=${x} should be at centre`);
    assert.ok(Math.abs(y - (0.5 + rScreen)) < 1e-9, `y=${y}`);
});

test('φ_pupil is monotonic in R_pupil and clamps the asin domain', () => {
    let prev = -Infinity;
    for (const r of [0.0, 0.05, 0.1, 0.2, 0.29]) {
        const ph = phiPupil(r);
        assert.ok(ph > prev, `φ_pupil not increasing at R_pupil=${r}`);
        prev = ph;
    }
    // R_pupil ≥ R_sphere would push asin out of domain; the clamp keeps it finite.
    const big = phiPupil(R_SPHERE * 2);
    assert.ok(Number.isFinite(big), 'φ_pupil must stay finite for oversized R_pupil');
    assert.ok(big <= Math.asin(0.92) + 1e-9, 'φ_pupil must respect the 0.92 clamp');
});

test('frontShade: bright at front pole, dim at back pole', () => {
    assert.ok(Math.abs(frontShade(0) - 1) < 1e-9, 'front pole (age=0) must be fully lit');
    assert.ok(frontShade(1) < 1e-9, 'back pole (age=1) must be fully occluded');
});

test('frontShade is monotonically decreasing front→back', () => {
    let prev = Infinity;
    for (let age = 0; age <= 1.0001; age += 0.05) {
        const s = frontShade(age);
        assert.ok(s <= prev + 1e-12, `front_shade not decreasing at age=${age}`);
        assert.ok(s >= 0 && s <= 1, `front_shade out of [0,1] at age=${age}`);
        prev = s;
    }
});

test('frontShade: rim is partially lit (between back and front)', () => {
    const rim = frontShade(0.5);                 // depth = cos(π/2) = 0
    assert.ok(rim > frontShade(1) && rim < frontShade(0),
        `rim shade ${rim} must sit between back and front`);
    // depth=0 → smoothstep(-0.25, 0.55, 0) = ((0.25/0.8)²·(3−2·0.25/0.8))
    const t = 0.25 / 0.8;
    assert.ok(Math.abs(rim - t * t * (3 - 2 * t)) < 1e-9, `rim shade ${rim} mismatched`);
});

test('frontShade clamps age outside [0,1] (no NaN past the poles)', () => {
    assert.ok(Math.abs(frontShade(-0.3) - frontShade(0)) < 1e-9, 'age<0 must clamp to front');
    assert.ok(Math.abs(frontShade(1.4) - frontShade(1)) < 1e-9, 'age>1 must clamp to back');
});

test('all outputs finite across the full valid φ sweep', () => {
    const rPupil = 0.12;
    const ph = phiPupil(rPupil);
    for (let a = ph; a <= PI - ph; a += 0.05) {
        for (const theta of [0, 1.3, 3.0, 5.5]) {
            const r = novaProject(theta, a);
            for (const [k, v] of Object.entries(r)) {
                assert.ok(Number.isFinite(v), `${k} not finite at φ=${a}, θ=${theta}`);
            }
        }
    }
});
