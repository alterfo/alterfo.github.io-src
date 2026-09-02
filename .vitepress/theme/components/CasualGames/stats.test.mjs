import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GAME_IDS,
  emptyGameStats,
  emptyStats,
  recordResult,
  mergeStats,
  normalizeStats,
  toPlain,
  fromPlain,
  serializeGame,
  deserializeGame,
  hasUsableSavedGame,
} from './stats.js'

test('emptyStats covers every game id with zeroed stats', () => {
  const stats = emptyStats()
  assert.equal(stats.updatedAt, 0)
  assert.deepEqual(Object.keys(stats.games), GAME_IDS)
  for (const id of GAME_IDS) assert.deepEqual(stats.games[id], emptyGameStats())
})

test('recordResult records a win, increments streak, and raises best', () => {
  const stats = recordResult(emptyStats(), 'queens', 120, true, 1000)
  assert.equal(stats.updatedAt, 1000)
  assert.equal(stats.games.queens.plays, 1)
  assert.equal(stats.games.queens.wins, 1)
  assert.equal(stats.games.queens.best, 120)
  assert.equal(stats.games.queens.currentStreak, 1)
  assert.equal(stats.games.queens.longestStreak, 1)
})

test('recordResult clamps negative scores to zero', () => {
  const stats = recordResult(emptyStats(), 'tango', -40, true, 1)
  assert.equal(stats.games.tango.best, 0)
})

test('recordResult resets streak on a loss', () => {
  let stats = recordResult(emptyStats(), 'zip', 100, true, 1)
  stats = recordResult(stats, 'zip', 80, true, 2)
  assert.equal(stats.games.zip.currentStreak, 2)
  assert.equal(stats.games.zip.longestStreak, 2)
  stats = recordResult(stats, 'zip', 50, false, 3)
  assert.equal(stats.games.zip.currentStreak, 0)
  assert.equal(stats.games.zip.longestStreak, 2)
  assert.equal(stats.games.zip.plays, 3)
  assert.equal(stats.games.zip.wins, 2)
})

test('recordResult keeps best even when a later result is lower', () => {
  let stats = recordResult(emptyStats(), 'solitaire', 500, true, 1)
  stats = recordResult(stats, 'solitaire', 300, true, 2)
  assert.equal(stats.games.solitaire.best, 500)
})

test('recordResult accepts missing stats and defaults to empty', () => {
  const stats = recordResult(null, 'queens', 10, true, 7)
  assert.equal(stats.games.queens.plays, 1)
  assert.equal(stats.games.queens.best, 10)
  assert.equal(stats.updatedAt, 7)
})

test('mergeStats takes best/streak maxima and sums plays/wins', () => {
  let a = recordResult(emptyStats(), 'queens', 90, true, 10)
  a = recordResult(a, 'tango', 200, false, 10)
  let b = recordResult(emptyStats(), 'queens', 150, true, 20)
  b = recordResult(b, 'tango', 120, true, 20)
  const merged = mergeStats(a, b)
  assert.equal(merged.games.queens.best, 150)
  assert.equal(merged.games.queens.plays, 2)
  assert.equal(merged.games.queens.wins, 2)
  assert.equal(merged.games.queens.currentStreak, 1)
  assert.equal(merged.games.queens.longestStreak, 1)
  assert.equal(merged.games.tango.plays, 2)
  assert.equal(merged.games.tango.wins, 1)
  assert.equal(merged.games.tango.best, 200)
  assert.equal(merged.updatedAt, 20)
})

test('normalizeStats fills missing games and coerces fields', () => {
  const normalized = normalizeStats({
    updatedAt: '42',
    games: { queens: { best: '70', plays: '2', wins: '1', currentStreak: '3', longestStreak: '4' } },
  })
  assert.equal(normalized.updatedAt, 42)
  assert.equal(normalized.games.queens.best, 70)
  assert.equal(normalized.games.queens.plays, 2)
  assert.equal(normalized.games.queens.wins, 1)
  assert.equal(normalized.games.queens.currentStreak, 3)
  assert.equal(normalized.games.queens.longestStreak, 4)
  assert.deepEqual(normalized.games.tango, emptyGameStats())
})

test('normalizeStats returns emptyStats for null input', () => {
  assert.deepEqual(normalizeStats(null), emptyStats())
})

test('toPlain converts typed arrays and leaves primitives untouched', () => {
  assert.equal(toPlain(5), 5)
  assert.equal(toPlain('x'), 'x')
  assert.deepEqual(toPlain([1, 2]), [1, 2])
  const typed = toPlain({ regions: Uint8Array.from([1, 2, 3]) })
  assert.equal(typed.regions.__typedArray, 'Uint8Array')
  assert.deepEqual(typed.regions.values, [1, 2, 3])
})

test('fromPlain reconstructs typed arrays and nested objects', () => {
  const value = fromPlain({ regions: { __typedArray: 'Uint8Array', values: [4, 5] }, size: 2 })
  assert.ok(value.regions instanceof Uint8Array)
  assert.deepEqual(Array.from(value.regions), [4, 5])
  assert.equal(value.size, 2)
})

test('toPlain/fromPlain round-trips a complex game state', () => {
  const state = {
    won: false,
    score: 120,
    puzzle: { size: 4, regions: Uint8Array.from([0, 1, 2, 3]) },
    queens: [-1, 0, 1, -1],
  }
  const restored = fromPlain(toPlain(state))
  assert.deepEqual(restored.queens, state.queens)
  assert.ok(restored.puzzle.regions instanceof Uint8Array)
  assert.deepEqual(Array.from(restored.puzzle.regions), [0, 1, 2, 3])
  assert.equal(restored.won, false)
})

test('serializeGame/deserializeGame round-trip with gameId', () => {
  const record = serializeGame('queens', { won: false, score: 10, regions: Uint8Array.from([9]) })
  assert.equal(record.gameId, 'queens')
  const restored = deserializeGame(record)
  assert.equal(restored.gameId, 'queens')
  assert.ok(restored.state.regions instanceof Uint8Array)
  assert.equal(restored.state.score, 10)
})

test('deserializeGame returns null for invalid record', () => {
  assert.equal(deserializeGame(null), null)
  assert.equal(deserializeGame({}), null)
})

test('hasUsableSavedGame accepts only unfinished saves', () => {
  assert.equal(hasUsableSavedGame(null), false)
  assert.equal(hasUsableSavedGame({ state: { won: true } }), false)
  assert.equal(hasUsableSavedGame({ state: { won: false } }), true)
  assert.equal(hasUsableSavedGame({ state: {} }), false)
})
