import { randInt, shuffle } from './rng.js'

export const MOON = 0
export const SUN = 1
export const EMPTY = -1
export const EQUAL = '='
export const DIFF = 'x'

export function generate(rng) {
  if (typeof rng !== 'function') throw new TypeError('rng must be a function')
  const size = 6
  const solution = generateFullGrid(size, rng)
  const givens = new Array(size * size).fill(EMPTY)
  const puzzle = { size, solution, givens, constraints: sampleConstraints(size, solution, rng) }
  while (true) {
    const solutions = solve(puzzle, 2)
    if (solutions.length === 1) return puzzle
    if (solutions.length === 0) {
      puzzle.constraints = sampleConstraints(size, solution, rng)
      givens.fill(EMPTY)
      continue
    }
    const first = solutions[0]
    const second = solutions[1]
    const index = first.findIndex((value, i) => value !== second[i])
    if (index === -1) {
      puzzle.constraints = sampleConstraints(size, solution, rng)
      givens.fill(EMPTY)
      continue
    }
    givens[index] = solution[index]
  }
}

export function countSolutions(puzzle, limit = 2) {
  return solve(puzzle, limit).length
}

export function validate(puzzle, board) {
  const size = puzzle.size
  const total = size * size
  if (!Array.isArray(board) || board.length !== total) {
    throw new RangeError(`board must have length ${total}`)
  }
  const half = size / 2
  const conflicts = []
  for (let row = 0; row < size; row += 1) {
    let moons = 0
    let suns = 0
    for (let col = 0; col < size; col += 1) {
      const value = board[row * size + col]
      if (value === MOON) moons += 1
      else if (value === SUN) suns += 1
    }
    if (moons > half || suns > half) conflicts.push({ type: 'rowBalance', row, moons, suns })
    for (let col = 0; col + 2 < size; col += 1) {
      const a = board[row * size + col]
      const b = board[row * size + col + 1]
      const c = board[row * size + col + 2]
      if (a !== EMPTY && a === b && b === c) conflicts.push({ type: 'rowRun', row, start: col, value: a })
    }
  }
  for (let col = 0; col < size; col += 1) {
    let moons = 0
    let suns = 0
    for (let row = 0; row < size; row += 1) {
      const value = board[row * size + col]
      if (value === MOON) moons += 1
      else if (value === SUN) suns += 1
    }
    if (moons > half || suns > half) conflicts.push({ type: 'colBalance', col, moons, suns })
    for (let row = 0; row + 2 < size; row += 1) {
      const a = board[row * size + col]
      const b = board[(row + 1) * size + col]
      const c = board[(row + 2) * size + col]
      if (a !== EMPTY && a === b && b === c) conflicts.push({ type: 'colRun', col, start: row, value: a })
    }
  }
  for (let rowA = 0; rowA < size; rowA += 1) {
    for (let rowB = rowA + 1; rowB < size; rowB += 1) {
      if (rowIsFullyDuplicate(board, size, rowA, rowB)) {
        conflicts.push({ type: 'rowDuplicate', rowA, rowB })
      }
    }
  }
  for (let colA = 0; colA < size; colA += 1) {
    for (let colB = colA + 1; colB < size; colB += 1) {
      if (columnIsFullyDuplicate(board, size, colA, colB)) {
        conflicts.push({ type: 'colDuplicate', colA, colB })
      }
    }
  }
  for (let index = 0; index < puzzle.constraints.length; index += 1) {
    const { a, b, op } = puzzle.constraints[index]
    const valueA = board[a]
    const valueB = board[b]
    if (valueA === EMPTY || valueB === EMPTY) continue
    if (op === EQUAL && valueA !== valueB) {
      conflicts.push({ type: 'constraint', index, a, b, op, valueA, valueB })
    } else if (op === DIFF && valueA === valueB) {
      conflicts.push({ type: 'constraint', index, a, b, op, valueA, valueB })
    }
  }
  return conflicts
}

export function isSolved(puzzle, board) {
  const total = puzzle.size * puzzle.size
  if (!Array.isArray(board) || board.length !== total) return false
  if (board.some((value) => value === EMPTY)) return false
  return validate(puzzle, board).length === 0
}

export function hint(puzzle, board) {
  const total = puzzle.size * puzzle.size
  if (!Array.isArray(board) || board.length !== total) {
    throw new RangeError(`board must have length ${total}`)
  }
  for (let index = 0; index < total; index += 1) {
    if (board[index] !== puzzle.solution[index]) {
      return { index, value: puzzle.solution[index] }
    }
  }
  return null
}

