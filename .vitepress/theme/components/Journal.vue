<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { loadEnvelope, saveEnvelope, initCrossTabSync } from './Journal/db.js'
import { emptyVault, upsertEntry, countWords, goalMet, computeStreak, mergeVaults } from './Journal/vault.js'
import { deriveKey, randomBytes, encryptJSON, decryptJSON, packEnvelope, unpackEnvelope } from './crypto.js'
import { exportEnvelope, readEnvelopeFile } from './Journal/exporter.js'
import { createOffer, acceptOffer, sendEnvelope as sendRTCEnvelope, receiveAndMerge, packBlob, unpackBlob, QREncoder } from './Journal/sync.js'

// ---- Volatile session state (never persisted) ----
let _key = null
let _salt = null
let _iterations = 600000

// ---- Reactive UI state ----
const phase = ref('loading')   // 'loading' | 'locked' | 'unlocked'
const hasVault = ref(false)
const passphraseInput = ref('')
const error = ref('')
const focusMode = ref(false)

const vault = reactive({ version: 1, entries: {}, createdAt: '' })

const todayISO = ref(new Date().toISOString().slice(0, 10))
const todayText = ref('')

// ---- Derived values ----
const wordCount = computed(() => countWords(todayText.value))
const progress = computed(() => Math.min(100, (wordCount.value / 500) * 100))
const streak = computed(() => computeStreak(vault, todayISO.value))
const isGoalMet = computed(() => wordCount.value >= 500)
const focusLocked = computed(() => focusMode.value && !isGoalMet.value)

const pastEntries = computed(() =>
  Object.entries(vault.entries)
    .filter(([date]) => date !== todayISO.value)
    .sort(([a], [b]) => b.localeCompare(a))
)

// ---- Autosave (debounced via db.saveEnvelope's own 300 ms debounce; we add 100 ms here) ----
let _saveTimer = null

async function persistVault() {
  if (!_key) return
  try {
    upsertEntry(vault, todayISO.value, todayText.value)
    const { iv, ciphertext } = await encryptJSON(_key, vault)
    const envelope = packEnvelope({ salt: _salt, iterations: _iterations, iv, ciphertext })
    saveEnvelope(envelope)
  } catch (e) {
    console.warn('[journal] save failed:', e)
  }
}

function onTextInput() {
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(persistVault, 100)
}

// ---- Unlock existing vault ----
async function unlock() {
  error.value = ''
  try {
    const envelopeStr = await loadEnvelope()
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
    error.value = 'Cannot unlock — wrong passphrase or corrupted data.'
    _key = null
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
    saveEnvelope(envelope)
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
    const { iv, ciphertext } = await encryptJSON(_key, vault)
    const envelopeStr = packEnvelope({ salt: _salt, iterations: _iterations, iv, ciphertext })
    exportEnvelope(envelopeStr)
  } catch (e) {
    console.warn('[journal] export failed:', e)
  }
}

// ---- Import ----
const importPhase = ref('idle')   // 'idle' | 'awaiting-passphrase' | 'merging' | 'error'
const importPassphrase = ref('')
const importError = ref('')
let _pendingImportStr = null
let _fileInputEl = null

function triggerImportPicker() {
  if (!_fileInputEl) {
    _fileInputEl = document.createElement('input')
    _fileInputEl.type = 'file'
    _fileInputEl.accept = '.journal'
    _fileInputEl.addEventListener('change', onImportFileChange)
  }
  _fileInputEl.value = ''
  _fileInputEl.click()
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
    importError.value = 'Failed to read file.'
    importPhase.value = 'error'
  }
}

async function doImport() {
  if (!_pendingImportStr || !_key) return
  importPhase.value = 'merging'
  importError.value = ''
  try {
    const { salt, iterations, iv, ciphertext } = unpackEnvelope(_pendingImportStr)
    const importKey = await deriveKey(importPassphrase.value, salt, iterations)
    const importedVault = await decryptJSON(importKey, { iv, ciphertext })
    const merged = mergeVaults(vault, importedVault)
    Object.assign(vault, merged)
    todayText.value = vault.entries[todayISO.value]?.text ?? todayText.value
    await persistVault()
    importPassphrase.value = ''
    _pendingImportStr = null
    importPhase.value = 'idle'
  } catch {
    importError.value = 'Cannot decrypt — check the passphrase.'
    importPhase.value = 'awaiting-passphrase'
  }
}

function cancelImport() {
  _pendingImportStr = null
  importPassphrase.value = ''
  importError.value = ''
  importPhase.value = 'idle'
}

