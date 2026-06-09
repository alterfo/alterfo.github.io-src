import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderSkeleton, CONFIDENCE_THRESHOLD } from './renderer.js'
import { emptySkeleton, OPENPOSE_CONNECTIONS } from './skeleton.js'

// Minimal no-op 2D context that records the call counts we assert on.
function makeMockCtx() {
  const calls = { beginPath: 0, moveTo: 0, lineTo: 0, stroke: 0, arc: 0, fill: 0 }
  return {
    calls,
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    beginPath() { calls.beginPath++ },
    moveTo() { calls.moveTo++ },
    lineTo() { calls.lineTo++ },
    stroke() { calls.stroke++ },
    arc() { calls.arc++ },
    fill() { calls.fill++ },
  }
}

test('renderSkeleton does not throw on a valid 18-point skeleton', () => {
  const ctx = makeMockCtx()
  const skel = emptySkeleton(200, 200, 50)
  assert.equal(skel.length, 18)
  assert.doesNotThrow(() => renderSkeleton(ctx, skel))
})

test('renderSkeleton draws all 17 limbs when every keypoint is confident', () => {
  const ctx = makeMockCtx()
  const skel = emptySkeleton(200, 200, 50) // emptySkeleton points all have confidence 1
  renderSkeleton(ctx, skel)
  assert.equal(ctx.calls.moveTo, 17)
  assert.equal(ctx.calls.lineTo, 17)
})

test('renderSkeleton draws a dot per confident keypoint', () => {
  const ctx = makeMockCtx()
  const skel = emptySkeleton(200, 200, 50)
  renderSkeleton(ctx, skel)
  assert.equal(ctx.calls.arc, 18)
})

test('renderSkeleton skips connections touching a low-confidence keypoint', () => {
  const ctx = makeMockCtx()
  const skel = emptySkeleton(200, 200, 50)
  // Neck = keypoint index 1; drop it below the threshold.
  skel[1].confidence = CONFIDENCE_THRESHOLD - 0.1
  // Count how many connections reference the Neck so the expectation tracks the data.
  const neckConns = OPENPOSE_CONNECTIONS.filter(([a, b]) => a === 1 || b === 1).length
  assert.ok(neckConns > 0)
  renderSkeleton(ctx, skel)
  assert.equal(ctx.calls.moveTo, 17 - neckConns)
  assert.equal(ctx.calls.lineTo, 17 - neckConns)
})

test('renderSkeleton tolerates a null/empty context without throwing', () => {
  const skel = emptySkeleton(100, 100, 40)
  assert.doesNotThrow(() => renderSkeleton(null, skel))
  assert.doesNotThrow(() => renderSkeleton(makeMockCtx(), null))
})
