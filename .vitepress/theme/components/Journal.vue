<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { loadEnvelope, saveEnvelope, cancelPendingSave, saveEnvelopeQuiet, initCrossTabSync } from './Journal/db.js'
import { emptyVault, upsertEntry, countWords, goalMet, computeStreak, mergeVaults } from './Journal/vault.js'
import { deriveKey, randomBytes, encryptJSON, decryptJSON, packEnvelope, unpackEnvelope } from './crypto.js'
import { exportEnvelope, readEnvelopeFile } from './Journal/exporter.js'

// ---- Volatile session state (never persisted) ----
let _key = null
let _salt = null
let _iterations = 600000

// ---- Reactive UI state ----
const phase = ref('loading')   // 'loading' | 'locked' | 'unlocked'
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
  weak:   'Слабый — добавьте цифры, заглавные буквы и длину',
  medium: 'Средний — добавьте спецсимволы или увеличьте длину',
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

async function lockVault(reason = '') {
  lockReason.value = reason
  clearTimeout(_saveTimer)
  clearTimeout(_idleTimer)
  try { await persistVault() } catch { /* best-effort flush */ }
  _key = null
  _salt = null
  viewDate.value = null
  todayText.value = ''
  Object.assign(vault, { version: 1, entries: {}, createdAt: '' })
  phase.value = 'locked'
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
    error.value = 'Cannot unlock — wrong passphrase or corrupted data.'
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
    importError.value = 'Не удалось расшифровать — проверьте пароль.'
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

// ---- Cross-tab sync ----
let _cleanupSync = () => {}

onMounted(async () => {
  const envelopeStr = await loadEnvelope()
  hasVault.value = envelopeStr != null
  phase.value = 'locked'

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
      console.warn('[journal] cross-tab sync failed:', err)
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

          <!-- Sync -->
          <div class="journal-sync-section">
            <div class="journal-section-label">Синхронизация</div>
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
      <div v-if="showChangePassword" class="cp-backdrop" @click.self="closeChangePwd">
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
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════════
   Root
══════════════════════════════════════════════ */
.journal-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #2c2c2c;
  font-family: 'PT Sans Caption', 'Segoe UI', system-ui, sans-serif;
  color: #e8e8e8;
  min-height: 0;
}

/* ══════════════════════════════════════════════
   Lock screen
══════════════════════════════════════════════ */
.journal-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.journal-lock-card {
  background: #3a3a3a;
  border: 1px solid #555;
  border-radius: 14px;
  padding: 40px 48px;
  width: 100%;
  max-width: 420px;
  text-align: center;
  box-shadow: 0 8px 40px rgba(0,0,0,.5);
}

.journal-lock-icon { font-size: 40px; margin-bottom: 14px; }
.journal-lock-title { margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #f0f0f0; }
.journal-lock-desc { margin: 0 0 24px; font-size: 14px; color: #aaa; line-height: 1.6; }

.journal-passphrase-input {
  width: 100%;
  box-sizing: border-box;
  padding: 11px 16px;
  font-size: 15px;
  background: #222;
  border: 1px solid #666;
  border-radius: 8px;
  color: #eee;
  outline: none;
  transition: border-color .15s;
}
.journal-passphrase-input:focus { border-color: #8888ff; }

.journal-lock-actions { margin-top: 18px; }

.journal-btn {
  padding: 10px 28px;
  font-size: 15px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: opacity .15s;
}
.journal-btn:hover { opacity: .85; }
.journal-btn-primary { background: #5555dd; color: #fff; }

.journal-error {
  margin-top: 14px;
  color: #ff7070;
  font-size: 13px;
}

.journal-lock-reason {
  margin-top: 14px;
  color: #aaa;
  font-size: 12px;
}

.journal-pw-strength {
  margin-top: 8px;
  font-size: 12px;
  text-align: left;
  padding: 5px 10px;
  border-radius: 6px;
  line-height: 1.4;
}
.pw-weak   { background: rgba(255,80,80,0.12); color: #ff8080; border: 1px solid rgba(255,80,80,0.3); }
.pw-medium { background: rgba(255,190,50,0.12); color: #ffcc55; border: 1px solid rgba(255,190,50,0.3); }
.pw-strong { background: rgba(80,200,100,0.12); color: #77cc77; border: 1px solid rgba(80,200,100,0.3); }

/* ══════════════════════════════════════════════
   Layout
══════════════════════════════════════════════ */
.journal-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* ══════════════════════════════════════════════
   Horizontal calendar strip
══════════════════════════════════════════════ */
.journal-cal-strip {
  flex-shrink: 0;
  background: #222;
  border-bottom: 1px solid #444;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.cal-nav-btn {
  background: none;
  border: none;
  color: #888;
  font-size: 18px;
  line-height: 1;
  padding: 0 4px;
  cursor: pointer;
  flex-shrink: 0;
  transition: color .15s;
}
.cal-nav-btn:hover { color: #ccc; }
.cal-nav-btn:disabled { color: #444; cursor: default; }

.cal-strip-label {
  font-size: 11px;
  color: #aaa;
  white-space: nowrap;
  text-transform: capitalize;
  min-width: 90px;
  text-align: center;
}
.cal-strip-scroll {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  flex: 1;
  scrollbar-width: thin;
  scrollbar-color: #444 transparent;
}
.cal-strip-scroll::-webkit-scrollbar { height: 3px; }
.cal-strip-scroll::-webkit-scrollbar-thumb { background: #444; border-radius: 2px; }

.cal-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 34px;
  padding: 4px 2px;
  border-radius: 5px;
  cursor: default;
  flex-shrink: 0;
  background: #333;
}
.cal-chip-n {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  color: #ccc;
}
.cal-chip-w {
  font-size: 9px;
  color: #777;
  margin-top: 2px;
  line-height: 1;
}

.cal-chip.cal-today    { background: #3a3aaa; }
.cal-chip.cal-today .cal-chip-n { color: #fff; }
.cal-chip.cal-today .cal-chip-w { color: #aaaaff; }
.cal-chip.cal-future   { background: #2a2a2a; }
.cal-chip.cal-future .cal-chip-n { color: #555; }
.cal-chip.cal-future .cal-chip-w { color: #444; }
.cal-chip.cal-empty    { background: #2e2e2e; }
.cal-chip.cal-empty .cal-chip-w { color: #555; }
.cal-chip.cal-partial  { background: #1e3a1e; }
.cal-chip.cal-partial .cal-chip-n { color: #99dd99; }
.cal-chip.cal-partial .cal-chip-w { color: #77bb77; }
.cal-chip.cal-goal     { background: #3a1e1e; }
.cal-chip.cal-goal .cal-chip-n { color: #ff9999; }
.cal-chip.cal-goal .cal-chip-w { color: #dd6666; }

.cal-chip.cal-goal,
.cal-chip.cal-partial,
.cal-chip.cal-zero {
  cursor: pointer;
}
.cal-chip.cal-goal:hover,
.cal-chip.cal-partial:hover,
.cal-chip.cal-zero:hover {
  opacity: 0.75;
}
.cal-chip.cal-selected {
  outline: 2px solid #888;
  outline-offset: 1px;
}

/* ══════════════════════════════════════════════
   Layout: body row (sidebar + main)
══════════════════════════════════════════════ */
.journal-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* ══════════════════════════════════════════════
   Sidebar
══════════════════════════════════════════════ */
.journal-sidebar {
  width: 200px;
  flex-shrink: 0;
  background: #252525;
  border-right: 1px solid #444;
  display: flex;
  flex-direction: column;
  padding: 16px 14px;
  gap: 18px;
  overflow-y: auto;
}

/* Streak */
.journal-streak-box {
  text-align: center;
  background: #333;
  border-radius: 10px;
  padding: 14px 8px;
  border: 1px solid #444;
}
.journal-streak-count {
  font-size: 42px;
  font-weight: 700;
  color: #8a8aff;
  line-height: 1;
}
.journal-streak-label {
  font-size: 11px;
  color: #888;
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: .05em;
}

/* Sync */
.journal-section-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #666;
}
.journal-sync-section {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.journal-btn-lock {
  background: #2a2a3a;
  color: #888;
  font-size: 11px;
  padding: 7px 10px;
  border: 1px solid #444;
  border-radius: 6px;
  width: 100%;
  text-align: left;
  cursor: pointer;
  transition: background .15s;
}
.journal-btn-lock:hover { background: #3a2a2a; color: #cc8888; border-color: #664444; }

.journal-btn-sync {
  background: #333;
  color: #aaa;
  font-size: 11px;
  padding: 7px 10px;
  border: 1px solid #444;
  border-radius: 6px;
  width: 100%;
  text-align: left;
  cursor: pointer;
  transition: background .15s;
}
.journal-btn-sync:hover { background: #3a3a3a; color: #ddd; }

.journal-import-dialog {
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.journal-import-label { font-size: 10px; color: #888; }
.journal-passphrase-input--small { font-size: 12px; padding: 7px 10px; }
.journal-import-actions { display: flex; gap: 6px; }
.journal-btn--sm { font-size: 11px; padding: 5px 12px; }
.journal-btn-cancel { background: #444; color: #ccc; border: 1px solid #555; }
.journal-btn-cancel:hover { background: #555; }

/* ══════════════════════════════════════════════
   Main editor
══════════════════════════════════════════════ */
.journal-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0;
  min-width: 0;
  max-width: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  background: #2c2c2c;
}

/* Top bar */
.journal-topbar {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 10px;
  padding: 16px 16px 0;
}
.journal-viewer { padding: 16px; }
.journal-viewer-topbar {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 14px;
}
.journal-viewer-back {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 14px;
  padding: 0;
}
.journal-viewer-back:hover { color: #ccc; }
.journal-viewer-date { font-size: 15px; font-weight: 600; color: #aaa; }
.journal-viewer-words { font-size: 11px; color: #666; }
.journal-viewer-text {
  font-size: 15px;
  line-height: 1.7;
  color: #ccc;
  white-space: pre-wrap;
  word-break: break-word;
}
.journal-today-date {
  font-size: 17px;
  font-weight: 600;
  color: #ddd;
  flex: 1;
}
.journal-save-status {
  font-size: 12px;
  transition: opacity .3s;
}
.save-idle { opacity: 0; }
.save-saving { color: #aaa; opacity: 1; }
.save-saved { color: #77cc77; opacity: 1; }

.journal-word-count {
  font-size: 13px;
  color: #888;
  transition: color .2s;
}
.wc-met { color: #77cc77; font-weight: 600; }

/* Progress bar */
.journal-progress-track {
  height: 4px;
  background: #3a3a3a;
  border-radius: 999px;
  margin: 0 16px 14px;
  overflow: hidden;
}
.journal-progress-fill {
  height: 100%;
  background: #5555dd;
  border-radius: 999px;
  transition: width .3s ease, background .3s;
}
.pf-met { background: #44aa44; }

/* ── Grow-wrap auto-height textarea ── */
.grow-wrap {
  display: grid;
  width: 100%;
  min-width: 0;
}
.grow-wrap::after {
  content: attr(data-replicated-value) " ";
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
  visibility: hidden;
  grid-area: 1 / 1 / 2 / 2;
  /* must match textarea exactly */
  font-size: 24px;
  line-height: 40px;
  font-family: Georgia, 'Times New Roman', serif;
  padding: 50px 5% 34px calc(6.2% + 16px);
  box-sizing: border-box;
  border-radius: 12px;
  border: 1px solid transparent;
}

/* Lined-paper textarea — images from ng2-words
   lines.png: 1453×40, red margin at x=90 = 6.19% of width.
   background-size: 100% 40px scales it to full element width.
   padding-left: calc(6.2% + 16px) keeps text right of the scaled margin. */
.journal-textarea {
  grid-area: 1 / 1 / 2 / 2;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  resize: none;
  overflow: hidden;
  overflow-wrap: break-word;
  word-break: break-word;
  outline: none;
  border-radius: 12px;
  border: none;
  box-shadow: 0 2px 14px rgba(0,0,0,.6);

  font-size: 24px;
  line-height: 40px;
  font-family: Georgia, 'Times New Roman', serif;
  color: #222;
  padding: 50px 5% 34px calc(6.2% + 16px);

  background:
    url(/assets/img/lines.png) repeat-y,
    url(/assets/img/paper.png) repeat;
  background-size: 100% 40px, auto;
  background-attachment: local, local;
  min-height: 400px;
}

/* Goal banner */
.journal-goal-banner {
  margin: 12px 16px 16px;
  font-size: 13px;
  color: #77cc77;
  font-weight: 500;
  text-align: right;
}

.journal-muted { color: #777; }

/* ══════════════════════════════════════════════
   Past entries
══════════════════════════════════════════════ */
.journal-past {
  margin: 16px 0 32px;
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.journal-past-header {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #555;
  padding-bottom: 8px;
  border-bottom: 1px solid #3a3a3a;
}
.journal-past-entry {
  background: #222;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 12px 14px;
  cursor: pointer;
  transition: background .12s, border-color .12s;
}
.journal-past-entry:hover {
  background: #2a2a2a;
}
.journal-past-entry--active {
  border-color: #555;
}
.journal-past-meta {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}
.journal-past-date {
  font-size: 13px;
  font-weight: 600;
  color: #aaa;
}
.journal-past-words {
  font-size: 11px;
  color: #666;
}
.journal-past-text {
  font-size: 14px;
  line-height: 1.65;
  color: #bbb;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 120px;
  overflow: hidden;
  mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
}
</style>
