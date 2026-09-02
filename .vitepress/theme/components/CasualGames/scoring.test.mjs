import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scorePuzzle, queensScore, formatClock, HINT_PENALTY, TIME_PENALTY_PER_SECOND } from './scoring.js'

test('scorePuzzle subtracts hint and time penalties and never goes below minPoints', () => {
  assert.equal(scorePuzzle({ basePoints: 300, hints: 2, elapsedSeconds: 10 }), 300 - 2 * HINT_PENALTY - 10 * TIME_PENALTY_PER_SECOND)
  assert.equal(scorePuzzle({ basePoints: 300, hints: 200, elapsedSeconds: 1000, minPoints: 5 }), 5)
  assert.equal(scorePuzzle({ basePoints: 50, hints: 3, elapsedSeconds: 0, minPoints: 0 }), 0)
})

test('scorePuzzle is monotonic in hints and elapsed time', () => {
  const base = scorePuzzle({ basePoints: 1000, hints: 0, elapsedSeconds: 0 })
  assert.ok(base > scorePuzzle({ basePoints: 1000, hints: 1, elapsedSeconds: 0 }))
  assert.ok(base > scorePuzzle({ basePoints: 1000, hints: 0, elapsedSeconds: 1 }))
})

test('scorePuzzle clamps invalid negative inputs to zero', () => {
  assert.equal(scorePuzzle({ basePoints: 100, hints: -5, elapsedSeconds: -10 }), 100)
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
