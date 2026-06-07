// Particle draw shader — renders point-list particles to trail texture.
// When kaleidoscope > 0.5 (Cymatics mode): draws 4× per particle, mirrored
// into all 4 quadrants around canvas centre → instant kaleidoscope symmetry.

struct Particle {
    pos  : vec2<f32>,
    vel  : vec2<f32>,
    age  : f32,
    hue  : f32,
    seed : u32,
    _pad : u32,
};

struct DrawUniforms {
    energy      : f32,
    beat_pulse  : f32,
    mid         : f32,
    high        : f32,
    kaleidoscope: f32,   // 1.0 = cymatics quarter×4 mirror mode
    nova_mode   : f32,   // 1.0 = iris mode (zone brightness scaling)
    _p2 : f32, _p3 : f32,
};

@group(0) @binding(0) var<storage, read> particles : array<Particle>;
@group(0) @binding(1) var<uniform>       u          : DrawUniforms;

struct VSOut {
    @builtin(position) pos   : vec4<f32>,
    @location(0)       color : vec4<f32>,
};

fn hsl2rgb(h: f32, s: f32, l: f32) -> vec3<f32> {
    let c = (1.0 - abs(2.0 * l - 1.0)) * s;
    let x = c * (1.0 - abs(fract(h * 6.0) * 2.0 - 1.0));
    let m = l - c * 0.5;
    let h6 = h * 6.0;
    var rgb: vec3<f32>;
    if      h6 < 1.0 { rgb = vec3f(c, x, 0.0); }
    else if h6 < 2.0 { rgb = vec3f(x, c, 0.0); }
    else if h6 < 3.0 { rgb = vec3f(0.0, c, x); }
    else if h6 < 4.0 { rgb = vec3f(0.0, x, c); }
    else if h6 < 5.0 { rgb = vec3f(x, 0.0, c); }
    else              { rgb = vec3f(c, 0.0, x); }
    return rgb + m;
}

fn uhash_d(x: u32) -> u32 {
    var v = x; v ^= v << 13u; v ^= v >> 17u; v ^= v << 5u; return v;
}
fn uf01_d(x: u32) -> f32 { return f32(x) * 2.3283064365e-10; }

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VSOut {
    var p_idx: u32;
    var quad:  u32;

    if u.kaleidoscope > 0.5 {
        // Quarter mapping: first ¼ of buffer × 4 quadrants = PARTICLE_COUNT draws.
        // 4× fewer vertex invocations than the old 4*PARTICLE_COUNT approach.
        let quarter = arrayLength(&particles) / 4u;
        p_idx = idx % quarter;
        quad  = idx / quarter;
    } else {
        p_idx = idx;
        quad  = 0u;
    }

    let p = particles[p_idx];

    var px = p.pos.x;
    var py = p.pos.y;

    if u.kaleidoscope > 0.5 {
        // Fold particle to first quadrant [0, 0.5] × [0, 0.5]
        let fx = select(px, 1.0 - px, px > 0.5);
        let fy = select(py, 1.0 - py, py > 0.5);
        // Mirror into target quadrant
        switch quad {
            case 0u: { px = fx;       py = fy; }
            case 1u: { px = 1.0 - fx; py = fy; }
            case 2u: { px = fx;       py = 1.0 - fy; }
            default: { px = 1.0 - fx; py = 1.0 - fy; }
        }
    }

    let ndc = vec2f(px * 2.0 - 1.0, 1.0 - py * 2.0);

    let spd_env    = clamp(length(p.vel) * 30.0, 0.0, 1.0);
    let age_env    = sin(clamp(p.age, 0.0, 1.0) * 3.14159);
    let brightness = 0.30 + 0.70 * max(spd_env, age_env * 0.6);

    // Sclera particles (nova hue > 0.80): cream-white, low saturation
    let is_sclera = u.nova_mode > 0.5 && fract(p.hue) > 0.80;
    let hue = select(fract(p.hue + u.high * 0.04), 0.095f, is_sclera);
    let sat = select(clamp(0.90 + u.mid * 0.10, 0.0, 1.0), 0.18f, is_sclera);
    let val = select(0.50f, 0.74f, is_sclera);
    let rgb = hsl2rgb(hue, sat, val);

    let energy_boost = 1.0 + u.energy * 3.8;
    let beat_boost   = 1.0 + u.beat_pulse * 3.8;

    // Kaleidoscope: quarter×4 mapping → same brightness as full-count single draw.
    let k_scale = select(1.0, 1.0, u.kaleidoscope > 0.5);

    // Nova iris: collarette (amber, hue≈0.09) is 2× brighter than outer (blue, hue≈0.58).
    let zone_scale = select(1.0,
        mix(2.0, 0.7, smoothstep(0.05, 0.62, fract(p.hue))),
        u.nova_mode > 0.5);

    // Nova: soft pupil edge fade + organic per-fiber brightness texture
    var nova_fx = 1.0;
    if u.nova_mode > 0.5 {
        let dx_ = p.pos.x - 0.5;
        let dy_ = p.pos.y - 0.5;
        let sr_ = sqrt(dx_ * dx_ * 3.16049 + dy_ * dy_);   // screen-space radius
        let R_pu = 0.090 + u.beat_pulse * 0.055;             // approx beat-reactive R_pupil
        nova_fx  = smoothstep(0.0, 0.022, sr_ - R_pu);      // fade near pupil edge
        nova_fx *= 0.65 + uf01_d(uhash_d(p.seed + 77u)) * 0.70;  // per-fiber 0.65..1.35
    }

    let base_alpha = brightness * 0.0022 * energy_boost * beat_boost * k_scale * zone_scale * nova_fx;

    var out: VSOut;
    out.pos   = vec4f(ndc, 0.0, 1.0);
    out.color = vec4f(rgb * base_alpha, base_alpha);
    return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    return in.color;
}
