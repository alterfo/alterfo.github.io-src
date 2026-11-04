// Planner enums + helpers. Pure (no Vue, no DOM) → node-testable.

// Array (not object) so kanban column order is preserved.
export const STATUS = [
  { id: 'todo', label: 'Todo' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
]

export const PRIORITY = {
  low: { label: 'Low', color: '#6b7280' },
  medium: { label: 'Medium', color: '#f59e0b' },
  high: { label: 'High', color: '#ef4444' },
}

// Short, collision-resistant enough for a single-user local app.
export function makeId() {
  return crypto.randomUUID().slice(0, 8)
}

// Local 'YYYY-MM-DD'. Built from Date getters, NOT toISOString() (which is UTC
// and can shift the day across timezones).
export function todayISO(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
