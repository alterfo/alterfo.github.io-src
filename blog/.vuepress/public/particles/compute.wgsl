struct Particle {
  position: vec2f,
  speed: f32,
  angle: f32,
  color: vec4f,
}

struct SimParams {
  width: f32,
  height: f32,
  deltaTime: f32,
  connectDistance: f32,
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: SimParams;

@compute @workgroup_size(64)
fn updateParticles(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= arrayLength(&particles)) {
    return;
  }

  var p = particles[idx];

  // Update position based on speed and angle
  let rad = p.angle * 0.01745329252;
  p.position.x = p.position.x + p.speed * cos(rad);
  p.position.y = p.position.y + p.speed * sin(rad);

  // Add slight angle variation for organic movement
  p.angle = p.angle + sin(p.position.x * 0.01 + params.deltaTime * 2.0) * 0.5;

  // Wrap around edges with margin
  let margin = 50.0;
  if (p.position.x < -margin) {
    p.position.x = params.width + margin;
  }
  if (p.position.x > params.width + margin) {
    p.position.x = -margin;
  }
  if (p.position.y < -margin) {
    p.position.y = params.height + margin;
  }
  if (p.position.y > params.height + margin) {
    p.position.y = -margin;
  }

  particles[idx] = p;
}
