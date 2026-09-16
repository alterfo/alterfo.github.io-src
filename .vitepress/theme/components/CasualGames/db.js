import { serializeGame, deserializeGame, normalizeStats } from './stats.js'

const DB_NAME = 'casual-games'
const DB_VERSION = 1
const STATS_STORE = 'stats'
const GAMES_STORE = 'games'

let _dbPromise = null

function openDB() {
  if (_dbPromise) return _dbPromise
  let req
  try {
    req = indexedDB.open(DB_NAME, DB_VERSION)
  } catch (err) {
    return Promise.reject(err)
  }
  _dbPromise = new Promise((resolve, reject) => {
    req.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STATS_STORE)) db.createObjectStore(STATS_STORE)
      if (!db.objectStoreNames.contains(GAMES_STORE)) db.createObjectStore(GAMES_STORE)
    }
    req.onsuccess = (event) => {
      const db = event.target.result
      db.onclose = () => { _dbPromise = null }
      db.onversionchange = () => { db.close(); _dbPromise = null }
      resolve(db)
    }
    req.onerror = (event) => { _dbPromise = null; reject(event.target.error) }
  })
  return _dbPromise
}


export async function loadStats() {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await openDB()
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STATS_STORE, 'readonly')
      const req = tx.objectStore(STATS_STORE).get('main')
      req.onsuccess = (event) => resolve(event.target.result ?? null)
      req.onerror = (event) => reject(event.target.error)
    })
    return record ? normalizeStats(record) : null
  } catch (err) {
    console.warn('[casual-games] loadStats failed:', err)
    return null
  }
}

export async function saveStats(stats) {
  if (typeof indexedDB === 'undefined') return false
  try {
    const db = await openDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STATS_STORE, 'readwrite')
      tx.objectStore(STATS_STORE).put(normalizeStats(stats), 'main')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return true
  } catch (err) {
    console.warn('[casual-games] saveStats failed:', err)
    return false
  }
}

export async function saveGame(gameId, state) {
  if (typeof indexedDB === 'undefined') return false
  try {
    const db = await openDB()
    if (state == null) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(GAMES_STORE, 'readwrite')
        tx.objectStore(GAMES_STORE).delete(gameId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      return true
    }
    const record = serializeGame(gameId, state)
    await new Promise((resolve, reject) => {
      const tx = db.transaction(GAMES_STORE, 'readwrite')
      tx.objectStore(GAMES_STORE).put(record, gameId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return true
  } catch (err) {
    console.warn('[casual-games] saveGame failed:', err)
    return false
  }
}

export async function loadGame(gameId) {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await openDB()
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(GAMES_STORE, 'readonly')
      const req = tx.objectStore(GAMES_STORE).get(gameId)
      req.onsuccess = (event) => resolve(event.target.result ?? null)
      req.onerror = (event) => reject(event.target.error)
    })
    return deserializeGame(record)
  } catch (err) {
    console.warn('[casual-games] loadGame failed:', err)
    return null
  }
}
