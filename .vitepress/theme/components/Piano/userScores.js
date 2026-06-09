// ── User-imported scores: localStorage persistence ───────────────────────────
// Pure module (no Vue). Stores full Score objects (with phrases) under one key,
// as a JSON array. Imported scores carry `userImported: true` so the UI can tell
// them apart from built-ins and offer deletion.
//
// Every function takes an optional `storage` arg (anything with getItem/setItem/
// removeItem). It defaults to the global `localStorage` when present, or `null`
// in environments without one (e.g. node tests / SSR) — in which case loads
// return `[]` and saves are no-ops.

const STORAGE_KEY = 'piano:user-scores'

function defaultStorage() {
  return typeof localStorage !== 'undefined' ? localStorage : null
}

export function loadUserScores(storage = defaultStorage()) {
  if (!storage) return []
  let raw
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return []
  }
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveUserScore(score, storage = defaultStorage()) {
  score.userImported = true
  const scores = loadUserScores(storage)
  const idx = scores.findIndex(s => s.id === score.id)
  if (idx >= 0) scores[idx] = score
  else scores.push(score)
  persist(scores, storage)
  return scores
}

export function deleteUserScore(id, storage = defaultStorage()) {
  const scores = loadUserScores(storage).filter(s => s.id !== id)
  persist(scores, storage)
  return scores
}

function persist(scores, storage) {
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(scores))
  } catch {
    // quota / serialization errors — leave in-memory array as source of truth
  }
}
