import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  OPENPOSE_KEYPOINTS,
  OPENPOSE_CONNECTIONS,
  LIMB_COLORS,
  BLAZEPOSE_TO_OPENPOSE,
  blazeposeToOpenpose,
  emptySkeleton,
} from './skeleton.js'

test('OPENPOSE_KEYPOINTS has 18 names', () => {
  assert.equal(OPENPOSE_KEYPOINTS.length, 18)
  assert.equal(OPENPOSE_KEYPOINTS[0], 'Nose')
  assert.equal(OPENPOSE_KEYPOINTS[1], 'Neck')
})

test('OPENPOSE_CONNECTIONS has 17 pairs of valid indices', () => {
  assert.equal(OPENPOSE_CONNECTIONS.length, 17)
  for (const [a, b] of OPENPOSE_CONNECTIONS) {
    assert.ok(a >= 0 && a < 18, `from index ${a} in range`)
    assert.ok(b >= 0 && b < 18, `to index ${b} in range`)
  }
})

test('LIMB_COLORS has 17 RGB tuples parallel to connections', () => {
  assert.equal(LIMB_COLORS.length, 17)
  for (const c of LIMB_COLORS) {
    assert.equal(c.length, 3)
    for (const ch of c) assert.ok(ch >= 0 && ch <= 255)
  }
})

test('BLAZEPOSE_TO_OPENPOSE has 18 entries with null only at Neck', () => {
  assert.equal(BLAZEPOSE_TO_OPENPOSE.length, 18)
  assert.equal(BLAZEPOSE_TO_OPENPOSE[1], null)
  assert.equal(BLAZEPOSE_TO_OPENPOSE[0], 0) // Nose
})

// Build a synthetic 33-element BlazePose landmark array.
function makeLandmarks() {
  const lm = []
  for (let i = 0; i < 33; i++) {
    lm.push({ x: i / 100, y: i / 50, z: 0, visibility: 0.5 })
  }
  return lm
}

test('blazeposeToOpenpose maps Nose from BlazePose 0 with pixel denormalization', () => {
  const landmarks = makeLandmarks()
  const skel = blazeposeToOpenpose(landmarks, 1000, 500)
  assert.equal(skel.length, 18)
  // Nose ← landmarks[0] = { x: 0, y: 0 } → pixels (0, 0)
  assert.equal(skel[0].x, 0 * 1000)
  assert.equal(skel[0].y, 0 * 500)
})

test('blazeposeToOpenpose denormalizes a non-zero joint to pixels', () => {
  const landmarks = makeLandmarks()
  const skel = blazeposeToOpenpose(landmarks, 1000, 500)
  // RShoulder ← landmarks[12] = { x: 0.12, y: 0.24 }
  assert.ok(Math.abs(skel[2].x - 0.12 * 1000) < 1e-9)
  assert.ok(Math.abs(skel[2].y - 0.24 * 500) < 1e-9)
})

test('blazeposeToOpenpose computes Neck as midpoint of shoulders 11 + 12', () => {
  const landmarks = makeLandmarks()
  const W = 1000
  const H = 500
  const skel = blazeposeToOpenpose(landmarks, W, H)
  const expectedX = ((landmarks[11].x + landmarks[12].x) / 2) * W
  const expectedY = ((landmarks[11].y + landmarks[12].y) / 2) * H
  assert.ok(Math.abs(skel[1].x - expectedX) < 1e-9)
  assert.ok(Math.abs(skel[1].y - expectedY) < 1e-9)
})

test('blazeposeToOpenpose clamps confidence to 0–1 and defaults missing visibility to 0', () => {
  const landmarks = makeLandmarks()
  landmarks[0].visibility = 1.5 // over range
  delete landmarks[12].visibility // missing → 0
  const skel = blazeposeToOpenpose(landmarks, 100, 100)
  assert.equal(skel[0].confidence, 1)
  assert.equal(skel[2].confidence, 0)
})

test('emptySkeleton returns 18 points all with confidence 1', () => {
  const skel = emptySkeleton(500, 400, 80)
  assert.equal(skel.length, 18)
  for (const p of skel) {
    assert.equal(p.confidence, 1)
    assert.ok(Number.isFinite(p.x))
    assert.ok(Number.isFinite(p.y))
  }
})

test('emptySkeleton centers the pose near (cx, cy)', () => {
  const cx = 500
  const cy = 400
  const skel = emptySkeleton(cx, cy, 80)
  // Neck is horizontally centered (dx = 0)
  assert.equal(skel[1].x, cx)
})
