import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stepParticle, connectionAlpha, createParticles, prefersReducedMotion, createField } from './ConnectingParticles.js'

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

test('connectionAlpha by distance', () => {
  assert.equal(connectionAlpha(0, 100), 0.4)
  assert.equal(connectionAlpha(100, 100), 0)
  assert.equal(connectionAlpha(50, 100), 0.2)
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
    fillStyle: '', strokeStyle: '', lineWidth: 0,
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {},
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
