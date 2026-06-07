// Particle system: 500k GPU particles.
// Mode 0 (default): 4-pole vortex — aurora/plasma/storm aesthetics.
// Mode 1 (chladni):  Chladni standing-wave attractor — particles migrate to
//   nodal lines of W(x,y) = sin(n·π·x+φ)·sin(m·π·y) + sin(m·π·x)·sin(n·π·y-φ).
//   Force = -W·∇W pushes toward W=0. Mode numbers n,m driven by bass/treble.
//   Beat pulse shifts phase → "mode jump" then crystallises back.

const PI : f32 = 3.14159265;

struct Particle {
    pos  : vec2<f32>,
    vel  : vec2<f32>,
    age  : f32,
    hue  : f32,
    seed : u32,
    _pad : u32,
};

struct Uniforms {
    time         : f32,
    orbit_str    : f32,  // vortex tangential force (pre-scaled from slider)
    pole_speed   : f32,  // Lissajous frequency multiplier
    noise_str    : f32,  // organic curl-noise shimmer
    speed        : f32,
    lifetime     : f32,
    hue_base     : f32,
    bass         : f32,
    mid          : f32,
    high         : f32,
    energy       : f32,
    beat_pulse   : f32,
    prev_beat    : f32,
    chladni_mode : f32,  // 0 = vortex, 1 = Chladni standing-wave
    nova_mode    : f32,  // 1 = radial spiral bloom
    pupil_drive  : f32,  // Nova: JS-smoothed pupil dilation drive (anti-jerk)
    // Live Nova tuning (window.nova.set) — 16..23
    nova_fibers  : f32,  // strand count
    nova_jitter  : f32,  // per-particle strand spread (line thickness)
    nova_curl    : f32,  // spiral bend scale (1 = default)
    nova_amp     : f32,  // meander bend scale (1 = default)
    nova_iris_r  : f32,  // iris radius / fiber length
    nova_pupil_r : f32,  // pupil base radius
    nova_pupil_g : f32,  // pupil dilation gain
    nova_sclera  : f32,  // sclera-explorer fraction 0..1
    nova_flow    : f32,  // radial streaming speed multiplier
    nova_anim    : f32,  // fiber bend-morph speed
    _np0 : f32, _np1 : f32,
};

@group(0) @binding(0) var<uniform>             u         : Uniforms;
@group(0) @binding(1) var<storage, read_write> particles : array<Particle>;

fn uhash(x: u32) -> u32 {
    var v = x;
    v ^= v << 13u; v ^= v >> 17u; v ^= v << 5u;
    return v;
}
fn uf01(x: u32) -> f32 { return f32(x) / 4294967295.0; }

fn hash22(p: vec2<f32>) -> vec2<f32> {
    var q = p;
    q = vec2f(dot(q, vec2f(127.1, 311.7)), dot(q, vec2f(269.5, 183.3)));
    return fract(sin(q) * 43758.5453) * 2.0 - 1.0;
}
fn gnoise(p: vec2<f32>) -> f32 {
    let i  = floor(p); let f  = fract(p);
    let u_ = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(
        mix(dot(hash22(i),                       f),
            dot(hash22(i + vec2f(1.0, 0.0)),     f - vec2f(1.0, 0.0)), u_.x),
        mix(dot(hash22(i + vec2f(0.0, 1.0)),     f - vec2f(0.0, 1.0)),
            dot(hash22(i + vec2f(1.0, 1.0)),     f - vec2f(1.0, 1.0)), u_.x), u_.y);
}
fn curl2d(p: vec2<f32>, t: f32) -> vec2<f32> {
    let eps = 0.003;
    let tp  = p * 3.0 + vec2f(0.0, t * 0.18);
    let dx  = gnoise(tp + vec2f(eps, 0.0)) - gnoise(tp - vec2f(eps, 0.0));
    let dy  = gnoise(tp + vec2f(0.0, eps)) - gnoise(tp - vec2f(0.0, eps));
    return vec2f(dy, -dx) / (2.0 * eps);
}