// ---- P2P sync (WebRTC, same-LAN) ----
const p2pPhase = ref('idle')
// 'idle' | 'offer-ready' | 'awaiting-answer' | 'answer-ready' | 'awaiting-offer' | 'connected' | 'error'
const p2pRole = ref('')        // 'initiator' | 'responder'
const p2pBlob = ref('')        // offer or answer blob to show user
const p2pPasteInput = ref('')  // user pastes the other side's blob
const p2pError = ref('')
let _p2pDc = null
let _p2pSession = null         // { acceptAnswer, waitForChannel } or { waitForChannel }

function renderQR(text) {
  if (!p2pQRCanvas.value) return
  QREncoder.encode(text, p2pQRCanvas.value, 3)
}

watch(p2pBlob, async (val) => {
  if (!val) return
  await nextTick()
  renderQR(val)
})

async function p2pCreateOffer() {
  p2pError.value = ''
  p2pRole.value = 'initiator'
  p2pPhase.value = 'offer-ready'
  try {
    _p2pSession = await createOffer()
    p2pBlob.value = _p2pSession.blobStr
    // Wait for answer paste
    p2pPhase.value = 'awaiting-answer'
  } catch (e) {
    p2pError.value = 'Failed to create offer: ' + e.message
    p2pPhase.value = 'error'
  }
}

async function p2pSubmitAnswer() {
  if (!_p2pSession || !p2pPasteInput.value.trim()) return
  p2pError.value = ''
  try {
    await _p2pSession.acceptAnswer(p2pPasteInput.value.trim())
    p2pPasteInput.value = ''
    _p2pDc = await _p2pSession.waitForChannel(onP2PEnvelope)
    p2pPhase.value = 'connected'
    await p2pExchangeEnvelope()
  } catch (e) {
    p2pError.value = 'Connection failed: ' + e.message
    p2pPhase.value = 'error'
  }
}

async function p2pAcceptOffer() {
  if (!p2pPasteInput.value.trim()) return
  p2pError.value = ''
  p2pRole.value = 'responder'
  try {
    _p2pSession = await acceptOffer(p2pPasteInput.value.trim())
    p2pPasteInput.value = ''
    p2pBlob.value = _p2pSession.blobStr
    p2pPhase.value = 'answer-ready'
    _p2pDc = await _p2pSession.waitForChannel(onP2PEnvelope)
    p2pPhase.value = 'connected'
    await p2pExchangeEnvelope()
  } catch (e) {
    p2pError.value = 'Connection failed: ' + e.message
    p2pPhase.value = 'error'
  }
}

async function p2pExchangeEnvelope() {
  if (!_key || !_p2pDc) return
  try {
    upsertEntry(vault, todayISO.value, todayText.value)
    const { iv, ciphertext } = await encryptJSON(_key, vault)
    const envelopeStr = packEnvelope({ salt: _salt, iterations: _iterations, iv, ciphertext })
    sendRTCEnvelope(_p2pDc, envelopeStr)
  } catch (e) {
    console.warn('[journal] p2p send failed:', e)
  }
}

async function onP2PEnvelope(envelopeStr) {
  if (!_key) return
  try {
    const { salt, iterations, iv, ciphertext } = unpackEnvelope(envelopeStr)
    const importKey = await deriveKey(passphraseInput.value || '__same__', salt, iterations)
      .catch(() => _key)
    // Try current key first (same passphrase), fall back handled below
    let importedVault
    try {
      importedVault = await decryptJSON(_key, { iv, ciphertext })
    } catch {
      p2pError.value = 'Peer uses a different passphrase — cannot auto-merge.'
      return
    }
    const merged = receiveAndMerge(vault, importedVault)
    Object.assign(vault, merged)
    todayText.value = vault.entries[todayISO.value]?.text ?? todayText.value
    await persistVault()
  } catch (e) {
    console.warn('[journal] p2p receive failed:', e)
  }
}

function p2pReset() {
  p2pPhase.value = 'idle'
  p2pRole.value = ''
  p2pBlob.value = ''
  p2pPasteInput.value = ''
  p2pError.value = ''
  if (_p2pDc) { try { _p2pDc.close() } catch {} _p2pDc = null }
  _p2pSession = null
}

function p2pStartResponder() {
  p2pRole.value = 'responder'
  p2pPhase.value = 'awaiting-offer'
  p2pError.value = ''
  p2pPasteInput.value = ''
}

// ---- Cross-tab sync ----
let _cleanupSync = () => {}

