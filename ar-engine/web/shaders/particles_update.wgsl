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
    _p2          : f32,
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
    // NOVA MODE — orthographic sphere meridian flow (volumetric eyeball).
    // Particles flow ACROSS the volume of a ball: from the front cap (pupil edge,
    // toward the observer) over the surface out to the rim (limbus) and around to
    // the back. Meridian azimuth θ is fixed per fiber bundle; the polar flow angle
    // φ = age·π advances with time. Orthographic projection (ASPECT-corrected):
    //   r_screen = R·sin(φ);  pos = (cx + r·cosθ/ASPECT, cy + r·sinθ);  depth = cos(φ).
    // dr_screen/dφ → 0 at the rim ⇒ particles bunch at the limbus (natural bright
    // eye edge, no special case). Pupil = front cap: φ ∈ [φ_pupil, π−φ_pupil],
    // φ_pupil = asin(R_pupil/R). Beat raises R_pupil ⇒ φ_pupil grows ⇒ mydriasis.
    // Pure-math mirror + unit tests: web/nova_project.js.
    // =========================================================================
    if u.nova_mode > 0.5 {
        let ASPECT: f32 = 16.0 / 9.0;
        let cx = 0.5; let cy = 0.5;
        let R_sphere = 0.295;

        // Beat-reactive pupil (mydriasis on kick) + slow organic breathing.
        let R_pupil   = 0.090 + u.beat_pulse * 0.070 + u.bass * 0.018
                      + 0.005 * sin(u.time * 0.71);
        let phi_pupil = asin(clamp(R_pupil / R_sphere, 0.0, 0.92));
        let front_age = phi_pupil / PI;
        let back_age  = 1.0 - front_age;

        // Meridian azimuth θ: 72 fiber bundles + permanent per-particle jitter
        // (thickens each meridian into a band that "wraps" the ball, kept below
        // half the 5° arm spacing so bundles stay separated) + a gentle per-fiber
        // wave along the meridian so the bands aren't dead-straight.
        let N_ARMS   = 72u;
        let arm_id   = p.seed % N_ARMS;
        let base_ang = f32(arm_id) / f32(N_ARMS) * 2.0 * PI;
        let jitter   = (uf01(uhash(p.seed + 31u)) - 0.5) * 0.075;  // ±2.1°
        let wave_ph  = uf01(uhash(p.seed + 35u)) * 6.28318;

        // Advance the polar flow coordinate: dφ/dt = ω0 + beat·k_beat + energy·k_energy.
        let dphi = 0.0060 + u.beat_pulse * 0.030 + u.energy * 0.010;
        p.age += (dphi / PI) * u.speed;

        // Past the back pole → re-enter at the front cap edge with a small random
        // age offset so fibers don't pulse as synchronized dashes. seed (hence the
        // θ bundle) is kept stable across respawn so fibers never jump.
        if p.age >= back_age {
            let rs = uhash(p.seed ^ (u32(u.time * 61.0) + i + 7u));
            p.age = front_age + uf01(rs) * 0.05;
        }

        let phi   = clamp(p.age * PI, phi_pupil, PI - phi_pupil);
        let wave  = sin(phi * 2.0 + wave_ph) * 0.05;   // ±2.9° meridian wobble
        let theta = base_ang + jitter + wave;

        let sinp = sin(phi);
        let cosp = cos(phi);
        let ct   = cos(theta);
        let st   = sin(theta);
        let r_screen = R_sphere * sinp;

        p.pos = vec2f(cx + r_screen * ct / ASPECT, cy + r_screen * st);
        // Radial screen-space flow velocity (→ 0 at the rim); drives the draw
        // shader's speed-brightness and stays small on respawn (no flash).
        p.vel = vec2f(ct / ASPECT, st) * (R_sphere * cosp * dphi * u.speed);

        // Two-zone iris hue by screen radius: collarette amber (inner) → blue-grey
        // (outer) + permanent per-fiber tint. Timbre/zone blend applied in draw.
        let t_r     = clamp((r_screen - R_pupil) / (R_sphere - R_pupil), 0.0, 1.0);
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
