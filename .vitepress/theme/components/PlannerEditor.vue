<script setup>
// Planner root component — encrypted-vault key lifecycle (unlock / create / lock) + autosave.
//
// Security model (mirrors Journal): the passphrase and derived AES-GCM key are NEVER
// persisted — only the { salt, iterations, iv, ciphertext } envelope is written to IndexedDB
// (Planner/db.js). The key lives ONLY in memory (`cryptoKey` ref below) for the session and
// is re-derived on every unlock.
//
// Planner data lives ONLY in the encrypted IndexedDB vault; the encrypted .planner
// export/import is the backup path. There is no plaintext on-disk projection.

import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { deriveKey, randomBytes, encryptJSON, decryptJSON, packEnvelope, unpackEnvelope } from './crypto.js'
import { loadSalt, saveSalt, writeVault, loadVault, saveVault, initCrossTabSync } from './Planner/db.js'
import { STATUS, PRIORITY } from './Planner/constants.js'
import { exportEnvelope, readEnvelopeFile } from './Planner/exporter.js'
import {
  state, loadData, getSnapshot, resetState,
  selectedProjectId, selectedTaskId,
  addProject, renameProject, removeProject, addTask, updateTask,
  visibleTasks, sortTasks, isOverdue, isDueToday,
  mergeProjectsFromFile, mergeVaultTasks,
} from './Planner/store.js'
import HelpModal from './HelpModal.vue'
import { shouldShowOnboarding } from './onboarding.js'

// ---- Help / onboarding (shown on first unlock, never on the password screen) ----
const showHelp = ref(false)

// ---- In-memory key (never persisted) ----
const cryptoKey = ref(null)
// The vault salt, kept in memory only so Export can re-pack the envelope. Like the key, it
// is loaded on unlock / generated on create and dropped on lock; only the at-rest envelope
// (which embeds the salt) is ever persisted.
let _salt = null
const ITERATIONS = 600000

// ---- Reactive UI state ----
const phase = ref('loading')      // 'loading' | 'locked' | 'unlocked'
// Show the help modal on the first unlock only — never over the password screen (mirrors Journal).
watch(phase, (p) => {
  if (p === 'unlocked' && shouldShowOnboarding('planner:seen-help')) showHelp.value = true
})
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
    _salt = salt
    cryptoKey.value = await deriveKey(passphrase.value, salt)
    resetState() // start empty
    // Persist the (empty) vault SYNCHRONOUSLY (awaited, not debounced) so a wrong passphrase
    // on the next visit is rejected by decrypt rather than silently "unlocking" a non-existent
    // record. Awaiting closes the race where the tab closes within the 300 ms save debounce,
    // leaving a salt but no vault — which would let any passphrase unlock the empty vault.
    await writeVault(cryptoKey.value, getSnapshot())
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
    _salt = salt
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
  _salt = null
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

// Colors cycled through for newly created projects.
const PROJECT_PALETTE = ['#a8874a', '#3ecf8e', '#f59e0b', '#ef4444', '#a78bfa', '#ec4899', '#22d3ee', '#84cc16']

// Non-tombstoned projects — the only ones shown in the sidebar / filters. Deleted projects are
// kept in `state.projects` as tombstones (so the deletion propagates through the merges) but
// must never render.
const liveProjects = computed(() => state.projects.filter(p => !p.deleted))

// If the selected project gets tombstoned (locally or via a cross-tab / file merge), drop the
// selection so the main pane never points at a hidden project.
watch(
  () => state.projects.find(p => p.id === selectedProjectId.value)?.deleted,
  isDeleted => { if (selectedProjectId.value && isDeleted) selectedProjectId.value = null }
)

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
  const color = PROJECT_PALETTE[liveProjects.value.length % PROJECT_PALETTE.length]
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

// Safe PRIORITY lookup for the template: an unknown priority (e.g. a stray value in an
// imported .planner file that slipped past clamping) must not throw `undefined.color` and blank the board.
function priorityOf(p) {
  return PRIORITY[p] || PRIORITY.medium
}

