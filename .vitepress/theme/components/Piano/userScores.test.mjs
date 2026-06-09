import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { loadUserScores, saveUserScore, deleteUserScore } from './userScores.js'

// ── Minimal localStorage mock (Map-backed) ────────────────────────────────────

function makeMockStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: key => { map.delete(key) },
    _map: map,
  }
}

const sampleScore = (id = 'user-1') => ({
  id,
  title: `Imported ${id}`,
  composer: 'Tester',
  tempo: 90,
  key: { root: 'D', mode: 'major' },
  timeSignature: [4, 4],
  modulations: [],
  phrases: [{ id: 'p1', measures: [{ id: 'm1', notes: [{ midi: 62, duration: 'q', hand: 'right' }] }] }],
})

describe('Piano/userScores.js', () => {
  it('loadUserScores returns [] on empty storage', () => {
    const storage = makeMockStorage()
    assert.deepEqual(loadUserScores(storage), [])
  })

  it('loadUserScores returns [] on corrupted JSON', () => {
    const storage = makeMockStorage({ 'piano:user-scores': '{not valid json' })
    assert.deepEqual(loadUserScores(storage), [])
  })

  it('loadUserScores returns [] when value is not an array', () => {
    const storage = makeMockStorage({ 'piano:user-scores': '{"id":"x"}' })
    assert.deepEqual(loadUserScores(storage), [])
  })

  it('loadUserScores returns [] when storage is null (no localStorage)', () => {
    assert.deepEqual(loadUserScores(null), [])
  })

  it('saveUserScore persists and round-trips with full phrases', () => {
    const storage = makeMockStorage()
    const result = saveUserScore(sampleScore(), storage)
    assert.equal(result.length, 1)

    const loaded = loadUserScores(storage)
    assert.equal(loaded.length, 1)
    assert.equal(loaded[0].id, 'user-1')
    assert.equal(loaded[0].phrases[0].measures[0].notes[0].midi, 62)
  })

  it('saveUserScore stamps userImported = true', () => {
    const storage = makeMockStorage()
    const score = sampleScore()
    delete score.userImported
    saveUserScore(score, storage)
    assert.equal(score.userImported, true)
    assert.equal(loadUserScores(storage)[0].userImported, true)
  })

  it('saveUserScore replaces an existing score by id', () => {
    const storage = makeMockStorage()
    saveUserScore(sampleScore('user-1'), storage)
    const updated = sampleScore('user-1')
    updated.title = 'Renamed'
    const result = saveUserScore(updated, storage)
    assert.equal(result.length, 1)
    assert.equal(loadUserScores(storage)[0].title, 'Renamed')
  })

  it('saveUserScore appends distinct ids', () => {
    const storage = makeMockStorage()
    saveUserScore(sampleScore('user-1'), storage)
    saveUserScore(sampleScore('user-2'), storage)
    const loaded = loadUserScores(storage)
    assert.equal(loaded.length, 2)
    assert.deepEqual(loaded.map(s => s.id).sort(), ['user-1', 'user-2'])
  })

  it('deleteUserScore removes by id and persists', () => {
    const storage = makeMockStorage()
    saveUserScore(sampleScore('user-1'), storage)
    saveUserScore(sampleScore('user-2'), storage)
    const result = deleteUserScore('user-1', storage)
    assert.equal(result.length, 1)
    assert.equal(result[0].id, 'user-2')
    assert.equal(loadUserScores(storage).length, 1)
  })

  it('deleteUserScore is a no-op for unknown id', () => {
    const storage = makeMockStorage()
    saveUserScore(sampleScore('user-1'), storage)
    const result = deleteUserScore('nope', storage)
    assert.equal(result.length, 1)
  })

  it('save then delete leaves storage empty', () => {
    const storage = makeMockStorage()
    saveUserScore(sampleScore('user-1'), storage)
    deleteUserScore('user-1', storage)
    assert.deepEqual(loadUserScores(storage), [])
  })
})
