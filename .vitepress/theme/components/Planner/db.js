// Planner encrypted persistence — mirrors IDEF0Editor/db.js and Journal/db.js.
// DB `planner` v1, three object stores (all keyPath:'id'):
//   vault — the encrypted snapshot envelope ({ id:'data', env })
//   meta  — the PBKDF2 salt ({ id:'salt', salt:[...] }); presence ⇒ vault already created
//   fs    — the File System Access directory handle ({ id:'dir', handle })
// Only the { salt, iterations, iv, ciphertext } envelope is ever stored — never the key,
// never plaintext. The derived key lives only in memory (PlannerEditor.vue) and is passed in.

import { encryptJSON, decryptJSON, packEnvelope, unpackEnvelope } from '../crypto.js'

const DB_NAME = 'planner'
const DB_VERSION = 1
const VAULT_STORE = 'vault'
const META_STORE = 'meta'
const FS_STORE = 'fs'

const VAULT_KEY = 'data'
const SALT_KEY = 'salt'
const DIR_KEY = 'dir'

// Iterations recorded in the envelope. Must match deriveKey's default (600000) used by the
// unlock flow — the key is derived externally, so this value is informational at rest.
const ITERATIONS = 600000

let _db = null

function openDB() {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      for (const store of [VAULT_STORE, META_STORE, FS_STORE]) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' })
        }
      }
    }
    req.onsuccess = e => {
      _db = e.target.result
      resolve(_db)
    }
    req.onerror = e => reject(e.target.error)
  })
}

// ---- low-level get/put (one record by id) ----

async function idbGet(store, id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(id)
    req.onsuccess = e => resolve(e.target.result ?? null)
    req.onerror = e => reject(e.target.error)
  })
}

async function idbPut(store, value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const req = tx.objectStore(store).put(value)
    req.onsuccess = () => resolve()
    req.onerror = e => reject(e.target.error)
  })
}

// ---- salt (meta store) ----

// Stored as a plain array (structured-clone-safe, no ambiguity across browsers) and
// converted back to a Uint8Array on load. null ⇒ first run (no vault yet).
async function loadSalt() {
  if (typeof indexedDB === 'undefined') return null
  try {
    const rec = await idbGet(META_STORE, SALT_KEY)
    if (!rec || !Array.isArray(rec.salt)) return null
    return Uint8Array.from(rec.salt)
  } catch (err) {
    console.warn('[planner] loadSalt failed:', err)
    return null
  }
}

async function saveSalt(saltBytes) {
  return idbPut(META_STORE, { id: SALT_KEY, salt: Array.from(saltBytes) })
}

// ---- vault (encrypted snapshot) ----

async function writeVault(key, snapshot) {
  const saltBytes = await loadSalt()
  if (!saltBytes) throw new Error('Cannot save vault: salt missing (vault not initialized)')
  const { iv, ciphertext } = await encryptJSON(key, snapshot)
  const env = packEnvelope({ salt: saltBytes, iterations: ITERATIONS, iv, ciphertext })
  await idbPut(VAULT_STORE, { id: VAULT_KEY, env })
}

let _saveTimer = null

// Debounced 300 ms encrypted save, then a localStorage ping for cross-tab reload.
function saveVault(key, snapshot) {
  if (typeof indexedDB === 'undefined') return
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(async () => {
    try {
      await writeVault(key, snapshot)
      try { localStorage.setItem('planner:saved', String(Date.now())) } catch {}
    } catch (err) {
      console.warn('[planner] saveVault failed:', err)
    }
  }, 300)
}

// Decrypt the stored snapshot. Returns null when nothing has been saved yet.
// A wrong key makes decryptJSON reject → the error propagates so the caller can show
// "wrong passphrase".
async function loadVault(key) {
  if (typeof indexedDB === 'undefined') return null
  const rec = await idbGet(VAULT_STORE, VAULT_KEY)
  if (!rec || !rec.env) return null
  const envelope = unpackEnvelope(rec.env)
  return decryptJSON(key, envelope)
}

// ---- File System Access directory handle (fs store) ----

// FileSystemDirectoryHandle is structured-cloneable — store the object directly,
// do NOT serialize it. Permission must be re-checked/re-requested on reload (fsbridge.js).
async function saveDirHandle(handle) {
  return idbPut(FS_STORE, { id: DIR_KEY, handle })
}

async function loadDirHandle() {
  if (typeof indexedDB === 'undefined') return null
  try {
    const rec = await idbGet(FS_STORE, DIR_KEY)
    return rec ? rec.handle : null
  } catch (err) {
    console.warn('[planner] loadDirHandle failed:', err)
    return null
  }
}

// onReload runs when another tab saves; the storage event only fires in OTHER tabs.
// Returns a cleanup function to remove the listener on unmount.
function initCrossTabSync(onReload) {
  if (typeof window === 'undefined') return () => {}
  const handler = e => {
    if (e.key === 'planner:saved') onReload()
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

export {
  loadSalt,
  saveSalt,
  saveVault,
  loadVault,
  saveDirHandle,
  loadDirHandle,
  initCrossTabSync,
}