// 4 Lissajous poles — irrational golden-ratio frequency pairs ensure
// the trajectory never exactly repeats over the lifetime of a song.
fn pole_pos(idx: u32) -> vec2f {
    let sp  = u.pole_speed * 0.15;  // 0.15 rad/s at speed=1 ≈ 42-s period
    let PHI = 0.6180339887;         // 1/φ

    var fx: f32; var fy: f32; var px: f32; var py: f32;
    switch idx {
        case 0u: { fx = 1.000; fy = PHI;   px = 0.00; py = 0.00; }
        case 1u: { fx = PHI;   fy = 1.000; px = 1.57; py = 2.36; }
        case 2u: { fx = 1.618; fy = PHI;   px = 3.14; py = 0.79; }
        default: { fx = PHI;   fy = 1.618; px = 4.71; py = 1.57; }
    }

    let beat_sign = select(-1.0, 1.0, idx % 2u == 0u);
    return vec2f(
        0.5 + 0.35 * sin(u.time * fx * sp + px) + beat_sign * u.beat_pulse * 0.13,
        0.5 + 0.35 * cos(u.time * fy * sp + py) - beat_sign * u.beat_pulse * 0.09,
    );
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if i >= arrayLength(&particles) { return; }

    var p = particles[i];

    // =========================================================================
    // CHLADNI / CYMATICS MODE — cosine free-edge plate, live-morphing.
    // W(x,y) = cos(n·π·x + φ)·cos(m·π·y) + cos(m·π·x)·cos(n·π·y + φ)
    // Fractional n,m (no floor) → pattern morphs continuously with music.
    // Slow time drift ensures visible evolution even during constant audio.
    // Beat injects a phase jump φ → pattern "shakes" and re-crystallises.
    // Curl noise prevents full freeze. Draw shader mirrors 4 quadrants.
    // =========================================================================
    if u.chladni_mode > 0.5 {
        // Smooth fractional modes — no floor(), so pattern morphs in-between
        // Bass drives n [1..4], high drives m [1..4], slow autonomous drift
        let n = 1.2 + u.bass * 2.8 + sin(u.time * 0.13) * 0.6;
        let m = 1.2 + u.high * 2.8 + cos(u.time * 0.09) * 0.6 + u.mid * 0.8;

        // Phase: beat causes a sudden jump; time causes slow pattern rotation
        let phi = u.beat_pulse * PI * 0.6 + u.time * 0.05;

        // Cosine free-edge Chladni — precompute sin/cos for each angle (8 calls total).
        // curl2d removed (was 32 sin/cos calls per particle → ~16M ops/frame at 500k).
        // Cheap hash-noise replaces it for anti-freeze: zero trig, pure integer ops.
        let ax = p.pos.x * n * PI + phi;
        let ay = p.pos.y * m * PI;
        let bx = p.pos.x * m * PI;
        let by = p.pos.y * n * PI + phi;
        let cax = cos(ax); let sax = sin(ax);
        let cay = cos(ay); let say = sin(ay);
        let cbx = cos(bx); let sbx = sin(bx);
        let cby = cos(by); let sby = sin(by);
        let W    = cax * cay + cbx * cby;
        let dWdx = -(n * PI) * sax * cay - (m * PI) * sbx * cby;
        let dWdy = -(m * PI) * cax * say - (n * PI) * cbx * sby;

        let str = 0.00028 * (1.0 + u.bass * 0.3 + u.beat_pulse * 0.5);
        p.vel += -vec2f(W * dWdx, W * dWdy) * str;

        // Cheap anti-freeze: hash-based random kick, zero trig ops.
        // Time-quantized so groups of 64 particles get kicks at staggered moments.
        let hk  = uhash(p.seed ^ (u32(u.time * 8.0) + (i >> 6u) + 5u));
        let hk2 = uhash(hk + 2u);
        p.vel += vec2f((uf01(hk) - 0.5), (uf01(hk2) - 0.5)) * 0.00015;

        // Boundary push
        let bnd  = 0.03;
        let push = str * 28.0;
        if p.pos.x < bnd           { p.vel.x += (bnd - p.pos.x) * push; }
        if p.pos.x > 1.0 - bnd     { p.vel.x -= (p.pos.x - 1.0 + bnd) * push; }
        if p.pos.y < bnd           { p.vel.y += (bnd - p.pos.y) * push; }
        if p.pos.y > 1.0 - bnd     { p.vel.y -= (p.pos.y - 1.0 + bnd) * push; }

        // Moderate damping — snaps to lines but not instantly frozen
        p.vel *= 0.83;
        p.pos  = clamp(p.pos + p.vel * u.speed, vec2f(0.0), vec2f(1.0));

        // Blue hue (draw shader will fold to kaleidoscope 4×)
        p.hue = fract(0.62 + (uf01(uhash(p.seed + 3u)) - 0.5) * 0.04);

        let dyn_life = u.lifetime * clamp(0.30 + u.energy * 6.0, 0.15, 2.5);
        p.age += 1.0 / max(dyn_life, 1.0);

        if p.age > 1.0 {
            let s  = uhash(p.seed + u32(u.time * 97.0 + f32(i)));
            let s1 = uhash(s); let s2 = uhash(s1);
            let s3 = uhash(s2); let s4 = uhash(s3);
            p.pos  = vec2f(uf01(s1), uf01(s2));
            p.vel  = vec2f(0.0);
            p.age  = uf01(s4) * 0.06;
            p.seed = s4;
            p.hue  = fract(0.62 + (uf01(uhash(s4 + 1u)) - 0.5) * 0.04);
        }

        particles[i] = p;
        return;
    }

    // =========================================================================
    // NOVA MODE — volumetric eyeball. The eyeball is a sphere (R_eye) LARGER than
    // the iris (R_iris): the iris is only the front colour ring; the "white" around
    // it is suggested by particles that flow ON PAST the limbus, slowing (sin
    // foreshortening: dr/dφ→0 at the rim) and fading (draw) → the eye reads as a
    // 3-D volume, not a flat disc. Meridian flow: azimuth θ per fiber; polar angle
    // φ = age·π advances with time. Orthographic projection (ASPECT-corrected):
    //   r_screen = R_eye·sin(φ);  pos = (cx + r·cosθ/ASPECT, cy + r·sinθ).
    // Fibers CURVE (per-fiber spiral) and WEAVE (per-fiber sinusoid) → not straight.
    // ~35% are "sclera explorers" (φ_max = π/2+) reaching the eyeball rim; the rest
    // are iris fibers (φ_max = φ_iris, ending at the limbus).
    // Pure-math mirror + unit tests: web/nova_project.js.
    // =========================================================================
    if u.nova_mode > 0.5 {
        let ASPECT: f32 = 16.0 / 9.0;
        let cx = 0.5; let cy = 0.5;
        let R_eye  = 0.420;            // full eyeball silhouette (sphere radius)
        let R_iris = u.nova_iris_r;   // iris ring edge (limbus) — most fibers end here

        // Pupil dilation driven by the JS-smoothed pupil_drive (soft attack/release →
        // gentle mydriasis, not a per-beat twitch) + slow organic breathing.
        let R_pupil   = u.nova_pupil_r + u.pupil_drive * u.nova_pupil_g
                      + 0.004 * sin(u.time * 0.6);
        let phi_pupil = asin(clamp(R_pupil / R_eye, 0.0, 0.92));
        let phi_iris  = asin(clamp(R_iris  / R_eye, 0.0, 0.999));
        let front_age = phi_pupil / PI;

        // ~35% "sclera explorers" flow past the limbus to the eyeball rim (and a
        // touch behind, φ_max = π/2 + 0.16) → volumetric halo around the iris.
        // The rest are iris fibers that turn back at the limbus.
        let is_sclera = (p.seed % 100u) < u32(clamp(u.nova_sclera, 0.0, 1.0) * 100.0);
        let phi_max   = select(phi_iris, PI * 0.5 + 0.16, is_sclera);
        let resp_age  = phi_max / PI;

        // Meridian azimuth θ: each particle belongs to one of N_FIBERS strands. The
        // wander parameters are derived from the FIBER id (not the particle seed), so
        // every particle on a strand shares the SAME curve → the strand reads as one
        // coherent, visibly bending line instead of a fuzzy radial band (the previous
        // per-particle randomness just blurred each arm into a straight spoke). Each
        // fiber gets a randomly-handed spiral + a 2-octave meander with its own
        // frequency/phase/amplitude, so 150 strands curve every which way and weave
        // through each other like real iris crypts. A per-fiber offset breaks the even
        // grid; a tiny per-particle jitter only gives the strand visible thickness.
        // Many fibers + the same particle budget ⇒ fewer particles per strand ⇒ fine,
        // thin lines (and a denser, prettier iris).
        let N_FIBERS = u32(clamp(u.nova_fibers, 1.0, 100000.0));
        let arm_id   = p.seed % N_FIBERS;
        var fs = uhash(uhash(arm_id + 0x9E3779B9u));  // scramble the small fiber id
        let g1 = uf01(fs); fs = uhash(fs);
        let g2 = uf01(fs); fs = uhash(fs);
        let g3 = uf01(fs); fs = uhash(fs);
        let g4 = uf01(fs); fs = uhash(fs);
        let g5 = uf01(fs); fs = uhash(fs);
        let g6 = uf01(fs); fs = uhash(fs);
        let g7 = uf01(fs);
        // Golden-angle (sunflower) distribution: consecutive fiber ids land ~137.5°
        // apart, so correlated curl/meander between neighbouring ids can't bunch them
        // into periodic spokes/gaps. fract() keeps the angle in [0,2π) for f32 precision;
        // a tiny per-fiber nudge breaks any residual structure. (0.3819660 = 1/φ².)
        let base_ang = fract(f32(arm_id) * 0.38196601) * 6.28318530 + (g1 - 0.5) * 0.05;
        // Living fibers: each strand's spiral slowly waxes/wanes/reverses on its own
        // period (per-fiber rate & phase) so the bend visibly morphs over ~15-30 s.
        // nova_anim scales the morph speed (0 = frozen). The meander phases also drift
        // with it, so the wiggles travel along the fibers.
        let morph  = sin(u.time * (0.22 + g3 * 0.24) * u.nova_anim + g4 * 6.28318);
        let curl   = (g2 - 0.5) * 0.20 * u.nova_curl * (0.4 + 0.7 * morph);  // animated spiral
        let f1     = 0.8 + g3 * 1.3;                         // 0.8..2.1 slow, smooth single bend
        let f2     = 2.0 + g4 * 2.0;                         // 2.0..4.0 subtle secondary undulation
        let ph1    = g5 * 6.28318 + u.time * 0.10 * u.nova_anim;  // drift → travelling wiggles
        let ph2    = g6 * 6.28318 - u.time * 0.07 * u.nova_anim;
        let amp    = (0.015 + g7 * 0.045) * u.nova_amp;      // per-fiber meander (scaled)
        // Per-fiber angular SWAY: the whole strand slowly rocks ±a couple degrees on
        // its own phase, so the dark gaps between fibers never sit still — they drift
        // and, with the motion trails, smear shut → the iris shimmers like a live eye.
        // Amplitude scales with nova_anim (0 = perfectly still).
        let sway   = sin(u.time * (0.30 + g6 * 0.50) + g5 * 6.28318) * 0.045 * u.nova_anim;
        let jitter = (uf01(uhash(p.seed + 31u)) - 0.5) * u.nova_jitter;  // strand thickness

        // Advance polar flow φ = age·π; respawn at the front cap when past φ_max.
        // Calmer than before: lower base rate + much smaller beat surge so particles
        // drift outward gently instead of rushing on every kick. Scaled by nova_flow.
        let dphi = (0.0032 + u.beat_pulse * 0.0090 + u.energy * 0.0045) * u.nova_flow;
        p.age += (dphi / PI) * u.speed;
        if p.age >= resp_age {
            let rs = uhash(p.seed ^ (u32(u.time * 61.0) + i + 7u));
            p.age = front_age + uf01(rs) * 0.05;
        }

        let phi = clamp(p.age * PI, phi_pupil, phi_max);
        // Radial fraction across the iris (0 pupil → 1 limbus → >1 in sclera);
        // the meander + spiral accumulate along the fiber with this.
        let t     = (phi - phi_pupil) / max(phi_iris - phi_pupil, 0.001);
        let tc    = min(t, 1.3);                       // clamp the wander in the sclera (no over-swirl)
        // Subtle 2-octave meander (amplitude grows with radius) + a gentle randomly-
        // handed spiral → each strand curves just slightly (~5-8° of azimuth wander at
        // the limbus), enough to look organic without the chaotic over-bending.
        let meander = (sin(t * f1 + ph1) * 0.7 + sin(t * f2 + ph2) * 0.3) * amp * tc;

        let sinp = sin(phi);
        let cosp = cos(phi);
        // Normalize the per-particle jitter by screen radius (∝ sinφ) so the strand's
        // SCREEN-space thickness stays ~constant from pupil to limbus. Without this the
        // fibers crowd into a razor-thin, dense band near the pupil and alias against the
        // pixel grid → periodic dark notches in the bright inner ring.
        let theta   = base_ang + sway + jitter / max(sinp, 0.30) + curl * tc * 0.6 + meander;
        let ct   = cos(theta);
        let st   = sin(theta);
        let r_screen = R_eye * sinp;

        p.pos = vec2f(cx + r_screen * ct / ASPECT, cy + r_screen * st);
        // Radial screen-space flow velocity (→ 0 at the rim ⇒ particles slow there).
        p.vel = vec2f(ct / ASPECT, st) * (R_eye * cosp * dphi * u.speed);

        // Two-zone iris hue by radius (collarette amber → blue-grey) + per-fiber tint.
        let t_r     = clamp((r_screen - R_pupil) / (R_iris - R_pupil), 0.0, 1.0);
        let hue_var = (uf01(uhash(p.seed + 34u)) - 0.5) * 0.10;
        p.hue = clamp(mix(0.09, 0.58, smoothstep(0.28, 0.72, t_r)) + hue_var, 0.01, 0.70);

        particles[i] = p;
        return;
    }

    // =========================================================================
    // VORTEX MODE (original — unchanged)
    // =========================================================================

    // Pre-compute all 4 pole positions (avoids 4× repeated trig in loops)
    let ppos = array<vec2f, 4>(
        pole_pos(0u), pole_pos(1u), pole_pos(2u), pole_pos(3u)
    );

    // ---- Multi-pole vortex (pure tangential — no radial attraction) ----
    let orbit = u.orbit_str * (1.0 + u.bass * 1.6);

    var force        = vec2f(0.0);
    var min_dist     = 99.0;
    var nearest_pole = 0u;

    for (var pi = 0u; pi < 4u; pi++) {
        let diff  = p.pos - ppos[pi];
        let dist  = length(diff);
        if dist < 0.001 { continue; }
        let sdist   = max(dist, 0.03);
        let tangent = vec2f(-diff.y, diff.x) / sdist;

        let rot = select(-1.0, 1.0, pi % 2u == 0u);
        force += tangent * rot * orbit / (sdist + 0.05);

        if dist < min_dist { min_dist = dist; nearest_pole = pi; }
    }
    p.vel += force;

    // ---- Aurora bias ----
    let aurora_str = max(0.0, 0.00045 - u.orbit_str) * 0.55;
    let fa = sin(u.time * 0.06) * 0.55;
    let flow_dir = vec2f(cos(fa), sin(fa) * 0.18);
    p.vel += flow_dir * aurora_str;

    // ---- Mid-frequency swirl ----
    let perp_vel = vec2f(-p.vel.y, p.vel.x);
    p.vel += perp_vel * u.mid * 0.0004;

    // ---- Organic shimmer ----
    p.vel += curl2d(p.pos, u.time) * u.noise_str;

    // ---- Soft canvas boundary ----
    let bnd  = 0.04;
    let push = orbit * 6.0;
    if p.pos.x < bnd           { p.vel.x += (bnd - p.pos.x) * push; }
    if p.pos.x > 1.0 - bnd     { p.vel.x -= (p.pos.x - 1.0 + bnd) * push; }
    if p.pos.y < bnd           { p.vel.y += (bnd - p.pos.y) * push; }
    if p.pos.y > 1.0 - bnd     { p.vel.y -= (p.pos.y - 1.0 + bnd) * push; }

    // ---- Damping + integrate ----
    p.vel *= 0.97;
    p.pos  = clamp(p.pos + p.vel * u.speed, vec2f(0.0), vec2f(1.0));

    // ---- Hue slowly converges toward nearest pole's colour ----
    let phues      = array<f32, 4>(0.06, 0.56, 0.16, 0.66);
    let target_hue = fract(phues[nearest_pole] + u.hue_base);
    var dh         = target_hue - p.hue;
    if dh > 0.5  { dh -= 1.0; }
    if dh < -0.5 { dh += 1.0; }
    p.hue = fract(p.hue + dh * 0.012);

    // ---- Age breathes with energy ----
    let dyn_life = u.lifetime * clamp(0.25 + u.energy * 7.0, 0.10, 2.5);
    p.age += 1.0 / max(dyn_life, 1.0);

    // ---- Respawn ----
    if p.age > 1.0 {
        let s  = uhash(p.seed + u32(u.time * 97.0 + f32(i)));
        let s1 = uhash(s);
        let s2 = uhash(s1);
        let s3 = uhash(s2);
        let s4 = uhash(s3);
        p.pos  = vec2f(uf01(s1), uf01(s2));
        let va = uf01(s3) * 6.28318;
        p.vel  = vec2f(cos(va), sin(va)) * u.orbit_str * 0.3;
        p.age  = uf01(s4) * 0.08;
        p.seed = s4;
        var md = 99.0; var np = 0u;
        for (var pi = 0u; pi < 4u; pi++) {
            let d = length(p.pos - ppos[pi]);
            if d < md { md = d; np = pi; }
        }
        p.hue = fract(phues[np] + u.hue_base + (uf01(uhash(s4 + 1u)) - 0.5) * 0.06);
    }

    particles[i] = p;
}
