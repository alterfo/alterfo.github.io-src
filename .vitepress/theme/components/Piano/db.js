const DB_NAME = 'piano'
const DB_VERSION = 1
const STORE = 'progress'

let _dbPromise = null

function openDB() {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = e => { _dbPromise = null; reject(e.target.error) }
  })
  return _dbPromise
}

// Compute derived stats: accuracy %, notesPlayed, longestStreak
export function computeSessionStats(stats) {
  const notesPlayed = (stats.correct ?? 0) + (stats.wrong ?? 0)
  const accuracy = notesPlayed > 0 ? Math.round((stats.correct / notesPlayed) * 100) : 0
  return { accuracy, notesPlayed, longestStreak: stats.longestStreak ?? 0 }
}

export async function loadProgress(scoreId) {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(scoreId)
      req.onsuccess = e => resolve(e.target.result ?? null)
      req.onerror = e => reject(e.target.error)
    })
  } catch (err) {
    console.warn('[piano] loadProgress failed:', err)
    return null
  }
}

async function writeProgress(scoreId, record) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).put(record, scoreId)
    req.onsuccess = () => resolve()
    req.onerror = e => reject(e.target.error)
  })
}

let _saveTimer = null

export function saveProgress(scoreId, state) {
  if (typeof indexedDB === 'undefined') return
  const record = {
    scoreId,
    level: state.level,
    phraseIdx: state.phraseIdx,
    measureIdx: state.measureIdx,
    stats: { ...(state.stats ?? {}) },
  }
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(async () => {
    try {
      await writeProgress(scoreId, record)
    } catch (err) {
      console.warn('[piano] saveProgress failed:', err)
    }
  }, 300)
}

export function cancelPendingSave() {
  clearTimeout(_saveTimer)
}
