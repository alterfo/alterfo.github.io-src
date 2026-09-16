import { randInt, shuffle } from './rng.js'

export const SIZE = 6
export const EMPTY = 0

const GENERATION_NODE_BUDGET = 300000

export function generate(rng) {
  if (typeof rng !== 'function') throw new TypeError('rng must be a function')
  const size = SIZE
  const total = size * size
  const solution = generateHamiltonianPath(size, rng)
  const positions = new Set(Array.from({ length: total }, (_, index) => index))
  const removalOrder = shuffle(
    Array.from({ length: total - 2 }, (_, index) => index + 1),
    rng,
  )
  for (const position of removalOrder) {
    positions.delete(position)
    const waypoints = labelsFromPositions(solution, positions)
    const result = solve(waypoints, size, 2, GENERATION_NODE_BUDGET)
    if (!(result.paths.length === 1 && result.complete)) {
      positions.add(position)
    }
  }
  return { size, solution, waypoints: labelsFromPositions(solution, positions) }
}

export function countSolutions(puzzle, limit = 2) {
  if (!puzzle || !Number.isInteger(puzzle.size) || !Array.isArray(puzzle.waypoints)) {
    throw new TypeError('puzzle must have size and waypoints')
  }
  return solve(puzzle.waypoints, puzzle.size, limit, Infinity).paths.length
}

export function validatePath(puzzle, path) {
  if (!puzzle || !Number.isInteger(puzzle.size) || !Array.isArray(puzzle.waypoints)) {
    throw new TypeError('puzzle must have size and waypoints')
  }
  if (!Array.isArray(path)) throw new TypeError('path must be an array')
  const size = puzzle.size
  const total = size * size
  const waypoints = puzzle.waypoints
  const conflicts = []
  const seen = new Set()
  const firstIndex = new Map()
  const numberedInPath = []
  for (let index = 0; index < path.length; index += 1) {
    const cell = path[index]
    if (!Number.isInteger(cell) || cell < 0 || cell >= total) {
      conflicts.push({ type: 'bounds', index, cell })
      continue
    }
    if (seen.has(cell)) {
      conflicts.push({ type: 'duplicate', index, cell, firstIndex: firstIndex.get(cell) })
    } else {
      seen.add(cell)
      firstIndex.set(cell, index)
    }
    const num = waypoints[cell]
    if (num > 0) numberedInPath.push({ index, cell, num })
    if (index > 0) {
      const previous = path[index - 1]
      if (
        Number.isInteger(previous) &&
        previous >= 0 &&
        previous < total &&
        !areAdjacent(size, previous, cell)
      ) {
        conflicts.push({ type: 'adjacent', index, from: previous, to: cell })
      }
    }
  }

  const { start, end } = endpoints(puzzle)
  if (path.length > 0) {
    const first = path[0]
    if (Number.isInteger(first) && first >= 0 && first < total && first !== start) {
      conflicts.push({ type: 'start', index: 0, cell: first, expected: start })
    }
  }

  for (let position = 0; position < numberedInPath.length; position += 1) {
    const entry = numberedInPath[position]
    if (entry.num !== position + 1) {
      conflicts.push({
        type: 'waypointOrder',
        index: entry.index,
        cell: entry.cell,
        expected: position + 1,
        got: entry.num,
      })
      break
    }
  }

  const endIndex = path.indexOf(end)
  if (endIndex !== -1) {
    if (endIndex !== path.length - 1) {
      conflicts.push({ type: 'endNotLast', index: endIndex, cell: end })
    } else if (seen.size < total) {
      conflicts.push({ type: 'incompleteEnd', index: endIndex, cell: end, visited: seen.size, total })
    }
  }

  return conflicts
}

export function isSolved(puzzle, path) {
  if (!puzzle || !Number.isInteger(puzzle.size) || !Array.isArray(puzzle.waypoints)) {
    throw new TypeError('puzzle must have size and waypoints')
  }
  if (!Array.isArray(path) || path.length !== puzzle.size * puzzle.size) return false
  return validatePath(puzzle, path).length === 0
}

export function hint(puzzle, path) {
  if (!puzzle || !Number.isInteger(puzzle.size) || !Array.isArray(puzzle.waypoints)) {
    throw new TypeError('puzzle must have size and waypoints')
  }
  if (!Array.isArray(path)) throw new TypeError('path must be an array')
  const total = puzzle.size * puzzle.size
  const solution = puzzle.solution
  if (path.length === 0) {
    return { from: solution[0], to: solution[1] }
  }
  for (let index = 0; index < total; index += 1) {
    if (index >= path.length || path[index] !== solution[index]) {
      if (index === 0) return { from: solution[0], to: solution[1] }
      return { from: solution[index - 1], to: solution[index] }
    }
  }
  return null
}

