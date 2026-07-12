import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stepParticle, gravityAccel, applyGravity, connectionAlpha, createParticles, prefersReducedMotion, createField } from './ConnectingParticles.js'

test('stepParticle wraps left edge to right', () => {
  assert.equal(stepParticle({ x: -1, y: 5, vx: 0, vy: 0 }, 100, 100).x, 100)
})

test('stepParticle wraps right edge to left', () => {
  assert.equal(stepParticle({ x: 101, y: 5, vx: 0, vy: 0 }, 100, 100).x, 0)
})

test('stepParticle applies velocity then wraps vertically', () => {
  const p = stepParticle({ x: 50, y: -2, vx: 1, vy: 0 }, 100, 100)
  assert.equal(p.x, 51)
  assert.equal(p.y, 100)
})

test('gravityAccel pulls p toward a distant q, scaled by q.r (mass)', () => {
  const p = { x: 0, y: 0, r: 1 }
  const lightPull = gravityAccel(p, { x: 100, y: 0, r: 1 })
  const heavyPull = gravityAccel(p, { x: 100, y: 0, r: 3 })
  assert.ok(lightPull.ax > 0, 'accelerates toward q (positive x direction)')
  assert.equal(lightPull.ay, 0, 'no y-pull when q is directly on the x axis')
  assert.ok(heavyPull.ax > lightPull.ax, 'a heavier (bigger-radius) q pulls harder')
})

test('gravityAccel strengthens as distance shrinks (accelerates on approach)', () => {
  const p = { x: 0, y: 0, r: 1 }
  const far = gravityAccel(p, { x: 100, y: 0, r: 1 })
  const near = gravityAccel(p, { x: 30, y: 0, r: 1 })
  const veryNear = gravityAccel(p, { x: 5, y: 0, r: 1 })
  assert.ok(near.ax > far.ax, 'closer pulls harder')
  assert.ok(veryNear.ax > near.ax, 'still pulls harder at very close range — attraction only, no repulsion')
})

test('gravityAccel stays finite (softened, not an infinite spike) as distance approaches 0', () => {
  const p = { x: 0, y: 0, r: 1 }
  const a = gravityAccel(p, { x: 0.001, y: 0, r: 3 })
  assert.ok(Number.isFinite(a.ax) && Number.isFinite(a.ay), 'softening keeps force finite at near-zero distance')
})

test('gravityAccel handles coincident points without NaN', () => {
  const p = { x: 10, y: 10, r: 1 }
  const q = { x: 10, y: 10, r: 1 }
  const a = gravityAccel(p, q)
  assert.ok(Number.isFinite(a.ax) && Number.isFinite(a.ay), 'no NaN/Infinity at zero distance')
})

test('gravityAccel is zero beyond the range cutoff (local interactions only)', () => {
  // A global full-field version was tried first: every particle pulling on
  // every other particle nets a constant drift toward the crowd's center of
  // mass, and a ~100-particle field visibly collapsed into one clump after
  // ~20-40s (verified via CDP time-lapse). Capping the range is what keeps
  // interactions local instead of summing into one global attractor.
  const p = { x: 0, y: 0, r: 1 }
  const farAway = gravityAccel(p, { x: 500, y: 0, r: 3 }, { range: 130 })
  assert.deepEqual(farAway, { ax: 0, ay: 0 })
})

test('applyGravity caps resulting speed at maxSpeed', () => {
  // Cluster of heavy, close particles maximizes pull on p — exercises the
  // speed cap that keeps close encounters bounded even though attraction
  // alone has no ceiling of its own.
  const particles = [
    { x: 0, y: 0, vx: 0, vy: 0, r: 3 },
    { x: 40, y: 0, vx: 0, vy: 0, r: 3 },
    { x: -40, y: 0, vx: 0, vy: 0, r: 3 },
    { x: 0, y: 40, vx: 0, vy: 0, r: 3 },
  ]
  applyGravity(particles, { maxSpeed: 0.5 })
  for (const p of particles) {
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
    assert.ok(speed <= 0.5 + 1e-9, `speed ${speed} exceeds maxSpeed`)
  }
})

test('connectionAlpha by distance', () => {
  assert.equal(connectionAlpha(0, 100), 0.35)
  assert.equal(connectionAlpha(100, 100), 0)
  assert.equal(connectionAlpha(50, 100), 0.175)
})

test('connectionAlpha beyond maxDist is 0', () => {
  assert.equal(connectionAlpha(150, 100), 0)
})

test('createParticles count and bounds', () => {
  const arr = createParticles(10, 200, 100)
  assert.equal(arr.length, 10)
  for (const p of arr) {
    assert.ok(p.x >= 0 && p.x <= 200, 'x in bounds')
    assert.ok(p.y >= 0 && p.y <= 100, 'y in bounds')
    assert.ok(typeof p.rgba === 'string' && p.rgba.startsWith('rgba('), 'rgba prefix')
    assert.ok(p.r >= 1 && p.r <= 3, 'radius in range')
    // velocity seeded as (rand-0.5)*0.6 → [-0.3, 0.3]; a regression that drops
    // the -0.5 (all-positive drift) or wrong magnitude would otherwise pass.
    assert.ok(p.vx >= -0.3 && p.vx <= 0.3, 'vx in range')
    assert.ok(p.vy >= -0.3 && p.vy <= 0.3, 'vy in range')
  }
})

