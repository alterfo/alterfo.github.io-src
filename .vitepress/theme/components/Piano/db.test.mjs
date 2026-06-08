import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'

// ── Minimal IndexedDB mock ────────────────────────────────────────────────────

function makeMockIDB() {
  const stores = {}

  function makeStore(data) {
    return {
      get(key) {
        const req = { result: data[key] ?? undefined }
        Promise.resolve().then(() => req.onsuccess?.({ target: req }))
        return req
      },
      put(value, key) {
        data[key] = value
        const req = {}
        Promise.resolve().then(() => req.onsuccess?.())
        return req
      },
    }
  }

  function makeDB() {
    const db = {
      objectStoreNames: { contains: name => name in stores },
      createObjectStore(name) { stores[name] = {} },
      transaction(name) {
        if (!(name in stores)) stores[name] = {}
        return { objectStore: () => makeStore(stores[name]) }
      },
    }
    return db
  }

  const db = makeDB()

  return {
    open(name, version) {
      const req = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      }
      Promise.resolve().then(() => {
        req.onupgradeneeded?.({ target: { result: db } })
        req.result = db
        req.onsuccess?.({ target: req })
      })
      return req
    },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Piano/db.js', () => {
  let loadProgress, saveProgress, cancelPendingSave, computeSessionStats
  let mockIDB

  before(async () => {
    mockIDB = makeMockIDB()
    global.indexedDB = mockIDB

    const mod = await import('./db.js')
    loadProgress = mod.loadProgress
    saveProgress = mod.saveProgress
    cancelPendingSave = mod.cancelPendingSave
    computeSessionStats = mod.computeSessionStats
  })

  after(() => {
    cancelPendingSave()
    delete global.indexedDB
  })

  it('loadProgress returns null for unknown scoreId', async () => {
    const result = await loadProgress('nonexistent')
    assert.equal(result, null)
  })

  it('saveProgress then loadProgress round-trip', async () => {
    const state = {
      level: 1,
      phraseIdx: 0,
      measureIdx: 2,
      stats: { correct: 10, wrong: 2, streak: 3, longestStreak: 5 },
    }
    saveProgress('twinkle', state)
    // wait for debounce
    await new Promise(r => setTimeout(r, 400))

    const saved = await loadProgress('twinkle')
    assert.ok(saved, 'record was saved')
    assert.equal(saved.scoreId, 'twinkle')
    assert.equal(saved.level, 1)
    assert.equal(saved.measureIdx, 2)
    assert.equal(saved.stats.correct, 10)
    assert.equal(saved.stats.longestStreak, 5)
  })

  it('saveProgress overwrites previous record', async () => {
    const state1 = { level: 1, phraseIdx: 0, measureIdx: 0, stats: { correct: 1, wrong: 0, streak: 1, longestStreak: 1 } }
    const state2 = { level: 2, phraseIdx: 1, measureIdx: 3, stats: { correct: 8, wrong: 1, streak: 2, longestStreak: 4 } }

    saveProgress('scale', state1)
    await new Promise(r => setTimeout(r, 400))
    saveProgress('scale', state2)
    await new Promise(r => setTimeout(r, 400))

    const saved = await loadProgress('scale')
    assert.equal(saved.level, 2)
    assert.equal(saved.phraseIdx, 1)
    assert.equal(saved.measureIdx, 3)
  })

  it('computeSessionStats accuracy 0 when no notes played', () => {
    const s = computeSessionStats({ correct: 0, wrong: 0, streak: 0, longestStreak: 0 })
    assert.equal(s.accuracy, 0)
    assert.equal(s.notesPlayed, 0)
    assert.equal(s.longestStreak, 0)
  })

  it('computeSessionStats accuracy rounds to integer', () => {
    const s = computeSessionStats({ correct: 7, wrong: 3, streak: 0, longestStreak: 4 })
    assert.equal(s.accuracy, 70)
    assert.equal(s.notesPlayed, 10)
    assert.equal(s.longestStreak, 4)
  })

  it('computeSessionStats 100% accuracy', () => {
    const s = computeSessionStats({ correct: 5, wrong: 0, streak: 5, longestStreak: 5 })
    assert.equal(s.accuracy, 100)
    assert.equal(s.notesPlayed, 5)
  })
})
