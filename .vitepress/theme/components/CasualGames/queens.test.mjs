import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32 } from './rng.js'
import { generate, regionAt, validate, isSolved, hint } from './queens.js'
import { queensScore, scorePuzzle } from './scoring.js'

function connectedSize(regions, size, color) {
  const total = size * size
  const visited = new Uint8Array(total)
  const first = regions.indexOf(color)
  if (first === -1) return 0
  const stack = [first]
  visited[first] = 1
  let count = 0
  while (stack.length > 0) {
    const cell = stack.pop()
    count += 1
    const row = Math.floor(cell / size)
    const col = cell % size
    const neighbors = []
    if (row > 0) neighbors.push(cell - size)
    if (row < size - 1) neighbors.push(cell + size)
    if (col > 0) neighbors.push(cell - 1)
    if (col < size - 1) neighbors.push(cell + 1)
    for (const neighbor of neighbors) {
      if (!visited[neighbor] && regions[neighbor] === color) {
        visited[neighbor] = 1
        stack.push(neighbor)
      }
    }
  }
  return count
}

function verifyPuzzle(puzzle) {
  const { size, solution, regions } = puzzle
  assert.equal(solution.length, size)
  assert.equal(new Set(solution).size, size)
  assert.ok(solution.every((row) => Number.isInteger(row) && row >= 0 && row < size))
  const colors = new Set()
  for (const color of regions) {
    assert.ok(Number.isInteger(color) && color >= 0 && color < size)
    colors.add(color)
  }
  assert.equal(colors.size, size)
  const regionQueens = new Set()
  for (let col = 0; col < size; col += 1) {
    const color = regionAt(puzzle, solution[col], col)
    assert.ok(!regionQueens.has(color), `region ${color} has more than one queen`)
    regionQueens.add(color)
  }
  assert.equal(regionQueens.size, size)
  for (let color = 0; color < size; color += 1) {
    const totalOfColor = [...regions].filter((value) => value === color).length
    assert.equal(connectedSize(regions, size, color), totalOfColor)
  }
  for (let left = 0; left < size - 1; left += 1) {
    assert.notEqual(Math.abs(solution[left] - solution[left + 1]), 1)
  }
}

test('generate builds connected regions and a valid solution for small and mid boards', () => {
  for (const size of [4, 5, 8]) {
    const puzzle = generate(size, mulberry32(size * 31 + 7))
    verifyPuzzle(puzzle)
    assert.deepEqual(validate(puzzle, puzzle.solution), [])
    assert.equal(isSolved(puzzle, puzzle.solution), true)
  }
})

test('generate is deterministic for the same seed and rejects unsupported sizes', () => {
  const first = generate(6, mulberry32(123))
  const second = generate(6, mulberry32(123))
  assert.deepEqual(first, second)
  assert.throws(() => generate(3, mulberry32(1)), RangeError)
  assert.throws(() => generate(1.5, mulberry32(1)), RangeError)
})

test('validate reports row conflicts', () => {
  const puzzle = generate(6, mulberry32(5))
  const queens = puzzle.solution.slice()
  queens[3] = puzzle.solution[2]
  assert.equal(validate(puzzle, puzzle.solution).length, 0)
  assert.ok(validate(puzzle, queens).some((conflict) => conflict.type === 'row'))
})

test('validate reports region conflicts', () => {
  const puzzle = generate(6, mulberry32(11))
  const found = {}
  for (let row = 0; row < puzzle.size; row += 1) {
    for (let col = 0; col < puzzle.size; col += 1) {
      const color = regionAt(puzzle, row, col)
      if (!found[color]) found[color] = { row, col }
      else if (found[color].col !== col) {
        found[color] = { row, col, other: found[color] }
      }
    }
  }
  const pair = Object.values(found).find((value) => value.other)
  const queens = new Array(puzzle.size).fill(-1)
  queens[pair.col] = pair.row
  queens[pair.other.col] = pair.other.row
  assert.ok(validate(puzzle, queens).some((conflict) => conflict.type === 'region'))
})

test('validate reports touch conflicts', () => {
  const puzzle = generate(6, mulberry32(17))
  const queens = new Array(puzzle.size).fill(-1)
  queens[0] = 1
  queens[1] = 0
  assert.ok(validate(puzzle, queens).some((conflict) => conflict.type === 'touch'))
})

test('isSolved rejects missing or wrong queens', () => {
  const puzzle = generate(6, mulberry32(23))
  assert.equal(isSolved(puzzle, new Array(puzzle.size).fill(-1)), false)
  const wrong = puzzle.solution.slice()
  wrong[2] = wrong[2] === 0 ? 1 : 0
  assert.equal(isSolved(puzzle, wrong), false)
})

test('hint returns the first mismatching solution cell and null when solved', () => {
  const puzzle = generate(6, mulberry32(29))
  assert.deepEqual(hint(puzzle, new Array(puzzle.size).fill(-1)), { col: 0, row: puzzle.solution[0] })
  const queens = new Array(puzzle.size).fill(-1)
  queens[0] = puzzle.solution[0]
  queens[1] = puzzle.solution[1]
  assert.deepEqual(hint(puzzle, queens), { col: 2, row: puzzle.solution[2] })
  assert.equal(hint(puzzle, puzzle.solution.slice()), null)
})

test('queens scoring rewards larger boards and penalizes hints and time', () => {
  assert.ok(queensScore(8, 0, 0) > queensScore(5, 0, 0))
  assert.equal(queensScore(8, 0, 0), scorePuzzle({ basePoints: 800, hints: 0, elapsedSeconds: 0 }))
  const clean = queensScore(8, 0, 30)
  const withHints = queensScore(8, 2, 30)
  const slower = queensScore(8, 0, 60)
  assert.ok(clean > withHints)
  assert.ok(clean > slower)
  assert.equal(queensScore(2, 99, 999), 0)
})
