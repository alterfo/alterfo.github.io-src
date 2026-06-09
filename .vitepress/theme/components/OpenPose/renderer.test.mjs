import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  renderSkeleton,
  renderSkeletonOnCanvas,
  renderSkeletonOnBlack,
  CONFIDENCE_THRESHOLD,
} from './renderer.js'
import { emptySkeleton, OPENPOSE_CONNECTIONS } from './skeleton.js'

// Minimal no-op 2D context that records the call counts we assert on.
function makeMockCtx() {
  const calls = {
    beginPath: 0, moveTo: 0, lineTo: 0, stroke: 0, arc: 0, fill: 0,
    fillRect: 0, drawImage: 0, clearRect: 0,
  }
  const ctx = {
    calls,
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    // The alpha in effect at each stroke — lets tests assert opacity per person.
    strokeAlphas: [],
    // The fillStyle in effect when the background was filled.
    fillRectStyle: null,
    beginPath() { calls.beginPath++ },
    moveTo() { calls.moveTo++ },
    lineTo() { calls.lineTo++ },
    stroke() { calls.stroke++; ctx.strokeAlphas.push(ctx.globalAlpha) },
    arc() { calls.arc++ },
    fill() { calls.fill++ },
    fillRect() { calls.fillRect++; ctx.fillRectStyle = ctx.fillStyle },
    drawImage() { calls.drawImage++ },
    clearRect() { calls.clearRect++ },
  }
  return ctx
}

// A canvas stub whose getContext returns the supplied mock ctx.
function makeMockCanvas(ctx, width, height) {
  return { width, height, getContext: () => ctx }
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

test('renderSkeletonOnCanvas draws the image then person 0 at full and person 1 at 0.7 alpha', () => {
  const ctx = makeMockCtx()
  const canvas = makeMockCanvas(ctx, 200, 200)
  const skels = [emptySkeleton(100, 100, 30), emptySkeleton(100, 100, 30)]
  renderSkeletonOnCanvas(canvas, {}, skels) // {} = stand-in imageBitmap
  assert.equal(ctx.calls.clearRect, 1)
  assert.equal(ctx.calls.drawImage, 1)
  // 17 strokes for person 0 at alpha 1, then 17 for person 1 at alpha 0.7.
  assert.equal(ctx.strokeAlphas.slice(0, 17).every((a) => a === 1), true)
  assert.equal(ctx.strokeAlphas.slice(17).every((a) => a === 0.7), true)
  assert.equal(ctx.globalAlpha, 1, 'globalAlpha restored after the 2nd person')
})

test('renderSkeletonOnCanvas skips drawImage when no bitmap is supplied', () => {
  const ctx = makeMockCtx()
  const canvas = makeMockCanvas(ctx, 200, 200)
  renderSkeletonOnCanvas(canvas, null, [emptySkeleton(100, 100, 30)])
  assert.equal(ctx.calls.clearRect, 1)
  assert.equal(ctx.calls.drawImage, 0)
})

test('renderSkeletonOnBlack fills a black background then draws all skeletons at full opacity', () => {
  const ctx = makeMockCtx()
  const prevOC = globalThis.OffscreenCanvas
  // Force the OffscreenCanvas path (node has no document for the <canvas> fallback).
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h }
    getContext() { return ctx }
  }
  try {
    const canvas = renderSkeletonOnBlack(300, 200, [
      emptySkeleton(150, 100, 30),
      emptySkeleton(150, 100, 30),
    ])
    assert.equal(canvas.width, 300)
    assert.equal(canvas.height, 200)
    assert.equal(ctx.calls.fillRect, 1)
    assert.equal(ctx.fillRectStyle, 'black', 'background filled black before skeletons')
    // 2 people × 17 limbs, none faded.
    assert.equal(ctx.calls.moveTo, 34)
    assert.equal(ctx.strokeAlphas.every((a) => a === 1), true)
  } finally {
    globalThis.OffscreenCanvas = prevOC
  }
})

test('renderSkeletonOnBlack tolerates an empty/missing skeleton list', () => {
  const ctx = makeMockCtx()
  const prevOC = globalThis.OffscreenCanvas
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h }
    getContext() { return ctx }
  }
  try {
    assert.doesNotThrow(() => renderSkeletonOnBlack(10, 10, undefined))
    assert.equal(ctx.calls.fillRect, 1)
    assert.equal(ctx.calls.moveTo, 0)
  } finally {
    globalThis.OffscreenCanvas = prevOC
  }
})
