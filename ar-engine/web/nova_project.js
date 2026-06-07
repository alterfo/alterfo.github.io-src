// nova_project.js — pure-math mirror of the Nova sphere meridian projection used
// in web/shaders/particles_update.wgsl (nova_mode branch). The WGSL is not unit-
// testable (no WebGPU harness), so the geometry lives here in parallel and is
// exercised by web/nova_project.test.mjs. Keep the two in sync: any change to the
// projection constants/formulas in the shader must be reflected here.
//
// Model: an orthographically-projected sphere of radius R_SPHERE centred at
// (cx, cy). A particle has a fixed meridian azimuth θ and a polar flow angle φ
// measured from the front pole (toward the observer):
//   φ = 0      → front pole (screen centre, depth +1)
//   φ = π/2    → rim / limbus (max screen radius, depth 0)
//   φ = π      → back pole (screen centre, depth −1)
// The pupil is the front cap: valid φ ∈ [φ_pupil, π − φ_pupil] with
// φ_pupil = asin(R_pupil / R_SPHERE) so r_screen(φ_pupil) == R_pupil.

export const R_SPHERE = 0.295;
export const ASPECT   = 16 / 9;

// Polar angle of the pupil cap edge. r_screen(phiPupil) === rPupil by construction.
// rPupil is clamped to [0, 0.92·rSphere] to mirror the shader's asin-domain guard.
export function phiPupil(rPupil, rSphere = R_SPHERE) {
    return Math.asin(Math.min(Math.max(rPupil / rSphere, 0), 0.92));
}

// Orthographic projection of a sphere point at meridian azimuth `theta` and polar
// flow angle `phi`. Returns screen position (x, y), the un-aspect-corrected screen
// radius `rScreen`, and `depth` (+1 front … −1 back) for occlusion shading.
export function novaProject(theta, phi, {
    rSphere = R_SPHERE, cx = 0.5, cy = 0.5, aspect = ASPECT,
} = {}) {
    const rScreen = rSphere * Math.sin(phi);
    return {
        x: cx + (rScreen * Math.cos(theta)) / aspect,
        y: cy + rScreen * Math.sin(theta),
        rScreen,
        depth: Math.cos(phi),
    };
}
