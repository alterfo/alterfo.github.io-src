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

// Gravity tuning. Force grows as 1/distance² (true inverse-square — motion
// visibly accelerates the closer two particles get), scaled by the puller's
// own radius (`r`, doubling as mass — bigger dot pulls harder), softened so
// the force stays finite (never an infinite spike) as distance shrinks to 0
// instead of being capped by a hard cutoff. Attraction only, no repulsion —
// a short-range repel-below-threshold branch was tried first and read as
// magnets snapping/bouncing off each other, not gravity. Real orbital motion
// doesn't push back; a close pair curves and slingshots past on its own
// momentum because softening keeps the pull finite, not because anything
// repels it. GRAVITY_RANGE caps how far gravity reaches at all: a first
// version let EVERY particle pull on every other particle regardless of
// distance, and a ~100-particle field always nets a pull toward the crowd's
// overall center of mass — after ~20-40s the whole field visibly collapsed
// into one dense clump (verified via CDP time-lapse). Capping the range
// makes each particle only feel its near neighbors, so interactions stay
// local swirls/close passes instead of summing into one global attractor.
const GRAVITY_STRENGTH = 0.6
const GRAVITY_SOFTENING = 24
const GRAVITY_RANGE = 130
const GRAVITY_MAX_SPEED = 1.1

// Pure: acceleration imparted on p by q's gravity (zero beyond GRAVITY_RANGE).
// Returns { ax, ay }.
export function gravityAccel(p, q, opts = {}) {
  const {
    strength = GRAVITY_STRENGTH,
    softening = GRAVITY_SOFTENING,
    range = GRAVITY_RANGE,
  } = opts
  const dx = q.x - p.x, dy = q.y - p.y
  const distSq = dx * dx + dy * dy
  if (distSq >= range * range) return { ax: 0, ay: 0 }
  const dist = Math.sqrt(distSq) || 0.0001
  const force = (strength * q.r) / (distSq + softening * softening)
  return { ax: (dx / dist) * force, ay: (dy / dist) * force }
}

// Mutates every particle's vx/vy in place from the net pull of every other
// particle (O(n²), computed from a single position snapshot so the result
// doesn't depend on iteration order), then caps speed so close encounters
// accelerate sharply without ever running away unbounded.
export function applyGravity(particles, opts = {}) {
  const maxSpeed = opts.maxSpeed ?? GRAVITY_MAX_SPEED
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    let ax = 0, ay = 0
    for (let j = 0; j < particles.length; j++) {
      if (i === j) continue
      const a = gravityAccel(p, particles[j], opts)
      ax += a.ax; ay += a.ay
    }
    p.vx += ax
    p.vy += ay
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
    if (speed > maxSpeed) {
      p.vx = (p.vx / speed) * maxSpeed
      p.vy = (p.vy / speed) * maxSpeed
    }
  }
}

// Pure: line-connection alpha by distance (0.35 at d=0, 0 at d>=maxDist).
// Safe to be this generous: the canvas is hard-cleared every frame (see
// createField's frame()), so there is no cross-frame accumulation risk —
// alpha here only controls how bright a connection looks THIS frame, not
// how much residue it leaves behind (there is none, by construction).
export function connectionAlpha(distance, maxDist) {
  if (distance >= maxDist) return 0
  return (1 - distance / maxDist) * 0.35
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

// Pure: whether a MediaQueryList-like object signals prefers-reduced-motion.
// Inject the matcher (a real MediaQueryList, or a `{ matches }` stub) so this
// is testable under node --test, which has no DOM/matchMedia.
export function prefersReducedMotion(mql) {
  return !!(mql && mql.matches)
}

// Browser-only: read the live OS/browser preference via matchMedia.
function osReducedMotion() {
  if (typeof matchMedia !== 'function') return false
  return prefersReducedMotion(matchMedia('(prefers-reduced-motion: reduce)'))
}

// Browser-only factory. opts:
//   density        — pixels-of-width per particle (count = floor(w / density)); ignored if `count` set
//   count          — explicit particle count, number or () => number (overrides density)
//   connectDistance — max px to draw a connecting line
//   bg             — solid clear color, hard-repainted every frame (no
//                    persistence — every frame is drawn from scratch)
//   palette        — rgba( prefixes (see spectrum.js CANVAS_PALETTE)
//   lineWidth      — connection line width
//   autoStart      — begin the rAF loop immediately (default true)
//   getSize        — () => ({ w, h }); default reads canvas.offsetWidth/Height
//   reducedMotion  — force the static-frame, no-rAF-loop gate; default reads
//                    the live `prefers-reduced-motion` media query
// returns { start(), stop(), resize(), destroy() }
export function createField(canvas, opts = {}) {
  const {
    density = 12,
    count = null,
    connectDistance = 100,
    bg = 'rgb(20,22,26)',
    palette = CANVAS_PALETTE,
    lineWidth = 0.8,
    autoStart = true,
    getSize = null,
    reducedMotion = osReducedMotion(),
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

    applyGravity(particles)

    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'lighter'

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      stepParticle(p, w, h)

      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j]
        const dx = q.x - p.x, dy = q.y - p.y
        const d = Math.sqrt(dx * dx + dy * dy)
        const a = connectionAlpha(d, connectDistance)
        if (a > 0) {
          // Gradient between the two particles' own colors, not just p's —
          // the line should read as "connecting these two specific dots".
          const grad = ctx.createLinearGradient(p.x, p.y, q.x, q.y)
          grad.addColorStop(0, p.rgba + a + ')')
          grad.addColorStop(1, q.rgba + a + ')')
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y)
          ctx.strokeStyle = grad
          ctx.lineWidth = lineWidth; ctx.stroke()
        }
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = p.rgba + '0.8)'; ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  function loop() {
    frame()
    raf = requestAnimationFrame(loop)
  }

  function start() {
    if (reducedMotion) return
    if (raf != null) return
    raf = requestAnimationFrame(loop)
  }

  function stop() {
    if (raf != null) { cancelAnimationFrame(raf); raf = null }
    frame() // draw one static frame so particles remain visible when paused
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
