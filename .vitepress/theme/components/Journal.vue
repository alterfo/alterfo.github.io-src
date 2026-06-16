<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { loadEnvelope, saveEnvelope, cancelPendingSave, saveEnvelopeQuiet, saveEnvelopeNow, initCrossTabSync } from './Journal/db.js'
import { emptyVault, upsertEntry, countWords, goalMet, computeStreak, mergeVaults } from './Journal/vault.js'
import { deriveKey, randomBytes, encryptJSON, decryptJSON, packEnvelope, unpackEnvelope } from './crypto.js'
import { exportEnvelope, readEnvelopeFile } from './Journal/exporter.js'
import { createOffer, acceptOffer, closeSync, sendEnvelope, receiveAndMerge, diffVaultDates } from './Journal/sync.js'
import { blobToSyncUrl, parseSyncUrl } from './Sync/qr.js'
import QRDisplay from './QRDisplay.vue'
import QRScanner from './QRScanner.vue'
import HelpModal from './HelpModal.vue'
import { shouldShowOnboarding } from './onboarding.js'

// ---- Help / onboarding (shown on first unlock, never on the password screen) ----
const showHelp = ref(false)

// ---- Volatile session state (never persisted) ----
let _key = null
let _salt = null
let _iterations = 600000

// ---- Reactive UI state ----
const phase = ref('loading')   // 'loading' | 'locked' | 'unlocked'
// Show the help modal on the first unlock only — never over the password screen.
// Also: if a sync URL was captured from the page hash (QR scan), open sync modal after unlock.
watch(phase, async (p) => {
  if (p !== 'unlocked') return
  if (shouldShowOnboarding('journal:seen-help')) showHelp.value = true
  if (_pendingSyncUrl) {
    const url = _pendingSyncUrl
    _pendingSyncUrl = null
    await nextTick()
    const parsed = parseSyncUrl(url)
    if (parsed?.role === 'offer') {
      // Phone opened the page from a desktop offer QR.
      // Pre-fill the offer blob and open sync modal in answer mode.
      // User still needs to enter their password and click "Создать ответ".
      openSync()
      await nextTick()
      syncRole.value = 'answer'
      syncPeerBlob.value = parsed.blobStr
    } else if (parsed?.role === 'answer') {
      // Desktop received answer URL (e.g. scanned phone's answer QR or tapped link).
      // Open sync modal; if the offer is still active, auto-submit the answer.
      openSync()
      await nextTick()
      if (_syncConn) {
        submitAnswer(parsed.blobStr)
      } else {
        // The offer session wasn't active — show a note so user can start fresh.
        syncError.value = 'Сессия синхронизации устарела. Создайте новый код.'
      }
    }
  }
})
const hasVault = ref(false)
const passphraseInput = ref('')
const error = ref('')
const lockReason = ref('')     // non-empty when locked due to inactivity

const vault = reactive({ version: 1, entries: {}, createdAt: '' })

function localDateISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const todayISO = ref(localDateISO())
const todayText = ref('')

// ---- Derived values ----
const wordCount = computed(() => countWords(todayText.value))
const progress = computed(() => Math.min(100, (wordCount.value / 500) * 100))
const streak = computed(() => computeStreak(vault, todayISO.value))
const isGoalMet = computed(() => wordCount.value >= 500)

const pastEntries = computed(() =>
  Object.entries(vault.entries)
    .filter(([date]) => date !== todayISO.value)
    .sort(([a], [b]) => b.localeCompare(a))
)

// ---- Password strength (shown only when creating a new vault) ----
const passwordStrength = computed(() => {
  const p = passphraseInput.value
  if (!p) return null
  if (p.length < 8) return 'weak'
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter(r => r.test(p)).length
  if (p.length >= 14 && variety >= 3) return 'strong'
  if (p.length >= 10 && variety >= 2) return 'medium'
  return 'weak'
})
const passwordStrengthLabel = computed(() => ({
  weak:   'Слабый — добавьте цифры, заглавные буквы и длину',
  medium: 'Средний — добавьте спецсимволы или увеличьте длину',
  strong: 'Надёжный',
}[passwordStrength.value] || ''))

// ---- Auto-lock after 5 minutes of inactivity ----
const IDLE_MS = 5 * 60 * 1000
const IDLE_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'click']
let _idleTimer = null

function resetIdleTimer() {
  if (phase.value !== 'unlocked') return
  clearTimeout(_idleTimer)
  _idleTimer = setTimeout(() => lockVault('Заблокировано из-за 5 минут бездействия'), IDLE_MS)
}

async function lockVault(reason = '', { flush = true } = {}) {
  lockReason.value = reason
  clearTimeout(_saveTimer)
  // Also cancel db.js's own 300 ms durable-write debounce — clearTimeout(_saveTimer)
  // only drops the component's 100 ms debounce. Without this, a stale-key write
  // already scheduled inside saveEnvelope() survives the lock and lands up to 300 ms
  // later, clobbering a freshly re-keyed envelope (the cross-tab { flush: false } path).
  cancelPendingSave()
  clearTimeout(_idleTimer)
  // Skip the flush when the in-memory key is stale (password changed in another
  // tab): persisting with the old key would clobber the freshly re-keyed envelope.
  if (flush) { try { await persistVault() } catch { /* best-effort flush */ } }
  _key = null
  _salt = null
  viewDate.value = null
  todayText.value = ''
  Object.assign(vault, { version: 1, entries: {}, createdAt: '' })
  phase.value = 'locked'
  // Close the change-password modal too: it is teleported to <body> and not part
  // of the locked-screen tree, so without this it would stay visible on top of
  // the lock screen and could be submitted against the now-wiped in-memory vault
  // (re-keying an empty vault → permanent data loss). Also clears the typed
  // passwords from memory on auto-lock.
  closeChangePwd()
  // Tear down any live P2P sync session too (same reasoning: the modal is teleported
  // to <body>, and a half-open RTCPeerConnection must not survive a lock).
  showSync.value = false
  syncReset()
}

