import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toOpenPoseJSON } from './exporter.js'
import { emptySkeleton } from './skeleton.js'

test('toOpenPoseJSON has version 1.3', () => {
  const json = toOpenPoseJSON([emptySkeleton(100, 100, 80)], 200, 200)
  assert.equal(json.version, 1.3)
})

test('people array has same length as input skeletons', () => {
  const one = toOpenPoseJSON([emptySkeleton(100, 100, 80)], 200, 200)
  assert.equal(one.people.length, 1)

  const two = toOpenPoseJSON(
    [emptySkeleton(60, 100, 40), emptySkeleton(140, 100, 40)],
    200, 200,
  )
  assert.equal(two.people.length, 2)
})

test('each person pose_keypoints_2d has exactly 54 values (18 × 3)', () => {
  const json = toOpenPoseJSON(
    [emptySkeleton(100, 100, 80), emptySkeleton(100, 100, 80)],
    200, 200,
  )
  for (const person of json.people) {
    assert.equal(person.pose_keypoints_2d.length, 54)
  }
})

test('coordinates are normalized 0–1 when skeleton is within image bounds', () => {
  // scale 20 keeps all keypoints well inside a 200×200 image around (100, 100).
  const json = toOpenPoseJSON([emptySkeleton(100, 100, 20)], 200, 200)
  const kp = json.people[0].pose_keypoints_2d
  for (let i = 0; i < kp.length; i += 3) {
    const x = kp[i]
    const y = kp[i + 1]
    const c = kp[i + 2]
    assert.ok(x >= 0 && x <= 1, `x ${x} out of [0,1]`)
    assert.ok(y >= 0 && y <= 1, `y ${y} out of [0,1]`)
    assert.ok(c >= 0 && c <= 1, `confidence ${c} out of [0,1]`)
  }
})

test('normalization divides pixel coords by image dimensions', () => {
  const skel = emptySkeleton(0, 0, 80)
  skel[0] = { x: 100, y: 50, confidence: 0.5 }
  const json = toOpenPoseJSON([skel], 200, 100)
  const kp = json.people[0].pose_keypoints_2d
  assert.equal(kp[0], 0.5) // 100 / 200
  assert.equal(kp[1], 0.5) // 50 / 100
  assert.equal(kp[2], 0.5) // confidence passthrough
})

test('empty skeletons input returns people: []', () => {
  assert.deepEqual(toOpenPoseJSON([], 200, 200).people, [])
  assert.deepEqual(toOpenPoseJSON(null, 200, 200).people, [])
})

test('each person carries the standard empty sub-arrays and person_id', () => {
  const json = toOpenPoseJSON([emptySkeleton(100, 100, 80)], 200, 200)
  const person = json.people[0]
  assert.deepEqual(person.person_id, [-1])
  assert.deepEqual(person.face_keypoints_2d, [])
  assert.deepEqual(person.hand_left_keypoints_2d, [])
  assert.deepEqual(person.hand_right_keypoints_2d, [])
})
