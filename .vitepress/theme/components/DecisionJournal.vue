<script setup>
// Decision Journal root component — encrypted-vault key lifecycle (unlock / create / lock)
// + autosave + calibration stats. Mirrors PlannerEditor / Journal:
//
// Security model: the passphrase and the derived AES-GCM key are NEVER persisted — only the
// { salt, iterations, iv, ciphertext } envelope is written to IndexedDB (Decisions/db.js).
// The key lives ONLY in memory (`cryptoKey` ref) for the session and is re-derived on unlock.
//
// Unlike the planner (a reactive store singleton) the decision vault is a single local `ref`
// holding the plain vault object; the pure model lives in Decisions/vault.js and the
// calibration math in Decisions/stats.js, so everything testable is already covered by node
// --test and this file is the (browser-only, manually verified) UI + crypto glue.

import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { deriveKey, randomBytes, encryptJSON, decryptJSON, packEnvelope, unpackEnvelope } from './crypto.js'
import { loadEnvelope, saveEnvelope, cancelPendingSave, saveEnvelopeNow, initCrossTabSync } from './Decisions/db.js'
import { exportEnvelope, readEnvelopeFile } from './Decisions/exporter.js'
import {
  emptyVault, upsertDecision, markReviewed, removeDecision,
  dueForReview, openDecisions, reviewedDecisions, mergeVaults,
} from './Decisions/vault.js'
import { brierScore, calibrationBuckets, counts } from './Decisions/stats.js'

const ITERATIONS = 600000

// ---- In-memory key + salt (never persisted; dropped on lock) ----
const cryptoKey = ref(null)
let _salt = null

// ---- Reactive UI state ----
const phase = ref('loading')      // 'loading' | 'locked' | 'unlocked'
const hasVault = ref(false)       // true once an envelope exists (vault created previously)
const passphrase = ref('')
const confirmPassphrase = ref('') // only used on first-run create
const error = ref('')
const busy = ref(false)

// The decrypted vault (plain object, deeply reactive via ref). Empty when locked.
const vault = ref(emptyVault())

