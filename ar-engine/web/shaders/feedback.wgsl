// Temporal accumulation / trails compute pass.
// result = cur + prev × decay, clamped to [0, 1].
// Decay drops on beat to flush trails (sharp visual reset on kick).

struct FeedbackUniforms {
    decay  : f32,
    width  : u32,
    height : u32,
    _pad   : u32,
};

@group(0) @binding(0) var<uniform> u        : FeedbackUniforms;
@group(0) @binding(1) var          cur_tex  : texture_2d<f32>;  // warped RD this frame
@group(0) @binding(2) var          prev_tex : texture_2d<f32>;  // previous feedback
@group(0) @binding(3) var          out      : texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let x = i32(gid.x);
    let y = i32(gid.y);
    if (x >= i32(u.width) || y >= i32(u.height)) { return; }

    let cur    = textureLoad(cur_tex,  vec2<i32>(x, y), 0);
    let prev   = textureLoad(prev_tex, vec2<i32>(x, y), 0);
    let result = cur + prev * u.decay;

    textureStore(out, vec2<i32>(x, y),
                 clamp(result, vec4<f32>(0.0), vec4<f32>(1.0)));
}
