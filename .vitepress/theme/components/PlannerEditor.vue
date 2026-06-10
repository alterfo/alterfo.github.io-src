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

import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { deriveKey, randomBytes } from './crypto.js'
import { loadSalt, saveSalt, loadVault, saveVault } from './Planner/db.js'
import { STATUS, PRIORITY } from './Planner/constants.js'
import {
  state, loadData, getSnapshot, resetState,
  selectedProjectId, selectedTaskId,
  addProject, renameProject, removeProject, addTask, updateTask,
  visibleTasks, isOverdue, isDueToday,
} from './Planner/store.js'

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

// ---- Layout shell: sidebar projects + main toolbar (Task 7) ----

// View mode for the main pane — kanban/list panes are built in Tasks 8/9.
const viewMode = ref('kanban') // 'kanban' | 'list'

// Active tag-filter chip (null = no filter).
const activeTag = ref(null)

// FS folder status — full bridge wiring lands in Task 11; default = no folder.
const fsStatus = ref('none') // 'none' | 'reconnect' | 'synced'
const fsChip = computed(() => {
  switch (fsStatus.value) {
    case 'synced': return { cls: 'fs-synced', label: '● Синхронизировано' }
    case 'reconnect': return { cls: 'fs-reconnect', label: '● Переподключить' }
    default: return { cls: 'fs-none', label: '● Нет папки' }
  }
})

// Colors cycled through for newly created projects.
const PROJECT_PALETTE = ['#1accff', '#3ecf8e', '#f59e0b', '#ef4444', '#a78bfa', '#ec4899', '#22d3ee', '#84cc16']

// Distinct tags across the selected project's live tasks (drives the filter chips).
const allTags = computed(() => {
  const set = new Set()
  for (const t of state.tasks) {
    if (t.deleted) continue
    if (selectedProjectId.value && t.projectId !== selectedProjectId.value) continue
    for (const tag of t.tags || []) set.add(tag)
  }
  return [...set].sort()
})

function projectTaskCount(id) {
  return state.tasks.filter(t => t.projectId === id && !t.deleted).length
}

function selectProject(id) {
  selectedProjectId.value = id
}

function newProject() {
  const color = PROJECT_PALETTE[state.projects.length % PROJECT_PALETTE.length]
  const p = addProject('Новый проект', color)
  selectedProjectId.value = p.id
  startRename(p.id, p.name)
}

function deleteProject(id, name) {
  if (confirm(`Удалить проект «${name}» и все его задачи?`)) removeProject(id)
}

// ---- Inline project rename ----
const renamingId = ref(null)
const renameText = ref('')
const renameInputEl = ref(null)

function startRename(id, name) {
  renamingId.value = id
  renameText.value = name
  nextTick(() => renameInputEl.value?.focus())
}
function commitRename() {
  if (renamingId.value == null) return
  const name = renameText.value.trim()
  if (name) renameProject(renamingId.value, name)
  renamingId.value = null
}
function cancelRename() {
  renamingId.value = null
}

function toggleTag(tag) {
  activeTag.value = activeTag.value === tag ? null : tag
}

function addNewTask() {
  if (!selectedProjectId.value) return
  const t = addTask(selectedProjectId.value, 'Новая задача')
  selectedTaskId.value = t.id
}

// ---- Kanban view (Task 8) ----

// One column per STATUS, each with its visible (non-deleted, project- + tag-filtered) tasks.
const kanbanColumns = computed(() =>
  STATUS.map(col => ({
    ...col,
    tasks: visibleTasks(state.tasks, {
      projectId: selectedProjectId.value,
      tag: activeTag.value,
      status: col.id,
    }),
  }))
)

// Due-chip color: red if overdue, amber if due today, else neutral grey.
function dueClass(task) {
  if (isOverdue(task)) return 'due-overdue'
  if (isDueToday(task)) return 'due-today'
  return 'due-normal'
}

function openTask(id) {
  selectedTaskId.value = id // detail panel opens on this in Task 10
}

// Native HTML5 drag-and-drop (no library). Desktop-oriented — touch DnD is weak, which is
// acceptable for this MVP. The dragged task id rides in the dataTransfer payload.
function onDragStart(e, taskId) {
  e.dataTransfer.setData('text/plain', taskId)
  e.dataTransfer.effectAllowed = 'move'
}
function onDrop(e, statusId) {
  const id = e.dataTransfer.getData('text/plain')
  if (id) updateTask(id, { status: statusId })
}

