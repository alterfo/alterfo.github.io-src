import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32, randInt, shuffle, dailySeed } from './rng.js'

test('mulberry32 is deterministic for the same seed', () => {
  const a = mulberry32(1234)
  const b = mulberry32(1234)
  const firstA = [a(), a(), a(), a()]
  const firstB = [b(), b(), b(), b()]
  assert.deepEqual(firstA, firstB)
})

test('mulberry32 produces different streams for different seeds', () => {
  const a = mulberry32(1)
  const b = mulberry32(2)
  assert.notDeepEqual([a(), a(), a()], [b(), b(), b()])
})

test('mulberry32 outputs values in the half-open unit interval', () => {
  const rng = mulberry32(99)
  for (let i = 0; i < 1000; i += 1) {
    const value = rng()
    assert.ok(value >= 0 && value < 1, `value ${value} out of range`)
  }
})

test('randInt returns integers in the requested range', () => {
  const rng = mulberry32(7)
  for (let i = 0; i < 500; i += 1) {
    const value = randInt(rng, 6)
    assert.ok(Number.isInteger(value))
    assert.ok(value >= 0 && value < 6)
  }
})

test('randInt with n of 1 always returns 0', () => {
  const rng = mulberry32(7)
  assert.equal(randInt(rng, 1), 0)
  assert.equal(randInt(rng, 1), 0)
})

test('randInt rejects non-positive or non-integer sizes', () => {
  const rng = mulberry32(7)
  assert.throws(() => randInt(rng, 0), RangeError)
  assert.throws(() => randInt(rng, -2), RangeError)
  assert.throws(() => randInt(rng, 1.5), RangeError)
})

test('shuffle returns a lossless permutation', () => {
  const source = Array.from({ length: 40 }, (_, i) => i)
  const result = shuffle(source, mulberry32(42))
  assert.equal(result.length, source.length)
  assert.deepEqual([...result].sort((x, y) => x - y), source)
})

test('shuffle is deterministic and does not mutate its input', () => {
  const source = [10, 20, 30, 40, 50, 60, 70, 80]
  const before = source.slice()
  const first = shuffle(source, mulberry32(123))
  const second = shuffle(source, mulberry32(123))
  assert.deepEqual(first, second)
  assert.deepEqual(source, before)
})

test('dailySeed is stable across hours within a local day', () => {
  assert.equal(dailySeed(new Date(2026, 8, 2, 0, 0)), dailySeed(new Date(2026, 8, 2, 23, 59)))
})

test('dailySeed changes on the next day and across month boundaries', () => {
  assert.notEqual(dailySeed(new Date(2026, 8, 2, 12)), dailySeed(new Date(2026, 8, 3, 12)))
  assert.notEqual(dailySeed(new Date(2026, 8, 30, 12)), dailySeed(new Date(2026, 9, 1, 12)))
})

test('dailySeed handles leap-day dates', () => {
  assert.equal(dailySeed(new Date(2024, 1, 29, 8)), 20240229)
})