onMounted(async () => {
  const envelopeStr = await loadEnvelope()
  hasVault.value = envelopeStr != null
  phase.value = 'locked'

  _cleanupSync = initCrossTabSync(async () => {
    if (!_key) return
    const str = await loadEnvelope()
    if (!str) return
    try {
      const { salt, iterations, iv, ciphertext } = unpackEnvelope(str)
      const data = await decryptJSON(_key, { iv, ciphertext })
      Object.assign(vault, data)
      // Preserve in-progress edits for today if they're newer than what just synced
      const synced = vault.entries[todayISO.value]
      if (!synced || countWords(todayText.value) >= countWords(synced.text)) return
      todayText.value = synced.text
    } catch {}
  })
})

onUnmounted(() => {
  _cleanupSync()
  clearTimeout(_saveTimer)
  _key = null
})
</script>

<template>
  <div class="journal-root">

    <!-- Loading -->
    <div v-if="phase === 'loading'" class="journal-center">
      <span class="journal-muted">Loading…</span>
    </div>

    <!-- Lock screen -->
    <div v-else-if="phase === 'locked'" class="journal-center">
      <div class="journal-lock-card">
        <div class="journal-lock-icon">🔒</div>
        <h2 class="journal-lock-title">
          {{ hasVault ? 'Unlock your journal' : 'Create your journal' }}
        </h2>
        <p class="journal-lock-desc">
          {{ hasVault
            ? 'Enter your passphrase to decrypt and open your journal.'
            : 'Choose a passphrase. It encrypts your journal locally — it is never sent anywhere.' }}
        </p>
        <input
          v-model="passphraseInput"
          type="password"
          class="journal-passphrase-input"
          :placeholder="hasVault ? 'Passphrase' : 'New passphrase'"
          autocomplete="current-password"
          @keydown="onPassphraseKeydown"
        />
        <div class="journal-lock-actions">
          <button v-if="hasVault" class="journal-btn journal-btn-primary" @click="unlock">Unlock</button>
          <button v-else class="journal-btn journal-btn-primary" @click="createVault">Create journal</button>
        </div>
        <p v-if="error" class="journal-error">{{ error }}</p>
      </div>
    </div>

    <!-- Journal UI -->
    <div v-else class="journal-layout">

      <!-- Sidebar -->
      <aside class="journal-sidebar">
        <div class="journal-streak-box">
          <div class="journal-streak-count">{{ streak }}</div>
          <div class="journal-streak-label">day streak</div>
        </div>

        <div class="journal-focus-toggle">
          <label class="journal-toggle-label">
            <input type="checkbox" v-model="focusMode" class="journal-toggle-input" />
            Focus mode
          </label>
          <div class="journal-toggle-desc">Lock editing until 500 words</div>
        </div>

        <!-- Sync actions -->
        <div class="journal-sync-section">
          <div class="journal-past-header">Sync</div>
          <button class="journal-btn journal-btn-sync" @click="doExport">Export .journal</button>
          <button class="journal-btn journal-btn-sync" @click="triggerImportPicker">Import .journal</button>

          <!-- Import passphrase dialog -->
          <div v-if="importPhase === 'awaiting-passphrase' || importPhase === 'merging'" class="journal-import-dialog">
            <div class="journal-import-label">Passphrase for imported file:</div>
            <input
              v-model="importPassphrase"
              type="password"
              class="journal-passphrase-input journal-passphrase-input--small"
              placeholder="Passphrase"
              @keydown.enter="doImport"
            />
            <div class="journal-import-actions">
              <button class="journal-btn journal-btn-primary journal-btn--sm" :disabled="importPhase === 'merging'" @click="doImport">Merge</button>
              <button class="journal-btn journal-btn-cancel journal-btn--sm" @click="cancelImport">Cancel</button>
            </div>
            <div v-if="importError" class="journal-error">{{ importError }}</div>
          </div>

          <!-- P2P pairing (WebRTC, same-LAN) -->
          <div class="journal-past-header" style="margin-top:4px">Live sync (LAN)</div>
          <div v-if="p2pPhase === 'idle'" class="journal-p2p-idle">
            <button class="journal-btn journal-btn-sync" @click="p2pCreateOffer">Create offer</button>
            <button class="journal-btn journal-btn-sync" @click="p2pStartResponder">Accept offer</button>
          </div>

          <!-- Initiator: show offer blob + QR, await answer -->
          <div v-else-if="p2pPhase === 'awaiting-answer'" class="journal-p2p-panel">
            <div class="journal-import-label">Share this offer with the peer:</div>
            <canvas ref="p2pQRCanvas" class="journal-qr-canvas"></canvas>
            <textarea readonly class="journal-p2p-blob" :value="p2pBlob"></textarea>
            <div class="journal-import-label" style="margin-top:6px">Paste peer's answer:</div>
            <textarea v-model="p2pPasteInput" class="journal-p2p-blob journal-p2p-paste" placeholder="Paste answer here…"></textarea>
            <div class="journal-import-actions">
              <button class="journal-btn journal-btn-primary journal-btn--sm" @click="p2pSubmitAnswer">Connect</button>
              <button class="journal-btn journal-btn-cancel journal-btn--sm" @click="p2pReset">Cancel</button>
            </div>
          </div>

          <!-- Responder: paste offer, show answer blob + QR -->
          <div v-else-if="p2pPhase === 'awaiting-offer'" class="journal-p2p-panel">
            <div class="journal-import-label">Paste the initiator's offer:</div>
            <textarea v-model="p2pPasteInput" class="journal-p2p-blob journal-p2p-paste" placeholder="Paste offer here…"></textarea>
            <div class="journal-import-actions">
              <button class="journal-btn journal-btn-primary journal-btn--sm" @click="p2pAcceptOffer">Generate answer</button>
              <button class="journal-btn journal-btn-cancel journal-btn--sm" @click="p2pReset">Cancel</button>
            </div>
          </div>

          <!-- Responder: show answer blob + QR (waiting for connection) -->
          <div v-else-if="p2pPhase === 'answer-ready'" class="journal-p2p-panel">
            <div class="journal-import-label">Share this answer with the initiator:</div>
            <canvas ref="p2pQRCanvas" class="journal-qr-canvas"></canvas>
            <textarea readonly class="journal-p2p-blob" :value="p2pBlob"></textarea>
            <div class="journal-muted" style="font-size:11px;margin-top:4px">Waiting for connection…</div>
            <button class="journal-btn journal-btn-cancel journal-btn--sm" style="margin-top:4px" @click="p2pReset">Cancel</button>
          </div>

          <!-- Connected -->
          <div v-else-if="p2pPhase === 'connected'" class="journal-p2p-panel journal-p2p-connected">
            Live sync connected. Entries merged.
            <button class="journal-btn journal-btn-cancel journal-btn--sm" style="margin-top:6px" @click="p2pReset">Disconnect</button>
          </div>

          <!-- Error -->
          <div v-else-if="p2pPhase === 'error'" class="journal-p2p-panel">
            <div class="journal-error">{{ p2pError }}</div>
            <button class="journal-btn journal-btn-cancel journal-btn--sm" @click="p2pReset">Reset</button>
          </div>
        </div>

        <div class="journal-past-header">Past entries</div>
        <div class="journal-past-list">
          <div
            v-for="[date, entry] in pastEntries"
            :key="date"
            class="journal-past-item"
            :class="{ 'journal-past-item--met': goalMet(entry) }"
          >
            <span class="journal-past-date">{{ date }}</span>
            <span class="journal-past-words">{{ entry.words }}w</span>
          </div>
          <div v-if="!pastEntries.length" class="journal-muted journal-past-empty">
            No past entries yet.
          </div>
        </div>
      </aside>

      <!-- Main editor -->
      <main class="journal-main">
        <div class="journal-today-header">
          <span class="journal-today-date">{{ todayISO }}</span>
          <span
            class="journal-word-count"
            :class="{ 'journal-word-count--met': isGoalMet }"
          >{{ wordCount }} / 500 words</span>
        </div>

        <div class="journal-progress-bar-track">
          <div
            class="journal-progress-bar-fill"
            :class="{ 'journal-progress-bar-fill--met': isGoalMet }"
            :style="{ width: progress + '%' }"
          ></div>
        </div>

        <div v-if="focusLocked" class="journal-focus-locked">
          Keep writing — {{ 500 - wordCount }} more words to go.
        </div>

        <textarea
          v-model="todayText"
          class="journal-textarea"
          :disabled="focusLocked"
          placeholder="Write today's entry…"
          @input="onTextInput"
          spellcheck="true"
          autocorrect="on"
        ></textarea>

        <div v-if="isGoalMet" class="journal-goal-met">
          500-word goal reached for today.
        </div>
      </main>

    </div>
  </div>