function generateFullGrid(size, rng) {
  const grid = new Array(size * size).fill(EMPTY)
  place(0)
  return grid

  function place(index) {
    if (index === size * size) return true
    const row = Math.floor(index / size)
    const col = index % size
    for (const value of shuffle([MOON, SUN], rng)) {
      grid[index] = value
      if (isRowColumnValidAt(grid, size, row, col)) {
        if (place(index + 1)) return true
      }
      grid[index] = EMPTY
    }
    return false
  }
}

function sampleConstraints(size, solution, rng) {
  const edges = []
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const index = row * size + col
      if (col < size - 1) edges.push([index, index + 1])
      if (row < size - 1) edges.push([index, index + size])
    }
  }
  const shuffled = shuffle(edges, rng)
  const count = 22 + randInt(rng, 16)
  const constraints = []
  for (let i = 0; i < count; i += 1) {
    const [a, b] = shuffled[i]
    constraints.push({ a, b, op: solution[a] === solution[b] ? EQUAL : DIFF })
  }
  return constraints
}

function solve(puzzle, limit = 2) {
  const size = puzzle.size
  const total = size * size
  const constraintAdj = Array.from({ length: total }, () => [])
  for (const constraint of puzzle.constraints) {
    constraintAdj[constraint.a].push({ other: constraint.b, op: constraint.op })
    constraintAdj[constraint.b].push({ other: constraint.a, op: constraint.op })
  }
  const board = new Array(total).fill(EMPTY)
  const solutions = []
  backtrack(0)
  return solutions

  function backtrack(index) {
    if (solutions.length >= limit) return
    if (index === total) {
      solutions.push(board.slice())
      return
    }
    const row = Math.floor(index / size)
    const col = index % size
    const given = puzzle.givens[index]
    const values = given === EMPTY ? [MOON, SUN] : [given]
    for (const value of values) {
      board[index] = value
      if (isRowColumnValidAt(board, size, row, col) && constraintValidAt(board, index, value, constraintAdj)) {
        backtrack(index + 1)
      }
    }
    board[index] = EMPTY
  }
}

function isRowColumnValidAt(grid, size, row, col) {
  const value = grid[row * size + col]
  const half = size / 2
  let rowMoons = 0
  let rowSuns = 0
  for (let c = 0; c <= col; c += 1) {
    const cell = grid[row * size + c]
    if (cell === MOON) rowMoons += 1
    else if (cell === SUN) rowSuns += 1
  }
  const rowRemaining = size - col - 1
  if (rowMoons > half || rowSuns > half || rowMoons + rowRemaining < half || rowSuns + rowRemaining < half) return false
  if (col >= 2) {
    const a = grid[row * size + col - 2]
    const b = grid[row * size + col - 1]
    if (a === value && b === value) return false
  }
  if (col === size - 1) {
    for (let otherRow = 0; otherRow < row; otherRow += 1) {
      if (rowIsFullyDuplicate(grid, size, row, otherRow)) return false
    }
  }
  let colMoons = 0
  let colSuns = 0
  for (let r = 0; r <= row; r += 1) {
    const cell = grid[r * size + col]
    if (cell === MOON) colMoons += 1
    else if (cell === SUN) colSuns += 1
  }
  const colRemaining = size - row - 1
  if (colMoons > half || colSuns > half || colMoons + colRemaining < half || colSuns + colRemaining < half) return false
  if (row >= 2) {
    const a = grid[(row - 2) * size + col]
    const b = grid[(row - 1) * size + col]
    if (a === value && b === value) return false
  }
  if (row === size - 1) {
    for (let otherCol = 0; otherCol < col; otherCol += 1) {
      if (columnIsFullyDuplicate(grid, size, col, otherCol)) return false
    }
  }
  return true
}

function constraintValidAt(board, index, value, constraintAdj) {
  for (const { other, op } of constraintAdj[index]) {
    const otherValue = board[other]
    if (otherValue === EMPTY) continue
    if (op === EQUAL && otherValue !== value) return false
    if (op === DIFF && otherValue === value) return false
  }
  return true
}

function rowIsFullyDuplicate(board, size, rowA, rowB) {
  for (let col = 0; col < size; col += 1) {
    const a = board[rowA * size + col]
    const b = board[rowB * size + col]
    if (a === EMPTY || b === EMPTY || a !== b) return false
  }
  return true
}

function columnIsFullyDuplicate(board, size, colA, colB) {
  for (let row = 0; row < size; row += 1) {
    const a = board[row * size + colA]
    const b = board[row * size + colB]
    if (a === EMPTY || b === EMPTY || a !== b) return false
  }
  return true
}