export function explainHint(puzzle, path, move) {
  if (!move) return null
  if (path.length === 0) {
    return `Начните путь с клетки, помеченной цифрой 1 — это старт маршрута.`
  }
  const num = puzzle.waypoints[move.to]
  if (num > 0) {
    return `Ведите путь в клетку с номером ${num} — следующая пронумерованная точка по порядку.`
  }
  return `Из текущей клетки путь можно продолжить только в эту соседнюю клетку — остальные соседи ведут в тупик или уже пройдены.`
}

function endpoints(puzzle) {
  let start = -1
  let end = -1
  let maxNum = 0
  for (let cell = 0; cell < puzzle.waypoints.length; cell += 1) {
    const num = puzzle.waypoints[cell]
    if (num === 1) start = cell
    if (num > maxNum) {
      maxNum = num
      end = cell
    }
  }
  return { start, end }
}

function labelsFromPositions(solution, positions) {
  const labels = new Array(solution.length).fill(EMPTY)
  ;[...positions]
    .sort((a, b) => a - b)
    .forEach((position, index) => {
      labels[solution[position]] = index + 1
    })
  return labels
}

function generateHamiltonianPath(size, rng) {
  const total = size * size
  const visited = new Uint8Array(total)
  const path = []
  function onwardCount(cell) {
    let count = 0
    for (const next of neighbors(size, cell)) {
      if (!visited[next]) count += 1
    }
    return count
  }
  function walk(cell) {
    if (path.length === total) return true
    const candidates = neighbors(size, cell).filter((next) => !visited[next])
    const grouped = new Map()
    for (const next of candidates) {
      const count = onwardCount(next)
      if (!grouped.has(count)) grouped.set(count, [])
      grouped.get(count).push(next)
    }
    for (const count of [...grouped.keys()].sort((a, b) => a - b)) {
      for (const next of shuffle(grouped.get(count), rng)) {
        visited[next] = 1
        path.push(next)
        if (walk(next)) return true
        path.pop()
        visited[next] = 0
      }
    }
    return false
  }
  const start = randInt(rng, total)
  visited[start] = 1
  path.push(start)
  if (!walk(start)) return canonicalPath(size)
  return path
}

function canonicalPath(size) {
  const path = []
  for (let row = 0; row < size; row += 1) {
    if (row % 2 === 0) {
      for (let col = 0; col < size; col += 1) path.push(row * size + col)
    } else {
      for (let col = size - 1; col >= 0; col -= 1) path.push(row * size + col)
    }
  }
  return path
}

function solve(waypoints, size, limit, budget) {
  const total = size * size
  const numbered = []
  for (let cell = 0; cell < total; cell += 1) {
    const num = waypoints[cell]
    if (num > 0) numbered.push({ cell, num })
  }
  numbered.sort((a, b) => a.num - b.num)
  const count = numbered.length
  if (count === 0) return { paths: [], nodes: 0, complete: true }
  const start = numbered[0].cell
  const end = numbered[count - 1].cell
  const visited = new Uint8Array(total)
  const order = [start]
  const paths = []
  let nodes = 0
  let hitBudget = false
  visited[start] = 1
  search(start, 1, 1)
  return { paths, nodes, complete: !hitBudget }

  function search(cell, filled, visitedNumbered) {
    if (paths.length >= limit) return
    if (nodes >= budget) {
      hitBudget = true
      return
    }
    nodes += 1
    if (cell === end) {
      if (filled === total && visitedNumbered === count) paths.push(order.slice())
      return
    }
    for (const next of neighbors(size, cell)) {
      if (visited[next]) continue
      const num = waypoints[next]
      if (num > 0) {
        if (num !== visitedNumbered + 1) continue
        visited[next] = 1
        order.push(next)
        search(next, filled + 1, visitedNumbered + 1)
        order.pop()
        visited[next] = 0
      } else {
        visited[next] = 1
        order.push(next)
        search(next, filled + 1, visitedNumbered)
        order.pop()
        visited[next] = 0
      }
    }
  }
}

function neighbors(size, cell) {
  const row = Math.floor(cell / size)
  const col = cell % size
  const out = []
  if (row > 0) out.push(cell - size)
  if (row < size - 1) out.push(cell + size)
  if (col > 0) out.push(cell - 1)
  if (col < size - 1) out.push(cell + 1)
  return out
}

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
