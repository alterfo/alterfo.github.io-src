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
  const project = { id: makeId(), name, color, deleted: false, createdAt: Date.now() }
  state.projects.push(project)
  return project
}

export function renameProject(id, name) {
  const p = state.projects.find(p => p.id === id)
  if (p) p.name = name
}

export function removeProject(id) {
  // Tombstone (deleted:true) rather than hard-splice. A hard delete is incompatible with the
  // "absence ≠ deletion" merge model: a cross-tab sync would re-add the project (and its tasks)
  // as "unknown ids", silently resurrecting it. The project tombstone propagates monotonically
  // through mergeProjectsFromFile; the tasks tombstone via LWW.
  const p = state.projects.find(p => p.id === id)
  if (p) p.deleted = true
  const now = Date.now()
  for (const t of state.tasks) {
    if (t.projectId === id && !t.deleted) {
      t.deleted = true
      t.updatedAt = now
    }
  }
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
//   - tag (single string)  → kanban chip filter (task must include it)
//   - tags (string[])      → list-view multi-tag filter, OR semantics (task includes ANY)
//   - priority (string)    → list-view priority filter
export function visibleTasks(tasks, { projectId = null, tag = null, tags = null, status = null, priority = null, hideDone = false } = {}) {
  return tasks.filter(t => {
    if (t.deleted) return false
    if (projectId && t.projectId !== projectId) return false
    if (tag && !(t.tags || []).includes(tag)) return false
    if (tags && tags.length && !tags.some(x => (t.tags || []).includes(x))) return false
    if (status && t.status !== status) return false
    if (priority && t.priority !== priority) return false
    if (hideDone && t.status === 'done') return false
    return true
  })
}

// Rank tables so priority/status sort in a meaningful order (not alphabetical).
const PRIORITY_RANK = { low: 0, medium: 1, high: 2 }
const STATUS_RANK = { todo: 0, 'in-progress': 1, done: 2 }

// Allow-lists for enum fields. Values arriving from an imported .planner file or a cross-tab
// vault snapshot are untrusted — an unknown priority/status would make PRIORITY[task.priority]
// undefined in the template (crashing the whole board) and drop the task from every kanban
// column. Clamp unknown values to a safe default at every ingestion boundary instead.
const VALID_PRIORITIES = new Set(['low', 'medium', 'high'])
const VALID_STATUSES = new Set(['todo', 'in-progress', 'done'])
const clampPriority = (p, fallback = 'medium') => (VALID_PRIORITIES.has(p) ? p : fallback)
const clampStatus = (s, fallback = 'todo') => (VALID_STATUSES.has(s) ? s : fallback)

// Pure list-view sort. Returns a NEW array (never mutates the input).
//   field: 'title' | 'project' | 'priority' | 'due' | 'status' | 'tags'
//   dir:   'asc' | 'desc'
//   projectNameById: { [projectId]: name } so 'project' sorts by display name.
// Tasks with no dueDate sort last in ascending order.
export function sortTasks(tasks, field, dir = 'asc', projectNameById = {}) {
  const sign = dir === 'desc' ? -1 : 1
  const keyOf = t => {
    switch (field) {
      case 'title': return (t.title || '').toLowerCase()
      case 'project': return (projectNameById[t.projectId] || '').toLowerCase()
      case 'priority': return PRIORITY_RANK[t.priority] ?? -1
      case 'due': return t.dueDate || '￿' // null/empty → sort last (asc)
      case 'status': return STATUS_RANK[t.status] ?? -1
      case 'tags': return (t.tags || []).join(',').toLowerCase()
      default: return 0
    }
  }
  return [...tasks].sort((a, b) => {
    const av = keyOf(a), bv = keyOf(b)
    if (av < bv) return -1 * sign
    if (av > bv) return 1 * sign
    return 0
  })
}

// Merge a remote snapshot's projects (a decrypted `.planner` import or a cross-tab vault
// update) back into local projects — kept deliberately simple (projects carry no updatedAt,
// so there is no LWW). Returns a NEW array; never mutates inputs.
//   - remote project with unknown id → added
//   - remote project with known id   → its name/color are taken as the source of truth
//   - deletion is MONOTONIC: a remote deleted:true tombstones a known project, but can
//     never un-delete a local tombstone. Projects have no updatedAt, so without this
//     "deletion wins" rule a stale snapshot (written before the delete landed) or a
//     cross-tab merge would resurrect a deleted project. There is no project-restore UI.
//   - local projects absent from the snapshot are KEPT (absence ≠ deletion)
export function mergeProjectsFromFile(localProjects, fileProjects) {
  const merged = (localProjects || []).map(p => ({ ...p }))
  const byId = new Map(merged.map(p => [p.id, p]))

  for (const f of fileProjects || []) {
    if (!f || !f.id) continue
    const l = byId.get(f.id)
    if (!l) {
      const project = {
        id: f.id,
        name: f.name ?? '',
        color: f.color ?? '#94a3b8',
        deleted: f.deleted === true,
        createdAt: f.createdAt ?? Date.now(),
      }
      merged.push(project)
      byId.set(project.id, project)
    } else {
      if (f.name != null) l.name = f.name
      if (f.color != null) l.color = f.color
      if (f.deleted === true) l.deleted = true // monotonic — never resurrect a tombstone
    }
  }
  return merged
}

// Full task-level LWW merge of a DECRYPTED remote vault snapshot into local tasks — used for
// cross-tab sync, where the "remote" is the same encrypted vault another tab just wrote to the
// shared IndexedDB. The remote IS the full encrypted vault, so `note` is merged too (it never
// leaves the encrypted store).
// Returns a NEW array; never mutates inputs.
//   - remote task with unknown id → added (clamped enums)
//   - remote task newer (updatedAt) → adopt all fields incl. note (clamped enums)
//   - local-only / older-or-equal → kept as-is
export function mergeVaultTasks(localTasks, remoteTasks) {
  const merged = (localTasks || []).map(t => ({ ...t }))
  const byId = new Map(merged.map(t => [t.id, t]))

  for (const r of remoteTasks || []) {
    if (!r || !r.id) continue
    const l = byId.get(r.id)
    if (!l) {
      const task = {
        ...r,
        status: clampStatus(r.status),
        priority: clampPriority(r.priority),
        tags: Array.isArray(r.tags) ? [...r.tags] : [],
        note: typeof r.note === 'string' ? r.note : '',
      }
      merged.push(task)
      byId.set(task.id, task)
    } else if ((r.updatedAt || 0) > (l.updatedAt || 0)) {
      Object.assign(l, r, {
        status: clampStatus(r.status, l.status),
        priority: clampPriority(r.priority, l.priority),
        tags: Array.isArray(r.tags) ? [...r.tags] : l.tags,
        note: typeof r.note === 'string' ? r.note : l.note,
      })
    }
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
