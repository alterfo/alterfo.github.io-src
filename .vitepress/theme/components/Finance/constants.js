// Finance app id/date helpers + fixed expense category list (mirrors Planner/constants.js).

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

// Small, fixed set — no free-form category management UI in v1 (keeps entry fast).
export const EXPENSE_CATEGORIES = [
  { id: 'food', label: 'Еда' },
  { id: 'transport', label: 'Транспорт' },
  { id: 'housing', label: 'Жильё' },
  { id: 'health', label: 'Здоровье' },
  { id: 'entertainment', label: 'Развлечения' },
  { id: 'shopping', label: 'Покупки' },
  { id: 'other', label: 'Другое' },
]

export const DEFAULT_CATEGORY = 'other'
