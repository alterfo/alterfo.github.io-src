const DB_NAME = 'idef0'
const DB_VERSION = 1
const STORE = 'projects'
const PROJECT_KEY = 'default'

let _db = null

function openDB() {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = e => {
      _db = e.target.result
      resolve(_db)
    }
    req.onerror = e => reject(e.target.error)
  })
}

async function loadProject() {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(PROJECT_KEY)
      req.onsuccess = e => resolve(e.target.result ?? null)
      req.onerror = e => reject(e.target.error)
    })
  } catch (err) {
    console.warn('[idef0] loadProject failed:', err)
    return null
  }
}

let _saveTimer = null

function saveProject(project) {
  if (typeof indexedDB === 'undefined') return
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(async () => {
    try {
      const db = await openDB()
      const data = JSON.parse(JSON.stringify(project))
      data.id = PROJECT_KEY
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        const req = tx.objectStore(STORE).put(data)
        req.onsuccess = () => resolve()
        req.onerror = e => reject(e.target.error)
      })
      try { localStorage.setItem('idef0:saved', String(Date.now())) } catch {}
    } catch (err) {
      console.warn('[idef0] saveProject failed:', err)
    }
  }, 300)
}

// onReload is called when another tab saves; storage event only fires in OTHER tabs
// Returns a cleanup function to remove the listener on unmount
function initCrossTabSync(onReload) {
  if (typeof window === 'undefined') return () => {}
  const handler = e => {
    if (e.key === 'idef0:saved') onReload()
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

export { loadProject, saveProject, initCrossTabSync }
