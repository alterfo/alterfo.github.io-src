<script setup>
// Planner root component — encrypted-vault key lifecycle (unlock / create / lock) + autosave.
//
// Security model (mirrors Journal): the passphrase and derived AES-GCM key are NEVER
// persisted — only the { salt, iterations, iv, ciphertext } envelope is written to IndexedDB
// (Planner/db.js). The key lives ONLY in memory (`cryptoKey` ref below) for the session and
// is re-derived on every unlock.
//
// The full UI (sidebar, kanban, list, detail panel, FS sync) is built in later tasks; this
// file currently provides the lock screen + a minimal unlocked placeholder so the lifecycle
// is wired and testable end-to-end.

import { ref, watch, onMounted, onUnmounted } from 'vue'
import { deriveKey, randomBytes } from './crypto.js'
import { loadSalt, saveSalt, loadVault, saveVault } from './Planner/db.js'
import { state, loadData, getSnapshot, resetState } from './Planner/store.js'

// ---- In-memory key (never persisted) ----
const cryptoKey = ref(null)

// ---- Reactive UI state ----
const phase = ref('loading')      // 'loading' | 'locked' | 'unlocked'
const hasVault = ref(false)       // true once a salt exists (vault created previously)
const passphrase = ref('')
const confirmPassphrase = ref('') // only used on first-run create
const error = ref('')
const busy = ref(false)

// ---- Create a brand-new vault (first run) ----
async function createVault() {
  error.value = ''
  if (!passphrase.value) {
    error.value = 'Введите пароль для защиты планировщика.'
    return
  }
  if (passphrase.value !== confirmPassphrase.value) {
    error.value = 'Пароли не совпадают.'
    return
  }
  busy.value = true
  try {
    const salt = randomBytes(16)
    await saveSalt(salt)
    cryptoKey.value = await deriveKey(passphrase.value, salt)
    resetState() // start empty
    // Persist the (empty) vault immediately so a wrong passphrase on the next visit is
    // rejected by decrypt rather than silently "unlocking" a non-existent record.
    saveVault(cryptoKey.value, getSnapshot())
    hasVault.value = true
    phase.value = 'unlocked'
    clearInputs()
  } catch (e) {
    error.value = 'Не удалось создать хранилище: ' + (e?.message || e)
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
    const salt = await loadSalt()
    if (!salt) {
      // Salt vanished — treat as first run.
      hasVault.value = false
      return
    }
    const key = await deriveKey(passphrase.value, salt)
    // A wrong key makes loadVault → decryptJSON reject; caught below.
    const snapshot = await loadVault(key)
    cryptoKey.value = key
    if (snapshot) loadData(snapshot)
    else resetState() // record not written yet (created but never saved) → empty
    phase.value = 'unlocked'
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
  resetState()
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

// ---- Autosave: re-encrypt on every state change while unlocked ----
// getSnapshot() reads every reactive field of `state` (via JSON.stringify), so the getter is
// tracked deeply; saveVault is itself debounced (300 ms) in db.js.
const stopAutosave = watch(
  () => getSnapshot(),
  s => { if (cryptoKey.value) saveVault(cryptoKey.value, s) },
  { deep: true }
)

onMounted(async () => {
  const salt = await loadSalt()
  hasVault.value = salt != null
  phase.value = 'locked'
})

onUnmounted(() => {
  stopAutosave()
  cryptoKey.value = null
})
</script>

<template>
  <div class="planner-root">
    <!-- Loading -->
    <div v-if="phase === 'loading'" class="planner-center">
      <span class="planner-muted">Загрузка…</span>
    </div>

    <!-- Lock / create screen -->
    <div v-else-if="phase === 'locked'" class="planner-center">
      <div class="planner-lock-card">
        <div class="planner-lock-icon">🔒</div>
        <p class="planner-lock-title">
          {{ hasVault ? 'Открыть планировщик' : 'Создать планировщик' }}
        </p>
        <p class="planner-lock-desc">
          {{ hasVault
            ? 'Введите пароль для расшифровки ваших проектов и задач.'
            : 'Придумайте пароль. Данные хранятся зашифрованными только на вашем устройстве.' }}
        </p>
        <input
          v-model="passphrase"
          type="password"
          class="planner-input"
          :placeholder="hasVault ? 'Пароль' : 'Новый пароль'"
          :autocomplete="hasVault ? 'current-password' : 'new-password'"
          @keydown.enter="onPassphraseEnter"
        />
        <input
          v-if="!hasVault"
          v-model="confirmPassphrase"
          type="password"
          class="planner-input"
          placeholder="Повторите пароль"
          autocomplete="new-password"
          @keydown.enter="onPassphraseEnter"
        />
        <div class="planner-lock-actions">
          <button
            class="planner-btn planner-btn-primary"
            :disabled="busy"
            @click="hasVault ? unlock() : createVault()"
          >
            {{ hasVault ? 'Открыть' : 'Создать' }}
          </button>
        </div>
        <p v-if="error" class="planner-error">{{ error }}</p>
      </div>
    </div>

    <!-- Unlocked (placeholder — real UI built in later tasks) -->
    <div v-else class="planner-unlocked">
      <div class="planner-topbar">
        <strong class="planner-topbar-title">Планировщик</strong>
        <span class="planner-muted planner-topbar-stats">
          {{ state.projects.length }} проектов · {{ state.tasks.length }} задач
        </span>
        <button class="planner-btn planner-btn-lock" @click="lockVault">🔒 Заблокировать</button>
      </div>
      <div class="planner-placeholder">
        <span class="planner-muted">Интерфейс проектов и задач появится здесь.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.planner-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0f172a;
  color: #e2e8f0;
  font-family: 'Segoe UI', system-ui, sans-serif;
  min-height: 0;
}

/* Lock screen */
.planner-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.planner-lock-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 14px;
  padding: 40px 48px;
  width: 100%;
  max-width: 420px;
  text-align: center;
  box-shadow: 0 8px 40px rgba(0, 0, 0, .5);
}
.planner-lock-icon { font-size: 40px; margin-bottom: 14px; }
.planner-lock-title { margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #f1f5f9; }
.planner-lock-desc { margin: 0 0 24px; font-size: 14px; color: #94a3b8; line-height: 1.6; }

.planner-input {
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
.planner-input:focus { border-color: #7fb3d3; }

.planner-lock-actions { margin-top: 10px; }

.planner-btn {
  padding: 10px 28px;
  font-size: 15px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: opacity .15s;
}
.planner-btn:hover { opacity: .85; }
.planner-btn:disabled { opacity: .5; cursor: default; }
.planner-btn-primary { background: #2563eb; color: #fff; }

.planner-error { margin-top: 14px; color: #f87171; font-size: 13px; }

/* Unlocked placeholder */
.planner-unlocked {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.planner-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  flex-shrink: 0;
}
.planner-topbar-title { font-size: 15px; color: #f1f5f9; }
.planner-topbar-stats { font-size: 12px; margin-right: auto; }
.planner-btn-lock {
  background: #334155;
  color: #cbd5e1;
  font-size: 12px;
  padding: 6px 14px;
}
.planner-btn-lock:hover { background: #475569; color: #fff; opacity: 1; }

.planner-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.planner-muted { color: #64748b; }
</style>