test('createParticles uses the supplied palette', () => {
  // createField threads a custom palette through to here; pin that the param is
  // honored, not silently overridden by the default CANVAS_PALETTE.
  const arr = createParticles(8, 10, 10, ['rgba(1,2,3,'])
  for (const p of arr) assert.equal(p.rgba, 'rgba(1,2,3,')
})

test('createParticles with count 0 returns an empty array', () => {
  assert.deepEqual(createParticles(0, 100, 100), [])
})

test('prefersReducedMotion reads mql.matches', () => {
  assert.equal(prefersReducedMotion({ matches: true }), true)
  assert.equal(prefersReducedMotion({ matches: false }), false)
})

test('prefersReducedMotion defaults to false without a matcher', () => {
  assert.equal(prefersReducedMotion(null), false)
  assert.equal(prefersReducedMotion(undefined), false)
})

// Minimal fake <canvas> — createField only needs getContext()/offsetWidth/
// offsetHeight/width/height, never the real DOM.
function fakeCanvas(w = 100, h = 100) {
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 0, globalCompositeOperation: 'source-over',
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {},
    createLinearGradient: () => ({ addColorStop() {} }),
  }
  return { offsetWidth: w, offsetHeight: h, width: 0, height: 0, getContext: () => ctx }
}

// node has no requestAnimationFrame/matchMedia — stub them around each case.
function withFakeRaf(fn) {
  let called = false
  const origRaf = globalThis.requestAnimationFrame
  const origCancel = globalThis.cancelAnimationFrame
  globalThis.requestAnimationFrame = () => { called = true; return 1 }
  globalThis.cancelAnimationFrame = () => {}
  try {
    fn(() => called)
  } finally {
    globalThis.requestAnimationFrame = origRaf
    globalThis.cancelAnimationFrame = origCancel
  }
}

test('createField with reducedMotion true never starts the rAF loop (static frame only)', () => {
  withFakeRaf((rafWasCalled) => {
    const field = createField(fakeCanvas(), { reducedMotion: true, count: 2 })
    assert.equal(rafWasCalled(), false, 'autoStart must not schedule a frame')
    field.start()
    assert.equal(rafWasCalled(), false, 'explicit start() stays a no-op under reduced motion')
  })
})

test('createField with reducedMotion false animates via requestAnimationFrame', () => {
  withFakeRaf((rafWasCalled) => {
    createField(fakeCanvas(), { reducedMotion: false, count: 2 })
    assert.equal(rafWasCalled(), true)
  })
})

// Both call sites omit `reducedMotion` and rely on createField's default,
// which reads the live `prefers-reduced-motion` media query — stub matchMedia
// to cover that default-wiring path, not just the explicit override above.
function withFakeMatchMedia(matches, fn) {
  const origMatchMedia = globalThis.matchMedia
  globalThis.matchMedia = () => ({ matches })
  try {
    fn()
  } finally {
    if (origMatchMedia === undefined) delete globalThis.matchMedia
    else globalThis.matchMedia = origMatchMedia
  }
}

test('createField with no reducedMotion option defaults to the live prefers-reduced-motion query (true)', () => {
  withFakeMatchMedia(true, () => {
    withFakeRaf((rafWasCalled) => {
      const field = createField(fakeCanvas(), { count: 2 })
      assert.equal(rafWasCalled(), false, 'autoStart must not schedule a frame')
      field.start()
      assert.equal(rafWasCalled(), false, 'explicit start() stays a no-op')
    })
  })
})

test('createField with no reducedMotion option defaults to the live prefers-reduced-motion query (false)', () => {
  withFakeMatchMedia(false, () => {
    withFakeRaf((rafWasCalled) => {
      createField(fakeCanvas(), { count: 2 })
      assert.equal(rafWasCalled(), true)
    })
  })
})

test('createField runs many frames without throwing (torus-wrap + connect/disconnect churn)', () => {
  // Small canvas + tight connectDistance forces frequent torus-wraps and
  // frequent connect/disconnect across many particles. Drive the rAF loop
  // manually (instead of stubbing it to a no-op) so frame() actually runs
  // repeatedly.
  const origRaf = globalThis.requestAnimationFrame
  const origCancel = globalThis.cancelAnimationFrame
  let pending = null
  globalThis.requestAnimationFrame = (cb) => { pending = cb; return 1 }
  globalThis.cancelAnimationFrame = () => { pending = null }
  try {
    const field = createField(fakeCanvas(40, 40), { count: 20, connectDistance: 30, reducedMotion: false })
    for (let i = 0; i < 150; i++) {
      const cb = pending
      pending = null
      assert.ok(cb, 'loop must keep re-arming itself every frame')
      cb()
    }
    field.destroy()
  } finally {
    globalThis.requestAnimationFrame = origRaf
    globalThis.cancelAnimationFrame = origCancel
  }
})
