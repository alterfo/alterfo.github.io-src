export const GAME_IDS = ['queens', 'tango', 'zip', 'solitaire']

export function emptyGameStats() {
  return { best: 0, plays: 0, wins: 0, currentStreak: 0, longestStreak: 0 }
}

export function emptyStats() {
  return {
    updatedAt: 0,
    games: Object.fromEntries(GAME_IDS.map((id) => [id, emptyGameStats()])),
  }
}

export function recordResult(stats, gameId, score, won, now = Date.now()) {
  const base = stats && typeof stats === 'object' ? stats : emptyStats()
  const previous = base.games && base.games[gameId] ? base.games[gameId] : emptyGameStats()
  const points = Math.max(0, Math.floor(Number(score) || 0))
  const currentStreak = won ? (previous.currentStreak || 0) + 1 : 0
  return {
    updatedAt: Number(now) || 0,
    games: {
      ...(base.games || {}),
      [gameId]: {
        best: Math.max(previous.best || 0, points),
        plays: (previous.plays || 0) + 1,
        wins: (previous.wins || 0) + (won ? 1 : 0),
        currentStreak,
        longestStreak: Math.max(previous.longestStreak || 0, currentStreak),
      },
    },
  }
}

export function mergeStats(left, right) {
  const a = left && typeof left === 'object' ? left : emptyStats()
  const b = right && typeof right === 'object' ? right : emptyStats()
  const games = {}
  for (const id of GAME_IDS) {
    const first = (a.games && a.games[id]) || emptyGameStats()
    const second = (b.games && b.games[id]) || emptyGameStats()
    games[id] = {
      best: Math.max(first.best || 0, second.best || 0),
      plays: (first.plays || 0) + (second.plays || 0),
      wins: (first.wins || 0) + (second.wins || 0),
      currentStreak: second.currentStreak || 0,
      longestStreak: Math.max(first.longestStreak || 0, second.longestStreak || 0),
    }
  }
  return {
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0),
    games,
  }
}

export function normalizeStats(record) {
  if (!record || typeof record !== 'object') return emptyStats()
  const games = {}
  for (const id of GAME_IDS) {
    const value = record.games && record.games[id]
    games[id] = value && typeof value === 'object'
      ? {
          best: Math.max(0, Math.floor(Number(value.best) || 0)),
          plays: Math.max(0, Math.floor(Number(value.plays) || 0)),
          wins: Math.max(0, Math.floor(Number(value.wins) || 0)),
          currentStreak: Math.max(0, Math.floor(Number(value.currentStreak) || 0)),
          longestStreak: Math.max(0, Math.floor(Number(value.longestStreak) || 0)),
        }
      : emptyGameStats()
  }
  return { updatedAt: Math.floor(Number(record.updatedAt) || 0), games }
}

export function toPlain(value) {
  if (value instanceof Uint8Array || value instanceof Int8Array || value instanceof Uint8ClampedArray) {
    return { __typedArray: value.constructor.name, values: Array.from(value) }
  }
  if (Array.isArray(value)) return value.map(toPlain)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value)) out[key] = toPlain(value[key])
    return out
  }
  return value
}

export function fromPlain(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.__typedArray === 'string') {
    if (value.__typedArray === 'Uint8Array') return Uint8Array.from(value.values || [])
    if (value.__typedArray === 'Int8Array') return Int8Array.from(value.values || [])
    if (value.__typedArray === 'Uint8ClampedArray') return Uint8ClampedArray.from(value.values || [])
    return Array.from(value.values || [])
  }
  if (Array.isArray(value)) return value.map(fromPlain)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value)) out[key] = fromPlain(value[key])
    return out
  }
  return value
}

export function serializeGame(gameId, state) {
  return { gameId, savedAt: Date.now(), state: toPlain(state) }
}

export function deserializeGame(record) {
  if (!record || typeof record !== 'object' || record.state == null) return null
  return {
    gameId: record.gameId,
    savedAt: Number(record.savedAt) || 0,
    state: fromPlain(record.state),
  }
}

export function hasUsableSavedGame(saved) {
  return Boolean(saved && saved.state && saved.state.won === false)
}
