// Animated 2D noise compute shader for UV displacement.
// Generates a noise texture where R=x_offset, G=y_offset in range [-1, 1].
// UV drifts slowly over time via sinusoidal offset (no external lib needed).

struct NoiseUniforms {
    time   : f32,
    scale  : f32,
    width  : u32,
    height : u32,
};

@group(0) @binding(0) var<uniform> u   : NoiseUniforms;
@group(0) @binding(1) var          out : texture_storage_2d<rgba32float, write>;

// 2D hash → vector in [-1, 1]^2
fn hash2(p: vec2<f32>) -> vec2<f32> {
    let q = vec2<f32>(dot(p, vec2<f32>(127.1, 311.7)),
                      dot(p, vec2<f32>(269.5, 183.3)));
    return fract(sin(q) * 43758.5453) * 2.0 - 1.0;
}

// Value noise with smoothstep interpolation — returns scalar in [-1, 1]
fn vnoise(p: vec2<f32>) -> f32 {
    let i  = floor(p);
    let f  = fract(p);
    let s  = f * f * (3.0 - 2.0 * f);  // smoothstep
    let a  = hash2(i              ).x;
    let b  = hash2(i + vec2(1.0, 0.0)).x;
    let c  = hash2(i + vec2(0.0, 1.0)).x;
    let d  = hash2(i + vec2(1.0, 1.0)).x;
    return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let x = i32(gid.x);
    let y = i32(gid.y);
    let W = i32(u.width);
    let H = i32(u.height);
    if (x >= W || y >= H) { return; }

    let uv    = vec2<f32>(f32(x) / f32(W), f32(y) / f32(H));
    let drift = vec2<f32>(sin(u.time * 0.028) * 8.0,
                          cos(u.time * 0.021) * 8.0);
    let p     = uv * u.scale + drift;

    // Two independent noise lookups for x/y displacement
    let nx = vnoise(p);
    let ny = vnoise(p + vec2<f32>(5.2, 1.3));

    textureStore(out, vec2<i32>(x, y), vec4<f32>(nx, ny, 0.0, 1.0));
}
