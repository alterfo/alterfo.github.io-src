import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  state,
  selectedProjectId,
  selectedTaskId,
  addProject,
  renameProject,
  removeProject,
  addTask,
  updateTask,
  removeTask,
  isOverdue,
  isDueToday,
  visibleTasks,
  sortTasks,
  mergeProjectsFromFile,
  mergeVaultTasks,
  loadData,
  getSnapshot,
  resetState,
} from './store.js'

beforeEach(() => {
  resetState()
})

// Plain task factory for the pure-helper tests (no reactivity needed).
function task(partial = {}) {
  const now = Date.now()
  return {
    id: 't1',
    projectId: 'p1',
    title: 'Task',
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    tags: [],
    note: '',
    deleted: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

describe('addProject / addTask defaults', () => {
  it('addProject creates a project with id, color, createdAt', () => {
    const p = addProject('Site', '#1accff')
    assert.equal(p.name, 'Site')
    assert.equal(p.color, '#1accff')
    assert.ok(p.id)
    assert.equal(p.deleted, false)
    assert.equal(typeof p.createdAt, 'number')
    assert.equal(state.projects.length, 1)
  })

  it('addTask applies the documented defaults', () => {
    const p = addProject('Site', '#1accff')
    const t = addTask(p.id, 'Ship sitemap')
    assert.equal(t.projectId, p.id)
    assert.equal(t.title, 'Ship sitemap')
    assert.equal(t.status, 'todo')
    assert.equal(t.priority, 'medium')
    assert.equal(t.dueDate, null)
    assert.deepEqual(t.tags, [])
    assert.equal(t.note, '')
    assert.equal(t.deleted, false)
    assert.equal(typeof t.createdAt, 'number')
    assert.equal(t.createdAt, t.updatedAt)
    assert.equal(state.tasks.length, 1)
  })
})

describe('updateTask', () => {
  it('merges the patch and bumps updatedAt', () => {
    const t = addTask('p1', 'Original')
    t.updatedAt = 1 // force an old timestamp so the bump is observable
    updateTask(t.id, { title: 'Renamed', priority: 'high' })
    const stored = state.tasks.find(x => x.id === t.id)
    assert.equal(stored.title, 'Renamed')
    assert.equal(stored.priority, 'high')
    assert.ok(stored.updatedAt > 1)
  })

  it('is a no-op for an unknown id', () => {
    updateTask('nope', { title: 'X' })
    assert.equal(state.tasks.length, 0)
  })
})

describe('removeTask / removeProject', () => {
  it('removeTask deletes the task hard', () => {
    const t = addTask('p1', 'Bye')
    removeTask(t.id)
    assert.equal(state.tasks.length, 0)
  })

  it('removeProject tombstones the project and its tasks (no hard splice → no resurrection)', () => {
    const p = addProject('Site', '#fff')
    const a = addTask(p.id, 'a')
    const b = addTask(p.id, 'b')
    const other = addTask('other', 'keep me')
    removeProject(p.id)
    // The project stays in the array as a tombstone so the deletion can propagate through the
    // merges, but it is flagged deleted (and filtered out of the UI via liveProjects).
    assert.equal(state.projects.length, 1)
    assert.equal(state.projects[0].deleted, true)
    // Its tasks are tombstoned with a bumped updatedAt (so the task LWW merge adopts the delete).
    assert.equal(state.tasks.find(t => t.id === a.id).deleted, true)
    assert.equal(state.tasks.find(t => t.id === b.id).deleted, true)
    // A task in a different project is untouched.
    assert.equal(state.tasks.find(t => t.id === other.id).deleted, false)
  })

  it('renameProject updates the name', () => {
    const p = addProject('Old', '#fff')
    renameProject(p.id, 'New')
    assert.equal(state.projects[0].name, 'New')
  })

  it('removeTask clears selectedTaskId when it points at the removed task', () => {
    const t = addTask('p1', 'Bye')
    selectedTaskId.value = t.id
    removeTask(t.id)
    assert.equal(selectedTaskId.value, null)
  })

  it('removeTask leaves a different selection untouched', () => {
    const keep = addTask('p1', 'Keep')
    const gone = addTask('p1', 'Gone')
    selectedTaskId.value = keep.id
    removeTask(gone.id)
    assert.equal(selectedTaskId.value, keep.id)
  })

  it('removeProject clears selectedProjectId when it points at the removed project', () => {
    const p = addProject('Site', '#fff')
    selectedProjectId.value = p.id
    removeProject(p.id)
    assert.equal(selectedProjectId.value, null)
  })
})

describe('isOverdue', () => {
  const today = '2026-06-10'

  it('true when dueDate < today and not done', () => {
    assert.equal(isOverdue(task({ dueDate: '2026-06-09' }), today), true)
  })

  it('false when dueDate is today', () => {
    assert.equal(isOverdue(task({ dueDate: '2026-06-10' }), today), false)
  })

  it('false when dueDate in the future', () => {
    assert.equal(isOverdue(task({ dueDate: '2026-06-11' }), today), false)
  })

  it('false when no dueDate', () => {
    assert.equal(isOverdue(task({ dueDate: null }), today), false)
  })

  it('false when overdue but already done', () => {
    assert.equal(isOverdue(task({ dueDate: '2026-06-01', status: 'done' }), today), false)
  })
})

describe('isDueToday', () => {
  const today = '2026-06-10'

  it('true when dueDate equals today and not done', () => {
    assert.equal(isDueToday(task({ dueDate: '2026-06-10' }), today), true)
  })

  it('false when dueDate is not today', () => {
    assert.equal(isDueToday(task({ dueDate: '2026-06-09' }), today), false)
  })

  it('false when no dueDate', () => {
    assert.equal(isDueToday(task({ dueDate: null }), today), false)
  })

  it('false when due today but done', () => {
    assert.equal(isDueToday(task({ dueDate: '2026-06-10', status: 'done' }), today), false)
  })
})

describe('visibleTasks', () => {
  const tasks = [
    task({ id: 'a', projectId: 'p1', status: 'todo', tags: ['seo'] }),
    task({ id: 'b', projectId: 'p1', status: 'done', tags: ['ui'] }),
    task({ id: 'c', projectId: 'p2', status: 'todo', tags: ['seo', 'ui'] }),
    task({ id: 'd', projectId: 'p1', status: 'todo', deleted: true }),
  ]

  it('hides deleted tombstones', () => {
    const ids = visibleTasks(tasks, {}).map(t => t.id)
    assert.deepEqual(ids.sort(), ['a', 'b', 'c'])
  })

  it('filters by project', () => {
    const ids = visibleTasks(tasks, { projectId: 'p1' }).map(t => t.id)
    assert.deepEqual(ids.sort(), ['a', 'b'])
  })

  it('filters by tag', () => {
    const ids = visibleTasks(tasks, { tag: 'seo' }).map(t => t.id)
    assert.deepEqual(ids.sort(), ['a', 'c'])
  })

  it('filters by status', () => {
    const ids = visibleTasks(tasks, { status: 'done' }).map(t => t.id)
    assert.deepEqual(ids, ['b'])
  })

  it('hideDone drops done tasks', () => {
    const ids = visibleTasks(tasks, { hideDone: true }).map(t => t.id)
    assert.deepEqual(ids.sort(), ['a', 'c'])
  })

  it('filters by priority', () => {
    const prioTasks = [
      task({ id: 'a', priority: 'high' }),
      task({ id: 'b', priority: 'low' }),
      task({ id: 'c', priority: 'high' }),
    ]
    const ids = visibleTasks(prioTasks, { priority: 'high' }).map(t => t.id)
    assert.deepEqual(ids.sort(), ['a', 'c'])
  })

  it('multi-tag filter uses OR semantics (task includes ANY)', () => {
    const ids = visibleTasks(tasks, { tags: ['ui'] }).map(t => t.id)
    assert.deepEqual(ids.sort(), ['b', 'c'])
    const ids2 = visibleTasks(tasks, { tags: ['seo', 'ui'] }).map(t => t.id)
    assert.deepEqual(ids2.sort(), ['a', 'b', 'c'])
  })

  it('empty tags array is ignored (no filtering)', () => {
    const ids = visibleTasks(tasks, { tags: [] }).map(t => t.id)
    assert.deepEqual(ids.sort(), ['a', 'b', 'c'])
  })
})

describe('sortTasks', () => {
  it('sorts by title asc/desc and does not mutate the input', () => {
    const tasks = [task({ id: 'b', title: 'Banana' }), task({ id: 'a', title: 'apple' })]
    const asc = sortTasks(tasks, 'title', 'asc').map(t => t.id)
    assert.deepEqual(asc, ['a', 'b']) // case-insensitive
    const desc = sortTasks(tasks, 'title', 'desc').map(t => t.id)
    assert.deepEqual(desc, ['b', 'a'])
    // input untouched
    assert.deepEqual(tasks.map(t => t.id), ['b', 'a'])
  })

  it('sorts by priority using rank order (low<medium<high), not alphabetical', () => {
    const tasks = [
      task({ id: 'h', priority: 'high' }),
      task({ id: 'l', priority: 'low' }),
      task({ id: 'm', priority: 'medium' }),
    ]
    assert.deepEqual(sortTasks(tasks, 'priority', 'asc').map(t => t.id), ['l', 'm', 'h'])
    assert.deepEqual(sortTasks(tasks, 'priority', 'desc').map(t => t.id), ['h', 'm', 'l'])
  })

  it('sorts by status using kanban order (todo<in-progress<done)', () => {
    const tasks = [
      task({ id: 'd', status: 'done' }),
      task({ id: 't', status: 'todo' }),
      task({ id: 'p', status: 'in-progress' }),
    ]
    assert.deepEqual(sortTasks(tasks, 'status', 'asc').map(t => t.id), ['t', 'p', 'd'])
  })

  it('sorts by due date with nulls last in ascending order', () => {
    const tasks = [
      task({ id: 'none', dueDate: null }),
      task({ id: 'late', dueDate: '2026-07-01' }),
      task({ id: 'soon', dueDate: '2026-06-15' }),
    ]
    assert.deepEqual(sortTasks(tasks, 'due', 'asc').map(t => t.id), ['soon', 'late', 'none'])
  })

  it('sorts by project display name via projectNameById', () => {
    const tasks = [
      task({ id: 'a', projectId: 'p1' }),
      task({ id: 'b', projectId: 'p2' }),
    ]
    const names = { p1: 'Zeta', p2: 'Alpha' }
    assert.deepEqual(sortTasks(tasks, 'project', 'asc', names).map(t => t.id), ['b', 'a'])
  })

  it('sorts by joined tags case-insensitively', () => {
    const tasks = [
      task({ id: 'z', tags: ['Zebra'] }),
      task({ id: 'a', tags: ['alpha', 'beta'] }),
      task({ id: 'm', tags: ['Mango'] }),
    ]
    assert.deepEqual(sortTasks(tasks, 'tags', 'asc').map(t => t.id), ['a', 'm', 'z'])
    assert.deepEqual(sortTasks(tasks, 'tags', 'desc').map(t => t.id), ['z', 'm', 'a'])
  })
})

describe('mergeVaultTasks (cross-tab full LWW, note-aware)', () => {
  it('adds a remote-only task including its note', () => {
    const local = [task({ id: 'a', updatedAt: 100 })]
    const remote = [task({ id: 'b', note: 'secret', updatedAt: 200 })]
    const merged = mergeVaultTasks(local, remote)
    assert.equal(merged.length, 2)
    assert.equal(merged.find(t => t.id === 'b').note, 'secret')
  })

  it('newer remote task overwrites note too (full vault LWW, note included)', () => {
    const local = [task({ id: 'a', note: 'old note', title: 'Old', updatedAt: 100 })]
    const remote = [task({ id: 'a', note: 'new note', title: 'New', updatedAt: 200 })]
    const merged = mergeVaultTasks(local, remote)
    const t = merged.find(x => x.id === 'a')
    assert.equal(t.title, 'New')
    assert.equal(t.note, 'new note')
  })

  it('older-or-equal remote task is ignored (local wins)', () => {
    const local = [task({ id: 'a', title: 'Local', note: 'keep', updatedAt: 300 })]
    const remote = [task({ id: 'a', title: 'Remote', note: 'drop', updatedAt: 100 })]
    const merged = mergeVaultTasks(local, remote)
    assert.equal(merged.find(t => t.id === 'a').title, 'Local')
    assert.equal(merged.find(t => t.id === 'a').note, 'keep')
  })

  it('local-only task is kept', () => {
    const local = [task({ id: 'a', updatedAt: 100 }), task({ id: 'b', updatedAt: 100 })]
    const remote = [task({ id: 'a', updatedAt: 50 })]
    const merged = mergeVaultTasks(local, remote)
    assert.deepEqual(merged.map(t => t.id).sort(), ['a', 'b'])
  })

  it('clamps invalid enums from a remote snapshot', () => {
    const remote = [task({ id: 'b', priority: 'urgent', status: 'blocked', updatedAt: 200 })]
    const merged = mergeVaultTasks([], remote)
    const t = merged.find(x => x.id === 'b')
    assert.equal(t.priority, 'medium')
    assert.equal(t.status, 'todo')
  })

  it('does not mutate inputs and is idempotent', () => {
    const original = task({ id: 'a', title: 'Old', updatedAt: 100 })
    const local = [original]
    const remote = [task({ id: 'a', title: 'New', updatedAt: 200 })]
    const once = mergeVaultTasks(local, remote)
    assert.equal(original.title, 'Old') // input untouched
    const twice = mergeVaultTasks(once, remote)
    assert.deepEqual(twice, once)
  })
})

describe('mergeProjectsFromFile', () => {
  it('adds a project that exists only in the file', () => {
    const local = [{ id: 'p1', name: 'Site', color: '#fff', createdAt: 1 }]
    const file = [{ id: 'p2', name: 'Agent project', color: '#000', createdAt: 2 }]
    const merged = mergeProjectsFromFile(local, file)
    assert.equal(merged.length, 2)
    const added = merged.find(p => p.id === 'p2')
    assert.equal(added.name, 'Agent project')
    assert.equal(added.color, '#000')
  })

  it('takes the file name/color as the source of truth for a known project', () => {
    const local = [{ id: 'p1', name: 'Old', color: '#fff', createdAt: 1 }]
    const file = [{ id: 'p1', name: 'Renamed', color: '#123', createdAt: 1 }]
    const merged = mergeProjectsFromFile(local, file)
    const p = merged.find(x => x.id === 'p1')
    assert.equal(p.name, 'Renamed')
    assert.equal(p.color, '#123')
  })

  it('keeps a local project absent from the file (absence ≠ deletion)', () => {
    const local = [
      { id: 'p1', name: 'A', color: '#fff', createdAt: 1 },
      { id: 'p2', name: 'B', color: '#000', createdAt: 1 },
    ]
    const file = [{ id: 'p1', name: 'A', color: '#fff', createdAt: 1 }]
    const merged = mergeProjectsFromFile(local, file)
    assert.equal(merged.length, 2)
    assert.ok(merged.find(p => p.id === 'p2'))
  })

  it('does not mutate the input array or its projects', () => {
    const original = { id: 'p1', name: 'Old', color: '#fff', createdAt: 1 }
    const local = [original]
    mergeProjectsFromFile(local, [{ id: 'p1', name: 'New', color: '#000', createdAt: 1 }])
    assert.equal(original.name, 'Old')
    assert.equal(original.color, '#fff')
    assert.equal(local.length, 1)
  })

  it('is idempotent', () => {
    const local = [{ id: 'p1', name: 'A', color: '#fff', createdAt: 1 }]
    const file = [
      { id: 'p1', name: 'A2', color: '#111', createdAt: 1 },
      { id: 'p2', name: 'B', color: '#222', createdAt: 2 },
    ]
    const once = mergeProjectsFromFile(local, file)
    const twice = mergeProjectsFromFile(once, file)
    assert.deepEqual(twice, once)
  })

  it('skips null and id-less file entries (hand-edited corruption)', () => {
    const local = [{ id: 'p1', name: 'A', color: '#fff', createdAt: 1 }]
    const file = [null, { name: 'no id' }, { id: 'p2', name: 'B', color: '#000', createdAt: 2 }]
    const merged = mergeProjectsFromFile(local, file)
    assert.deepEqual(merged.map(p => p.id).sort(), ['p1', 'p2'])
  })

  it('a file deleted:true tombstones a known local project', () => {
    const local = [{ id: 'p1', name: 'A', color: '#fff', deleted: false, createdAt: 1 }]
    const file = [{ id: 'p1', name: 'A', color: '#fff', deleted: true, createdAt: 1 }]
    const merged = mergeProjectsFromFile(local, file)
    assert.equal(merged.find(p => p.id === 'p1').deleted, true)
  })

  it('deletion is MONOTONIC: a stale file (deleted:false) can NOT resurrect a local tombstone', () => {
    const local = [{ id: 'p1', name: 'A', color: '#fff', deleted: true, createdAt: 1 }]
    const file = [{ id: 'p1', name: 'A', color: '#fff', deleted: false, createdAt: 1 }]
    const merged = mergeProjectsFromFile(local, file)
    assert.equal(merged.find(p => p.id === 'p1').deleted, true) // stays deleted
  })

  it('a known project absent from the file keeps its local tombstone (absence ≠ restoration)', () => {
    const local = [{ id: 'p1', name: 'A', color: '#fff', deleted: true, createdAt: 1 }]
    const merged = mergeProjectsFromFile(local, [])
    assert.equal(merged.find(p => p.id === 'p1').deleted, true)
  })
})

// A project deleted in one tab must NOT come back when the other tab merges in the deleting
// tab's snapshot (the bug both review passes flagged: hard-delete + "absence ≠ deletion" merges
// silently resurrected the project and its tasks). With tombstones the deletion survives.
describe('cross-tab / file project deletion does not resurrect', () => {
  it('deleting a project + tombstoning its tasks survives a round-trip merge', () => {
    // Tab A starts with a project and two tasks, then deletes the project.
    resetState()
    const p = addProject('Site', '#fff')
    const a = addTask(p.id, 'a')
    addTask(p.id, 'b')
    removeProject(p.id)
    const snapshotA = getSnapshot() // what Tab A persists to the shared vault / writes to disk

    // Tab B still has the project + tasks LIVE; it merges Tab A's snapshot in.
    const localProjects = [{ id: p.id, name: 'Site', color: '#fff', deleted: false, createdAt: 1 }]
    const localTasks = [
      task({ id: a.id, projectId: p.id, deleted: false, updatedAt: 1 }),
      task({ id: 'b2', projectId: p.id, deleted: false, updatedAt: 1 }),
    ]
    const mergedProjects = mergeProjectsFromFile(localProjects, snapshotA.projects)
    const mergedTasks = mergeVaultTasks(localTasks, snapshotA.tasks)

    // The project is now a tombstone in Tab B (filtered out of the UI), not a live project.
    assert.equal(mergedProjects.find(x => x.id === p.id).deleted, true)
    // Its tasks that exist in both are tombstoned by the newer updatedAt from Tab A.
    assert.equal(mergedTasks.find(t => t.id === a.id).deleted, true)
  })
})

describe('loadData / getSnapshot', () => {
  it('loadData overwrites both projects and tasks (no stale entries survive)', () => {
    // Seed stale data first so a true overwrite (not a partial merge) is observable.
    loadData({ projects: [{ id: 'old', name: 'Stale', color: '#000', createdAt: 0 }], tasks: [task({ id: 'told' })] })
    loadData({ projects: [{ id: 'p1', name: 'A', color: '#fff', createdAt: 1 }], tasks: [task({ id: 't1' })] })
    assert.deepEqual(state.projects.map(p => p.id), ['p1'])
    assert.deepEqual(state.tasks.map(t => t.id), ['t1'])
  })

  it('getSnapshot returns a deep clone, not a live ref', () => {
    loadData({ projects: [{ id: 'p1', name: 'A', color: '#fff', createdAt: 1 }], tasks: [task({ id: 't1' })] })
    const snap = getSnapshot()
    snap.tasks[0].title = 'mutated'
    assert.notEqual(state.tasks[0].title, 'mutated')
  })
})
