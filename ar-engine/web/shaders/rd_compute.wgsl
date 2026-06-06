// Gray-Scott reaction-diffusion compute shader.
// Reads from tex_in (previous state) and writes to tex_out (next state).
// dU/dt = Du·∇²U − U·V² + feed·(1−U)
// dV/dt = Dv·∇²V + U·V² − (feed+kill)·V
// Laplacian: 5-point stencil with toroidal wrap.

struct RDUniforms {
    feed        : f32,   // Gray-Scott feed rate
    kill        : f32,   // Gray-Scott kill rate
    Du          : f32,   // diffusion coefficient U
    Dv          : f32,   // diffusion coefficient V
    dye_x       : f32,   // dye centre X (normalised 0..1)
    dye_y       : f32,   // dye centre Y (normalised 0..1)
    dye_radius  : f32,   // dye radius (pixels)
    dye_strength: f32,   // peak dye concentration added
    time        : f32,   // elapsed seconds (for future noise seed)
    dt          : f32,   // Euler time-step (typically 1.0)
    width       : u32,
    height      : u32,
    inject      : u32,   // 1 = inject dye this frame
    _pad0       : u32,
    _pad1       : u32,
    _pad2       : u32,
};

@group(0) @binding(0) var<uniform> u    : RDUniforms;
@group(0) @binding(1) var          tin  : texture_2d<f32>;
@group(0) @binding(2) var          tout : texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
    let x = i32(gid.x);
    let y = i32(gid.y);
    let W = i32(u.width);
    let H = i32(u.height);
    if (x >= W || y >= H) { return; }

    let xm = (x - 1 + W) % W;
    let xp = (x + 1)     % W;
    let ym = (y - 1 + H) % H;
    let yp = (y + 1)     % H;

    let c   = textureLoad(tin, vec2<i32>(x,  y ), 0);
    let lft = textureLoad(tin, vec2<i32>(xm, y ), 0);
    let rgt = textureLoad(tin, vec2<i32>(xp, y ), 0);
    let top = textureLoad(tin, vec2<i32>(x,  ym), 0);
    let bot = textureLoad(tin, vec2<i32>(x,  yp), 0);

    let lap = lft + rgt + top + bot - 4.0 * c;

    let A   = c.r;
    let B   = c.g;
    let uvv = A * B * B;

    var nA = A + u.dt * (u.Du * lap.r - uvv + u.feed * (1.0 - A));
    var nB = B + u.dt * (u.Dv * lap.g + uvv - (u.feed + u.kill) * B);

    if (u.inject != 0u) {
        let fx = f32(x) - u.dye_x * f32(W);
        let fy = f32(y) - u.dye_y * f32(H);
        let d  = length(vec2<f32>(fx, fy));
        if (d < u.dye_radius) {
            let t = 1.0 - d / u.dye_radius;
            nB = clamp(nB + u.dye_strength * t * t, 0.0, 1.0);
        }
    }

    textureStore(tout, vec2<i32>(x, y),
        vec4<f32>(clamp(nA, 0.0, 1.0), clamp(nB, 0.0, 1.0), 0.0, 1.0));
}