// Local 'YYYY-MM-DD' from Date getters (NOT toISOString → that is UTC and shifts the day).
function todayISO(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function plusDaysISO(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return todayISO(d)
}

// ---- Selectors over the vault (recompute on any decision change) ----
const allDecisions = computed(() => Object.values(vault.value.decisions || {}))
const dueList = computed(() => dueForReview(vault.value, todayISO()))
const dueIds = computed(() => new Set(dueList.value.map(d => d.id)))
const openNotDue = computed(() => openDecisions(vault.value).filter(d => !dueIds.value.has(d.id)))
const reviewedList = computed(() => reviewedDecisions(vault.value))

const stats = computed(() => ({
  brier: brierScore(allDecisions.value),
  buckets: calibrationBuckets(allDecisions.value).filter(b => b.n > 0),
  counts: counts(allDecisions.value, todayISO()),
}))

// ---- Right-pane view state ----
const view = ref('empty')   // 'empty' | 'form' | 'review' | 'detail' | 'stats'
const selectedId = ref(null)
const showReviewed = ref(false)

// ---- Create a brand-new vault (first run) ----
async function createVault() {
  error.value = ''
  if (!passphrase.value) {
    error.value = 'Введите пароль для защиты журнала.'
    return
  }
  if (passphrase.value.length < 6) {
    error.value = 'Пароль не короче 6 символов.'
    return
  }
  if (passphrase.value !== confirmPassphrase.value) {
    error.value = 'Пароли не совпадают.'
    return
  }
  busy.value = true
  try {
    const salt = randomBytes(16)
    _salt = salt
    cryptoKey.value = await deriveKey(passphrase.value, salt)
    vault.value = emptyVault()
    // Persist the (empty) vault SYNCHRONOUSLY (awaited, not debounced) so a wrong passphrase on
    // the next visit is rejected by decrypt rather than silently "unlocking" a non-existent record.
    const { iv, ciphertext } = await encryptJSON(cryptoKey.value, vault.value)
    await saveEnvelopeNow(packEnvelope({ salt, iterations: ITERATIONS, iv, ciphertext }))
    hasVault.value = true
    phase.value = 'unlocked'
    view.value = 'empty'
    clearInputs()
  } catch (e) {
    error.value = 'Не удалось создать журнал: ' + (e?.message || e)
    cryptoKey.value = null
  } finally {
    busy.value = false
  }
}

// ---- Unlock an existing vault (returning) ----
async function unlock() {
  error.value = ''
  if (!passphrase.value) {
    error.value = 'Введите пароль.'
    return
  }
  busy.value = true
  try {
    const envStr = await loadEnvelope()
    if (!envStr) {
      hasVault.value = false
      return
    }
    const { salt, iterations, iv, ciphertext } = unpackEnvelope(envStr)
    const key = await deriveKey(passphrase.value, salt, iterations)
    // A wrong key makes decryptJSON reject; caught below.
    const data = await decryptJSON(key, { iv, ciphertext })
    cryptoKey.value = key
    _salt = salt
    vault.value = data && data.decisions ? data : emptyVault()
    phase.value = 'unlocked'
    view.value = 'empty'
    clearInputs()
  } catch {
    error.value = 'Неверный пароль или повреждённые данные.'
    cryptoKey.value = null
  } finally {
    busy.value = false
  }
}

// ---- Lock: drop the key and all decrypted state from memory ----
function lockVault() {
  cryptoKey.value = null      // null first so the autosave watcher skips the reset below
  _salt = null
  cancelPendingSave()
  vault.value = emptyVault()
  draft.value = null
  reviewDraft.value = null
  selectedId.value = null
  view.value = 'empty'
  phase.value = 'locked'
  clearInputs()
}

function clearInputs() {
  passphrase.value = ''
  confirmPassphrase.value = ''
  error.value = ''
}

function onPassphraseEnter() {
  if (busy.value) return
  hasVault.value ? unlock() : createVault()
}

// ---- Decision form (new / edit) ----
const draft = ref(null)       // editing draft object or null
const formError = ref('')

function startNewDecision() {
  draft.value = {
    id: null,
    title: '',
    context: '',
    options: ['', ''],
    chosen: '',
    expectedOutcome: '',
    confidence: 70,
    reviewDate: plusDaysISO(30),
  }
  formError.value = ''
  selectedId.value = null
  view.value = 'form'
}

function editDecision(id) {
  const d = vault.value.decisions[id]
  if (!d) return
  draft.value = {
    id: d.id,
    title: d.title || '',
    context: d.context || '',
    options: d.options && d.options.length ? [...d.options] : ['', ''],
    chosen: d.chosen || '',
    expectedOutcome: d.expectedOutcome || '',
    confidence: d.confidence ?? 70,
    reviewDate: d.reviewDate || plusDaysISO(30),
  }
  formError.value = ''
  selectedId.value = id
  view.value = 'form'
}

const chosenOptions = computed(() => (draft.value?.options || []).map(o => o.trim()).filter(Boolean))

function addOption() {
  draft.value.options.push('')
}
function removeOption(i) {
  draft.value.options.splice(i, 1)
  if (draft.value.options.length === 0) draft.value.options.push('')
}

function saveDraft() {
  formError.value = ''
  if (!draft.value.title.trim()) {
    formError.value = 'Введите заголовок решения.'
    return
  }
  const conf = Number(draft.value.confidence)
  if (!Number.isFinite(conf)) {
    formError.value = 'Укажите уверенность (0–100%).'
    return
  }
  const options = draft.value.options.map(o => o.trim()).filter(Boolean)
  upsertDecision(vault.value, {
    id: draft.value.id || undefined,
    title: draft.value.title.trim(),
    context: draft.value.context,
    options,
    chosen: options.includes(draft.value.chosen) ? draft.value.chosen : '',
    expectedOutcome: draft.value.expectedOutcome,
    confidence: conf,
    reviewDate: draft.value.reviewDate || null,
  })
  draft.value = null
  view.value = 'empty'
  selectedId.value = null
}

function cancelForm() {
  draft.value = null
  formError.value = ''
  view.value = 'empty'
  selectedId.value = null
}

function deleteCurrent() {
  const id = draft.value?.id
  if (!id) { cancelForm(); return }
  if (!confirm('Удалить это решение?')) return
  removeDecision(vault.value, id)
  draft.value = null
  view.value = 'empty'
  selectedId.value = null
}

// ---- Review flow ----
const reviewDraft = ref(null) // { id, outcome: null|'correct'|'wrong', actualOutcome }
const reviewError = ref('')

function startReview(id) {
  const d = vault.value.decisions[id]
  if (!d) return
  reviewDraft.value = { id, outcome: null, actualOutcome: d.actualOutcome || '' }
  reviewError.value = ''
  selectedId.value = id
  view.value = 'review'
}

const reviewTarget = computed(() => reviewDraft.value ? vault.value.decisions[reviewDraft.value.id] : null)

function submitReview() {
  reviewError.value = ''
  if (!reviewDraft.value) return
  if (!reviewDraft.value.outcome) {
    reviewError.value = 'Отметьте, сбылось ли ожидание.'
    return
  }
  markReviewed(vault.value, reviewDraft.value.id, reviewDraft.value.outcome, reviewDraft.value.actualOutcome)
  reviewDraft.value = null
  selectedId.value = null
  view.value = 'stats' // surface the updated calibration
}

function cancelReview() {
  reviewDraft.value = null
  reviewError.value = ''
  view.value = 'empty'
  selectedId.value = null
}

// ---- Read-only detail of a reviewed decision ----
const detailTarget = computed(() => selectedId.value ? vault.value.decisions[selectedId.value] : null)

function openDetail(id) {
  selectedId.value = id
  view.value = 'detail'
}

// ---- Display helpers ----
function fmtBrier(b) {
  return b == null ? '—' : b.toFixed(3)
}
function fmtPct(x) {
  return x == null ? '—' : Math.round(x) + '%'
}
function fmtRate(r) {
  return r == null ? '—' : Math.round(r * 100) + '%'
}
function outcomeLabel(o) {
  if (o === 'correct') return '✓ Сбылось'
  if (o === 'wrong') return '✗ Не сбылось'
  return '—'
}

// ---- Export / Import encrypted .decisions files ----
async function onExport() {
  if (!cryptoKey.value || !_salt) return
  try {
    const { iv, ciphertext } = await encryptJSON(cryptoKey.value, vault.value)
    exportEnvelope(packEnvelope({ salt: _salt, iterations: ITERATIONS, iv, ciphertext }), 'decisions')
  } catch (e) {
    console.warn('[decisions] export failed:', e)
  }
}

const importPhase = ref('idle') // 'idle' | 'awaiting-passphrase' | 'merging'
const importPassphrase = ref('')
const importError = ref('')
let _pendingImportStr = null
const fileInputEl = ref(null)

function onImport() {
  importError.value = ''
  if (fileInputEl.value) {
    fileInputEl.value.value = '' // allow re-picking the same file
    fileInputEl.value.click()
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
    importError.value = 'Не удалось прочитать файл.'
    importPhase.value = 'idle'
  }
}

async function doImport() {
  if (!_pendingImportStr || !cryptoKey.value || importPhase.value === 'merging') return
  if (!importPassphrase.value.trim()) {
    importError.value = 'Введите пароль импортируемого файла.'
    return
  }
  importPhase.value = 'merging'
  importError.value = ''
  try {
    const { salt, iterations, iv, ciphertext } = unpackEnvelope(_pendingImportStr)
    const importKey = await deriveKey(importPassphrase.value, salt, iterations)
    const imported = await decryptJSON(importKey, { iv, ciphertext })
    // LWW merge (commutative/idempotent) of the imported vault into the current one.
    vault.value = mergeVaults(vault.value, imported)
    importPassphrase.value = ''
    _pendingImportStr = null
    importPhase.value = 'idle'
    view.value = 'stats'
  } catch {
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

// ---- Autosave: re-encrypt on every vault change while unlocked ----
// _applyingRemote is set while we adopt another tab's just-saved snapshot (cross-tab sync):
// that data is already persisted in the shared IndexedDB, so re-saving would ping-pong forever.
let _applyingRemote = false
const stopAutosave = watch(
  vault,
  async (v) => {
    if (!cryptoKey.value || _applyingRemote) return
    try {
      const { iv, ciphertext } = await encryptJSON(cryptoKey.value, v)
      saveEnvelope(packEnvelope({ salt: _salt, iterations: ITERATIONS, iv, ciphertext }))
    } catch (e) {
      console.warn('[decisions] autosave failed:', e)
    }
  },
  { deep: true }
)

// ---- Cross-tab sync: another tab saved → reload its envelope and LWW-merge it in ----
// Both tabs share the same encrypted IndexedDB record (same salt), so our in-memory key decrypts
// it. Applied under _applyingRemote so the autosave watcher does not bounce it back.
let _cleanupSync = () => {}
async function onCrossTabSave() {
  if (!cryptoKey.value) return
  try {
    const envStr = await loadEnvelope()
    if (!envStr) return
    const { iv, ciphertext } = unpackEnvelope(envStr)
    const remote = await decryptJSON(cryptoKey.value, { iv, ciphertext })
    _applyingRemote = true
    vault.value = mergeVaults(vault.value, remote)
    await nextTick() // let the autosave watcher fire (and skip) before re-enabling saves
  } catch (e) {
    console.warn('[decisions] cross-tab sync failed:', e)
  } finally {
    _applyingRemote = false
  }
}

onMounted(async () => {
  _cleanupSync = initCrossTabSync(onCrossTabSave)
  const env = await loadEnvelope()
  hasVault.value = env != null
  phase.value = 'locked'
})

onUnmounted(() => {
  _cleanupSync()
  cancelPendingSave()
  stopAutosave()
  cryptoKey.value = null
})
</script>

<template>
  <div class="dj-root">
    <!-- Loading -->
    <div v-if="phase === 'loading'" class="dj-center">
      <span class="dj-muted">Загрузка…</span>
    </div>

    <!-- Lock / create screen -->
    <div v-else-if="phase === 'locked'" class="dj-center">
      <div class="dj-lock-card">
        <div class="dj-lock-icon">⚖️</div>
        <p class="dj-lock-title">
          {{ hasVault ? 'Открыть журнал решений' : 'Создать журнал решений' }}
        </p>
        <p class="dj-lock-desc">
          {{ hasVault
            ? 'Введите пароль для расшифровки ваших решений и калибровки.'
            : 'Придумайте пароль. Данные хранятся зашифрованными только на вашем устройстве.' }}
        </p>
        <input
          v-model="passphrase"
          type="password"
          class="dj-input"
          :placeholder="hasVault ? 'Пароль' : 'Новый пароль'"
          :autocomplete="hasVault ? 'current-password' : 'new-password'"
          @keydown.enter="onPassphraseEnter"
        />
        <input
          v-if="!hasVault"
          v-model="confirmPassphrase"
          type="password"
          class="dj-input"
          placeholder="Повторите пароль"
          autocomplete="new-password"
          @keydown.enter="onPassphraseEnter"
        />
        <div class="dj-lock-actions">
          <button
            class="dj-btn dj-btn-primary"
            :disabled="busy"
            @click="hasVault ? unlock() : createVault()"
          >
            {{ hasVault ? 'Открыть' : 'Создать' }}
          </button>
        </div>
        <p v-if="error" class="dj-error">{{ error }}</p>
      </div>
    </div>

    <!-- Unlocked — sidebar (queues) + main (form / review / detail / stats) -->
    <div v-else class="dj-unlocked">
      <!-- Sidebar -->
      <aside class="dj-sidebar">
        <div class="dj-sidebar-head">
          <strong class="dj-sidebar-title">Журнал решений</strong>
        </div>

        <div class="dj-sidebar-actions">
          <button class="dj-new-decision" @click="startNewDecision">+ Новое решение</button>
          <button class="dj-stats-btn" :class="{ active: view === 'stats' }" @click="view = 'stats'">📊 Статистика</button>
        </div>

        <div class="dj-queues">
          <!-- Due for review -->
          <section v-if="dueList.length" class="dj-section">
            <h3 class="dj-section-title dj-section-due">⏰ На ревью ({{ dueList.length }})</h3>
            <div
              v-for="d in dueList"
              :key="d.id"
              class="dj-card dj-card-due"
              :class="{ active: selectedId === d.id }"
              @click="startReview(d.id)"
            >
              <span class="dj-card-title">{{ d.title || 'Без названия' }}</span>
              <span class="dj-card-meta">
                <span class="dj-card-conf">{{ d.confidence }}%</span>
                <span class="dj-card-date">{{ d.reviewDate }}</span>
              </span>
            </div>
          </section>

          <!-- Open (not yet due) -->
          <section class="dj-section">
            <h3 class="dj-section-title">Открытые ({{ openNotDue.length }})</h3>
            <div
              v-for="d in openNotDue"
              :key="d.id"
              class="dj-card"
              :class="{ active: selectedId === d.id }"
              @click="editDecision(d.id)"
            >
              <span class="dj-card-title">{{ d.title || 'Без названия' }}</span>
              <span class="dj-card-meta">
                <span class="dj-card-conf">{{ d.confidence }}%</span>
                <span v-if="d.reviewDate" class="dj-card-date">{{ d.reviewDate }}</span>
              </span>
            </div>
            <p v-if="!openNotDue.length && !dueList.length" class="dj-empty-hint">Пока нет решений. Добавьте первое.</p>
          </section>

          <!-- Reviewed (collapsed) -->
          <section v-if="reviewedList.length" class="dj-section">
            <h3 class="dj-section-title dj-section-toggle" @click="showReviewed = !showReviewed">
              <span>{{ showReviewed ? '▾' : '▸' }} Оценённые ({{ reviewedList.length }})</span>
            </h3>
            <template v-if="showReviewed">
              <div
                v-for="d in reviewedList"
                :key="d.id"
                class="dj-card dj-card-reviewed"
                :class="{ active: selectedId === d.id }"
                @click="openDetail(d.id)"
              >
                <span class="dj-card-title">{{ d.title || 'Без названия' }}</span>
                <span class="dj-card-meta">
                  <span class="dj-outcome" :class="d.outcome === 'correct' ? 'ok' : 'bad'">{{ outcomeLabel(d.outcome) }}</span>
                  <span class="dj-card-conf">{{ d.confidence }}%</span>
                </span>
              </div>
            </template>
          </section>
        </div>

        <div class="dj-sidebar-footer">
          <div class="dj-footer-actions">
            <button class="dj-btn-sm" @click="onExport">Экспорт</button>
            <button class="dj-btn-sm" @click="onImport">Импорт</button>
          </div>

          <!-- Hidden picker for .decisions import -->
          <input
            ref="fileInputEl"
            type="file"
            accept=".decisions"
            style="display:none"
            @change="onImportFileChange"
          />

          <!-- Import passphrase dialog -->
          <div v-if="importPhase !== 'idle'" class="dj-import-dialog">
            <div class="dj-import-label">Пароль импортируемого файла:</div>
            <input
              v-model="importPassphrase"
              type="password"
              class="dj-import-input"
              placeholder="Пароль"
              autocomplete="off"
              @keydown.enter="doImport"
            />
            <div class="dj-import-actions">
              <button class="dj-btn-sm dj-import-merge" :disabled="importPhase === 'merging'" @click="doImport">
                {{ importPhase === 'merging' ? 'Расшифровка…' : 'Объединить' }}
              </button>
              <button class="dj-btn-sm" @click="cancelImport">Отмена</button>
            </div>
            <p v-if="importError" class="dj-import-error">{{ importError }}</p>
          </div>
          <p v-if="importError && importPhase === 'idle'" class="dj-import-error">{{ importError }}</p>

          <button class="dj-btn-sm dj-lock-btn" @click="lockVault">🔒 Заблокировать</button>
        </div>
      </aside>

      <!-- Main -->
      <main class="dj-main">
        <!-- Empty placeholder -->
        <div v-if="view === 'empty'" class="dj-main-empty">
          <div class="dj-empty-card">
            <div class="dj-empty-icon">⚖️</div>
            <p class="dj-empty-title">Журнал решений</p>
            <p class="dj-empty-text">
              Записывайте решения с уверенностью в процентах и датой ревью.
              Когда дата придёт&#160;— отметьте исход, и журнал посчитает вашу калибровку.
            </p>
            <button class="dj-btn dj-btn-primary" @click="startNewDecision">+ Новое решение</button>
          </div>
        </div>

        <!-- Decision form (new / edit) -->
        <div v-else-if="view === 'form'" class="dj-panel">
          <h2 class="dj-panel-title">{{ draft.id ? 'Редактировать решение' : 'Новое решение' }}</h2>

          <label class="dj-field">
            <span class="dj-field-label">Заголовок *</span>
            <input v-model="draft.title" class="dj-text" placeholder="Какое решение я принимаю?" />
          </label>

          <label class="dj-field">
            <span class="dj-field-label">Контекст</span>
            <textarea v-model="draft.context" class="dj-textarea" placeholder="Что известно? Почему сейчас?"></textarea>
          </label>

          <div class="dj-field">
            <span class="dj-field-label">Варианты</span>
            <div v-for="(opt, i) in draft.options" :key="i" class="dj-option-row">
              <input v-model="draft.options[i]" class="dj-text" :placeholder="`Вариант ${i + 1}`" />
              <button class="dj-option-del" title="Убрать вариант" @click="removeOption(i)">✕</button>
            </div>
            <button class="dj-add-option" @click="addOption">+ Вариант</button>
          </div>

          <label class="dj-field">
            <span class="dj-field-label">Выбранный вариант</span>
            <select v-model="draft.chosen" class="dj-select">
              <option value="">(не выбран)</option>
              <option v-for="opt in chosenOptions" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </label>

          <label class="dj-field">
            <span class="dj-field-label">Ожидаемый исход</span>
            <textarea v-model="draft.expectedOutcome" class="dj-textarea" placeholder="Что я ожидаю, что произойдёт?"></textarea>
          </label>

          <div class="dj-field">
            <span class="dj-field-label">Уверенность: {{ draft.confidence }}%</span>
            <div class="dj-conf-row">
              <input v-model="draft.confidence" type="range" min="0" max="100" step="1" class="dj-range" />
              <input v-model="draft.confidence" type="number" min="0" max="100" class="dj-conf-num" />
            </div>
          </div>

          <label class="dj-field">
            <span class="dj-field-label">Дата ревью</span>
            <input v-model="draft.reviewDate" type="date" class="dj-date" />
          </label>

          <p v-if="formError" class="dj-form-error">{{ formError }}</p>

          <div class="dj-form-actions">
            <button class="dj-btn dj-btn-primary" @click="saveDraft">Сохранить</button>
            <button class="dj-btn dj-btn-ghost" @click="cancelForm">Отмена</button>
            <button v-if="draft.id" class="dj-btn dj-btn-danger" @click="deleteCurrent">Удалить</button>
          </div>
        </div>

        <!-- Review card -->
        <div v-else-if="view === 'review' && reviewTarget" class="dj-panel">
          <h2 class="dj-panel-title">Ревью решения</h2>
          <div class="dj-review-box">
            <div class="dj-review-row"><span class="dj-review-k">Решение</span><span class="dj-review-v">{{ reviewTarget.title }}</span></div>
            <div v-if="reviewTarget.chosen" class="dj-review-row"><span class="dj-review-k">Выбор</span><span class="dj-review-v">{{ reviewTarget.chosen }}</span></div>
            <div v-if="reviewTarget.expectedOutcome" class="dj-review-row"><span class="dj-review-k">Ожидание</span><span class="dj-review-v">{{ reviewTarget.expectedOutcome }}</span></div>
            <div class="dj-review-row"><span class="dj-review-k">Уверенность</span><span class="dj-review-v">{{ reviewTarget.confidence }}%</span></div>
          </div>

          <p class="dj-review-q">Сбылось ли ожидание?</p>
          <div class="dj-outcome-buttons">
            <button
              class="dj-outcome-btn ok"
              :class="{ selected: reviewDraft.outcome === 'correct' }"
              @click="reviewDraft.outcome = 'correct'"
            >✓ Да, сбылось</button>
            <button
              class="dj-outcome-btn bad"
              :class="{ selected: reviewDraft.outcome === 'wrong' }"
              @click="reviewDraft.outcome = 'wrong'"
            >✗ Нет, не сбылось</button>
          </div>

          <label class="dj-field">
            <span class="dj-field-label">Что произошло на самом деле</span>
            <textarea v-model="reviewDraft.actualOutcome" class="dj-textarea" placeholder="Фактический исход (по желанию)"></textarea>
          </label>

          <p v-if="reviewError" class="dj-form-error">{{ reviewError }}</p>

          <div class="dj-form-actions">
            <button class="dj-btn dj-btn-primary" @click="submitReview">Записать исход</button>
            <button class="dj-btn dj-btn-ghost" @click="cancelReview">Отмена</button>
          </div>
        </div>

        <!-- Reviewed detail (read-only) -->
        <div v-else-if="view === 'detail' && detailTarget" class="dj-panel">
          <h2 class="dj-panel-title">{{ detailTarget.title }}</h2>
          <div class="dj-review-box">
            <div v-if="detailTarget.context" class="dj-review-row"><span class="dj-review-k">Контекст</span><span class="dj-review-v">{{ detailTarget.context }}</span></div>
            <div v-if="detailTarget.chosen" class="dj-review-row"><span class="dj-review-k">Выбор</span><span class="dj-review-v">{{ detailTarget.chosen }}</span></div>
            <div v-if="detailTarget.expectedOutcome" class="dj-review-row"><span class="dj-review-k">Ожидание</span><span class="dj-review-v">{{ detailTarget.expectedOutcome }}</span></div>
            <div class="dj-review-row"><span class="dj-review-k">Уверенность</span><span class="dj-review-v">{{ detailTarget.confidence }}%</span></div>
            <div class="dj-review-row">
              <span class="dj-review-k">Исход</span>
              <span class="dj-review-v dj-outcome" :class="detailTarget.outcome === 'correct' ? 'ok' : 'bad'">{{ outcomeLabel(detailTarget.outcome) }}</span>
            </div>
            <div v-if="detailTarget.actualOutcome" class="dj-review-row"><span class="dj-review-k">Факт</span><span class="dj-review-v">{{ detailTarget.actualOutcome }}</span></div>
          </div>
          <div class="dj-form-actions">
            <button class="dj-btn dj-btn-ghost" @click="editDecision(detailTarget.id)">Редактировать</button>
          </div>
        </div>

        <!-- Stats / calibration -->
        <div v-else-if="view === 'stats'" class="dj-panel">
          <h2 class="dj-panel-title">Калибровка</h2>

          <div class="dj-counts">
            <div class="dj-count"><span class="dj-count-n">{{ stats.counts.total }}</span><span class="dj-count-l">всего</span></div>
            <div class="dj-count"><span class="dj-count-n">{{ stats.counts.open }}</span><span class="dj-count-l">открыто</span></div>
            <div class="dj-count"><span class="dj-count-n">{{ stats.counts.due }}</span><span class="dj-count-l">на ревью</span></div>
            <div class="dj-count"><span class="dj-count-n">{{ stats.counts.reviewed }}</span><span class="dj-count-l">оценено</span></div>
          </div>

          <template v-if="stats.counts.reviewed">
            <div class="dj-brier">
              <span class="dj-brier-n">{{ fmtBrier(stats.brier) }}</span>
              <span class="dj-brier-l">Brier score <em>(0&#160;— идеал, 0.25&#160;— монетка, 1&#160;— макс. ошибка)</em></span>
            </div>

            <table class="dj-cal-table">
              <thead>
                <tr><th>Заявлено</th><th>Сбылось</th><th>Решений</th></tr>
              </thead>
              <tbody>
                <tr v-for="b in stats.buckets" :key="b.label">
                  <td>{{ b.label }} <span class="dj-cal-avg">(ср. {{ fmtPct(b.avgConfidence) }})</span></td>
                  <td class="dj-cal-rate">{{ fmtRate(b.hitRate) }}</td>
                  <td>{{ b.n }}</td>
                </tr>
              </tbody>
            </table>
            <p class="dj-cal-hint">Хорошая калибровка: «сбылось» близко к «заявлено». Завышенная уверенность&#160;— «сбылось» ниже заявленного.</p>
          </template>

          <p v-else class="dj-empty-hint dj-stats-empty">
            Пока нет оценённых решений. Отметьте исход хотя бы одного решения, дата ревью которого наступила,&#160;— и здесь появится калибровка.
          </p>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.dj-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0f172a;
  color: #e2e8f0;
  font-family: 'Segoe UI', system-ui, sans-serif;
  min-height: 0;
}

/* Lock screen */
.dj-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dj-lock-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 14px;
  padding: 40px 48px;
  width: 100%;
  max-width: 420px;
  text-align: center;
  box-shadow: 0 8px 40px rgba(0, 0, 0, .5);
}
.dj-lock-icon { font-size: 40px; margin-bottom: 14px; }
.dj-lock-title { margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #f1f5f9; }
.dj-lock-desc { margin: 0 0 24px; font-size: 14px; color: #94a3b8; line-height: 1.6; }

.dj-input {
  width: 100%;
  box-sizing: border-box;
  padding: 11px 16px;
  margin-bottom: 10px;
  font-size: 15px;
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 8px;
  color: #e2e8f0;
  outline: none;
  transition: border-color .15s;
}
.dj-input:focus { border-color: #33ffcc; }

.dj-lock-actions { margin-top: 10px; }

.dj-btn {
  padding: 10px 22px;
  font-size: 15px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: opacity .15s, background .15s;
}
.dj-btn:hover { opacity: .88; }
.dj-btn:disabled { opacity: .5; cursor: default; }
.dj-btn-primary { background: #0d9488; color: #fff; }
.dj-btn-ghost { background: #e2e8f0; color: #334155; }
.dj-btn-danger { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

.dj-error { margin-top: 14px; color: #f87171; font-size: 13px; }

/* Unlocked layout */
.dj-unlocked {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr;
  min-height: 0;
}

/* Sidebar */
.dj-sidebar {
  background: #1e293b;
  border-right: 1px solid #334155;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.dj-sidebar-head {
  padding: 14px 16px;
  border-bottom: 1px solid #334155;
  flex-shrink: 0;
}
.dj-sidebar-title { font-size: 15px; color: #f1f5f9; }

.dj-sidebar-actions {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}
.dj-new-decision {
  padding: 9px;
  background: #0d9488;
  border: none;
  border-radius: 7px;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.dj-new-decision:hover { background: #0f766e; }
.dj-stats-btn {
  padding: 8px;
  background: #273449;
  border: 1px solid #334155;
  border-radius: 7px;
  color: #cbd5e1;
  font-size: 13px;
  cursor: pointer;
}
.dj-stats-btn:hover { background: #334155; color: #fff; }
.dj-stats-btn.active { background: #134e4a; border-color: #0d9488; color: #5eead4; }

.dj-queues {
  flex: 1;
  overflow-y: auto;
  padding: 4px 10px 10px;
  min-height: 0;
}
.dj-section { margin-bottom: 14px; }
.dj-section-title {
  margin: 8px 2px 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: #64748b;
  font-weight: 600;
}
.dj-section-due { color: #fbbf24; }
.dj-section-toggle { cursor: pointer; user-select: none; }
.dj-section-toggle:hover { color: #94a3b8; }

.dj-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 7px;
  cursor: pointer;
  background: #273449;
  margin-bottom: 6px;
  border: 1px solid transparent;
}
.dj-card:hover { background: #2f3e57; }
.dj-card.active { border-color: #0d9488; }
.dj-card-due { background: #3b2f14; }
.dj-card-due:hover { background: #463819; }
.dj-card-reviewed { background: #1f2a3d; }
.dj-card-title {
  font-size: 13px;
  color: #e2e8f0;
  line-height: 1.3;
  word-break: break-word;
}
.dj-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.dj-card-conf {
  font-size: 11px;
  color: #5eead4;
  font-variant-numeric: tabular-nums;
}
.dj-card-date {
  font-size: 11px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}
.dj-outcome { font-size: 11px; }
.dj-outcome.ok { color: #34d399; }
.dj-outcome.bad { color: #f87171; }
.dj-empty-hint {
  padding: 8px 4px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.dj-sidebar-footer {
  border-top: 1px solid #334155;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}
.dj-footer-actions { display: flex; gap: 8px; }
.dj-btn-sm {
  flex: 1;
  padding: 7px 10px;
  background: #334155;
  border: none;
  border-radius: 6px;
  color: #cbd5e1;
  font-size: 12px;
  cursor: pointer;
}
.dj-btn-sm:hover { background: #475569; color: #fff; }
.dj-lock-btn { flex: none; }

.dj-import-dialog {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 7px;
  padding: 9px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.dj-import-label { font-size: 12px; color: #94a3b8; }
.dj-import-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 9px;
  font-size: 13px;
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 6px;
  color: #e2e8f0;
  outline: none;
}
.dj-import-input:focus { border-color: #33ffcc; }
.dj-import-actions { display: flex; gap: 7px; }
.dj-import-merge { background: #0d9488; color: #fff; }
.dj-import-merge:hover { background: #0f766e; }
.dj-import-error { margin: 4px 0 0; color: #f87171; font-size: 12px; }

/* Main */
.dj-main {
  background: #ffffff;
  color: #1e293b;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
}
.dj-main-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.dj-empty-card {
  max-width: 440px;
  text-align: center;
}
.dj-empty-icon { font-size: 44px; margin-bottom: 12px; }
.dj-empty-title { margin: 0 0 10px; font-size: 20px; font-weight: 600; color: #0f172a; }
.dj-empty-text { margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #64748b; }
.dj-stats-empty { color: #64748b; max-width: 420px; }

.dj-panel {
  padding: 24px 28px;
  max-width: 640px;
  width: 100%;
  box-sizing: border-box;
}
.dj-panel-title {
  margin: 0 0 18px;
  font-size: 19px;
  font-weight: 600;
  color: #0f172a;
}

.dj-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}
.dj-field-label {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: .03em;
}
.dj-text, .dj-textarea, .dj-select, .dj-date, .dj-conf-num {
  padding: 9px 11px;
  font-size: 14px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #1e293b;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}
.dj-text:focus, .dj-textarea:focus, .dj-select:focus, .dj-date:focus, .dj-conf-num:focus {
  border-color: #0d9488;
}
.dj-textarea { min-height: 72px; resize: vertical; line-height: 1.5; }

.dj-option-row { display: flex; gap: 8px; margin-bottom: 6px; }
.dj-option-row .dj-text { flex: 1; }
.dj-option-del {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  color: #94a3b8;
  cursor: pointer;
  font-size: 12px;
  padding: 0 10px;
}
.dj-option-del:hover { color: #dc2626; }
.dj-add-option {
  align-self: flex-start;
  margin-top: 2px;
  padding: 5px 12px;
  background: #f1f5f9;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  color: #475569;
  font-size: 12px;
  cursor: pointer;
}
.dj-add-option:hover { background: #e2e8f0; }

.dj-conf-row { display: flex; align-items: center; gap: 12px; }
.dj-range { flex: 1; accent-color: #0d9488; }
.dj-conf-num { width: 72px; }

.dj-form-error { margin: 0 0 14px; color: #dc2626; font-size: 13px; }
.dj-form-actions { display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap; }

/* Review / detail box */
.dj-review-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dj-review-row { display: flex; gap: 12px; font-size: 14px; }
.dj-review-k {
  flex-shrink: 0;
  width: 96px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .03em;
  color: #94a3b8;
  padding-top: 1px;
}
.dj-review-v { color: #1e293b; line-height: 1.5; word-break: break-word; }
.dj-review-q { margin: 0 0 12px; font-size: 15px; font-weight: 600; color: #0f172a; }

.dj-outcome-buttons { display: flex; gap: 12px; margin-bottom: 18px; }
.dj-outcome-btn {
  flex: 1;
  padding: 12px;
  border-radius: 9px;
  border: 2px solid #e2e8f0;
  background: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  color: #475569;
}
.dj-outcome-btn.ok.selected { border-color: #10b981; background: #ecfdf5; color: #047857; }
.dj-outcome-btn.bad.selected { border-color: #ef4444; background: #fef2f2; color: #b91c1c; }
.dj-outcome-btn:hover { border-color: #cbd5e1; }

/* Stats */
.dj-counts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}
.dj-count {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  padding: 12px 8px;
  text-align: center;
}
.dj-count-n { display: block; font-size: 22px; font-weight: 700; color: #0f172a; }
.dj-count-l { display: block; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .03em; margin-top: 3px; }

.dj-brier {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding: 16px 18px;
  background: #ecfeff;
  border: 1px solid #a5f3fc;
  border-radius: 10px;
  margin-bottom: 20px;
}
.dj-brier-n { font-size: 32px; font-weight: 700; color: #0e7490; font-variant-numeric: tabular-nums; }
.dj-brier-l { font-size: 13px; color: #475569; line-height: 1.4; }
.dj-brier-l em { font-style: normal; color: #94a3b8; display: block; font-size: 12px; }

.dj-cal-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.dj-cal-table th {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 2px solid #e2e8f0;
  color: #475569;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .03em;
}
.dj-cal-table td {
  padding: 9px 10px;
  border-bottom: 1px solid #f1f5f9;
  color: #1e293b;
}
.dj-cal-avg { color: #94a3b8; font-size: 12px; }
.dj-cal-rate { font-weight: 600; color: #0e7490; }
.dj-cal-hint { margin: 14px 0 0; font-size: 13px; color: #64748b; line-height: 1.5; }

@media (max-width: 720px) {
  .dj-unlocked { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .dj-sidebar { border-right: none; border-bottom: 1px solid #334155; max-height: 45vh; }
}
</style>
