import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32 } from './rng.js'
import { generate, validatePath, isSolved, hint, countSolutions, explainHint, SIZE, EMPTY } from './zip.js'

const TOTAL = SIZE * SIZE

function areAdjacent(size, a, b) {
  const rowA = Math.floor(a / size)
  const colA = a % size
  const rowB = Math.floor(b / size)
  const colB = b % size
  return (
    (rowA === rowB && Math.abs(colA - colB) === 1) ||
    (colA === colB && Math.abs(rowA - rowB) === 1)
  )
}

function verifyPuzzle(puzzle) {
  assert.equal(puzzle.size, SIZE)
  assert.equal(puzzle.solution.length, TOTAL)
  assert.equal(puzzle.waypoints.length, TOTAL)
  assert.equal(new Set(puzzle.solution).size, TOTAL)
  assert.ok(puzzle.solution.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < TOTAL))
  for (let index = 1; index < TOTAL; index += 1) {
    assert.ok(areAdjacent(puzzle.size, puzzle.solution[index - 1], puzzle.solution[index]))
  }
  const numbered = []
  for (let cell = 0; cell < TOTAL; cell += 1) {
    const num = puzzle.waypoints[cell]
    assert.ok(Number.isInteger(num) && num >= EMPTY && num <= TOTAL)
    if (num > EMPTY) numbered.push({ cell, num })
  }
  assert.ok(numbered.length >= 2)
  const labels = numbered.map((entry) => entry.num).sort((a, b) => a - b)
  for (let index = 0; index < labels.length; index += 1) assert.equal(labels[index], index + 1)
  const byLabel = new Map(numbered.map((entry) => [entry.num, entry.cell]))
  let previousPosition = -1
  for (let label = 1; label <= numbered.length; label += 1) {
    const position = puzzle.solution.indexOf(byLabel.get(label))
    assert.ok(position > previousPosition)
    previousPosition = position
  }
  assert.deepEqual(validatePath(puzzle, puzzle.solution), [])
  assert.equal(isSolved(puzzle, puzzle.solution), true)
  assert.equal(countSolutions(puzzle, 2), 1)
}

test('generate builds a valid 6x6 puzzle with a unique Hamiltonian solution', () => {
  for (const seed of [7, 31, 97, 2026]) {
    verifyPuzzle(generate(mulberry32(seed)))
  }
})

test('generate is deterministic for the same seed', () => {
  assert.deepEqual(generate(mulberry32(123)), generate(mulberry32(123)))
})

test('generate rejects a non-function rng', () => {
  assert.throws(() => generate(null), TypeError)
  assert.throws(() => generate(), TypeError)
})

test('validatePath accepts an empty path', () => {
  const puzzle = generate(mulberry32(5))
  assert.deepEqual(validatePath(puzzle, []), [])
})

test('validatePath reports out-of-bounds cells', () => {
  const puzzle = generate(mulberry32(5))
  assert.ok(validatePath(puzzle, [-1]).some((conflict) => conflict.type === 'bounds'))
  assert.ok(validatePath(puzzle, [TOTAL]).some((conflict) => conflict.type === 'bounds'))
})

test('validatePath reports duplicate cells', () => {
  const puzzle = generate(mulberry32(11))
  const start = puzzle.solution[0]
  const next = puzzle.solution[1]
  const conflicts = validatePath(puzzle, [start, next, next])
  assert.ok(conflicts.some((conflict) => conflict.type === 'duplicate' && conflict.cell === next))
})

test('validatePath reports non-adjacent consecutive cells', () => {
  const puzzle = generate(mulberry32(17))
  const start = puzzle.solution[0]
  const far = puzzle.solution.find((cell) => cell !== start && !areAdjacent(puzzle.size, start, cell))
  assert.ok(validatePath(puzzle, [start, far]).some((conflict) => conflict.type === 'adjacent'))
})

test('validatePath reports a path that does not start at waypoint 1', () => {
  const waypoints = new Array(TOTAL).fill(EMPTY)
  waypoints[5] = 1
  waypoints[2] = 2
  const puzzle = { size: SIZE, waypoints, solution: [] }
  assert.ok(validatePath(puzzle, [0]).some((conflict) => conflict.type === 'start'))
})

