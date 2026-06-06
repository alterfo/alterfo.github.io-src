// Beam draw shader — renders point-list particles to trail texture.
// Particles start bright at the emitter and fade as they travel (age 0→1).
// Additive blending: dense beam core accumulates toward white; edges stay coloured.

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

    // Brightness: concentrated near emitter (age≈0), fades toward tip (age≈1).
    // pow(x, 0.6) keeps it bright longer then drops — mimics a spotlight beam.
    let brightness = pow(clamp(1.0 - p.age, 0.0, 1.0), 0.6);

    // Hue: slight shift with high frequencies; vivid saturation
    let hue = fract(p.hue + u.high * 0.06);
    let sat = clamp(0.88 + u.mid * 0.12, 0.0, 1.0);
    let rgb = hsl2rgb(hue, sat, 0.46);

    // Energy makes the entire beam breathe: loud sections are visibly brighter
    let energy_boost = 1.0 + u.energy * 3.5;
    // Beat flashes the beam on kick
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
