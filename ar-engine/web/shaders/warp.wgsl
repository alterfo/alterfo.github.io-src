// UV displacement warp compute pass.
// Reads the RD texture at UV coordinates displaced by the noise field × warp_amount.
// Toroidal wrap keeps the pattern seamless at edges.

struct WarpUniforms {
    warp_amount : f32,   // max pixel displacement (noise is ±1, so ±warp_amount pixels)
    width       : u32,
    height      : u32,
    _pad        : u32,
};

@group(0) @binding(0) var<uniform> u         : WarpUniforms;
@group(0) @binding(1) var          rd_tex    : texture_2d<f32>;     // Gray-Scott output (rdA)
@group(0) @binding(2) var          noise_tex : texture_2d<f32>;     // noise.wgsl output
@group(0) @binding(3) var          out       : texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let x = i32(gid.x);
    let y = i32(gid.y);
    let W = i32(u.width);
    let H = i32(u.height);
    if (x >= W || y >= H) { return; }

    let noise = textureLoad(noise_tex, vec2<i32>(x, y), 0);

    // Displace sampling coordinates by noise (noise.rg ∈ [-1, 1])
    let ox = i32(noise.r * u.warp_amount);
    let oy = i32(noise.g * u.warp_amount);

    // Toroidal wrap for seamless edges
    let sx = ((x + ox) % W + W) % W;
    let sy = ((y + oy) % H + H) % H;

    textureStore(out, vec2<i32>(x, y),
                 textureLoad(rd_tex, vec2<i32>(sx, sy), 0));
}