watch(phase, (p) => {
  if (p === 'unlocked') { resetIdleTimer() }
  else { clearTimeout(_idleTimer) }
})

// ---- Past-entry viewer ----
// null = today's editor; iso-string = read-only viewer for that date
const viewDate = ref(null)
const viewEntry = computed(() => viewDate.value ? vault.entries[viewDate.value] : null)

function openEntry(iso) {
  if (iso === todayISO.value) { viewDate.value = null; return }  // today → editor
  if (!vault.entries[iso]) return                                // no entry → no-op
  viewDate.value = iso
}

function closeViewer() {
  viewDate.value = null
}

// ---- Calendar ----
const calOffset = ref(0)  // 0 = current month, -1 = previous, etc.

const calYear = computed(() => {
  const d = new Date(parseInt(todayISO.value.slice(0, 4)), parseInt(todayISO.value.slice(5, 7)) - 1 + calOffset.value, 1)
  return d.getFullYear()
})
const calMonth = computed(() => {
  const d = new Date(parseInt(todayISO.value.slice(0, 4)), parseInt(todayISO.value.slice(5, 7)) - 1 + calOffset.value, 1)
  return d.getMonth()
})
const calMonthLabel = computed(() => {
  return new Date(calYear.value, calMonth.value, 1)
    .toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
})
const calFirstDow = computed(() => {
  const d = new Date(calYear.value, calMonth.value, 1)
  return (d.getDay() + 6) % 7  // Monday = 0
})
const calDays = computed(() => {
  const year = calYear.value
  const month = calMonth.value
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const result = []
  for (let n = 1; n <= daysInMonth; n++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`
    const entry = vault.entries[iso]
    result.push({ n, iso, words: entry?.words ?? -1 })
  }
  return result
})

function calDayClass(day) {
  if (day.iso === todayISO.value) return 'cal-today'
  if (day.iso > todayISO.value) return 'cal-future'
  if (day.words < 0) return 'cal-empty'
  if (day.words >= 500) return 'cal-goal'
  if (day.words > 0) return 'cal-partial'
  return 'cal-zero'
}

// ---- Save status indicator ----
const saveStatus = ref('idle')   // 'idle' | 'saving' | 'saved'
let _statusTimer = null

function setSaveStatus(s) {
  clearTimeout(_statusTimer)
  saveStatus.value = s
  if (s === 'saved') _statusTimer = setTimeout(() => { saveStatus.value = 'idle' }, 2000)
}

// ---- Autosave (debounced via db.saveEnvelope's own 300 ms debounce; we add 100 ms here) ----
let _saveTimer = null

async function buildEnvelope() {
  const { iv, ciphertext } = await encryptJSON(_key, vault)
  return packEnvelope({ salt: _salt, iterations: _iterations, iv, ciphertext })
}

async function persistVault() {
  if (!_key) return
  try {
    setSaveStatus('saving')
    upsertEntry(vault, todayISO.value, todayText.value)
    saveEnvelope(await buildEnvelope())
    setSaveStatus('saved')
  } catch (e) {
    console.warn('[journal] save failed:', e)
    setSaveStatus('idle')
  }
}

function onTextInput() {
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(persistVault, 100)
}

function onTextKeydown(e) {
  if (e.key !== 'Tab') return
  e.preventDefault()
  const el = e.target
  const start = el.selectionStart
  const end = el.selectionEnd
  todayText.value = todayText.value.slice(0, start) + '\t' + todayText.value.slice(end)
  nextTick(() => { el.selectionStart = el.selectionEnd = start + 1 })
}

// ---- Day rollover at midnight ----
let _dayTimer = null

function scheduleDayRollover() {
  const now = new Date()
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  _dayTimer = setTimeout(async () => {
    const newDay = localDateISO()
    if (newDay !== todayISO.value) {
      // Flush any pending keystrokes before switching dates.
      clearTimeout(_saveTimer)
      await persistVault()
      todayISO.value = newDay
      todayText.value = vault.entries[newDay]?.text ?? ''
    }
    scheduleDayRollover()
  }, tomorrow - now + 500)
}

// ---- Unlock existing vault ----
async function unlock() {
  error.value = ''
  if (!passphraseInput.value) { error.value = 'Enter your passphrase.'; return }
  try {
    const envelopeStr = await loadEnvelope()
    if (!envelopeStr) { error.value = 'No vault found.'; return }
    const { salt, iterations, iv, ciphertext } = unpackEnvelope(envelopeStr)
    _salt = salt
    _iterations = iterations
    _key = await deriveKey(passphraseInput.value, salt, iterations)
    const data = await decryptJSON(_key, { iv, ciphertext })
    Object.assign(vault, data)
    todayText.value = vault.entries[todayISO.value]?.text ?? ''
    passphraseInput.value = ''
    phase.value = 'unlocked'
  } catch {
    error.value = 'Cannot unlock — wrong passphrase or corrupted data.'
    _key = null
    _salt = null
    _iterations = 600000
  }
}

// ---- Create a new vault ----
async function createVault() {
  error.value = ''
  if (!passphraseInput.value) {
    error.value = 'Enter a passphrase to protect your journal.'
    return
  }
  try {
    _salt = randomBytes(16)
    _iterations = 600000
    _key = await deriveKey(passphraseInput.value, _salt, _iterations)
    const newVault = emptyVault()
    Object.assign(vault, newVault)
    todayText.value = ''
    const { iv, ciphertext } = await encryptJSON(_key, vault)
    const envelope = packEnvelope({ salt: _salt, iterations: _iterations, iv, ciphertext })
    await saveEnvelopeQuiet(envelope)
    passphraseInput.value = ''
    hasVault.value = true
    phase.value = 'unlocked'
  } catch (e) {
    error.value = 'Failed to create vault: ' + e.message
    _key = null
  }
}

function onPassphraseKeydown(e) {
  if (e.key === 'Enter') hasVault.value ? unlock() : createVault()
}

// ---- Export ----
async function doExport() {
  if (!_key) return
  try {
    upsertEntry(vault, todayISO.value, todayText.value)
    exportEnvelope(await buildEnvelope())
  } catch (e) {
    console.warn('[journal] export failed:', e)
  }
}

// ---- Import ----
const importPhase = ref('idle')   // 'idle' | 'awaiting-passphrase' | 'merging' | 'error'
const importPassphrase = ref('')
const importError = ref('')
let _pendingImportStr = null
const _fileInputRef = ref(null)

function triggerImportPicker() {
  importError.value = ''
  if (_fileInputRef.value) {
    _fileInputRef.value.value = ''
    _fileInputRef.value.click()
  }
}

async function onImportFileChange(e) {
  const file = e.target.files[0]
  if (!file) return
  try {
    _pendingImportStr = await readEnvelopeFile(file)
    importPassphrase.value = ''
    importError.value = ''
    importPhase.value = 'awaiting-passphrase'
  } catch {
    importError.value = 'Failed to read the selected file.'
    importPhase.value = 'idle'
  }
}

async function doImport() {
  if (!_pendingImportStr || !_key || importPhase.value === 'merging') return
  if (!importPassphrase.value.trim()) {
    importError.value = 'Введите пароль для импортируемого файла.'
    return
  }
  importPhase.value = 'merging'
  importError.value = ''
  try {
    const { salt, iterations, iv, ciphertext } = unpackEnvelope(_pendingImportStr)
    const importKey = await deriveKey(importPassphrase.value, salt, iterations)
    const importedVault = await decryptJSON(importKey, { iv, ciphertext })
    if (todayText.value.trim()) upsertEntry(vault, todayISO.value, todayText.value)
    const merged = mergeVaults(vault, importedVault)
    Object.assign(vault, merged)
    todayText.value = vault.entries[todayISO.value]?.text ?? todayText.value
    await persistVault()
    importPassphrase.value = ''
    _pendingImportStr = null
    importPhase.value = 'idle'
  } catch (err) {
    importError.value = 'Не удалось расшифровать — проверьте пароль.'
    importPhase.value = 'awaiting-passphrase'
  }
}

function cancelImport() {
  _pendingImportStr = null
  importPassphrase.value = ''
  importError.value = ''
  importPhase.value = 'idle'
}

// ---- Change password (re-key) ----
const showChangePassword = ref(false)
const cpCurrent = ref('')
const cpNew = ref('')
const cpConfirm = ref('')
const cpError = ref('')
const cpLoading = ref(false)

function closeChangePwd() {
  showChangePassword.value = false
  cpCurrent.value = ''
  cpNew.value = ''
  cpConfirm.value = ''
  cpError.value = ''
  cpLoading.value = false
}

// Re-key the vault: verify the current password, then re-encrypt the in-memory
// vault under a freshly derived key (new salt). The journal data is unchanged —
// only the encryption envelope is replaced. Crypto/db modules are untouched:
// encryptJSON returns { iv, ciphertext }, so we pack with the new salt directly.
async function doChangePassword() {
  cpError.value = ''
  if (!cpNew.value) { cpError.value = 'Введите новый пароль'; return }
  if (cpNew.value !== cpConfirm.value) { cpError.value = 'Пароли не совпадают'; return }
  if (cpNew.value.length < 6) { cpError.value = 'Пароль слишком короткий (минимум 6 символов)'; return }

  cpLoading.value = true
  try {
    // 1. Verify the current password: re-derive from the stored envelope's own
    //    salt/iterations and decrypt — a wrong password throws OperationError.
    const currentEnvelope = await loadEnvelope()
    if (!currentEnvelope) { cpError.value = 'Хранилище не найдено'; return }
    const { salt: oldSalt, iterations: oldIterations, iv: oldIv, ciphertext: oldCt } = unpackEnvelope(currentEnvelope)
    const testKey = await deriveKey(cpCurrent.value, oldSalt, oldIterations)
    await decryptJSON(testKey, { iv: oldIv, ciphertext: oldCt })

    // 1b. Abort if the vault was locked while we were verifying (idle auto-lock
    //     or a cross-tab re-key landed during the awaits above). lockVault wipes
    //     the in-memory vault to { entries: {} } and nulls _key, so re-encrypting
    //     it now would durably overwrite the journal with an empty vault. Bail
    //     before any write — the on-disk envelope (old key) stays intact.
    if (phase.value !== 'unlocked' || !_key) {
      cpError.value = 'Сессия заблокирована — откройте дневник заново'
      return
    }

    // 2. Fresh salt + new key — full re-keying, not just re-encryption.
    const newSalt = randomBytes(16)
    const newIterations = 600000
    const newKey = await deriveKey(cpNew.value, newSalt, newIterations)

    // 3. Re-encrypt the current in-memory vault (fold in any in-progress text first).
    upsertEntry(vault, todayISO.value, todayText.value)
    const { iv, ciphertext } = await encryptJSON(newKey, vault)
    const packed = packEnvelope({ salt: newSalt, iterations: newIterations, iv, ciphertext })

    // 4. Drop any pending debounced (old-key) write so it cannot clobber the
    //    re-keyed envelope, then write durably (awaited; rejects on failure so a
    //    failed write keeps the old key below) and ping other tabs so they re-lock.
    clearTimeout(_saveTimer)
    cancelPendingSave()
    await saveEnvelopeNow(packed, { notify: true })

    // 5. Swap in-memory key material only after the write succeeds — if step 4
    //    threw, IndexedDB still holds the old envelope and _key is unchanged.
    _key = newKey
    _salt = newSalt
    _iterations = newIterations
    closeChangePwd()
  } catch (e) {
    if (e?.name === 'OperationError') {
      cpError.value = 'Неверный текущий пароль'
    } else {
      cpError.value = 'Ошибка: ' + (e?.message || e)
    }
  } finally {
    cpLoading.value = false
  }
}

// ---- P2P sync (WebRTC, same-LAN, no server) ----
// Live device↔device sync: only the encrypted envelope crosses the channel; the
// receiver re-enters the journal password to decrypt the peer's envelope (its salt
// differs, so the in-memory key can't). All RTCPeerConnection work happens inside
// click handlers (Task 3/4) — nothing at module top level, so SSR stays safe.
const showSync = ref(false)
const syncRole = ref(null)        // null | 'offer' | 'answer'
const syncStage = ref('idle')     // 'idle' | 'blob-ready' | 'waiting' | 'connected' | 'merged' | 'error'
const syncBlob = ref('')          // our blob (offer/answer) to hand to the peer
const syncBlobUrl = ref('')       // shareable URL encoding the blob (for copy-link + QR)
const syncPeerBlob = ref('')      // the peer's blob pasted in
const syncPass = ref('')          // journal password — decrypts the peer's envelope
const syncError = ref('')
const syncResult = ref('')        // human summary after a merge
const syncConnState = ref('')     // raw pc.connectionState (from onState) for the status line
const syncCopied = ref(false)     // brief copied-feedback flag on the copy button
const syncLinkCopied = ref(false) // brief copied-feedback flag on the copy-link button
const syncRetry = ref(false)      // true after a received envelope failed to decrypt → show password + retry
const _syncBlobTextarea = ref(null)  // DOM node for the execCommand copy fallback

// Live connection handles (browser-only; null on SSR / before a role is chosen).
let _syncPc = null
let _syncConn = null              // object returned by createOffer / acceptOffer
let _pendingSyncEnvelope = null   // last envelope received over the channel (for password retry)
let _pendingSyncUrl = null        // sync URL from the page hash — applied after unlock

const syncStageLabel = computed(() => {
  if (syncStage.value === 'waiting') {
    return syncConnState.value === 'connecting'
      ? 'Устанавливаем соединение…'
      : 'Ждём подключения второго устройства…'
  }
  return ({
    'blob-ready': 'Код готов — передайте его на другое устройство.',
    connected: 'Соединено.',
    merged: 'Готово.',
  }[syncStage.value] || '')
})

// Tear down any live connection and clear all sync state. Idempotent — safe on
// modal close, lock, and unmount (closeSync no-ops on a null/closed pc).
function syncReset() {
  closeSync(_syncPc)
  _syncPc = null
  _syncConn = null
  _pendingSyncEnvelope = null
  syncRole.value = null
  syncStage.value = 'idle'
  syncBlob.value = ''
  syncBlobUrl.value = ''
  syncPeerBlob.value = ''
  syncPass.value = ''
  syncError.value = ''
  syncResult.value = ''
  syncConnState.value = ''
  syncCopied.value = false
  syncLinkCopied.value = false
  syncRetry.value = false
}

function openSync() {
  syncReset()
  showSync.value = true
}

function closeSyncModal() {
  showSync.value = false
  syncReset()
}

// --- Role selection + blob exchange ---
// onState mirrors pc.connectionState into the status line; a hard 'failed'
// surfaces as a recoverable error. The waitForChannel timeout (sync.js) covers
// the silent case where the peer never finishes connecting.
function onSyncState(state) {
  syncConnState.value = state
  if (state === 'failed' && syncStage.value !== 'merged') {
    syncError.value = 'Соединение не удалось установить. Проверьте, что оба устройства в одной сети.'
    syncStage.value = 'error'
  }
}

// Wait for the DataChannel to open; once open, send our encrypted envelope and
// mark the session connected. Both peers send — the LWW merge is commutative, so
// each side converges to the same vault without a round trip. Only the packed
// envelope crosses the channel (never plaintext).
function startWaiting() {
  syncStage.value = 'waiting'
  _syncConn.waitForChannel(onReceiveEnvelope)
    .then(async (dc) => {
      syncStage.value = 'connected'
      try {
        // Fold in any in-progress today's text so it participates in the peer's merge.
        // Guard on non-empty text (like doImport/decryptAndMerge): an unconditional
        // upsert would stamp an empty today entry with a fresh updatedAt, which LWW
        // would then let overwrite the peer's real entry for today (data loss).
        if (todayText.value.trim()) upsertEntry(vault, todayISO.value, todayText.value)
        sendEnvelope(dc, await buildEnvelope())
      } catch {
        syncError.value = 'Не удалось отправить данные на другое устройство.'
      }
    })
    .catch((e) => {
      syncError.value = (e && e.message) || 'Ошибка соединения.'
      syncStage.value = 'error'
    })
}

// The peer's encrypted envelope arrives here. Keep it so the user can retry with
// a corrected password (decryption is the only thing that can fail per-attempt).
function onReceiveEnvelope(envelopeStr) {
  _pendingSyncEnvelope = envelopeStr
  decryptAndMerge(envelopeStr)
}

// Decrypt the peer's envelope with the journal password (re-derive from the
// SENDER's salt — each device has its own, so the in-memory key can't decrypt a
// peer's envelope; this mirrors doImport), LWW-merge, persist durably, and refresh
// the editor. A wrong password (OperationError) leaves the channel open for retry.
async function decryptAndMerge(envelopeStr) {
  syncError.value = ''
  try {
    const { salt, iterations, iv, ciphertext } = unpackEnvelope(envelopeStr)
    const key = await deriveKey(syncPass.value, salt, iterations)
    const importedVault = await decryptJSON(key, { iv, ciphertext })
    // Fold in any in-progress today's text before merging so it participates in LWW.
    if (todayText.value.trim()) upsertEntry(vault, todayISO.value, todayText.value)
    const merged = receiveAndMerge(vault, importedVault)
    const { added, updated } = diffVaultDates(vault, merged)
    Object.assign(vault, merged)
    todayText.value = vault.entries[todayISO.value]?.text ?? todayText.value
    await persistVault()
    const total = added + updated
    syncResult.value = total === 0
      ? 'Данные уже синхронизированы.'
      : `Объединено ${total} записей (${updated} обновлено)`
    syncRetry.value = false
    _pendingSyncEnvelope = null
    syncStage.value = 'merged'
  } catch (err) {
    if (err?.name === 'OperationError') {
      // Wrong password — keep the channel open so the user can fix it and retry.
      syncError.value = 'Неверный пароль — введите пароль дневника со второго устройства.'
      syncRetry.value = true
    } else {
      syncError.value = 'Не удалось обработать данные с другого устройства.'
    }
  }
}

// Retry decryption of the already-received envelope after the user corrects the password.
function retrySyncDecrypt() {
  if (!_pendingSyncEnvelope) return
  if (!syncPass.value.trim()) { syncError.value = 'Введите пароль дневника.'; return }
  decryptAndMerge(_pendingSyncEnvelope)
}

// Initiator: generate the offer blob, then await the peer's answer.
async function startOffer() {
  syncError.value = ''
  if (!syncPass.value.trim()) { syncError.value = 'Введите пароль дневника.'; return }
  syncRole.value = 'offer'
  syncStage.value = 'idle'
  try {
    _syncConn = await createOffer(onSyncState)
    _syncPc = _syncConn.pc
    syncBlob.value = _syncConn.blobStr
    syncBlobUrl.value = blobToSyncUrl(_syncConn.blobStr, 'offer')
    syncStage.value = 'blob-ready'
  } catch {
    syncError.value = 'Не удалось создать код соединения.'
    syncRole.value = null
  }
}

// Initiator step 2: accept the answer blob pasted back from the peer.
// rawInput is set when auto-filling from a QR scan or a sync URL.
async function submitAnswer(rawInput) {
  syncError.value = ''
  const raw = (rawInput ?? syncPeerBlob.value).trim()
  if (!raw) { syncError.value = 'Вставьте ответ со второго устройства.'; return }
  const parsed = parseSyncUrl(raw)
  const blobStr = parsed ? parsed.blobStr : raw
  try {
    await _syncConn.acceptAnswer(blobStr)
  } catch (e) {
    syncError.value = e?.message || 'Неверный код ответа — проверьте и вставьте заново.'
    return
  }
  startWaiting()
}

// Responder: choose the answer role; the offer blob is pasted next.
function startAnswer() {
  syncError.value = ''
  if (!syncPass.value.trim()) { syncError.value = 'Введите пароль дневника.'; return }
  syncRole.value = 'answer'
  syncStage.value = 'idle'
}

// Responder step 2: accept the offer blob, produce the answer, and wait.
async function submitOffer(rawInput) {
  syncError.value = ''
  const raw = (rawInput ?? syncPeerBlob.value).trim()
  if (!raw) { syncError.value = 'Вставьте код с первого устройства.'; return }
  const parsed = parseSyncUrl(raw)
  const blobStr = parsed ? parsed.blobStr : raw
  try {
    _syncConn = await acceptOffer(blobStr, onSyncState)
  } catch (e) {
    syncError.value = e?.message || 'Неверный код — проверьте и вставьте заново.'
    return
  }
  _syncPc = _syncConn.pc
  syncBlob.value = _syncConn.blobStr
  syncBlobUrl.value = blobToSyncUrl(_syncConn.blobStr, 'answer')
  startWaiting()
}

// Copy our blob to the clipboard, with a select()+execCommand fallback.
async function copySyncBlob() {
  try {
    await navigator.clipboard.writeText(syncBlob.value)
    syncCopied.value = true
  } catch {
    const el = _syncBlobTextarea.value
    if (el) {
      el.focus(); el.select()
      try { document.execCommand('copy'); syncCopied.value = true } catch { /* clipboard unavailable */ }
    }
  }
  if (syncCopied.value) setTimeout(() => { syncCopied.value = false }, 1500)
}

// Copy the shareable sync URL (for laptop-to-laptop via AirDrop / messenger).
async function copySyncLink() {
  if (!syncBlobUrl.value) return
  try {
    await navigator.clipboard.writeText(syncBlobUrl.value)
    syncLinkCopied.value = true
    setTimeout(() => { syncLinkCopied.value = false }, 1500)
  } catch { /* clipboard unavailable */ }
}

// Called when QRScanner emits 'scanned' — auto-submit without user paste.
function onScanOffer(text) {
  syncPeerBlob.value = text
  submitOffer(text)
}

function onScanAnswer(text) {
  syncPeerBlob.value = text
  submitAnswer(text)
}

// Close the modal on Escape (the change-password modal closes on backdrop only;
// the spec asks for Escape too). Listener is attached only while the modal is open.
function onSyncEscape(e) {
  if (e.key === 'Escape') closeSyncModal()
}
watch(showSync, (open) => {
  if (open) document.addEventListener('keydown', onSyncEscape)
  else document.removeEventListener('keydown', onSyncEscape)
})

// ---- Cross-tab sync ----
let _cleanupSync = () => {}

onMounted(async () => {
  const envelopeStr = await loadEnvelope()
  hasVault.value = envelopeStr != null
  phase.value = 'locked'

  // Detect a sync URL in the hash (placed there when a user scans a QR code).
  // Keep the URL and strip the hash so it doesn't persist across reloads.
  const hash = window.location.hash
  if (hash.startsWith('#sync-')) {
    _pendingSyncUrl = window.location.href
    history.replaceState(null, '', window.location.pathname + window.location.search)
  }

  scheduleDayRollover()
  IDLE_EVENTS.forEach(e => document.addEventListener(e, resetIdleTimer, { passive: true }))

  _cleanupSync = initCrossTabSync(async () => {
    if (!_key) return
    const str = await loadEnvelope()
    if (!str) return
    try {
      const { salt, iterations, iv, ciphertext } = unpackEnvelope(str)
      const data = await decryptJSON(_key, { iv, ciphertext })
      // Include in-progress text before merging so it participates in LWW
      upsertEntry(vault, todayISO.value, todayText.value)
      const merged = mergeVaults(vault, data)
      Object.assign(vault, merged)
      const mergedToday = vault.entries[todayISO.value]
      if (mergedToday) todayText.value = mergedToday.text
      // Cancel any pending debounced save so it cannot overwrite the merged result.
      clearTimeout(_saveTimer)
      cancelPendingSave()
      // Use quiet save (no localStorage event) to avoid triggering sync in other tabs.
      const { iv: newIv, ciphertext: newCt } = await encryptJSON(_key, vault)
      await saveEnvelopeQuiet(packEnvelope({ salt: _salt, iterations: _iterations, iv: newIv, ciphertext: newCt }))
    } catch (err) {
      if (err?.name === 'OperationError') {
        // The on-disk envelope no longer decrypts with our key → the password was
        // changed in another tab. Lock WITHOUT flushing (a flush would re-write the
        // old-key envelope and clobber the re-key); the user re-unlocks with the new
        // password. lockVault cancels both pending saves (component debounce +
        // db.js's durable debounce via cancelPendingSave) so no old-key write lands.
        await lockVault('Пароль был изменён в другой вкладке', { flush: false })
      } else {
        console.warn('[journal] cross-tab sync failed:', err)
      }
    }
  })
})

onUnmounted(() => {
  _cleanupSync()
  clearTimeout(_saveTimer)
  clearTimeout(_dayTimer)
  clearTimeout(_statusTimer)
  clearTimeout(_idleTimer)
  IDLE_EVENTS.forEach(e => document.removeEventListener(e, resetIdleTimer))
  document.removeEventListener('keydown', onSyncEscape)
  closeSync(_syncPc)
  _syncPc = null
  _syncConn = null
  _key = null
  _salt = null
  _pendingImportStr = null
})
</script>

<template>
  <div class="journal-root">
    <input
      ref="_fileInputRef"
      type="file"
      accept=".journal"
      style="display:none"
      @change="onImportFileChange"
    />

    <!-- Loading -->
    <div v-if="phase === 'loading'" class="journal-center">
      <span class="journal-muted">Загрузка…</span>
    </div>

    <!-- Lock screen -->
    <div v-else-if="phase === 'locked'" class="journal-center">
      <div class="journal-lock-card">
        <div class="journal-lock-icon">🔒</div>
        <p class="journal-lock-title">
          {{ hasVault ? 'Открыть дневник' : 'Создать дневник' }}
        </p>
        <p class="journal-lock-desc">
          {{ hasVault
            ? 'Введите пароль для расшифровки вашего дневника.'
            : 'Придумайте пароль. Дневник хранится зашифрованным только на вашем устройстве.' }}
        </p>
        <input
          v-model="passphraseInput"
          type="password"
          class="journal-passphrase-input"
          :placeholder="hasVault ? 'Пароль' : 'Новый пароль'"
          :autocomplete="hasVault ? 'current-password' : 'new-password'"
          @keydown="onPassphraseKeydown"
        />
        <div v-if="!hasVault && passwordStrength" class="journal-pw-strength" :class="'pw-' + passwordStrength">
          {{ passwordStrengthLabel }}
        </div>
        <div class="journal-lock-actions">
          <button v-if="hasVault" class="journal-btn journal-btn-primary" @click="unlock">Открыть</button>
          <button v-else class="journal-btn journal-btn-primary" @click="createVault">Создать</button>
        </div>
        <p v-if="lockReason && !error" class="journal-lock-reason">{{ lockReason }}</p>
        <p v-if="error" class="journal-error">{{ error }}</p>
      </div>
    </div>

    <!-- Journal UI -->
    <div v-else class="journal-layout">

      <!-- Horizontal calendar strip (full width, top) -->
      <div class="journal-cal-strip">
        <button class="cal-nav-btn" @click="calOffset--" title="Предыдущий месяц">‹</button>
        <div class="cal-strip-label">{{ calMonthLabel }}</div>
        <button class="cal-nav-btn" @click="calOffset++" :disabled="calOffset >= 0" title="Следующий месяц">›</button>
        <div class="cal-strip-scroll">
          <div
            v-for="day in calDays"
            :key="day.iso"
            class="cal-chip"
            :class="[calDayClass(day), { 'cal-selected': viewDate === day.iso }]"
            @click="openEntry(day.iso)"
          >
            <span class="cal-chip-n">{{ day.n }}</span>
            <span class="cal-chip-w">{{ day.words >= 0 ? day.words : '·' }}</span>
          </div>
        </div>
      </div>

      <!-- Body: sidebar + editor -->
      <div class="journal-body">

        <!-- Sidebar -->
        <aside class="journal-sidebar">

          <!-- Streak -->
          <div class="journal-streak-box">
            <div class="journal-streak-count">{{ streak }}</div>
            <div class="journal-streak-label">дней подряд</div>
          </div>

          <!-- Lock -->
          <button class="journal-btn journal-btn-lock" @click="lockVault()">🔒 Заблокировать</button>

          <!-- Change password -->
          <button class="journal-btn journal-btn-sync" @click="showChangePassword = true">🔑 Сменить пароль</button>

          <!-- Help -->
          <button class="journal-btn journal-btn-sync" @click="showHelp = true" title="Справка">? Справка</button>

          <!-- Sync -->
          <div class="journal-sync-section">
            <div class="journal-section-label">Синхронизация</div>
            <button class="journal-btn journal-btn-sync" @click="openSync">📡 Синхронизация</button>
            <button class="journal-btn journal-btn-sync" @click="doExport">↑ Экспорт .journal</button>
            <button class="journal-btn journal-btn-sync" @click="triggerImportPicker">↓ Импорт .journal</button>
            <div v-if="importPhase === 'idle' && importError" class="journal-error">{{ importError }}</div>
            <div v-if="importPhase === 'awaiting-passphrase' || importPhase === 'merging'" class="journal-import-dialog">
              <div class="journal-import-label">Пароль импортируемого файла:</div>
              <input
                v-model="importPassphrase"
                type="password"
                class="journal-passphrase-input journal-passphrase-input--small"
                placeholder="Пароль"
                @keydown.enter="doImport"
              />
              <div class="journal-import-actions">
                <button class="journal-btn journal-btn-primary journal-btn--sm" :disabled="importPhase === 'merging'" @click="doImport">
                  {{ importPhase === 'merging' ? 'Расшифровка…' : 'Объединить' }}
                </button>
                <button class="journal-btn journal-btn-cancel journal-btn--sm" @click="cancelImport">Отмена</button>
              </div>
              <div v-if="importError" class="journal-error">{{ importError }}</div>
            </div>
          </div>

        </aside>

        <!-- Main editor -->
        <main class="journal-main">

          <!-- Editor (today) -->
          <template v-if="!viewDate">
            <!-- Top bar -->
            <div class="journal-topbar">
              <span class="journal-today-date">{{ todayISO }}</span>
              <span class="journal-save-status" :class="'save-' + saveStatus">
                <template v-if="saveStatus === 'saving'">сохранение…</template>
                <template v-else-if="saveStatus === 'saved'">сохранено ✓</template>
              </span>
              <span class="journal-word-count" :class="{ 'wc-met': isGoalMet }">
                {{ wordCount }} / 500 слов
              </span>
            </div>

            <!-- Progress bar -->
            <div class="journal-progress-track">
              <div
                class="journal-progress-fill"
                :class="{ 'pf-met': isGoalMet }"
                :style="{ width: progress + '%' }"
              ></div>
            </div>

            <!-- Lined-paper auto-grow textarea -->
            <div class="grow-wrap" :data-replicated-value="todayText">
              <textarea
                v-model="todayText"
                class="journal-textarea"
                placeholder="Автор, жги!"
                @input="onTextInput"
                @keydown="onTextKeydown"
                spellcheck="true"
                autocorrect="on"
                rows="1"
              ></textarea>
            </div>

            <div v-if="isGoalMet" class="journal-goal-banner">
              Цель 500 слов на сегодня достигнута.
            </div>
          </template>

          <!-- Read-only viewer (past entry) -->
          <template v-else>
            <div class="journal-viewer">
              <div class="journal-viewer-topbar">
                <button class="journal-viewer-back" @click="closeViewer">← Сегодня</button>
                <span class="journal-viewer-date">{{ viewDate }}</span>
                <span class="journal-viewer-words">{{ viewEntry?.words ?? 0 }} слов</span>
              </div>
              <div class="journal-viewer-text">{{ viewEntry?.text ?? '' }}</div>
            </div>
          </template>

          <!-- Past entries -->
          <div v-if="pastEntries.length" class="journal-past">
            <div class="journal-past-header">Предыдущие записи</div>
            <div
              v-for="[date, entry] in pastEntries"
              :key="date"
              class="journal-past-entry"
              :class="{ 'journal-past-entry--active': viewDate === date }"
              title="Открыть полную запись"
              @click="openEntry(date)"
            >
              <div class="journal-past-meta">
                <span class="journal-past-date">{{ date }}</span>
                <span class="journal-past-words">{{ entry.words }} сл.</span>
              </div>
              <div class="journal-past-text">{{ entry.text }}</div>
            </div>
          </div>

        </main>

      </div><!-- /journal-body -->
    </div><!-- /journal-layout -->

    <!-- Change-password modal -->
    <Teleport to="body">
      <div v-if="showChangePassword && phase === 'unlocked'" class="cp-backdrop" @click.self="closeChangePwd">
        <div class="cp-modal">
          <h3>Сменить пароль</h3>
          <input v-model="cpCurrent" type="password" autocomplete="current-password" placeholder="Текущий пароль" />
          <input v-model="cpNew" type="password" autocomplete="new-password" placeholder="Новый пароль" />
          <input v-model="cpConfirm" type="password" autocomplete="new-password" placeholder="Повторите новый" />
          <p v-if="cpError" class="cp-error">{{ cpError }}</p>
          <div class="cp-actions">
            <button class="journal-btn journal-btn-cancel" @click="closeChangePwd">Отмена</button>
            <button class="journal-btn journal-btn-primary" :disabled="cpLoading" @click="doChangePassword">
              {{ cpLoading ? 'Сохраняю…' : 'Сменить' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Sync modal (teleported to body) -->
    <Teleport to="body">
      <div v-if="showSync && phase === 'unlocked'" class="cp-backdrop" @click.self="closeSyncModal">
        <div class="cp-modal sync-modal">
          <h3>📡 Синхронизация устройств</h3>

          <!-- Role selection -->
          <template v-if="syncRole === null">
            <p class="sync-desc">
              Прямое P2P-соединение в одной сети&nbsp;— без серверов и облака.<br>
              <strong>Ноутбук↔ноутбук:</strong> скопируйте ссылку и пришлите через AirDrop или мессенджер.<br>
              <strong>Ноутбук↔телефон:</strong> телефон сканирует QR прямо с экрана.
            </p>
            <input
              v-model="syncPass"
              type="password"
              autocomplete="current-password"
              placeholder="Пароль дневника"
            />
            <div class="sync-hint">
              Нужен для расшифровки данных с другого устройства&nbsp;— тот же пароль, что и на нём.
            </div>
            <div class="sync-role-actions">
              <button class="journal-btn journal-btn-primary" @click="startOffer">Показать QR / ссылку</button>
              <button class="journal-btn journal-btn-sync sync-role-btn" @click="startAnswer">
                Сканировать или вставить код
              </button>
            </div>
          </template>

          <!-- Offer / answer blob exchange -->
          <template v-else>
            <!-- Initiator: show our offer QR + link, then take the peer's answer -->
            <template v-if="syncRole === 'offer'">
              <div class="sync-block-label">Отсканируйте QR на другом устройстве или скопируйте ссылку:</div>
              <QRDisplay v-if="syncBlob" :text="syncBlobUrl" class="sync-qr" />
              <div class="sync-share-row">
                <button class="journal-btn journal-btn-sync" @click="copySyncLink">
                  {{ syncLinkCopied ? 'Скопировано ✓' : 'Скопировать ссылку' }}
                </button>
                <button class="journal-btn journal-btn-sync sync-copy-btn" @click="copySyncBlob">
                  {{ syncCopied ? 'Код скопирован ✓' : 'Скопировать код' }}
                </button>
              </div>
              <template v-if="syncStage === 'blob-ready'">
                <div class="sync-block-label sync-block-label-mt">Ответ со второго устройства:</div>
                <QRScanner @scanned="onScanAnswer" @error="syncError = $event" class="sync-scanner" />
                <div class="sync-or">или вставьте текстом</div>
                <textarea
                  v-model="syncPeerBlob"
                  class="sync-blob sync-blob-sm"
                  placeholder="Ответный код или ссылка…"
                ></textarea>
                <button class="journal-btn journal-btn-primary sync-go-btn" @click="submitAnswer()">Подключиться</button>
              </template>
            </template>

            <!-- Responder: scan offer QR or paste, then show answer QR + link -->
            <template v-else-if="syncRole === 'answer'">
              <template v-if="syncStage === 'idle'">
                <div class="sync-block-label">Сканируйте QR с первого устройства или вставьте код / ссылку:</div>
                <QRScanner @scanned="onScanOffer" @error="syncError = $event" class="sync-scanner" />
                <div class="sync-or">или вставьте текстом</div>
                <textarea
                  v-model="syncPeerBlob"
                  class="sync-blob sync-blob-sm"
                  placeholder="Код приглашения или ссылка…"
                ></textarea>
                <input
                  v-model="syncPass"
                  type="password"
                  autocomplete="current-password"
                  placeholder="Пароль дневника (для расшифровки)"
                  style="margin-top:10px"
                />
                <button class="journal-btn journal-btn-primary sync-go-btn" @click="submitOffer()">Создать ответ</button>
              </template>
              <template v-else>
                <div class="sync-block-label">Ваш ответ&nbsp;— отсканируйте или скопируйте ссылку на первом устройстве:</div>
                <QRDisplay v-if="syncBlob" :text="syncBlobUrl" class="sync-qr" />
                <div class="sync-share-row">
                  <button class="journal-btn journal-btn-sync" @click="copySyncLink">
                    {{ syncLinkCopied ? 'Скопировано ✓' : 'Скопировать ссылку' }}
                  </button>
                  <button class="journal-btn journal-btn-sync sync-copy-btn" @click="copySyncBlob">
                    {{ syncCopied ? 'Код скопирован ✓' : 'Скопировать код' }}
                  </button>
                </div>
                <textarea
                  ref="_syncBlobTextarea"
                  class="sync-blob sync-blob-sm"
                  readonly
                  :value="syncBlob"
                  @focus="$event.target.select()"
                ></textarea>
              </template>
            </template>

            <p v-if="syncStageLabel" class="sync-stage-line">{{ syncStageLabel }}</p>
            <p v-if="syncResult" class="sync-result-line">{{ syncResult }}</p>

            <!-- Wrong-password retry: the envelope is already received; re-derive
                 with a corrected password without tearing down the channel. -->
            <template v-if="syncRetry">
              <div class="sync-block-label">Пароль дневника со второго устройства:</div>
              <input
                v-model="syncPass"
                type="password"
                autocomplete="current-password"
                placeholder="Пароль дневника"
                @keydown.enter="retrySyncDecrypt"
              />
              <button class="journal-btn journal-btn-primary sync-go-btn" @click="retrySyncDecrypt">Повторить</button>
            </template>
          </template>

          <p v-if="syncError" class="cp-error">{{ syncError }}</p>

          <div class="cp-actions">
            <button class="journal-btn journal-btn-cancel" @click="closeSyncModal">Закрыть</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ═══ HELP MODAL ═══ -->
    <HelpModal v-model="showHelp">
      <h2>Зашифрованный дневник</h2>

      <h3>Почему это безопасно</h3>
      <p>Дневник использует <strong>E2EE — сквозное шифрование прямо в браузере</strong>. Данные никогда не покидают устройство в читаемом виде.</p>

      <p><strong>Ключ выводится из пароля через PBKDF2:</strong></p>
      <ul>
        <li>600 000 итераций хеширования SHA-256 — это намеренно медленно</li>
        <li>Перебор 1 000 000 паролей занял бы ~десятки часов на современном GPU</li>
        <li>Случайная соль (16 байт) исключает атаки по радужным таблицам</li>
        <li>Один и тот же пароль → разные ключи на разных устройствах</li>
      </ul>

      <p><strong>Шифрование AES-GCM 256:</strong></p>
      <ul>
        <li>Военный стандарт, используется везде от TLS до хранилищ паролей</li>
        <li>Аутентифицированное шифрование: изменение хоть одного байта → расшифровка провалится</li>
        <li>Каждое сохранение использует уникальный IV (12 байт) → одинаковый текст → разный шифротекст</li>
        <li>Ключ <strong>нигде не хранится</strong> — только в памяти на время сессии; при перезагрузке нужно вводить пароль снова</li>
      </ul>

      <p>Что хранится в IndexedDB и <code>.journal</code> файлах: <code>{ соль, итерации, IV, шифротекст }</code> — без ключа это бесполезные байты.</p>

      <h3>Работа с записями</h3>
      <ul>
        <li>Пиши в поле ниже — автосохранение каждые 300 мс</li>
        <li><strong>Цель: 500 слов в день</strong> — прогресс-бар показывает прогресс</li>
        <li>Прошлые записи — в левой панели</li>
      </ul>

      <h3>Стрик</h3>
      <p>Последовательные дни с ≥500 словами. Сегодняшний день не прерывает стрик до полуночи.</p>

      <h3>Синхронизация</h3>
      <ul>
        <li><strong>Экспорт</strong> — скачивает <code>.journal</code> файл (зашифрован, нет открытого текста)</li>
        <li><strong>Импорт</strong> — загружает файл, сливает с текущими данными по принципу «побеждает последнее обновление»</li>
        <li>Для резервного копирования между устройствами используй файловый обмен</li>
      </ul>

      <h3>Смена пароля</h3>
      <p>Sidebar → <strong>Сменить пароль</strong>: введи текущий, новый (дважды) → дневник будет зашифрован новым ключом с новой солью.</p>
    </HelpModal>
  </div>
</template>

<style scoped src="./Journal.css"></style>