// Due-chip color: red if overdue, amber if due today, else neutral grey.
function dueClass(task) {
  if (isOverdue(task)) return 'due-overdue'
  if (isDueToday(task)) return 'due-today'
  return 'due-normal'
}

function openTask(id) {
  selectedTaskId.value = id // opens the detail panel (Task 10)
}

// ---- Task detail panel (Task 10) ----

// The task bound to the right-side detail drawer (null = closed). Tombstoned tasks never show.
const selectedTask = computed(() => {
  const t = state.tasks.find(t => t.id === selectedTaskId.value)
  return t && !t.deleted ? t : null
})

// Field edit → updateTask (bumps updatedAt → the autosave watcher re-encrypts + persists).
function editField(field, value) {
  if (!selectedTask.value) return
  updateTask(selectedTask.value.id, { [field]: value })
}

// ---- Inline title editing (dblclick on a kanban card / list row) ----
// Пользовательский фидбэк: инпут в боковой панели выглядит как заголовок,
// редактируемость не находится. Даблклик по названию прямо на карточке/строке
// открывает инлайн-инпут (паттерн IDEF0): Enter/blur — сохранить, Esc — отмена.
const editingTaskId = ref(null)
const editingTitle = ref('')

// Локальная директива: автофокус + select на появившемся инлайн-инпуте.
const vFocus = { mounted: (el) => { el.focus(); el.select() } }

function startTitleEdit(task) {
  editingTaskId.value = task.id
  editingTitle.value = task.title
}

function commitTitleEdit() {
  if (!editingTaskId.value) return
  const v = editingTitle.value.trim()
  if (v) updateTask(editingTaskId.value, { title: v })
  editingTaskId.value = null
}

// Esc: сбрасываем id ДО blur — последующий blur-commit выйдет по early return.
function cancelTitleEdit() {
  editingTaskId.value = null
}

// Comma-separated text → deduped, trimmed tag array.
function editTags(text) {
  if (!selectedTask.value) return
  const tags = [...new Set(text.split(',').map(s => s.trim()).filter(Boolean))]
  updateTask(selectedTask.value.id, { tags })
}

function removeTag(tag) {
  if (!selectedTask.value) return
  updateTask(selectedTask.value.id, { tags: selectedTask.value.tags.filter(t => t !== tag) })
}

function closeDetail() {
  selectedTaskId.value = null
}

// Delete = tombstone (deleted:true) so the removal propagates through import / cross-tab merges.
function deleteSelectedTask() {
  const t = selectedTask.value
  if (!t) return
  if (confirm(`Удалить задачу «${t.title || 'без названия'}»?`)) {
    updateTask(t.id, { deleted: true })
    selectedTaskId.value = null
  }
}

// Close on outside-click — but not when clicking a card/row (those switch the selection) or
// inside the panel itself.
function onDocMouseDown(e) {
  if (!selectedTaskId.value) return
  if (e.target.closest?.('.planner-detail')) return
  if (e.target.closest?.('.planner-card, .planner-row')) return
  closeDetail()
}
// Close on Esc.
function onDocKeyDown(e) {
  if (e.key === 'Escape' && selectedTaskId.value) closeDetail()
}

// ---- List view (Task 9) ----

// Sort state for the table headers (toggle asc/desc on the active field).
const sortField = ref('status') // 'status' | 'title' | 'project' | 'priority' | 'due' | 'tags'
const sortDir = ref('asc')      // 'asc' | 'desc'

// Independent filter bar (the list view spans projects, unlike kanban).
const listProjectFilter = ref(null) // null = all projects
const listPriorityFilter = ref(null) // null = all priorities
const listTagFilter = ref([])        // multi-tag (OR)
const listHideDone = ref(false)

// id → name / color lookups (for the project column + project-name sorting).
const projectNameById = computed(() => {
  const m = {}
  for (const p of state.projects) m[p.id] = p.name
  return m
})
const projectColorById = computed(() => {
  const m = {}
  for (const p of state.projects) m[p.id] = p.color
  return m
})

