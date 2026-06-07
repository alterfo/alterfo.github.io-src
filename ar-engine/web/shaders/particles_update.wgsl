// Concert-screen abstract: 500k particles in a 4-pole vortex field.
// Poles travel on non-repeating Lissajous paths (golden-ratio frequencies)
// with alternating CW/CCW rotation — creating aurora-like streaming patterns
// that continuously evolve and never exactly repeat.
// Beat displaces all poles simultaneously → dramatic mid-song reorganisation.

struct Particle {
    pos  : vec2<f32>,
    vel  : vec2<f32>,
    age  : f32,
    hue  : f32,
    seed : u32,
    _pad : u32,
};

struct Uniforms {
    time       : f32,
    orbit_str  : f32,  // vortex tangential force (pre-scaled from slider)
    pole_speed : f32,  // Lissajous frequency multiplier
    noise_str  : f32,  // organic curl-noise shimmer
    speed      : f32,
    lifetime   : f32,
    hue_base   : f32,
    bass       : f32,
    mid        : f32,
    high       : f32,
    energy     : f32,
    beat_pulse : f32,
    prev_beat  : f32,
    _p0        : f32,
    _p1        : f32,
    _p2        : f32,
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

    // Beat displaces adjacent poles in opposite directions — creates a
    // "pull-apart" visual on every kick that snaps back as beat decays.
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

    // Pre-compute all 4 pole positions (avoids 4× repeated trig in loops)
    let ppos = array<vec2f, 4>(
        pole_pos(0u), pole_pos(1u), pole_pos(2u), pole_pos(3u)
    );

    // ---- Multi-pole vortex (pure tangential — no radial attraction) ----
    // Pure curl field: no sources or sinks, so particle density is preserved.
    // Particles follow the STREAMLINES between poles (not orbits around them),
    // creating flowing ribbons rather than visible blobs at pole positions.
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

    // ---- Aurora bias ----------------------------------------------------------------
    // When vortex is weak (low orbit_str), a slow oscillating horizontal current
    // dominates → aurora / curtain aesthetic.  As orbit_str rises the bias fades
    // out, giving way to plasma / ribbon / storm looks.
    // aurora_str → 0 when orbit_str ≥ 0.00045 (Vortex slider ≥ 9).
    let aurora_str = max(0.0, 0.00045 - u.orbit_str) * 0.55;
    let fa = sin(u.time * 0.06) * 0.55;            // ±31° swing, 105-s period
    let flow_dir = vec2f(cos(fa), sin(fa) * 0.18); // mostly horizontal curtains
    p.vel += flow_dir * aurora_str;

    // ---- Mid-frequency swirl: voices / synths stir the field ----
    let perp_vel = vec2f(-p.vel.y, p.vel.x);
    p.vel += perp_vel * u.mid * 0.0004;

    // ---- Organic shimmer (low-amplitude curl noise) ----
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
    // Each pole has a complementary hue; colour regions flow and merge
    // as poles drift — the colours themselves become part of the animation.
    let phues      = array<f32, 4>(0.06, 0.56, 0.16, 0.66);
    let target_hue = fract(phues[nearest_pole] + u.hue_base);
    var dh         = target_hue - p.hue;
    if dh > 0.5  { dh -= 1.0; }
    if dh < -0.5 { dh += 1.0; }
    p.hue = fract(p.hue + dh * 0.012);

    // ---- Age breathes with energy ----
    // Quiet sections → short-lived sparks; loud drops → long trailing ribbons.
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
        // Seed with small velocity in a random direction — poles quickly pull
        // particles into their orbits within a few frames.
        p.vel  = vec2f(cos(va), sin(va)) * u.orbit_str * 0.3;
        p.age  = uf01(s4) * 0.08;
        p.seed = s4;
        // Assign hue of nearest pole at birth position
        var md = 99.0; var np = 0u;
        for (var pi = 0u; pi < 4u; pi++) {
            let d = length(p.pos - ppos[pi]);
            if d < md { md = d; np = pi; }
        }
        p.hue = fract(phues[np] + u.hue_base + (uf01(uhash(s4 + 1u)) - 0.5) * 0.06);
    }

    particles[i] = p;
}
