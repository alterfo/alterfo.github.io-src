// Stadium beam emitter: 500k particles organised into 6 sweeping light beams.
// Each beam originates from a fixed "light head" position and fires particles
// in a sweeping cone. Bass widens the sweep; beat snaps the angle.

struct Particle {
    pos  : vec2<f32>,
    vel  : vec2<f32>,
    age  : f32,
    hue  : f32,
    seed : u32,
    _pad : u32,
};

struct Uniforms {
    time        : f32,
    beam_spread : f32,   // half-angle of beam cone in radians
    sweep_scale : f32,   // sweep amplitude multiplier
    noise_str   : f32,   // organic shimmer (curl noise)
    speed       : f32,
    lifetime    : f32,
    hue_base    : f32,
    bass        : f32,
    mid         : f32,
    high        : f32,
    energy      : f32,
    beat_pulse  : f32,
    prev_beat   : f32,
    _p0         : f32,
    _p1         : f32,
    _p2         : f32,
};

@group(0) @binding(0) var<uniform>             u         : Uniforms;
@group(0) @binding(1) var<storage, read_write> particles : array<Particle>;

fn uhash(x: u32) -> u32 {
    var v = x;
    v ^= v << 13u;  v ^= v >> 17u;  v ^= v << 5u;
    return v;
}
fn uf01(x: u32) -> f32 { return f32(x) / 4294967295.0; }

// Minimal gradient noise for beam shimmer
fn hash22(p: vec2<f32>) -> vec2<f32> {
    var q = p;
    q = vec2<f32>(dot(q, vec2<f32>(127.1, 311.7)), dot(q, vec2<f32>(269.5, 183.3)));
    return fract(sin(q) * 43758.5453) * 2.0 - 1.0;
}
fn gnoise(p: vec2<f32>) -> f32 {
    let i  = floor(p);
    let f  = fract(p);
    let u_ = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(
        mix(dot(hash22(i),                       f),
            dot(hash22(i + vec2f(1.0, 0.0)),     f - vec2f(1.0, 0.0)), u_.x),
        mix(dot(hash22(i + vec2f(0.0, 1.0)),     f - vec2f(0.0, 1.0)),
            dot(hash22(i + vec2f(1.0, 1.0)),     f - vec2f(1.0, 1.0)), u_.x), u_.y);
}
fn shimmer(p: vec2<f32>, t: f32) -> vec2<f32> {
    let eps = 0.003;
    let tp  = p * 5.0 + vec2f(0.0, t * 0.35);
    let dx  = gnoise(tp + vec2f(eps, 0.0)) - gnoise(tp - vec2f(eps, 0.0));
    let dy  = gnoise(tp + vec2f(0.0, eps)) - gnoise(tp - vec2f(0.0, eps));
    return vec2f(dy, -dx) / (2.0 * eps);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if i >= arrayLength(&particles) { return; }
    let e = i % 6u;

    // ---- Emitter positions (around the canvas edges, pointing inward) ----
    let epos = array<vec2f, 6>(
        vec2f(0.08, 0.74),   // left stage wing
        vec2f(0.92, 0.74),   // right stage wing
        vec2f(0.24, 0.96),   // left back truss
        vec2f(0.76, 0.96),   // right back truss
        vec2f(0.08, 0.04),   // left overhead rig
        vec2f(0.92, 0.04),   // right overhead rig
    );
    // Base angles pointing toward canvas center — precomputed atan2(0.5-ey, 0.5-ex)
    let ebase = array<f32, 6>(
        -0.540, -2.602,   // wings point inward-up
        -1.083, -2.059,   // trusses point upward-inward
         0.820,  2.321,   // overheads point downward-inward
    );
    // Individual sweep parameters: freq, phase, amplitude
    let efreq  = array<f32, 6>(0.47, 0.47, 0.53, 0.53, 0.41, 0.41);
    let ephase = array<f32, 6>(0.00, 1.57, 2.09, 4.19, 1.05, 3.14);
    let eswamp = array<f32, 6>(0.45, 0.45, 0.38, 0.38, 0.52, 0.52);
    // Per-emitter hue (complementary pairs)
    let ehue   = array<f32, 6>(0.06, 0.56, 0.14, 0.64, 0.82, 0.32);

    // ---- Current beam angle for this emitter ----
    let sweep_amp  = eswamp[e] * u.sweep_scale * (1.0 + u.bass * 0.7);
    // Even emitters snap one way on beat, odd the other — "scissors" effect
    let beat_sign  = select(-1.0, 1.0, e % 2u == 0u);
    let beam_angle = ebase[e]
        + sweep_amp * sin(u.time * efreq[e] + ephase[e])
        + beat_sign * u.beat_pulse * 0.55;

    // Bass momentarily scatters each particle within the fan (different jitter per particle)
    let bass_jitter = (uf01(uhash(i * 4u + 1u)) - 0.5) * u.bass * 0.12;
    let steer_angle = beam_angle + bass_jitter;
    let beam_dir    = vec2f(cos(steer_angle), sin(steer_angle));

    var p = particles[i];

    // ---- Organic shimmer ----
    p.vel += shimmer(p.pos, u.time) * u.noise_str;

    // ---- Continuous beam steering: ALL particles turn toward current beam angle ----
    // Normal speed: smooth motor-like sweep (0.10/frame ≈ 22 frames to redirect).
    // Beat spike: snappy redirect (0.28/frame ≈ 8 frames) — all beams snap at once.
    let spd = length(p.vel);
    if spd > 0.0002 {
        let vel_dir    = p.vel / spd;
        let steer_rate = clamp(0.10 + u.beat_pulse * 0.18, 0.0, 1.0);
        let new_dir    = normalize(mix(vel_dir, beam_dir, steer_rate));
        p.vel = new_dir * spd;
    }

    // ---- Damping + integrate ----
    p.vel *= 0.97;
    p.pos += p.vel * u.speed;

    // ---- Age (breathes with music energy) ----
    // At silence: 15% of set lifetime → short sparks.
    // At moderate energy (0.1): ~1× set lifetime → normal beams.
    // At loud sections (0.2+): up to 2.5× → extended trailing beams.
    let dyn_lifetime = u.lifetime * clamp(0.3 + u.energy * 7.0, 0.10, 2.5);
    let inv_life     = 1.0 / max(dyn_lifetime, 1.0);
    p.age += inv_life;

    // ---- Respawn at emitter when particle dies ----
    if p.age > 1.0 {
        let s  = uhash(p.seed + u32(u.time * 97.0 + f32(i)));
        let s1 = uhash(s);
        let s2 = uhash(s1);
        let s3 = uhash(s2);

        // Scatter within beam cone; mid widens beam slightly
        let spread     = (uf01(s1) - 0.5) * (u.beam_spread + u.mid * 0.04);
        let emit_angle = beam_angle + spread;

        let beam_speed = 0.010 + u.energy * 0.004;
        p.pos = epos[e];
        p.vel = vec2f(cos(emit_angle), sin(emit_angle)) * beam_speed;
        p.age = uf01(s2) * 0.06;  // slight stagger to avoid simultaneous respawn
        p.hue = fract(ehue[e] + u.hue_base + (uf01(s3) - 0.5) * 0.04);
        p.seed = s3;
    }

    particles[i] = p;
}