// Tags available to the list filter (scoped to the list's project filter).
const listAllTags = computed(() => {
  const set = new Set()
  for (const t of state.tasks) {
    if (t.deleted) continue
    if (listProjectFilter.value && t.projectId !== listProjectFilter.value) continue
    for (const tag of t.tags || []) set.add(tag)
  }
  return [...set].sort()
})

// Filtered + sorted rows for the table.
const listTasks = computed(() => {
  const filtered = visibleTasks(state.tasks, {
    projectId: listProjectFilter.value,
    priority: listPriorityFilter.value,
    tags: listTagFilter.value,
    hideDone: listHideDone.value,
  })
  return sortTasks(filtered, sortField.value, sortDir.value, projectNameById.value)
})

// Header click: same field → flip direction; new field → asc.
function sortBy(field) {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDir.value = 'asc'
  }
}
function sortArrow(field) {
  if (sortField.value !== field) return ''
  return sortDir.value === 'asc' ? ' ▲' : ' ▼'
}

// Checkbox toggles a task between done and todo.
function toggleDone(task) {
  updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' })
}

function toggleListTag(tag) {
  const i = listTagFilter.value.indexOf(tag)
  if (i === -1) listTagFilter.value = [...listTagFilter.value, tag]
  else listTagFilter.value = listTagFilter.value.filter(t => t !== tag)
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

// ---- Export / Import encrypted .planner files (Task 11) ----

// Export = re-pack the current snapshot into a fresh envelope and download it. Only the
// { salt, iterations, iv, ciphertext } envelope leaves memory — never the key or plaintext.
async function onExport() {
  if (!cryptoKey.value || !_salt) return
  try {
    const { iv, ciphertext } = await encryptJSON(cryptoKey.value, getSnapshot())
    exportEnvelope(packEnvelope({ salt: _salt, iterations: ITERATIONS, iv, ciphertext }), 'planner')
  } catch (e) {
    console.warn('[planner] export failed:', e)
  }
}

// Import flow: pick a .planner file → prompt for its passphrase → decrypt → LWW-merge.
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
    // The .planner envelope is the full encrypted vault (notes included), so merge with the
    // note-aware mergeVaultTasks. Same source kind as cross-tab sync (onCrossTabSave).
    const tasks = mergeVaultTasks(state.tasks, imported.tasks || [])
    const projects = mergeProjectsFromFile(state.projects, imported.projects || [])
    loadData({ projects, tasks }) // autosave watcher persists the merged snapshot
    importPassphrase.value = ''
    _pendingImportStr = null
    importPhase.value = 'idle'
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

// ---- Autosave: re-encrypt on every state change while unlocked ----
// getSnapshot() reads every reactive field of `state` (via JSON.stringify), so the getter is
// tracked deeply; saveVault is itself debounced (300 ms) in db.js.
// _applyingRemote is set while we adopt another tab's just-saved snapshot (cross-tab sync):
// that data is already persisted in the shared IndexedDB, so re-saving would be redundant AND
// would emit another 'planner:saved' ping, ping-ponging the two tabs forever. Skip the save
// for remote-applied changes; genuine user edits still save normally.
let _applyingRemote = false
const stopAutosave = watch(
  () => getSnapshot(),
  s => {
    if (!cryptoKey.value || _applyingRemote) return
    saveVault(cryptoKey.value, s)
  },
  { deep: true }
)

// ---- Cross-tab sync: another tab saved → reload its snapshot and LWW-merge it in ----
// Both tabs share the same encrypted IndexedDB record, so we just re-decrypt it and merge
// (task-level LWW, notes included). The merge is applied under _applyingRemote so the autosave
// watcher does not bounce the change straight back to the other tab.
let _cleanupSync = () => {}
async function onCrossTabSave() {
  if (!cryptoKey.value) return
  try {
    const snapshot = await loadVault(cryptoKey.value)
    if (!snapshot) return
    const tasks = mergeVaultTasks(state.tasks, snapshot.tasks || [])
    const projects = mergeProjectsFromFile(state.projects, snapshot.projects || [])
    _applyingRemote = true
    loadData({ projects, tasks })
    await nextTick() // let the autosave watcher fire (and skip) before re-enabling saves
  } catch (e) {
    console.warn('[planner] cross-tab sync failed:', e)
  } finally {
    _applyingRemote = false
  }
}

onMounted(async () => {
  document.addEventListener('mousedown', onDocMouseDown)
  document.addEventListener('keydown', onDocKeyDown)
  _cleanupSync = initCrossTabSync(onCrossTabSave)
  const salt = await loadSalt()
  hasVault.value = salt != null
  phase.value = 'locked'
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocMouseDown)
  document.removeEventListener('keydown', onDocKeyDown)
  _cleanupSync()
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

    <!-- Unlocked — layout shell: sidebar + main (kanban/list panes built in Tasks 8/9) -->
    <div v-else class="planner-unlocked">
      <!-- Sidebar -->
      <aside class="planner-sidebar">
        <div class="planner-sidebar-head">
          <strong class="planner-sidebar-title">Планировщик</strong>
        </div>

        <div class="planner-project-list">
          <div
            v-for="p in liveProjects"
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
                aria-label="Удалить проект"
                @click.stop="deleteProject(p.id, p.name)"
              >✕</button>
            </template>
          </div>
          <p v-if="!liveProjects.length" class="planner-sidebar-empty">Нет проектов</p>
        </div>

        <button class="planner-new-project" @click="newProject">+ Новый проект</button>

        <div class="planner-sidebar-footer">
          <div class="planner-footer-actions">
            <button class="planner-btn-sm" @click="onExport">Экспорт</button>
            <button class="planner-btn-sm" @click="onImport">Импорт</button>
            <button class="planner-btn-sm planner-help-btn" title="Справка" aria-label="Справка" @click="showHelp = true">?</button>
          </div>

          <!-- Hidden picker for .planner import -->
          <input
            ref="fileInputEl"
            type="file"
            accept=".planner"
            style="display:none"
            @change="onImportFileChange"
          />

          <!-- Import passphrase dialog -->
          <div v-if="importPhase !== 'idle'" class="planner-import-dialog">
            <div class="planner-import-label">Пароль импортируемого файла:</div>
            <input
              v-model="importPassphrase"
              type="password"
              class="planner-import-input"
              placeholder="Пароль"
              autocomplete="off"
              @keydown.enter="doImport"
            />
            <div class="planner-import-actions">
              <button class="planner-btn-sm planner-import-merge" :disabled="importPhase === 'merging'" @click="doImport">
                {{ importPhase === 'merging' ? 'Расшифровка…' : 'Объединить' }}
              </button>
              <button class="planner-btn-sm" @click="cancelImport">Отмена</button>
            </div>
            <p v-if="importError" class="planner-import-error">{{ importError }}</p>
          </div>
          <p v-if="importError && importPhase === 'idle'" class="planner-import-error">{{ importError }}</p>

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
          <div v-if="viewMode === 'kanban'" class="planner-tag-filters">
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
          <!-- Kanban board — needs a selected project -->
          <template v-if="viewMode === 'kanban'">
          <div v-if="!selectedProjectId" class="planner-content-empty">
            <span class="planner-muted">Выберите или создайте проект.</span>
          </div>

          <div v-else class="planner-kanban">
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
                  :draggable="editingTaskId !== task.id"
                  @dragstart="onDragStart($event, task.id)"
                  @click="openTask(task.id)"
                >
                  <div class="planner-card-top">
                    <span
                      class="planner-card-prio"
                      :style="{ background: priorityOf(task.priority).color }"
                      :title="priorityOf(task.priority).label"
                    ></span>
                    <input
                      v-if="editingTaskId === task.id"
                      v-model="editingTitle"
                      v-focus
                      class="planner-title-inline-input"
                      @click.stop
                      @keydown.enter.prevent="commitTitleEdit"
                      @keydown.esc.stop="cancelTitleEdit"
                      @blur="commitTitleEdit"
                    />
                    <span
                      v-else
                      class="planner-card-title"
                      title="Двойной клик — переименовать"
                      @dblclick.stop="startTitleEdit(task)"
                    >{{ task.title }}</span>
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
          </template>

          <!-- List view (Task 9) — spans projects with its own filter bar -->
          <div v-else class="planner-list-view">
            <div class="planner-list-filters">
              <select v-model="listProjectFilter" class="planner-filter-select">
                <option :value="null">Все проекты</option>
                <option v-for="p in liveProjects" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
              <select v-model="listPriorityFilter" class="planner-filter-select">
                <option :value="null">Любой приоритет</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <div class="planner-list-tagfilter">
                <button
                  v-for="tag in listAllTags"
                  :key="tag"
                  class="planner-tag-chip"
                  :class="{ active: listTagFilter.includes(tag) }"
                  @click="toggleListTag(tag)"
                >#{{ tag }}</button>
              </div>
              <label class="planner-hidedone">
                <input type="checkbox" v-model="listHideDone" /> Скрыть выполненные
              </label>
            </div>

            <table class="planner-table">
              <thead>
                <tr>
                  <th class="col-done" @click="sortBy('status')">✓<span class="sort-arrow">{{ sortArrow('status') }}</span></th>
                  <th @click="sortBy('title')">Задача<span class="sort-arrow">{{ sortArrow('title') }}</span></th>
                  <th @click="sortBy('project')">Проект<span class="sort-arrow">{{ sortArrow('project') }}</span></th>
                  <th @click="sortBy('priority')">Приоритет<span class="sort-arrow">{{ sortArrow('priority') }}</span></th>
                  <th @click="sortBy('due')">Срок<span class="sort-arrow">{{ sortArrow('due') }}</span></th>
                  <th @click="sortBy('tags')">Теги<span class="sort-arrow">{{ sortArrow('tags') }}</span></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="task in listTasks"
                  :key="task.id"
                  class="planner-row"
                  :class="{ selected: selectedTaskId === task.id, 'is-done': task.status === 'done' }"
                  @click="openTask(task.id)"
                >
                  <td class="col-done">
                    <input
                      type="checkbox"
                      :checked="task.status === 'done'"
                      @click.stop
                      @change="toggleDone(task)"
                    />
                  </td>
                  <td class="col-title">
                    <input
                      v-if="editingTaskId === task.id"
                      v-model="editingTitle"
                      v-focus
                      class="planner-title-inline-input"
                      @click.stop
                      @keydown.enter.prevent="commitTitleEdit"
                      @keydown.esc.stop="cancelTitleEdit"
                      @blur="commitTitleEdit"
                    />
                    <span
                      v-else
                      title="Двойной клик — переименовать"
                      @dblclick.stop="startTitleEdit(task)"
                    >{{ task.title }}</span>
                  </td>
                  <td class="col-project">
                    <span class="planner-proj-tag">
                      <span
                        class="planner-project-dot"
                        :style="{ background: projectColorById[task.projectId] || '#7a7d82' }"
                      ></span>
                      {{ projectNameById[task.projectId] || '—' }}
                    </span>
                  </td>
                  <td class="col-prio">
                    <span
                      class="planner-card-prio"
                      :style="{ background: priorityOf(task.priority).color }"
                    ></span>
                    {{ priorityOf(task.priority).label }}
                  </td>
                  <td class="col-due">
                    <span v-if="task.dueDate" class="planner-card-due" :class="dueClass(task)">{{ task.dueDate }}</span>
                    <span v-else class="planner-muted">—</span>
                  </td>
                  <td class="col-tags">
                    <span v-for="tag in task.tags" :key="tag" class="planner-card-tag">#{{ tag }}</span>
                  </td>
                </tr>
                <tr v-if="!listTasks.length">
                  <td colspan="6" class="planner-table-empty">Нет задач</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <!-- Task detail panel (Task 10) — right-side drawer, opens on card/row click -->
      <aside v-if="selectedTask" class="planner-detail">
        <header class="planner-detail-head">
          <input
            class="planner-detail-title"
            :value="selectedTask.title"
            placeholder="Без названия"
            @input="editField('title', $event.target.value)"
          />
          <button class="planner-detail-close" title="Закрыть" aria-label="Закрыть" @click="closeDetail">✕</button>
        </header>

        <div class="planner-detail-body">
          <label class="planner-field">
            <span class="planner-field-label">Статус</span>
            <select :value="selectedTask.status" @change="editField('status', $event.target.value)">
              <option v-for="s in STATUS" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </label>

          <label class="planner-field">
            <span class="planner-field-label">Приоритет</span>
            <select :value="selectedTask.priority" @change="editField('priority', $event.target.value)">
              <option v-for="(p, id) in PRIORITY" :key="id" :value="id">{{ p.label }}</option>
            </select>
          </label>

          <label class="planner-field">
            <span class="planner-field-label">Срок</span>
            <input
              type="date"
              :value="selectedTask.dueDate || ''"
              @change="editField('dueDate', $event.target.value || null)"
            />
          </label>

          <label class="planner-field">
            <span class="planner-field-label">Теги</span>
            <input
              class="planner-detail-tags-input"
              :value="selectedTask.tags.join(', ')"
              placeholder="через запятую"
              @change="editTags($event.target.value)"
            />
          </label>
          <div v-if="selectedTask.tags.length" class="planner-detail-chips">
            <span v-for="tag in selectedTask.tags" :key="tag" class="planner-detail-chip">
              #{{ tag }}
              <button class="planner-detail-chip-x" title="Убрать тег" aria-label="Убрать тег" @click="removeTag(tag)">✕</button>
            </span>
          </div>

          <label class="planner-field planner-field-note">
            <span class="planner-field-label">
              Заметка <em class="planner-note-hint">(приватная, шифруется на устройстве)</em>
            </span>
            <textarea
              class="planner-detail-note"
              :value="selectedTask.note"
              placeholder="Личные заметки — шифруются и остаются только на устройстве."
              @input="editField('note', $event.target.value)"
            ></textarea>
          </label>
        </div>

        <footer class="planner-detail-foot">
          <button class="planner-detail-delete" @click="deleteSelectedTask">Удалить задачу</button>
        </footer>
      </aside>
    </div>

    <HelpModal v-model="showHelp">
      <h2>Зашифрованный планировщик</h2>

      <p>Проекты и задачи с канбан-доской и списком — всё <strong>шифруется прямо в браузере</strong> и не покидает устройство в читаемом виде.</p>

      <h3>Почему это безопасно</h3>
      <ul>
        <li>Ключ выводится из пароля через <strong>PBKDF2</strong> (600 000 итераций SHA-256) и шифрует данные <strong>AES-GCM 256</strong></li>
        <li>Ключ нигде не хранится — только в памяти на время сессии; при перезагрузке нужно ввести пароль снова</li>
        <li>На диске (IndexedDB и файлы <code>.planner</code>) лежит лишь envelope <code>{ соль, итерации, IV, шифротекст }</code> — без ключа это бесполезные байты</li>
      </ul>

      <h3>Как пользоваться</h3>
      <ul>
        <li>Слева — список проектов: добавляй, переименовывай (двойной клик) и удаляй их</li>
        <li><strong>Канбан</strong> — перетаскивай карточки между «Сделать / В работе / Готово»; <strong>Список</strong> — сортировка и фильтры по проекту, приоритету и тегам</li>
        <li>Клик по задаче открывает панель: статус, приоритет, срок, теги и приватная заметка</li>
      </ul>

      <h3>Всё хранится зашифрованным</h3>
      <p>Проекты, задачи и заметки <strong>никогда не записываются на диск в открытом виде</strong>. Единственное хранилище — зашифрованный сейф в браузере; резервная копия — зашифрованный файл <code>.planner</code>.</p>

      <h3>Экспорт / импорт</h3>
      <ul>
        <li><strong>Экспорт</strong> — скачивает зашифрованный файл <code>.planner</code> (нет открытого текста)</li>
        <li><strong>Импорт</strong> — читает файл, спрашивает его пароль и сливает данные по принципу «побеждает последнее обновление»</li>
      </ul>
    </HelpModal>
  </div>
</template>

<style scoped src="./PlannerEditor.css"></style>