test('validatePath reports waypoints visited out of order', () => {
  const waypoints = new Array(TOTAL).fill(EMPTY)
  waypoints[0] = 1
  waypoints[1] = 3
  const puzzle = { size: SIZE, waypoints, solution: [] }
  assert.ok(validatePath(puzzle, [0, 1]).some((conflict) => conflict.type === 'waypointOrder'))
})

test('validatePath reports the end waypoint appearing before the final cell', () => {
  const waypoints = new Array(TOTAL).fill(EMPTY)
  waypoints[0] = 1
  waypoints[2] = 2
  const puzzle = { size: SIZE, waypoints, solution: [] }
  assert.ok(validatePath(puzzle, [0, 1, 2, 3]).some((conflict) => conflict.type === 'endNotLast'))
})

test('validatePath reports reaching the end before covering every cell', () => {
  const waypoints = new Array(TOTAL).fill(EMPTY)
  waypoints[0] = 1
  waypoints[2] = 2
  const puzzle = { size: SIZE, waypoints, solution: [] }
  assert.ok(validatePath(puzzle, [0, 1, 2]).some((conflict) => conflict.type === 'incompleteEnd'))
})

test('validatePath rejects a non-array path', () => {
  const puzzle = generate(mulberry32(5))
  assert.throws(() => validatePath(puzzle, 'nope'), TypeError)
})

test('isSolved accepts only a complete, conflict-free path', () => {
  const puzzle = generate(mulberry32(23))
  assert.equal(isSolved(puzzle, puzzle.solution.slice()), true)
  assert.equal(isSolved(puzzle, []), false)
  assert.equal(isSolved(puzzle, puzzle.solution.slice(0, TOTAL - 1)), false)
  const swapped = puzzle.solution.slice()
  ;[swapped[0], swapped[1]] = [swapped[1], swapped[0]]
  assert.equal(isSolved(puzzle, swapped), false)
  assert.equal(isSolved(puzzle, 'nope'), false)
})

test('hint returns the next segment of the solution path and null when solved', () => {
  const puzzle = generate(mulberry32(29))
  const { solution } = puzzle
  assert.deepEqual(hint(puzzle, []), { from: solution[0], to: solution[1] })
  assert.deepEqual(hint(puzzle, [solution[0]]), { from: solution[0], to: solution[1] })
  assert.deepEqual(hint(puzzle, solution.slice(0, 3)), { from: solution[2], to: solution[3] })
  const wrongFirst = solution[0] === 0 ? 1 : 0
  assert.deepEqual(hint(puzzle, [wrongFirst]), { from: solution[0], to: solution[1] })
  assert.equal(hint(puzzle, solution.slice()), null)
})

test('hint rejects a non-array path', () => {
  const puzzle = generate(mulberry32(29))
  assert.throws(() => hint(puzzle, 'nope'), TypeError)
})

test('countSolutions respects the limit and validates its input', () => {
  const puzzle = generate(mulberry32(41))
  assert.equal(countSolutions(puzzle, 1), 1)
  assert.equal(countSolutions(puzzle, 2), 1)
  assert.throws(() => countSolutions(null), TypeError)
  assert.throws(() => countSolutions({ size: SIZE, waypoints: 'nope' }), TypeError)
})

test('explainHint returns null when there is no move', () => {
  const puzzle = { size: 3, waypoints: [1, 0, 0, 0, 0, 0, 0, 0, 2] }
  assert.equal(explainHint(puzzle, [], null), null)
})

test('explainHint tells the player to start at waypoint 1 when the path is empty', () => {
  const puzzle = { size: 3, waypoints: [1, 0, 0, 0, 0, 0, 0, 0, 2] }
  const message = explainHint(puzzle, [], { from: 0, to: 0 })
  assert.match(message, /1/)
})

test('explainHint names the next numbered waypoint', () => {
  const puzzle = { size: 3, waypoints: [1, 0, 0, 0, 0, 0, 0, 0, 2] }
  const message = explainHint(puzzle, [0], { from: 0, to: 8 })
  assert.match(message, /номером 2/)
})

test('explainHint gives a generic continuation reason for unnumbered cells', () => {
  const puzzle = { size: 3, waypoints: [1, 0, 0, 0, 0, 0, 0, 0, 2] }
  const message = explainHint(puzzle, [0], { from: 0, to: 1 })
  assert.equal(typeof message, 'string')
  assert.ok(message.length > 0)
  assert.doesNotMatch(message, /номером/)
})