</template>

<style scoped>
.journal-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1e293b;
  min-height: 0;
}

/* ---- Lock screen ---- */
.journal-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.journal-lock-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 40px 48px;
  width: 100%;
  max-width: 400px;
  text-align: center;
  box-shadow: 0 4px 24px rgba(0,0,0,.06);
}

.journal-lock-icon { font-size: 36px; margin-bottom: 12px; }
.journal-lock-title { margin: 0 0 8px; font-size: 20px; font-weight: 600; }
.journal-lock-desc { margin: 0 0 20px; font-size: 14px; color: #64748b; line-height: 1.5; }

.journal-passphrase-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 14px;
  font-size: 15px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  outline: none;
  transition: border-color .15s;
}
.journal-passphrase-input:focus { border-color: #6366f1; }

.journal-lock-actions { margin-top: 16px; }

.journal-btn {
  padding: 10px 24px;
  font-size: 15px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: opacity .15s;
}
.journal-btn:hover { opacity: .88; }
.journal-btn-primary { background: #6366f1; color: #fff; }

.journal-error {
  margin-top: 14px;
  color: #ef4444;
  font-size: 13px;
}

/* ---- Layout ---- */
.journal-layout {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* ---- Sidebar ---- */
.journal-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  padding: 20px 16px;
  gap: 20px;
  overflow-y: auto;
}

.journal-streak-box {
  text-align: center;
  background: #f1f5f9;
  border-radius: 10px;
  padding: 16px 8px;
}
.journal-streak-count {
  font-size: 40px;
  font-weight: 700;
  color: #6366f1;
  line-height: 1;
}
.journal-streak-label {
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}

.journal-focus-toggle {}
.journal-toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.journal-toggle-input { cursor: pointer; }
.journal-toggle-desc { font-size: 11px; color: #94a3b8; margin-top: 4px; }

.journal-past-header {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #94a3b8;
}

.journal-past-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  flex: 1;
}

.journal-past-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 13px;
  background: #f8fafc;
}
.journal-past-item--met { background: #f0fdf4; }
.journal-past-date { color: #475569; }
.journal-past-words { color: #94a3b8; font-size: 11px; }
.journal-past-item--met .journal-past-words { color: #22c55e; }

.journal-past-empty { font-size: 12px; padding: 4px 0; }

/* ---- Main editor ---- */
.journal-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
  min-width: 0;
  overflow-y: auto;
}

.journal-today-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}
.journal-today-date {
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
}
.journal-word-count {
  font-size: 14px;
  color: #64748b;
  transition: color .2s;
}
.journal-word-count--met { color: #22c55e; font-weight: 600; }

.journal-progress-bar-track {
  height: 6px;
  background: #e2e8f0;
  border-radius: 999px;
  margin-bottom: 16px;
  overflow: hidden;
}
.journal-progress-bar-fill {
  height: 100%;
  background: #6366f1;
  border-radius: 999px;
  transition: width .3s ease, background .3s;
}
.journal-progress-bar-fill--met { background: #22c55e; }

.journal-focus-locked {
  background: #fef9c3;
  border: 1px solid #fde047;
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 14px;
  color: #713f12;
  margin-bottom: 12px;
}

.journal-textarea {
  flex: 1;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px 20px;
  font-size: 16px;
  line-height: 1.7;
  font-family: Georgia, 'Times New Roman', serif;
  color: #1e293b;
  background: #fff;
  resize: none;
  outline: none;
  transition: border-color .15s;
  min-height: 300px;
}
.journal-textarea:focus { border-color: #6366f1; }
.journal-textarea:disabled { background: #f1f5f9; color: #94a3b8; cursor: not-allowed; }

.journal-goal-met {
  margin-top: 12px;
  font-size: 14px;
  color: #22c55e;
  font-weight: 500;
  text-align: right;
}

.journal-muted { color: #94a3b8; }

/* ---- Sync section ---- */
.journal-sync-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.journal-btn-sync {
  background: #f1f5f9;
  color: #475569;
  font-size: 12px;
  padding: 7px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  width: 100%;
  text-align: left;
  cursor: pointer;
  font-weight: 500;
  transition: background .15s;
}
.journal-btn-sync:hover { background: #e2e8f0; }

.journal-import-dialog {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.journal-import-label {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
}

.journal-passphrase-input--small {
  font-size: 13px;
  padding: 7px 10px;
}

.journal-import-actions {
  display: flex;
  gap: 6px;
}

.journal-btn--sm {
  font-size: 12px;
  padding: 6px 14px;
}

.journal-btn-cancel {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
}
.journal-btn-cancel:hover { background: #e2e8f0; }

/* ---- P2P panel ---- */
.journal-p2p-idle {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.journal-p2p-panel {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}

.journal-p2p-connected {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #15803d;
  font-weight: 500;
}

.journal-qr-canvas {
  display: block;
  width: 100%;
  image-rendering: pixelated;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
}

.journal-p2p-blob {
  width: 100%;
  box-sizing: border-box;
  font-family: monospace;
  font-size: 9px;
  padding: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  resize: none;
  height: 56px;
  overflow: auto;
  color: #475569;
}

.journal-p2p-paste {
  background: #fafafa;
  color: #1e293b;
}
</style>
