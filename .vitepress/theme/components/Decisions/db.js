// Encrypted persistence for the Decision Journal vault. Mirrors Journal/db.js:
// stores a SINGLE packed-envelope string (no key, no plaintext ever) in its own
// IndexedDB, with a debounced save, an awaited durable save, and a cross-tab ping.
// Browser-only (IndexedDB / localStorage) — node --check, no unit tests (repo convention).

const DB_NAME = 'decision-journal'
const DB_VERSION = 1
const STORE = 'vault'
const ENVELOPE_KEY = 'envelope'
const PING_KEY = 'decisions:ping'

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
    console.warn('[decisions] loadEnvelope failed:', err)
    return null
  }
}

let _saveTimer = null

async function writeEnvelope(envelopeStr) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).put(envelopeStr, ENVELOPE_KEY)
    req.onsuccess = () => resolve()
    req.onerror = e => reject(e.target.error)
  })
}

// Debounced save (300 ms) used on the autosave path. Pings other tabs after a
// confirmed write so they re-load and LWW-merge.
function saveEnvelope(envelopeStr) {
  if (typeof indexedDB === 'undefined') return
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(async () => {
    try {
      await writeEnvelope(envelopeStr)
      try { localStorage.setItem(PING_KEY, String(Date.now())) } catch {}
    } catch (err) {
      console.warn('[decisions] saveEnvelope failed:', err)
    }
  }, 300)
}

function cancelPendingSave() {
  clearTimeout(_saveTimer)
}

// Durable write that REJECTS on failure (unlike the debounced saveEnvelope, which
// swallows). Used by the create-vault guard so the record exists before the screen
// unlocks (closing the wrong-passphrase-on-empty-vault race), and anywhere the caller
// must keep old in-memory state if the write does not land. With { notify: true } it
// pings other tabs after a confirmed write.
async function saveEnvelopeNow(envelopeStr, { notify = false } = {}) {
  if (typeof indexedDB === 'undefined') return
  await writeEnvelope(envelopeStr)
  if (notify) {
    try { localStorage.setItem(PING_KEY, String(Date.now())) } catch {}
  }
}

function initCrossTabSync(onReload) {
  if (typeof window === 'undefined') return () => {}
  const handler = e => {
    if (e.key === PING_KEY) onReload()
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

export { loadEnvelope, saveEnvelope, cancelPendingSave, saveEnvelopeNow, initCrossTabSync }
