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
import { deriveKey, randomBytes, encryptJSON, decryptJSON, packEnvelope, unpackEnvelope } from './crypto.js'
import { loadSalt, saveSalt, writeVault, loadVault, saveVault, saveDirHandle, loadDirHandle, initCrossTabSync } from './Planner/db.js'
import { STATUS, PRIORITY } from './Planner/constants.js'
import {
  fsSupported, pickDirectory, checkPermission, ensurePermission, writeTasksJson, readTasksJson,
} from './Planner/fsbridge.js'
import { exportEnvelope, readEnvelopeFile } from './Planner/exporter.js'
import {
  state, loadData, getSnapshot, resetState,
  selectedProjectId, selectedTaskId,
  addProject, renameProject, removeProject, addTask, updateTask,
  visibleTasks, sortTasks, isOverdue, isDueToday,
  projectForFile, mergeFromFile, mergeProjectsFromFile, mergeVaultTasks,
} from './Planner/store.js'

// ---- In-memory key (never persisted) ----
const cryptoKey = ref(null)
// The vault salt, kept in memory only so Export can re-pack the envelope. Like the key, it
// is loaded on unlock / generated on create and dropped on lock; only the at-rest envelope
// (which embeds the salt) is ever persisted.
let _salt = null
const ITERATIONS = 600000

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
    // If a folder is already connected (granted handle restored on mount), pull any agent
    // edits made while locked, then push the merged state back to disk.
    if (fsStatus.value === 'synced') { await pullFromFile(); await writeTasksNow() }
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
  clearTimeout(_fsTimer)      // cancel any pending tasks.json write (now gated by cryptoKey anyway)
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

// ---- File System Access bridge (Task 11) ----
// The connected directory handle (FileSystemDirectoryHandle | null). Restored from IndexedDB
// on mount; re-picked via the FS chip. tasks.json is the PLAINTEXT, note-free projection.
const dirHandle = ref(null)
const fsStatus = ref('none') // 'none' | 'reconnect' | 'synced'
const fsChip = computed(() => {
  switch (fsStatus.value) {
    case 'synced': return { cls: 'fs-synced', label: '● ' + (dirHandle.value?.name || 'Синхронизировано') }
    case 'reconnect': return { cls: 'fs-reconnect', label: '● Переподключить папку' }
    default: return { cls: 'fs-none', label: '● Подключить папку' }
  }
})

// Chip click dispatches based on current status. All paths run inside this user gesture so
// showDirectoryPicker / requestPermission are allowed (see fsbridge.js gotcha #1).
function onFsChipClick() {
  if (!fsSupported) return
  if (fsStatus.value === 'reconnect') reconnectFolder()
  else connectFolder() // 'none' → pick; 'synced' → re-pick (switch folders)
}

// Connect (or switch) the synced folder, persist the handle, and seed tasks.json.
async function connectFolder() {
  if (!fsSupported) return
  try {
    const handle = await pickDirectory()
    dirHandle.value = handle
    await saveDirHandle(handle)
    fsStatus.value = 'synced'
    // Pull any tasks.json the agent already created, then write the current state.
    await pullFromFile()
    await writeTasksNow()
  } catch (e) {
    if (e?.name !== 'AbortError') console.warn('[planner] connectFolder failed:', e)
  }
}

// Re-grant permission on a restored handle (post-reload it often reports 'prompt').
async function reconnectFolder() {
  if (!dirHandle.value) return connectFolder()
  try {
    if (!(await ensurePermission(dirHandle.value))) return
    fsStatus.value = 'synced'
    await pullFromFile()
    await writeTasksNow()
  } catch (e) {
    console.warn('[planner] reconnectFolder failed:', e)
  }
}

// Read tasks.json and LWW-merge agent edits back into state. No-op when not actively synced.
// Returns true iff the merge actually changed local state. The change check matters: without it
// every window focus would re-encrypt the vault AND rewrite tasks.json even when nothing was
// edited on disk — needless churn that also keeps re-touching the file an agent may be watching.
async function pullFromFile() {
  if (!dirHandle.value || fsStatus.value !== 'synced' || !cryptoKey.value) return false
  try {
    const file = await readTasksJson(dirHandle.value)
    if (!file) return false
    const tasks = mergeFromFile(state.tasks, file.tasks || [])
    const projects = mergeProjectsFromFile(state.projects, file.projects || [])
    if (JSON.stringify({ projects, tasks }) === JSON.stringify({ projects: state.projects, tasks: state.tasks })) {
      return false // nothing changed on disk → leave state (and the vault) untouched
    }
    loadData({ projects, tasks }) // mutates state → autosave watcher re-encrypts the vault
    return true
  } catch (e) {
    console.warn('[planner] pullFromFile failed:', e)
    fsStatus.value = 'reconnect' // permission likely lapsed
    return false
  }
}

// Write the plaintext (note-free) projection to tasks.json. Guarded so a locked or
// disconnected app never writes an empty file over a populated one.
async function writeTasksNow() {
  if (!dirHandle.value || fsStatus.value !== 'synced' || !cryptoKey.value) return
  try {
    await writeTasksJson(dirHandle.value, projectForFile(state))
  } catch (e) {
    console.warn('[planner] writeTasksJson failed:', e)
    fsStatus.value = 'reconnect'
  }
}

