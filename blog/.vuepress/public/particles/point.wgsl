struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) size: f32,
}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: SimParams;

struct SimParams {
  width: f32,
  height: f32,
  deltaTime: f32,
  connectDistance: f32,
}

struct Particle {
  position: vec2f,
  speed: f32,
  angle: f32,
  color: vec4f,
}

@vertex
fn vsPoint(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  let particleCount = arrayLength(&particles);
  if (u32(vertexIndex) >= particleCount) {
    return VertexOutput(vec4f(0.0), vec4f(0.0), 0.0);
  }

  let p = particles[vertexIndex];
  
  let clipX = (p.position.x / params.width) * 2.0 - 1.0;
  let clipY = 1.0 - (p.position.y / params.height) * 2.0;

  var output: VertexOutput;
  output.position = vec4f(clipX, clipY, 0.0, 1.0);
  output.color = vec4f(p.color.rgb * 1.5 + 0.2, p.color.a * 0.9);
  output.size = 3.0 + p.speed * 2.0;
  
  return output;
}

@fragment
fn fsPoint(@location(0) color: vec4f, @location(1) size: f32) -> @location(0) vec4f {
  return color;
}
