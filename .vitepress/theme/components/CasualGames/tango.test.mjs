import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32 } from './rng.js'
import {
  generate,
  validate,
  isSolved,
  hint,
  countSolutions,
  MOON,
  SUN,
  EMPTY,
  EQUAL,
  DIFF,
} from './tango.js'

const SIZE = 6
const TOTAL = SIZE * SIZE

function areAdjacent(size, a, b) {
  const rowA = Math.floor(a / size)
  const colA = a % size
  const rowB = Math.floor(b / size)
  const colB = b % size
  return (rowA === rowB && Math.abs(colA - colB) === 1) || (colA === colB && Math.abs(rowA - rowB) === 1)
}

function rowValues(board, row) {
  return Array.from({ length: SIZE }, (_, col) => board[row * SIZE + col])
}

function columnValues(board, col) {
  return Array.from({ length: SIZE }, (_, row) => board[row * SIZE + col])
}

function verifyPuzzle(puzzle) {
  assert.equal(puzzle.size, SIZE)
  assert.equal(puzzle.solution.length, TOTAL)
  assert.equal(puzzle.givens.length, TOTAL)
  assert.ok(puzzle.solution.every((value) => value === MOON || value === SUN))
  assert.ok(puzzle.givens.every((value) => value === MOON || value === SUN || value === EMPTY))
  assert.ok(puzzle.constraints.length > 0)
  assert.ok(puzzle.givens.some((value) => value !== EMPTY))
  for (let row = 0; row < SIZE; row += 1) {
    const values = rowValues(puzzle.solution, row)
    assert.equal(values.filter((value) => value === SUN).length, 3)
    assert.equal(values.filter((value) => value === MOON).length, 3)
  }
  for (let col = 0; col < SIZE; col += 1) {
    const values = columnValues(puzzle.solution, col)
    assert.equal(values.filter((value) => value === SUN).length, 3)
    assert.equal(values.filter((value) => value === MOON).length, 3)
  }
  for (let rowA = 0; rowA < SIZE; rowA += 1) {
    for (let rowB = rowA + 1; rowB < SIZE; rowB += 1) {
      assert.notDeepEqual(rowValues(puzzle.solution, rowA), rowValues(puzzle.solution, rowB))
    }
  }
  for (let colA = 0; colA < SIZE; colA += 1) {
    for (let colB = colA + 1; colB < SIZE; colB += 1) {
      assert.notDeepEqual(columnValues(puzzle.solution, colA), columnValues(puzzle.solution, colB))
    }
  }
  for (const constraint of puzzle.constraints) {
    assert.ok(Number.isInteger(constraint.a) && constraint.a >= 0 && constraint.a < TOTAL)
    assert.ok(Number.isInteger(constraint.b) && constraint.b >= 0 && constraint.b < TOTAL)
    assert.notEqual(constraint.a, constraint.b)
    assert.ok(areAdjacent(puzzle.size, constraint.a, constraint.b))
    assert.ok(constraint.op === EQUAL || constraint.op === DIFF)
    assert.equal(constraint.op === EQUAL, puzzle.solution[constraint.a] === puzzle.solution[constraint.b])
  }
  for (let index = 0; index < TOTAL; index += 1) {
    if (puzzle.givens[index] !== EMPTY) assert.equal(puzzle.givens[index], puzzle.solution[index])
  }
  assert.deepEqual(validate(puzzle, puzzle.solution), [])
  assert.equal(isSolved(puzzle, puzzle.solution), true)
  assert.equal(countSolutions(puzzle, 2), 1)
}