// Debounced tasks.json write (mirrors the 300 ms vault save) driven by the autosave watcher.
let _fsTimer = null
function scheduleFsWrite() {
  if (!dirHandle.value || fsStatus.value !== 'synced' || !cryptoKey.value) return
  clearTimeout(_fsTimer)
  _fsTimer = setTimeout(writeTasksNow, 300)
}

// No file-watch API → re-read tasks.json on window focus and merge (fsbridge.js gotcha #3).
// Only write the reconciled file back when the pull actually merged a change — a plain focus
// with no on-disk edits must not rewrite tasks.json (which would clobber an agent mid-write).
async function onWindowFocus() {
  if (fsStatus.value !== 'synced' || !cryptoKey.value) return
  if (await pullFromFile()) await writeTasksNow()
}

// Colors cycled through for newly created projects.
const PROJECT_PALETTE = ['#1accff', '#3ecf8e', '#f59e0b', '#ef4444', '#a78bfa', '#ec4899', '#22d3ee', '#84cc16']

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

// Safe PRIORITY lookup for the template: an unknown priority (e.g. a typo in an agent-edited
// tasks.json that slipped past clamping) must not throw `undefined.color` and blank the board.
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

// Delete = tombstone (deleted:true) so the removal propagates through the tasks.json merge.
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
    const tasks = mergeFromFile(state.tasks, imported.tasks || [])
    const projects = mergeProjectsFromFile(state.projects, imported.projects || [])
    loadData({ projects, tasks }) // autosave watcher persists; FS write is scheduled too
    importPassphrase.value = ''
    _pendingImportStr = null
    importPhase.value = 'idle'
  } catch {
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
    scheduleFsWrite() // mirror the change into tasks.json when a folder is connected
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
  window.addEventListener('focus', onWindowFocus)
  _cleanupSync = initCrossTabSync(onCrossTabSave)
  const salt = await loadSalt()
  hasVault.value = salt != null
  // Restore a previously connected folder (handle survives reload; permission may not).
  if (fsSupported) {
    try {
      const handle = await loadDirHandle()
      if (handle) {
        dirHandle.value = handle
        // 'granted' → auto-sync once unlocked; 'prompt'/'denied' → show "Reconnect folder".
        fsStatus.value = (await checkPermission(handle)) === 'granted' ? 'synced' : 'reconnect'
      }
    } catch (e) {
      console.warn('[planner] restore folder failed:', e)
    }
  }
  phase.value = 'locked'
})

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocMouseDown)
  document.removeEventListener('keydown', onDocKeyDown)
  window.removeEventListener('focus', onWindowFocus)
  _cleanupSync()
  clearTimeout(_fsTimer)
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
                @click.stop="deleteProject(p.id, p.name)"
              >✕</button>
            </template>
          </div>
          <p v-if="!liveProjects.length" class="planner-sidebar-empty">Нет проектов</p>
        </div>

        <button class="planner-new-project" @click="newProject">+ Новый проект</button>

        <div class="planner-sidebar-footer">
          <button
            v-if="fsSupported"
            class="planner-fs-chip"
            :class="fsChip.cls"
            :title="fsStatus === 'synced' ? 'Сменить папку' : 'Подключить локальную папку для tasks.json'"
            @click="onFsChipClick"
          >{{ fsChip.label }}</button>

          <div class="planner-footer-actions">
            <button class="planner-btn-sm" @click="onExport">Экспорт</button>
            <button class="planner-btn-sm" @click="onImport">Импорт</button>
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
          <!-- Kanban board — needs a selected project -->
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
                  draggable="true"
                  @dragstart="onDragStart($event, task.id)"
                  @click="openTask(task.id)"
                >
                  <div class="planner-card-top">
                    <span
                      class="planner-card-prio"
                      :style="{ background: priorityOf(task.priority).color }"
                      :title="priorityOf(task.priority).label"
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
          </template>

          <!-- List view (Task 9) — spans projects with its own filter bar -->
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
                  <td class="col-title">{{ task.title }}</td>
                  <td class="col-project">
                    <span class="planner-proj-tag">
                      <span
                        class="planner-project-dot"
                        :style="{ background: projectColorById[task.projectId] || '#94a3b8' }"
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

      <!-- Task detail panel (Task 10) — right-side drawer, opens on card/row click -->
      <aside v-if="selectedTask" class="planner-detail">
        <header class="planner-detail-head">
          <input
            class="planner-detail-title"
            :value="selectedTask.title"
            placeholder="Без названия"
            @input="editField('title', $event.target.value)"
          />
          <button class="planner-detail-close" title="Закрыть" @click="closeDetail">✕</button>
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
              <button class="planner-detail-chip-x" title="Убрать тег" @click="removeTag(tag)">✕</button>
            </span>
          </div>

          <label class="planner-field planner-field-note">
            <span class="planner-field-label">
              Заметка <em class="planner-note-hint">(приватная, не попадает в tasks.json)</em>
            </span>
            <textarea
              class="planner-detail-note"
              :value="selectedTask.note"
              placeholder="Личные заметки — шифруются и остаются только на устройстве."
              @input="editField('note', $event.target.value)"
            ></textarea>
          </label>
        </div>

        <footer class="planner-detail-foot">
          <button class="planner-detail-delete" @click="deleteSelectedTask">Удалить задачу</button>
        </footer>
      </aside>
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
  position: relative; /* anchors the absolute detail drawer */
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
  border: none;
  width: 100%;
  cursor: pointer;
  font-family: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.planner-fs-chip:hover { filter: brightness(1.15); }
