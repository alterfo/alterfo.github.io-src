const DB_NAME = 'journal'
const DB_VERSION = 1
const STORE = 'vault'
const ENVELOPE_KEY = 'envelope'

let _db = null

function openDB() {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = e => {
      _db = e.target.result
      resolve(_db)
    }
    req.onerror = e => reject(e.target.error)
  })
}

async function loadEnvelope() {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(ENVELOPE_KEY)
      req.onsuccess = e => resolve(e.target.result ?? null)
      req.onerror = e => reject(e.target.error)
    })
  } catch (err) {
    console.warn('[journal] loadEnvelope failed:', err)
    return null
  }
}

let _saveTimer = null

function saveEnvelope(envelopeStr) {
  if (typeof indexedDB === 'undefined') return
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(async () => {
    try {
      const db = await openDB()
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        const req = tx.objectStore(STORE).put(envelopeStr, ENVELOPE_KEY)
        req.onsuccess = () => resolve()
        req.onerror = e => reject(e.target.error)
      })
      try { localStorage.setItem('journal:saved', String(Date.now())) } catch {}
    } catch (err) {
      console.warn('[journal] saveEnvelope failed:', err)
    }
  }, 300)
}

function initCrossTabSync(onReload) {
  if (typeof window === 'undefined') return () => {}
  const handler = e => {
    if (e.key === 'journal:saved') onReload()
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

export { loadEnvelope, saveEnvelope, initCrossTabSync }
