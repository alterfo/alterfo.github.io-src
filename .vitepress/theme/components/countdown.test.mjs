import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeRemaining, ringOffset } from './countdown.js'

test('computeRemaining: exactly one day left', () => {
  assert.deepEqual(computeRemaining(0, 1, 0), {
    days: 1, hours: 0, minutes: 0, seconds: 0, finished: false,
  })
})

test('computeRemaining: target reached → finished', () => {
  const r = computeRemaining(0, 1, 86400000)
  assert.equal(r.finished, true)
  assert.deepEqual(r, { days: 0, hours: 0, minutes: 0, seconds: 0, finished: true })
})

test('computeRemaining: past target → finished', () => {
  assert.equal(computeRemaining(0, 1, 90000000).finished, true)
})

test('computeRemaining: 2 days, halfway → 1 day left, not finished', () => {
  const r = computeRemaining(0, 2, 86400000)
  assert.equal(r.days, 1)
  assert.equal(r.finished, false)
})

test('ringOffset: empty / full / half', () => {
  assert.equal(ringOffset(0, 60, 100), 100)
  assert.equal(ringOffset(60, 60, 100), 0)
  assert.equal(ringOffset(30, 60, 100), 50)
})

test('ringOffset: max 0 guards against division by zero', () => {
  assert.equal(ringOffset(5, 0, 100), 100)
})
