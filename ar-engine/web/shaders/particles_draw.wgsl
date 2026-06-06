// Vortex draw shader — renders point-list particles to trail texture.
// Brightness driven by orbital speed: fast-orbiting particles near poles
// are brighter than slow-drifting particles between poles, naturally
// highlighting the vortex structure without any explicit geometry.
// Additive blending: dense orbits bloom toward white; streams stay coloured.

struct Particle {
    pos  : vec2<f32>,
    vel  : vec2<f32>,
    age  : f32,
    hue  : f32,
    seed : u32,
    _pad : u32,
};

struct DrawUniforms {
    energy     : f32,
    beat_pulse : f32,
    mid        : f32,
    high       : f32,
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

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VSOut {
    let p = particles[idx];

    let ndc = vec2f(p.pos.x * 2.0 - 1.0, 1.0 - p.pos.y * 2.0);

    // Brightness = speed-based glow + age fade-in/out floor.
    // Speed component: fast-moving particles (in strong flow zones) glow brighter.
    // Floor of 0.30 ensures freshly spawned particles contribute to trail density
    // immediately — critical for aurora/silk looks where many slow particles exist.
    let spd_env    = clamp(length(p.vel) * 30.0, 0.0, 1.0);
    let age_env    = sin(clamp(p.age, 0.0, 1.0) * 3.14159);
    let brightness = 0.30 + 0.70 * max(spd_env, age_env * 0.6);

    // Hue: hi-hat content adds shimmer; vivid saturation for concert aesthetics
    let hue = fract(p.hue + u.high * 0.04);
    let sat = clamp(0.90 + u.mid * 0.10, 0.0, 1.0);
    let rgb = hsl2rgb(hue, sat, 0.50);

    // Energy breathes the field; beat adds a sharp luminance kick
    let energy_boost = 1.0 + u.energy * 3.8;
    let beat_boost   = 1.0 + u.beat_pulse * 2.5;

    let base_alpha = brightness * 0.0022 * energy_boost * beat_boost;

    var out: VSOut;
    out.pos   = vec4f(ndc, 0.0, 1.0);
    out.color = vec4f(rgb * base_alpha, base_alpha);
    return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    return in.color;
}
