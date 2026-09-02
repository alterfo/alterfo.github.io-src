import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scorePuzzle, queensScore, formatClock, HINT_PENALTY, TIME_PENALTY_PER_SECOND } from './scoring.js'

test('scorePuzzle subtracts hint and time penalties and never goes below zero', () => {
  assert.equal(scorePuzzle(300, 2, 10), 300 - 2 * HINT_PENALTY - 10 * TIME_PENALTY_PER_SECOND)
  assert.equal(scorePuzzle(300, 200, 1000), 0)
  assert.equal(scorePuzzle(50, 3, 0), 0)
})

test('scorePuzzle is monotonic in hints and elapsed time', () => {
  const base = scorePuzzle(1000, 0, 0)
  assert.ok(base > scorePuzzle(1000, 1, 0))
  assert.ok(base > scorePuzzle(1000, 0, 1))
})

test('scorePuzzle clamps invalid negative inputs to zero', () => {
  assert.equal(scorePuzzle(100, -5, -10), 100)
})

test('queensScore uses board size as the base', () => {
  assert.equal(queensScore(5, 0, 0), 500)
  assert.equal(queensScore(8, 0, 0), 800)
})

test('formatClock pads seconds and clamps negative input', () => {
  assert.equal(formatClock(0), '0:00')
  assert.equal(formatClock(9), '0:09')
  assert.equal(formatClock(61), '1:01')
  assert.equal(formatClock(-4), '0:00')
})