test('generate builds a valid 6x6 puzzle with a unique solution', () => {
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

test('validate reports row balance conflicts', () => {
  const puzzle = generate(mulberry32(5))
  const board = new Array(TOTAL).fill(EMPTY)
  for (let col = 0; col < 4; col += 1) board[col] = SUN
  const conflicts = validate(puzzle, board)
  assert.ok(conflicts.some((conflict) => conflict.type === 'rowBalance' && conflict.row === 0))
})

test('validate reports column balance conflicts', () => {
  const puzzle = generate(mulberry32(5))
  const board = new Array(TOTAL).fill(EMPTY)
  for (let row = 0; row < 4; row += 1) board[row * SIZE] = SUN
  const conflicts = validate(puzzle, board)
  assert.ok(conflicts.some((conflict) => conflict.type === 'colBalance' && conflict.col === 0))
})

test('validate reports row run conflicts', () => {
  const puzzle = generate(mulberry32(5))
  const board = new Array(TOTAL).fill(EMPTY)
  board[0] = SUN
  board[1] = SUN
  board[2] = SUN
  const conflicts = validate(puzzle, board)
  assert.ok(conflicts.some((conflict) => conflict.type === 'rowRun' && conflict.row === 0 && conflict.start === 0))
})

test('validate reports column run conflicts', () => {
  const puzzle = generate(mulberry32(5))
  const board = new Array(TOTAL).fill(EMPTY)
  board[0] = SUN
  board[SIZE] = SUN
  board[SIZE * 2] = SUN
  const conflicts = validate(puzzle, board)
  assert.ok(conflicts.some((conflict) => conflict.type === 'colRun' && conflict.col === 0 && conflict.start === 0))
})

test('validate reports duplicate row conflicts', () => {
  const puzzle = generate(mulberry32(5))
  const board = new Array(TOTAL).fill(EMPTY)
  const row = rowValues(puzzle.solution, 0)
  row.forEach((value, col) => { board[col] = value })
  row.forEach((value, col) => { board[SIZE + col] = value })
  const conflicts = validate(puzzle, board)
  assert.ok(conflicts.some((conflict) => conflict.type === 'rowDuplicate' && conflict.rowA === 0 && conflict.rowB === 1))
})

test('validate reports duplicate column conflicts', () => {
  const puzzle = generate(mulberry32(5))
  const board = new Array(TOTAL).fill(EMPTY)
  const column = columnValues(puzzle.solution, 0)
  column.forEach((value, row) => { board[row * SIZE] = value })
  column.forEach((value, row) => { board[row * SIZE + 1] = value })
  const conflicts = validate(puzzle, board)
  assert.ok(conflicts.some((conflict) => conflict.type === 'colDuplicate' && conflict.colA === 0 && conflict.colB === 1))
})

test('validate reports equal-constraint violations', () => {
  const puzzle = { size: SIZE, constraints: [{ a: 0, b: 1, op: EQUAL }] }
  const board = new Array(TOTAL).fill(EMPTY)
  board[0] = MOON
  board[1] = SUN
  const conflicts = validate(puzzle, board)
  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].type, 'constraint')
  assert.equal(conflicts[0].op, EQUAL)
})

test('validate reports different-constraint violations', () => {
  const puzzle = { size: SIZE, constraints: [{ a: 0, b: 1, op: DIFF }] }
  const board = new Array(TOTAL).fill(EMPTY)
  board[0] = MOON
  board[1] = MOON
  const conflicts = validate(puzzle, board)
  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].type, 'constraint')
  assert.equal(conflicts[0].op, DIFF)
})

test('validate ignores empty cells', () => {
  const puzzle = generate(mulberry32(11))
  assert.deepEqual(validate(puzzle, new Array(TOTAL).fill(EMPTY)), [])
})

test('validate rejects a board of the wrong length', () => {
  const puzzle = generate(mulberry32(11))
  assert.throws(() => validate(puzzle, []), RangeError)
  assert.throws(() => validate(puzzle, new Array(TOTAL - 1).fill(EMPTY)), RangeError)
})

test('isSolved accepts only a complete, conflict-free board', () => {
  const puzzle = generate(mulberry32(23))
  assert.equal(isSolved(puzzle, puzzle.solution.slice()), true)
  assert.equal(isSolved(puzzle, new Array(TOTAL).fill(EMPTY)), false)
  const wrong = puzzle.solution.slice()
  wrong[5] = wrong[5] === SUN ? MOON : SUN
  assert.equal(isSolved(puzzle, wrong), false)
})

test('isSolved rejects complete boards with duplicate rows or columns', () => {
  const puzzle = generate(mulberry32(23))
  const duplicateRow = puzzle.solution.slice()
  for (let col = 0; col < SIZE; col += 1) duplicateRow[SIZE + col] = puzzle.solution[col]
  assert.equal(isSolved(puzzle, duplicateRow), false)

  const duplicateColumn = puzzle.solution.slice()
  for (let row = 0; row < SIZE; row += 1) duplicateColumn[row * SIZE + 1] = puzzle.solution[row * SIZE]
  assert.equal(isSolved(puzzle, duplicateColumn), false)
})

test('hint returns the first differing cell and null when solved', () => {
  const puzzle = generate(mulberry32(29))
  assert.deepEqual(hint(puzzle, new Array(TOTAL).fill(EMPTY)), { index: 0, value: puzzle.solution[0] })
  const board = puzzle.solution.slice()
  board[2] = EMPTY
  assert.deepEqual(hint(puzzle, board), { index: 2, value: puzzle.solution[2] })
  board[1] = board[1] === SUN ? MOON : SUN
  assert.deepEqual(hint(puzzle, board), { index: 1, value: puzzle.solution[1] })
  assert.equal(hint(puzzle, puzzle.solution.slice()), null)
})

test('hint rejects a board of the wrong length', () => {
  const puzzle = generate(mulberry32(29))
  assert.throws(() => hint(puzzle, []), RangeError)
})

test('countSolutions respects the limit and enumerates solutions', () => {
  const open = { size: SIZE, givens: new Array(TOTAL).fill(EMPTY), constraints: [] }
  assert.equal(countSolutions(open, 1), 1)
  assert.equal(countSolutions(open, 2), 2)
  assert.equal(countSolutions(open, 3), 3)
})
