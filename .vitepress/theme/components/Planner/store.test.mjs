import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  state,
  addProject,
  renameProject,
  removeProject,
  addTask,
  updateTask,
  removeTask,
  isOverdue,
  isDueToday,
  visibleTasks,
  projectForFile,
  mergeFromFile,
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

  it('removeProject drops the project and its tasks', () => {
    const p = addProject('Site', '#fff')
    addTask(p.id, 'a')
    addTask(p.id, 'b')
    addTask('other', 'keep me')
    removeProject(p.id)
    assert.equal(state.projects.length, 0)
    assert.equal(state.tasks.length, 1)
    assert.equal(state.tasks[0].projectId, 'other')
  })

  it('renameProject updates the name', () => {
    const p = addProject('Old', '#fff')
    renameProject(p.id, 'New')
    assert.equal(state.projects[0].name, 'New')
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
})

describe('projectForFile (security: strips note)', () => {
  it('omits note from every task and includes the contract readme', () => {
    const snap = {
      projects: [{ id: 'p1', name: 'Site', color: '#fff', createdAt: 1 }],
      tasks: [task({ id: 't1', note: 'TOP SECRET private note' })],
    }
    const file = projectForFile(snap)
    assert.ok(typeof file._readme === 'string' && file._readme.length > 0)
    assert.equal(file.tasks.length, 1)
    assert.equal('note' in file.tasks[0], false)
    // and the whole serialized blob must not contain the secret
    assert.equal(JSON.stringify(file).includes('TOP SECRET'), false)
  })

  it('projects carry only id/name/color/createdAt', () => {
    const snap = {
      projects: [{ id: 'p1', name: 'Site', color: '#fff', createdAt: 1, extra: 'x' }],
      tasks: [],
    }
    const file = projectForFile(snap)
    assert.deepEqual(Object.keys(file.projects[0]).sort(), ['color', 'createdAt', 'id', 'name'])
  })
})

describe('mergeFromFile (LWW, note-safe)', () => {
  it('adds a new task from the file with an empty note', () => {
    const local = [task({ id: 'a', updatedAt: 100 })]
    const file = [{ id: 'b', projectId: 'p1', title: 'Agent task', status: 'todo', priority: 'high', dueDate: null, tags: ['x'], deleted: false, createdAt: 200, updatedAt: 200 }]
    const merged = mergeFromFile(local, file)
    assert.equal(merged.length, 2)
    const added = merged.find(t => t.id === 'b')
    assert.equal(added.title, 'Agent task')
    assert.equal(added.note, '')
  })

  it('newer file updatedAt patches shared fields but preserves note', () => {
    const local = [task({ id: 'a', title: 'Old', status: 'todo', note: 'keep me', updatedAt: 100 })]
    const file = [{ id: 'a', title: 'New', status: 'done', priority: 'high', dueDate: '2026-07-01', tags: ['y'], deleted: false, updatedAt: 200 }]
    const merged = mergeFromFile(local, file)
    const t = merged.find(x => x.id === 'a')
    assert.equal(t.title, 'New')
    assert.equal(t.status, 'done')
    assert.equal(t.dueDate, '2026-07-01')
    assert.deepEqual(t.tags, ['y'])
    assert.equal(t.updatedAt, 200)
    assert.equal(t.note, 'keep me') // note never overwritten by file
  })

  it('older-or-equal file updatedAt is ignored (app copy wins)', () => {
    const local = [task({ id: 'a', title: 'Local newer', updatedAt: 300 })]
    const file = [{ id: 'a', title: 'File older', updatedAt: 100 }]
    const merged = mergeFromFile(local, file)
    assert.equal(merged.find(t => t.id === 'a').title, 'Local newer')

    const fileEqual = [{ id: 'a', title: 'File equal', updatedAt: 300 }]
    const merged2 = mergeFromFile(local, fileEqual)
    assert.equal(merged2.find(t => t.id === 'a').title, 'Local newer')
  })

  it('deleted:true in a newer file entry tombstones the task', () => {
    const local = [task({ id: 'a', deleted: false, updatedAt: 100 })]
    const file = [{ id: 'a', deleted: true, updatedAt: 200 }]
    const merged = mergeFromFile(local, file)
    assert.equal(merged.find(t => t.id === 'a').deleted, true)
  })

  it('local task absent from the file is KEPT (absence ≠ deletion)', () => {
    const local = [task({ id: 'a', updatedAt: 100 }), task({ id: 'b', updatedAt: 100 })]
    const file = [{ id: 'a', title: 'still here', updatedAt: 50 }]
    const merged = mergeFromFile(local, file)
    assert.ok(merged.find(t => t.id === 'b'))
    assert.equal(merged.length, 2)
  })

  it('does not mutate the input array or its tasks', () => {
    const original = task({ id: 'a', title: 'Old', updatedAt: 100 })
    const local = [original]
    const file = [{ id: 'a', title: 'New', updatedAt: 200 }]
    mergeFromFile(local, file)
    assert.equal(original.title, 'Old')
    assert.equal(local.length, 1)
  })

  it('is idempotent for a single user', () => {
    const local = [task({ id: 'a', title: 'X', updatedAt: 100 })]
    const file = [{ id: 'a', title: 'Y', updatedAt: 200 }]
    const once = mergeFromFile(local, file)
    const twice = mergeFromFile(once, file)
    assert.deepEqual(twice, once)
  })

  it('clears dueDate when the newer file sets it to null', () => {
    const local = [task({ id: 'a', dueDate: '2026-06-01', updatedAt: 100 })]
    const file = [{ id: 'a', dueDate: null, updatedAt: 200 }]
    const merged = mergeFromFile(local, file)
    assert.equal(merged.find(t => t.id === 'a').dueDate, null)
  })
})

describe('loadData / getSnapshot', () => {
  it('loadData replaces state and getSnapshot is a deep clone', () => {
    loadData({ projects: [{ id: 'p1', name: 'A', color: '#fff', createdAt: 1 }], tasks: [task({ id: 't1' })] })
    assert.equal(state.projects.length, 1)
    assert.equal(state.tasks.length, 1)
    const snap = getSnapshot()
    snap.tasks[0].title = 'mutated'
    assert.notEqual(state.tasks[0].title, 'mutated') // snapshot is a clone, not a live ref
  })
})
