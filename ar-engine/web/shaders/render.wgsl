// Final render pass: reads particle trail (fbB), tonemaps, hue drift, beat flash.

struct RenderUniforms {
    beat_pulse : f32,   // 0..1, exponential-decay spike on kick
    hue_shift  : f32,   // 0..1, slow drift — rotates hue around grey axis
    blend_mode : u32,   // 0=Add(normal), 1=Screen, 2=Difference
    width      : u32,
    height     : u32,
    _pad0      : u32,
    _pad1      : u32,
    _pad2      : u32,
    // Colour map stops (vec4 = rgb + padding). Offset 32..95.
    c0         : vec4<f32>,
    c1         : vec4<f32>,
    c2         : vec4<f32>,
    c3         : vec4<f32>,
};

@group(0) @binding(0) var<uniform> u      : RenderUniforms;
@group(0) @binding(1) var          fb_tex : texture_2d<f32>;

struct VSOut {
    @builtin(position) pos : vec4<f32>,
};

// Fullscreen triangle — 3 hardcoded NDC vertices cover the entire [-1,1]^2 viewport.
@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> VSOut {
    var pts = array<vec2<f32>, 3>(
        vec2<f32>(-1.0,  3.0),
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 3.0, -1.0),
    );
    var out: VSOut;
    out.pos = vec4<f32>(pts[vi], 0.0, 1.0);
    return out;
}

// Reinhard-style tonemap — prevents blow-out while preserving colour ratios.
fn tonemap(c: vec3<f32>) -> vec3<f32> {
    return c / (c + vec3<f32>(1.0));
}

// Rotate hue around the grey axis (1,1,1)/√3 using Rodrigues formula.
fn hueRotate(col: vec3<f32>, shift: f32) -> vec3<f32> {
    let angle = shift * 6.28318;
    let cosA  = cos(angle);
    let sinA  = sin(angle);
    let k     = vec3<f32>(0.57735, 0.57735, 0.57735);
    return col * cosA + cross(k, col) * sinA + k * dot(k, col) * (1.0 - cosA);
}

// Screen blend: 1 - (1-a)(1-b)  — brighter than Add for mid-tones
fn screen(a: vec3<f32>, b: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(1.0) - (vec3<f32>(1.0) - a) * (vec3<f32>(1.0) - b);
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    let ix = i32(in.pos.x);
    let iy = i32(in.pos.y);

    // Scale viewport pixel coords to fb_tex texel coords so the render pass
    // works correctly at any target resolution (preview 960×540 or full 1920×1080).
    let fb_sz = textureDimensions(fb_tex);
    let uv    = (vec2<f32>(f32(ix), f32(iy)) + 0.5)
                / vec2<f32>(f32(u.width), f32(u.height));
    let coord = clamp(
        vec2<i32>(uv * vec2<f32>(f32(fb_sz.x), f32(fb_sz.y))),
        vec2<i32>(0, 0),
        vec2<i32>(i32(fb_sz.x) - 1, i32(fb_sz.y) - 1)
    );
    // Particle trail: accumulated RGB from coloured particles
    let pix = textureLoad(fb_tex, coord, 0);
    var col = tonemap(pix.rgb * 2.8);        // boost then Reinhard
    col = pow(col, vec3<f32>(0.8));           // mild gamma lift

    if (u.hue_shift > 0.001) {
        col = hueRotate(col, u.hue_shift);
    }

    // blend_mode post-process (meaningful in Advanced multi-layer compositing)
    if (u.blend_mode == 1u) {
        // Screen: boost darker regions slightly for a "glow" look
        col = screen(col, vec3<f32>(0.04, 0.0, 0.08));
    } else if (u.blend_mode == 2u) {
        // Difference-style: invert and re-saturate dark zones
        let inv = vec3<f32>(1.0) - col;
        col = col + inv * inv * 0.5;
    }

    return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