.planner-fs-chip.fs-none { background: #273449; color: #94a3b8; }
.planner-fs-chip.fs-reconnect { background: #3b2f14; color: #f59e0b; }
.planner-fs-chip.fs-synced { background: #14321f; color: #34d399; }

/* Import passphrase dialog (sidebar footer) */
.planner-import-dialog {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 7px;
  padding: 9px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.planner-import-label { font-size: 12px; color: #94a3b8; }
.planner-import-input {
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
.planner-import-input:focus { border-color: #7fb3d3; }
.planner-import-actions { display: flex; gap: 7px; }
.planner-import-merge { background: #2563eb; color: #fff; }
.planner-import-merge:hover { background: #1d4ed8; }
.planner-import-error { margin: 4px 0 0; color: #f87171; font-size: 12px; }
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

/* List view */
.planner-list-view {
  padding: 16px;
}
.planner-list-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.planner-filter-select {
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  background: #fff;
  color: #334155;
  cursor: pointer;
}
.planner-list-tagfilter {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.planner-hidedone {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
  margin-left: auto;
}

.planner-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.planner-table thead th {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 2px solid #e2e8f0;
  color: #334155;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.planner-table thead th:hover { background: #f8fafc; }
.planner-table thead th.col-done { width: 36px; text-align: center; }
.sort-arrow { color: #2563eb; font-size: 11px; }

.planner-row {
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
}
.planner-row:hover { background: #f8fafc; }
.planner-row.selected { background: #eff6ff; }
.planner-row.is-done .col-title { text-decoration: line-through; color: #94a3b8; }
.planner-table td {
  padding: 8px 10px;
  vertical-align: middle;
}
.planner-table td.col-done { text-align: center; }
.planner-table td.col-done input { cursor: pointer; }
.col-title { color: #1e293b; word-break: break-word; }
.planner-proj-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #475569;
}
.col-prio { white-space: nowrap; color: #475569; }
.col-prio .planner-card-prio { display: inline-block; margin-right: 6px; margin-top: 0; vertical-align: middle; }
.col-due .planner-card-due { display: inline-block; }
.col-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.planner-table-empty {
  text-align: center;
  padding: 28px 10px;
  color: #94a3b8;
}

/* Task detail panel (right-side drawer) */
.planner-detail {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 340px;
  background: #ffffff;
  border-left: 1px solid #e2e8f0;
  box-shadow: -8px 0 24px rgba(15, 23, 42, .12);
  display: flex;
  flex-direction: column;
  min-height: 0;
  z-index: 20;
}
.planner-detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}
.planner-detail-title {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 6px 8px;
  background: transparent;
  outline: none;
}
.planner-detail-title:hover { border-color: #e2e8f0; }
.planner-detail-title:focus { border-color: #2563eb; background: #fff; }
.planner-detail-close {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 15px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  flex-shrink: 0;
}
.planner-detail-close:hover { background: #f1f5f9; color: #334155; }

.planner-detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}
.planner-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.planner-field-label {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: .03em;
}
.planner-note-hint {
  font-style: normal;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: #94a3b8;
}
.planner-field select,
.planner-field input[type="date"],
.planner-detail-tags-input {
  padding: 7px 10px;
  font-size: 13px;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  background: #fff;
  color: #334155;
  outline: none;
}
.planner-field select:focus,
.planner-field input:focus,
.planner-detail-tags-input:focus { border-color: #2563eb; }

.planner-detail-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: -8px;
}
.planner-detail-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 2px 4px 2px 8px;
  border-radius: 5px;
  background: #eef2ff;
  color: #4f46e5;
}
.planner-detail-chip-x {
  background: none;
  border: none;
  color: #818cf8;
  cursor: pointer;
  font-size: 10px;
  padding: 0 2px;
  line-height: 1;
}
.planner-detail-chip-x:hover { color: #4338ca; }

.planner-field-note { flex: 1; min-height: 0; }
.planner-detail-note {
  flex: 1;
  min-height: 160px;
  resize: vertical;
  padding: 9px 11px;
  font-size: 13px;
  line-height: 1.5;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  background: #fff;
  color: #334155;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}
.planner-detail-note:focus { border-color: #2563eb; }

.planner-detail-foot {
  padding: 12px 14px;
  border-top: 1px solid #e2e8f0;
  flex-shrink: 0;
}
.planner-detail-delete {
  width: 100%;
  padding: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 7px;
  color: #dc2626;
  font-size: 13px;
  cursor: pointer;
}
.planner-detail-delete:hover { background: #fee2e2; }
</style>
