// Particle draw shader — renders 500k point-list particles to trail texture.
// Uses additive blending; each particle contributes a tiny HSL-coloured dot.
// Accumulation over many frames via the feedback trail creates glowing light streams.

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

// HSL → RGB (all inputs/outputs 0..1)
fn hsl2rgb(h: f32, s: f32, l: f32) -> vec3<f32> {
    let c = (1.0 - abs(2.0 * l - 1.0)) * s;
    let x = c * (1.0 - abs(fract(h * 6.0) * 2.0 - 1.0));
    let m = l - c * 0.5;
    let h6 = h * 6.0;
    var rgb: vec3<f32>;
    if      h6 < 1.0 { rgb = vec3<f32>(c, x, 0.0); }
    else if h6 < 2.0 { rgb = vec3<f32>(x, c, 0.0); }
    else if h6 < 3.0 { rgb = vec3<f32>(0.0, c, x); }
    else if h6 < 4.0 { rgb = vec3<f32>(0.0, x, c); }
    else if h6 < 5.0 { rgb = vec3<f32>(x, 0.0, c); }
    else              { rgb = vec3<f32>(c, 0.0, x); }
    return rgb + m;
}

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VSOut {
    let p = particles[idx];

    // Map [0,1] particle pos to NDC [-1,1]; Y is flipped (WebGPU Y=1 at top)
    let ndc = vec2<f32>(p.pos.x * 2.0 - 1.0, 1.0 - p.pos.y * 2.0);

    // Life envelope: 0 at birth/death, 1 at mid-life
    let life  = sin(p.age * 3.14159);
    let speed = length(p.vel);

    // Audio-reactive color: hue drifts with high, saturation with mid
    let hue = fract(p.hue + u.high * 0.15 + u.beat_pulse * 0.05);
    let sat = clamp(0.75 + u.mid * 0.25, 0.0, 1.0);
    let lum = clamp(0.35 + speed * 14.0 + u.energy * 0.4, 0.0, 0.95);
    let rgb = hsl2rgb(hue, sat, lum * 0.5); // halve lum for HSL convention

    // Very dim output: accumulation over many frames builds bright trails
    let alpha = life * 0.022;

    var out: VSOut;
    out.pos   = vec4<f32>(ndc, 0.0, 1.0);
    out.color = vec4<f32>(rgb * life * 0.022, alpha);
    return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    return in.color;
}
