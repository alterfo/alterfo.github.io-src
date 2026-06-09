// Single connecting-particles module — replaces the two divergent copies that
// lived in Portfolio.vue (drawFrame/initParticles) and Layout.vue's 2D fallback
// (drawConnections2D/initCanvas2D). Pure helpers below are unit-tested; the
// browser-only createField() factory drives the rAF loop through them.
import { CANVAS_PALETTE } from './spectrum.js'

// Pure: advance a particle one step with torus-wrap at the edges.
// Mutates p, returns p.
export function stepParticle(p, w, h) {
  p.x += p.vx; p.y += p.vy
  if (p.x < 0) p.x = w; else if (p.x > w) p.x = 0
  if (p.y < 0) p.y = h; else if (p.y > h) p.y = 0
  return p
}

// Pure: line-connection alpha by distance (0.4 at d=0, 0 at d>=maxDist).
export function connectionAlpha(distance, maxDist) {
  if (distance >= maxDist) return 0
  return (1 - distance / maxDist) * 0.4
}

// Pure: build an array of particles seeded inside w×h.
export function createParticles(count, w, h, palette = CANVAS_PALETTE) {
  const arr = []
  for (let i = 0; i < count; i++) {
    arr.push({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6,
      rgba: palette[Math.floor(Math.random() * palette.length)],
      r: 1 + Math.random() * 2,
    })
  }
  return arr
}

// Browser-only factory. opts:
//   density        — pixels-of-width per particle (count = floor(w / density)); ignored if `count` set
//   count          — explicit particle count, number or () => number (overrides density)
//   connectDistance — max px to draw a connecting line
//   fade           — per-frame fill that creates the trailing effect
//   palette        — rgba( prefixes (see spectrum.js CANVAS_PALETTE)
//   lineWidth      — connection line width
//   autoStart      — begin the rAF loop immediately (default true)
//   getSize        — () => ({ w, h }); default reads canvas.offsetWidth/Height
// returns { start(), stop(), resize(), destroy() }
export function createField(canvas, opts = {}) {
  const {
    density = 12,
    count = null,
    connectDistance = 100,
    fade = 'rgba(10,0,32,0.15)',
    palette = CANVAS_PALETTE,
    lineWidth = 0.8,
    autoStart = true,
    getSize = null,
  } = opts

  const ctx = canvas.getContext('2d')
  let w = 0, h = 0
  let particles = []
  let raf = null

  function measure() {
    if (getSize) {
      const s = getSize()
      w = s.w; h = s.h
    } else {
      w = canvas.offsetWidth
      h = canvas.offsetHeight
    }
    canvas.width = w
    canvas.height = h
  }

  function particleCount() {
    if (typeof count === 'function') return Math.max(1, Math.floor(count()))
    if (typeof count === 'number') return Math.max(1, Math.floor(count))
    return Math.max(1, Math.floor(w / density))
  }

  function build() {
    particles = createParticles(particleCount(), w, h, palette)
  }

  function frame() {
    if (!ctx) return
    ctx.fillStyle = fade
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      stepParticle(p, w, h)
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j]
        const dx = q.x - p.x, dy = q.y - p.y
        const d = Math.sqrt(dx * dx + dy * dy)
        const a = connectionAlpha(d, connectDistance)
        if (a > 0) {
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y)
          ctx.strokeStyle = p.rgba + a + ')'
          ctx.lineWidth = lineWidth; ctx.stroke()
        }
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = p.rgba + '0.8)'; ctx.fill()
    }
  }

  function loop() {
    frame()
    raf = requestAnimationFrame(loop)
  }

  function start() {
    if (raf != null) return
    raf = requestAnimationFrame(loop)
  }

  function stop() {
    if (raf != null) { cancelAnimationFrame(raf); raf = null }
  }

  function resize() {
    measure(); build(); frame()
  }

  function destroy() {
    stop(); particles = []
  }

  measure(); build(); frame()
  if (autoStart) start()

  return { start, stop, resize, destroy }
}
