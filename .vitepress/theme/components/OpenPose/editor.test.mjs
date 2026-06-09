import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  moveKeypoint,
  addPerson,
  removePerson,
  MAX_PERSONS,
} from './editor.js'
import { emptySkeleton } from './skeleton.js'

test('MAX_PERSONS is 2', () => {
  assert.equal(MAX_PERSONS, 2)
})

test('moveKeypoint updates x/y and sets confidence to 1.0', () => {
  const skel = emptySkeleton(100, 100, 80)
  skel[3].confidence = 0.1 // simulate a low-confidence detection
  const out = moveKeypoint(skel, 3, 250, 175)
  assert.equal(out, skel) // mutates in place
  assert.equal(skel[3].x, 250)
  assert.equal(skel[3].y, 175)
  assert.equal(skel[3].confidence, 1.0)
})

test('moveKeypoint ignores an out-of-range index without throwing', () => {
  const skel = emptySkeleton(100, 100, 80)
  assert.doesNotThrow(() => moveKeypoint(skel, 99, 1, 1))
  assert.doesNotThrow(() => moveKeypoint(skel, -1, 1, 1))
})

test('addPerson appends a 18-point T-pose person', () => {
  const skels = addPerson([], 300, 200, 80)
  assert.equal(skels.length, 1)
  assert.equal(skels[0].length, 18)
  for (const p of skels[0]) assert.equal(p.confidence, 1)
})

test('addPerson centers the new person at (cx, cy)', () => {
  const skels = addPerson([], 300, 200, 80)
  // Neck (index 1) is horizontally centered.
  assert.equal(skels[0][1].x, 300)
})

test('addPerson respects the max of 2 and returns same ref at the limit', () => {
  let skels = addPerson([], 0, 0)
  skels = addPerson(skels, 0, 0)
  assert.equal(skels.length, 2)
  const atLimit = skels
  const after = addPerson(skels, 0, 0)
  assert.equal(after.length, 2)
  assert.equal(after, atLimit) // no-op returns the same array
})

test('removePerson pops the last person', () => {
  let skels = addPerson(addPerson([], 0, 0), 0, 0)
  assert.equal(skels.length, 2)
  skels = removePerson(skels)
  assert.equal(skels.length, 1)
})

test('removePerson never goes below 0 and returns same ref when empty', () => {
  const empty = []
  const after = removePerson(empty)
  assert.equal(after.length, 0)
  assert.equal(after, empty) // no-op returns the same array
})

test('addPerson / removePerson return new arrays (not mutated input)', () => {
  const base = []
  const added = addPerson(base, 10, 10)
  assert.notEqual(added, base)
  assert.equal(base.length, 0)

  const removed = removePerson(added)
  assert.notEqual(removed, added)
  assert.equal(added.length, 1)
})
