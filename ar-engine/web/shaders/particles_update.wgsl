// Particle system update compute shader.
// Each invocation updates one of up to 500k particles using 2-octave curl noise.

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
    noise_scale  : f32,
    noise_speed  : f32,
    noise_str    : f32,
    speed        : f32,
    lifetime     : f32,
    hue_base     : f32,
    bass         : f32,
    mid          : f32,
    high         : f32,
    energy       : f32,
    beat_pulse   : f32,
    prev_beat    : f32,  // beat on the previous frame (for edge detection)
    _p0          : f32,
    _p1          : f32,
    _p2          : f32,
};

@group(0) @binding(0) var<uniform>            u         : Uniforms;
@group(0) @binding(1) var<storage, read_write> particles : array<Particle>;

// ---- Gradient noise ----------------------------------------------------------
fn hash22(p: vec2<f32>) -> vec2<f32> {
    var q = p;
    q = vec2<f32>(dot(q, vec2<f32>(127.1, 311.7)), dot(q, vec2<f32>(269.5, 183.3)));
    return fract(sin(q) * 43758.5453) * 2.0 - 1.0;
}

fn gnoise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0); // quintic smooth
    let a = dot(hash22(i + vec2<f32>(0.0, 0.0)), f - vec2<f32>(0.0, 0.0));
    let b = dot(hash22(i + vec2<f32>(1.0, 0.0)), f - vec2<f32>(1.0, 0.0));
    let c = dot(hash22(i + vec2<f32>(0.0, 1.0)), f - vec2<f32>(0.0, 1.0));
    let d = dot(hash22(i + vec2<f32>(1.0, 1.0)), f - vec2<f32>(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 2D curl noise: rotate gradient of scalar field by 90°
fn curl2d(p: vec2<f32>, t: f32) -> vec2<f32> {
    let sc  = u.noise_scale;
    let eps = 0.001;
    let tp  = vec2<f32>(p.x * sc, p.y * sc + t * u.noise_speed);

    // octave 1
    let dx1 = gnoise(tp + vec2<f32>(eps, 0.0)) - gnoise(tp - vec2<f32>(eps, 0.0));
    let dy1 = gnoise(tp + vec2<f32>(0.0, eps)) - gnoise(tp - vec2<f32>(0.0, eps));
    var c = vec2<f32>(dy1, -dx1) / (2.0 * eps);

    // octave 2 (higher frequency, lower amplitude)
    let tp2 = tp * 2.3 + vec2<f32>(13.4, 7.7);
    let dx2 = gnoise(tp2 + vec2<f32>(eps, 0.0)) - gnoise(tp2 - vec2<f32>(eps, 0.0));
    let dy2 = gnoise(tp2 + vec2<f32>(0.0, eps)) - gnoise(tp2 - vec2<f32>(0.0, eps));
    c += vec2<f32>(dy2, -dx2) * 0.5 / (2.0 * eps);

    return c;
}

// ---- Fast integer hash for respawn randomness --------------------------------
fn uhash(x: u32) -> u32 {
    var v = x;
    v ^= v << 13u;  v ^= v >> 17u;  v ^= v << 5u;
    return v;
}
fn uf01(x: u32) -> f32 { return f32(x) / 4294967295.0; }

// ---- Main -------------------------------------------------------------------
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let i = gid.x;
    if i >= arrayLength(&particles) { return; }

    var p = particles[i];

    // ---- curl noise force (bass + beat both amplify turbulence) ----------
    let bass_amp = 1.0 + u.bass * 2.5 + u.beat_pulse * 3.0;
    let c = curl2d(p.pos, u.time);
    p.vel += c * u.noise_str * bass_amp;

    // ---- beat rising edge: radial explosion from random point -----------
    let is_beat = u.beat_pulse > 0.7 && u.prev_beat <= 0.7;
    if is_beat {
        let seed = uhash(i ^ u32(u.time * 1000.0));
        let bx   = uf01(uhash(seed));
        let by   = uf01(uhash(seed + 1u));
        let dir  = p.pos - vec2<f32>(bx, by);
        let d    = length(dir);
        if d > 0.001 {
            p.vel += normalize(dir) * 0.18;
        }
    }

    // ---- gentle attractor (shifts with mid energy) ----------------------
    let cx    = 0.5 + sin(u.time * 0.07) * 0.15;
    let cy    = 0.5 + cos(u.time * 0.11) * 0.12;
    let pull  = vec2<f32>(cx, cy) - p.pos;
    p.vel += pull * 0.0003 * (1.0 - u.energy);

    // ---- damping + integrate (beat reduces damping → faster swirl) ------
    let spd = u.speed * (0.5 + u.energy * 1.5);
    p.vel *= (0.93 - u.beat_pulse * 0.05);
    p.pos += p.vel * spd;
    p.pos  = fract(p.pos);   // wrap at boundary

    // ---- age & respawn --------------------------------------------------
    let inv_life = 1.0 / max(u.lifetime, 1.0);
    p.age += inv_life;
    if p.age > 1.0 {
        let s  = uhash(p.seed + u32(u.time * 100.0 + f32(i)));
        let s1 = uhash(s);
        let s2 = uhash(s1);
        let s3 = uhash(s2);
        p.pos  = vec2<f32>(uf01(s1), uf01(s2));
        p.vel  = vec2<f32>(0.0);
        p.age  = uf01(s3) * 0.3;   // stagger so not all die at once
        p.hue  = fract(uf01(uhash(s3 + 1u)) + u.hue_base + u.high * 0.2);
        p.seed = s;
    }

    particles[i] = p;
}