// Export / Import are wired in Task 11 (FS sync + encrypted .planner files).
function onExport() {}
function onImport() {}

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

    <!-- Unlocked — layout shell: sidebar + main (kanban/list panes built in Tasks 8/9) -->
    <div v-else class="planner-unlocked">
      <!-- Sidebar -->
      <aside class="planner-sidebar">
        <div class="planner-sidebar-head">
          <strong class="planner-sidebar-title">Планировщик</strong>
        </div>

        <div class="planner-project-list">
          <div
            v-for="p in state.projects"
            :key="p.id"
            class="planner-project"
            :class="{ active: selectedProjectId === p.id }"
            @click="selectProject(p.id)"
            @dblclick="startRename(p.id, p.name)"
          >
            <span class="planner-project-dot" :style="{ background: p.color }"></span>
            <input
              v-if="renamingId === p.id"
              ref="renameInputEl"
              v-model="renameText"
              class="planner-rename-input"
              @click.stop
              @keydown.enter="commitRename"
              @keydown.esc="cancelRename"
              @blur="commitRename"
            />
            <template v-else>
              <span class="planner-project-name">{{ p.name }}</span>
              <span class="planner-project-count">{{ projectTaskCount(p.id) }}</span>
              <button
                class="planner-project-del"
                title="Удалить проект"
                @click.stop="deleteProject(p.id, p.name)"
              >✕</button>
            </template>
          </div>
          <p v-if="!state.projects.length" class="planner-sidebar-empty">Нет проектов</p>
        </div>

        <button class="planner-new-project" @click="newProject">+ Новый проект</button>

        <div class="planner-sidebar-footer">
          <div class="planner-fs-chip" :class="fsChip.cls">{{ fsChip.label }}</div>
          <div class="planner-footer-actions">
            <button class="planner-btn-sm" @click="onExport">Экспорт</button>
            <button class="planner-btn-sm" @click="onImport">Импорт</button>
          </div>
          <button class="planner-btn-sm planner-lock-btn" @click="lockVault">🔒 Заблокировать</button>
        </div>
      </aside>

      <!-- Main -->
      <main class="planner-main">
        <div class="planner-toolbar">
          <div class="planner-view-toggle">
            <button :class="{ active: viewMode === 'kanban' }" @click="viewMode = 'kanban'">Канбан</button>
            <button :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'">Список</button>
          </div>
          <button class="planner-add-task" :disabled="!selectedProjectId" @click="addNewTask">+ Задача</button>
          <div class="planner-tag-filters">
            <button
              v-for="tag in allTags"
              :key="tag"
              class="planner-tag-chip"
              :class="{ active: activeTag === tag }"
              @click="toggleTag(tag)"
            >#{{ tag }}</button>
          </div>
        </div>

        <div class="planner-content">
          <!-- No project selected -->
          <div v-if="!selectedProjectId" class="planner-content-empty">
            <span class="planner-muted">Выберите или создайте проект.</span>
          </div>

          <!-- Kanban board -->
          <div v-else-if="viewMode === 'kanban'" class="planner-kanban">
            <section
              v-for="col in kanbanColumns"
              :key="col.id"
              class="planner-column"
              @dragover.prevent
              @drop="onDrop($event, col.id)"
            >
              <header class="planner-column-head">
                <span class="planner-column-title">{{ col.label }}</span>
                <span class="planner-column-count">{{ col.tasks.length }}</span>
              </header>
              <div class="planner-column-body">
                <article
                  v-for="task in col.tasks"
                  :key="task.id"
                  class="planner-card"
                  :class="{ selected: selectedTaskId === task.id }"
                  draggable="true"
                  @dragstart="onDragStart($event, task.id)"
                  @click="openTask(task.id)"
                >
                  <div class="planner-card-top">
                    <span
                      class="planner-card-prio"
                      :style="{ background: PRIORITY[task.priority].color }"
                      :title="PRIORITY[task.priority].label"
                    ></span>
                    <span class="planner-card-title">{{ task.title }}</span>
                  </div>
                  <div
                    v-if="task.dueDate || (task.tags && task.tags.length)"
                    class="planner-card-meta"
                  >
                    <span
                      v-if="task.dueDate"
                      class="planner-card-due"
                      :class="dueClass(task)"
                    >{{ task.dueDate }}</span>
                    <span
                      v-for="tag in task.tags"
                      :key="tag"
                      class="planner-card-tag"
                    >#{{ tag }}</span>
                  </div>
                </article>
                <p v-if="!col.tasks.length" class="planner-column-empty">Пусто</p>
              </div>
            </section>
          </div>

          <!-- List view (Task 9) -->
          <div v-else class="planner-content-empty">
            <span class="planner-muted">Список задач появится здесь.</span>
          </div>
        </div>
      </main>
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

/* Unlocked — layout shell */
.planner-unlocked {
  flex: 1;
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 0;
}

