// Planner reactive store — mirrors IDEF0Editor/model.js: a module-level reactive()
// singleton + exported CRUD. Pure helpers (no reactivity) are factored out so they are
// directly unit-testable under `node --test` with plain arrays/objects.

import { reactive, ref } from 'vue'
import { makeId, todayISO } from './constants.js'

// ---- Reactive state (singleton) ----

export const state = reactive({ projects: [], tasks: [] })
export const selectedProjectId = ref(null)
export const selectedTaskId = ref(null)

// ---- Project CRUD ----

export function addProject(name, color) {
  const project = { id: makeId(), name, color, createdAt: Date.now() }
  state.projects.push(project)
  return project
}

export function renameProject(id, name) {
  const p = state.projects.find(p => p.id === id)
  if (p) p.name = name
}

export function removeProject(id) {
  const idx = state.projects.findIndex(p => p.id === id)
  if (idx !== -1) state.projects.splice(idx, 1)
  // Drop the project's tasks too (no orphans).
  state.tasks = state.tasks.filter(t => t.projectId !== id)
  if (selectedProjectId.value === id) selectedProjectId.value = null
}

// ---- Task CRUD ----

export function addTask(projectId, title) {
  const now = Date.now()
  const task = {
    id: makeId(),
    projectId,
    title,
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    tags: [],
    note: '',
    deleted: false,
    createdAt: now,
    updatedAt: now,
  }
  state.tasks.push(task)
  return task
}

export function updateTask(id, patch) {
  const t = state.tasks.find(t => t.id === id)
  if (!t) return
  Object.assign(t, patch, { updatedAt: Date.now() })
  return t
}

export function removeTask(id) {
  const idx = state.tasks.findIndex(t => t.id === id)
  if (idx !== -1) state.tasks.splice(idx, 1)
  if (selectedTaskId.value === id) selectedTaskId.value = null
}

// ---- Pure helpers (no reactivity — take plain args, unit-testable) ----

// Overdue = has a due date strictly before today AND not done.
export function isOverdue(task, today = todayISO()) {
  return !!(task.dueDate && task.dueDate < today && task.status !== 'done')
}

// Due today = due date equals today AND not done.
export function isDueToday(task, today = todayISO()) {
  return !!(task.dueDate && task.dueDate === today && task.status !== 'done')
}

// Filter for views. Tombstones (deleted) are always hidden.
export function visibleTasks(tasks, { projectId = null, tag = null, status = null, hideDone = false } = {}) {
  return tasks.filter(t => {
    if (t.deleted) return false
    if (projectId && t.projectId !== projectId) return false
    if (tag && !(t.tags || []).includes(tag)) return false
    if (status && t.status !== status) return false
    if (hideDone && t.status === 'done') return false
    return true
  })
}

// One-line contract for the agent editing tasks.json on disk.
const FILE_README =
  'Edit tasks below. To signal a change set updatedAt to Date.now() (epoch ms). ' +
  'Set deleted:true to remove. Notes are private and not shown here.'

// Plaintext projection written to tasks.json — `note` is NEVER included (security).
export function projectForFile(state) {
  return {
    _readme: FILE_README,
    projects: (state.projects || []).map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      createdAt: p.createdAt,
    })),
    tasks: (state.tasks || []).map(t => ({
      id: t.id,
      projectId: t.projectId,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      tags: t.tags,
      deleted: t.deleted,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  }
}

// Single-user last-write-wins merge of an edited tasks.json back into local tasks.
// Returns a NEW array; never mutates inputs and NEVER touches `note`.
//   - file task with unknown id → added as a new task with note:'' (agent created it)
//   - file task newer (updatedAt) → patch shared fields only; note preserved
//   - file task older-or-equal → ignored (app copy is newer)
//   - local tasks absent from the file are KEPT (absence ≠ deletion); deletion is
//     explicit via deleted:true.
export function mergeFromFile(localTasks, fileTasks) {
  // Clone locals so neither the array nor its task objects are mutated.
  const merged = (localTasks || []).map(t => ({ ...t }))
  const byId = new Map(merged.map(t => [t.id, t]))

  for (const f of fileTasks || []) {
    if (!f || !f.id) continue
    const l = byId.get(f.id)
    if (!l) {
      const task = {
        id: f.id,
        projectId: f.projectId ?? null,
        title: f.title ?? '',
        status: f.status ?? 'todo',
        priority: f.priority ?? 'medium',
        dueDate: f.dueDate ?? null,
        tags: Array.isArray(f.tags) ? [...f.tags] : [],
        note: '', // private note never travels through the file
        deleted: f.deleted === true,
        createdAt: f.createdAt ?? Date.now(),
        updatedAt: f.updatedAt ?? Date.now(),
      }
      merged.push(task)
      byId.set(task.id, task)
    } else if (f.updatedAt > l.updatedAt) {
      // File copy is newer → patch shared fields ONLY (note stays as-is).
      l.title = f.title ?? l.title
      l.status = f.status ?? l.status
      l.priority = f.priority ?? l.priority
      l.dueDate = f.dueDate !== undefined ? f.dueDate : l.dueDate
      l.tags = Array.isArray(f.tags) ? [...f.tags] : l.tags
      l.deleted = f.deleted === true
      l.updatedAt = f.updatedAt
    }
    // else: app copy newer-or-equal → ignore the file's version
  }
  return merged
}

// ---- Persistence glue ----

export function loadData(data) {
  Object.assign(state, data)
}

export function getSnapshot() {
  return JSON.parse(JSON.stringify(state))
}

// Reset to empty — used on Lock and for test isolation.
export function resetState() {
  state.projects = []
  state.tasks = []
  selectedProjectId.value = null
  selectedTaskId.value = null
}
