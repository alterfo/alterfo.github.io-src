import { randInt, shuffle } from './rng.js'

export function generate(size, rng) {
  if (!Number.isInteger(size) || size < 4) throw new RangeError('size must be an integer of at least 4')
  const solution = generateQueenLayout(size, rng)
  const regions = assignRegions(size, solution, rng)
  return { size, solution, regions }
}

export function regionAt(puzzle, row, col) {
  return puzzle.regions[row * puzzle.size + col]
}

export function validate(puzzle, queens) {
  const size = puzzle.size
  const conflicts = []
  const rows = new Map()
  const regions = new Map()
  for (let col = 0; col < size; col += 1) {
    const row = queens[col]
    if (row < 0) continue
    if (!Number.isInteger(row) || row < 0 || row >= size) {
      conflicts.push({ type: 'bounds', col, row })
      continue
    }
    if (rows.has(row)) {
      conflicts.push({ type: 'row', col, row, otherCol: rows.get(row), otherRow: row })
    } else {
      rows.set(row, col)
    }
    const region = regionAt(puzzle, row, col)
    if (regions.has(region)) {
      const other = regions.get(region)
      conflicts.push({ type: 'region', col, row, otherCol: other.col, otherRow: other.row })
    } else {
      regions.set(region, { col, row })
    }
  }
  const placed = []
  for (let col = 0; col < size; col += 1) {
    if (queens[col] >= 0) placed.push({ col, row: queens[col] })
  }
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const dc = Math.abs(placed[i].col - placed[j].col)
      const dr = Math.abs(placed[i].row - placed[j].row)
      if (dc <= 1 && dr <= 1) {
        conflicts.push({
          type: 'touch',
          col: placed[j].col,
          row: placed[j].row,
          otherCol: placed[i].col,
          otherRow: placed[i].row,
        })
      }
    }
  }
  return conflicts
}

export function isSolved(puzzle, queens) {
  if (queens.length !== puzzle.size) return false
  if (queens.some((row) => row < 0)) return false
  return validate(puzzle, queens).length === 0
}

export function hint(puzzle, queens) {
  for (let col = 0; col < puzzle.size; col += 1) {
    if (queens[col] !== puzzle.solution[col]) {
      return { col, row: puzzle.solution[col] }
    }
  }
  return null
}

function generateQueenLayout(size, rng) {
  const layout = new Array(size).fill(-1)
  const used = new Set()
  const candidates = Array.from({ length: size }, (_, index) => index)
  function place(col) {
    if (col === size) return true
    for (const row of shuffle(candidates, rng)) {
      if (used.has(row)) continue
      if (col > 0 && Math.abs(row - layout[col - 1]) === 1) continue
      used.add(row)
      layout[col] = row
      if (place(col + 1)) return true
      used.delete(row)
      layout[col] = -1
    }
    return false
  }
  place(0)
  return layout
}

function assignRegions(size, solution, rng) {
  const total = size * size
  const regions = new Uint8Array(total).fill(255)
  const inFrontier = new Uint8Array(total)
  const frontier = []
  const neighborDeltas = [-size, size, -1, 1]
  for (let col = 0; col < size; col += 1) {
    const cell = solution[col] * size + col
    regions[cell] = col
  }
  for (let col = 0; col < size; col += 1) {
    const cell = solution[col] * size + col
    pushNeighbors(cell, size, regions, inFrontier, frontier, neighborDeltas)
  }
  while (frontier.length > 0) {
    const index = randInt(rng, frontier.length)
    const cell = frontier[index]
    frontier[index] = frontier[frontier.length - 1]
    frontier.pop()
    if (regions[cell] !== 255) continue
    const neighborColors = []
    const row = Math.floor(cell / size)
    const col = cell % size
    if (row > 0 && regions[cell - size] !== 255) neighborColors.push(regions[cell - size])
    if (row < size - 1 && regions[cell + size] !== 255) neighborColors.push(regions[cell + size])
    if (col > 0 && regions[cell - 1] !== 255) neighborColors.push(regions[cell - 1])
    if (col < size - 1 && regions[cell + 1] !== 255) neighborColors.push(regions[cell + 1])
    regions[cell] = neighborColors[randInt(rng, neighborColors.length)]
    pushNeighbors(cell, size, regions, inFrontier, frontier, neighborDeltas)
  }
  return regions
}

function pushNeighbors(cell, size, regions, inFrontier, frontier, neighborDeltas) {
  const row = Math.floor(cell / size)
  const col = cell % size
  const candidates = []
  if (row > 0) candidates.push(cell - size)
  if (row < size - 1) candidates.push(cell + size)
  if (col > 0) candidates.push(cell - 1)
  if (col < size - 1) candidates.push(cell + 1)
  for (const candidate of candidates) {
    if (regions[candidate] === 255 && !inFrontier[candidate]) {
      inFrontier[candidate] = 1
      frontier.push(candidate)
    }
  }
}