/* Sidebar */
.planner-sidebar {
  background: #1e293b;
  border-right: 1px solid #334155;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.planner-sidebar-head {
  padding: 14px 16px;
  border-bottom: 1px solid #334155;
  flex-shrink: 0;
}
.planner-sidebar-title { font-size: 15px; color: #f1f5f9; }

.planner-project-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  min-height: 0;
}
.planner-project {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 14px;
  color: #cbd5e1;
}
.planner-project:hover { background: #273449; }
.planner-project.active { background: #334155; color: #fff; }
.planner-project-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.planner-project-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.planner-project-count { font-size: 11px; color: #64748b; }
.planner-project-del {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  font-size: 12px;
  padding: 0 2px;
  opacity: 0;
  transition: opacity .15s;
}
.planner-project:hover .planner-project-del { opacity: 1; }
.planner-project-del:hover { color: #f87171; }
.planner-rename-input {
  flex: 1;
  min-width: 0;
  background: #0f172a;
  border: 1px solid #475569;
  border-radius: 5px;
  color: #e2e8f0;
  font-size: 14px;
  padding: 3px 6px;
  outline: none;
}
.planner-sidebar-empty {
  padding: 10px;
  color: #64748b;
  font-size: 13px;
  text-align: center;
}

.planner-new-project {
  margin: 8px;
  padding: 9px;
  background: #273449;
  border: 1px dashed #475569;
  border-radius: 7px;
  color: #cbd5e1;
  font-size: 13px;
  cursor: pointer;
  flex-shrink: 0;
}
.planner-new-project:hover { background: #334155; color: #fff; }

.planner-sidebar-footer {
  border-top: 1px solid #334155;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}
.planner-fs-chip {
  font-size: 12px;
  padding: 5px 8px;
  border-radius: 6px;
  text-align: center;
}
.planner-fs-chip.fs-none { background: #273449; color: #94a3b8; }
.planner-fs-chip.fs-reconnect { background: #3b2f14; color: #f59e0b; }
.planner-fs-chip.fs-synced { background: #14321f; color: #34d399; }
.planner-footer-actions { display: flex; gap: 8px; }
.planner-btn-sm {
  flex: 1;
  padding: 7px 10px;
  background: #334155;
  border: none;
  border-radius: 6px;
  color: #cbd5e1;
  font-size: 12px;
  cursor: pointer;
}
.planner-btn-sm:hover { background: #475569; color: #fff; }
.planner-lock-btn { flex: none; }

/* Main */
.planner-main {
  background: #ffffff;
  color: #1e293b;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.planner-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.planner-view-toggle {
  display: flex;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  overflow: hidden;
}
.planner-view-toggle button {
  padding: 6px 14px;
  background: #fff;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: #475569;
}
.planner-view-toggle button.active { background: #2563eb; color: #fff; }
.planner-add-task {
  padding: 7px 14px;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 7px;
  font-size: 13px;
  cursor: pointer;
}
.planner-add-task:disabled { background: #cbd5e1; cursor: default; }
.planner-tag-filters {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-left: auto;
}
.planner-tag-chip {
  padding: 4px 10px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  font-size: 12px;
  color: #475569;
  cursor: pointer;
}
.planner-tag-chip.active { background: #2563eb; color: #fff; border-color: #2563eb; }

.planner-content {
  flex: 1;
  overflow: auto;
  min-height: 0;
}
.planner-content-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.planner-muted { color: #64748b; }

/* Kanban board */
.planner-kanban {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  padding: 16px;
  align-items: start;
  min-height: 100%;
  box-sizing: border-box;
}
.planner-column {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  min-height: 120px;
}
.planner-column-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}
.planner-column-title {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  text-transform: uppercase;
  letter-spacing: .03em;
}
.planner-column-count {
  font-size: 12px;
  color: #64748b;
  background: #e2e8f0;
  border-radius: 10px;
  padding: 1px 8px;
  min-width: 18px;
  text-align: center;
}
.planner-column-body {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}
.planner-column-empty {
  margin: 4px 0;
  text-align: center;
  color: #cbd5e1;
  font-size: 12px;
}

.planner-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 9px 10px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .04);
  transition: border-color .12s, box-shadow .12s;
}
.planner-card:hover { border-color: #cbd5e1; box-shadow: 0 2px 6px rgba(0, 0, 0, .08); }
.planner-card.selected { border-color: #2563eb; box-shadow: 0 0 0 1px #2563eb; }
.planner-card:active { cursor: grabbing; }
.planner-card-top {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.planner-card-prio {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
}
.planner-card-title {
  font-size: 14px;
  color: #1e293b;
  line-height: 1.35;
  word-break: break-word;
}
.planner-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
  padding-left: 16px;
}
.planner-card-due {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 5px;
  font-variant-numeric: tabular-nums;
}
.planner-card-due.due-normal { background: #f1f5f9; color: #64748b; }
.planner-card-due.due-today { background: #fef3c7; color: #b45309; }
.planner-card-due.due-overdue { background: #fee2e2; color: #b91c1c; }
.planner-card-tag {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 5px;
  background: #eef2ff;
  color: #4f46e5;
}
</style>
