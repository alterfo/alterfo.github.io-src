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

    // Speed-based brightness: fast orbital particles (near poles) are vivid;
    // slow-drifting interstitial particles are dim — reveals the vortex structure
    // without explicit geometry. Scale 28 maps typical orbit speed → 0.6..1.0 range.
    let spd_env  = clamp(length(p.vel) * 28.0, 0.0, 1.0);
    // Age envelope: fade in at birth (0.08s), persist, fade at death
    let age_env  = sin(clamp(p.age, 0.0, 1.0) * 3.14159);
    // Blend: speed is dominant; age adds soft birth/death fade
    let brightness = mix(age_env * 0.5, 1.0, spd_env);

    // Hue: slight shift with high-frequency content (hi-hat shimmer on colour)
    let hue = fract(p.hue + u.high * 0.05);
    // Saturation: midrange voices push colours toward vivid
    let sat = clamp(0.85 + u.mid * 0.15, 0.0, 1.0);
    let rgb = hsl2rgb(hue, sat, 0.48);

    // Energy breathes the whole field; beat punctuates each kick
    let energy_boost = 1.0 + u.energy * 3.5;
    let beat_boost   = 1.0 + u.beat_pulse * 2.2;

    let base_alpha = brightness * 0.0018 * energy_boost * beat_boost;

    var out: VSOut;
    out.pos   = vec4f(ndc, 0.0, 1.0);
    out.color = vec4f(rgb * base_alpha, base_alpha);
    return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    return in.color;
}
