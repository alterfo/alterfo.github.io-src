struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) dist: f32,
}

struct SimParams {
  width: f32,
  height: f32,
  deltaTime: f32,
  connectDistance: f32,
}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: SimParams;

struct Particle {
  position: vec2f,
  speed: f32,
  angle: f32,
  color: vec4f,
}

// Vertex shader - draws lines between ALL nearby particles
@vertex
fn vsLine(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  let particleCount = arrayLength(&particles);
  let maxConnections = 8u;
  
  let pIdx = instanceIndex / maxConnections;
  let connIdx = instanceIndex % maxConnections;
  
  if (pIdx >= particleCount) {
    return VertexOutput(vec4f(0.0), vec4f(0.0), 0.0);
  }

  let p1 = particles[pIdx];
  
  var connectedParticleIdx = 999u;
  var minDist = params.connectDistance;
  
  for (var i = 0u; i < particleCount; i++) {
    if (i == pIdx) {
      continue;
    }
    
    let p2 = particles[i];
    let dx = p2.position.x - p1.position.x;
    let dy = p2.position.y - p1.position.y;
    let dist = sqrt(dx * dx + dy * dy);
    
    if (dist < params.connectDistance && dist < minDist) {
      var count = 0u;
      for (var j = 0u; j < i; j++) {
        if (j == pIdx) { continue; }
        let pj = particles[j];
        let dxj = pj.position.x - p1.position.x;
        let dyj = pj.position.y - p1.position.y;
        let distj = sqrt(dxj * dxj + dyj * dyj);
        if (distj < params.connectDistance && distj < dist) {
          count++;
        }
      }
      
      if (count == connIdx) {
        minDist = dist;
        connectedParticleIdx = i;
      }
    }
  }

  if (connectedParticleIdx == 999u) {
    return VertexOutput(vec4f(0.0), vec4f(0.0), 0.0);
  }

  let p2 = particles[connectedParticleIdx];
  let pos = select(p1.position, p2.position, vertexIndex == 1u);

  let clipX = (pos.x / params.width) * 2.0 - 1.0;
  let clipY = 1.0 - (pos.y / params.height) * 2.0;

  let distAlpha = 1.0 - (minDist / params.connectDistance);
  let alpha = distAlpha * distAlpha * 0.8;
  
  var output: VertexOutput;
  output.position = vec4f(clipX, clipY, 0.0, 1.0);
  output.color = vec4f(p1.color.rgb * 0.5 + p2.color.rgb * 0.5, alpha);
  output.dist = minDist;
  
  return output;
}

@fragment
fn fsLine(@location(0) color: vec4f, @location(1) dist: f32) -> @location(0) vec4f {
  return color;
}
