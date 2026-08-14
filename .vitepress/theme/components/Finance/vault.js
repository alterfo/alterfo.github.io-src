// Pure vault logic for the Finance tracker: no DOM, no crypto, no IndexedDB —
// fully unit-testable under Node 22. Mirrors Decisions/vault.js (id-keyed CRUD with
// tombstone deletes, LWW merge), extended to three entity types (expenses, accounts,
// holdings) instead of one. Shape:
//   { version, createdAt, expenses: { [id]: Expense }, accounts: { [id]: Account },
//     holdings: { [id]: Holding } }

import { makeId, todayISO, DEFAULT_CATEGORY } from './constants.js'

export function emptyVault() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    expenses: {},
    accounts: {},
    holdings: {},
  }
}

// Create or edit an expense. Fields present on `expense` override the stored copy;
// missing fields fall back to the existing expense (partial edit) then to a default.
// createdAt is preserved across edits; updatedAt is always bumped to `now`.
export function upsertExpense(vault, expense, now = new Date().toISOString()) {
  const id = expense.id || makeId()
  const existing = vault.expenses[id]

  const stored = {
    id,
    amount: expense.amount ?? existing?.amount ?? 0,
    category: expense.category ?? existing?.category ?? DEFAULT_CATEGORY,
    note: expense.note ?? existing?.note ?? '',
    date: expense.date ?? existing?.date ?? todayISO(),
    deleted: expense.deleted ?? existing?.deleted ?? false,
    createdAt: existing ? existing.createdAt : (expense.createdAt ?? now),
    updatedAt: now,
  }

  vault.expenses[id] = stored
  return stored
}

// Create or edit an account. Same partial-edit semantics as upsertExpense.
export function upsertAccount(vault, account, now = new Date().toISOString()) {
  const id = account.id || makeId()
  const existing = vault.accounts[id]

  const stored = {
    id,
    name: account.name ?? existing?.name ?? '',
    balance: account.balance ?? existing?.balance ?? 0,
    deleted: account.deleted ?? existing?.deleted ?? false,
    createdAt: existing ? existing.createdAt : (account.createdAt ?? now),
    updatedAt: now,
  }

  vault.accounts[id] = stored
  return stored
}

// Create or edit a holding. lastPrice/priceAsOf use explicit-undefined-vs-null
// semantics (like Decisions' reviewDate) so a caller can clear a cached price with
// `null` while an omitted field preserves the existing cached value.
export function upsertHolding(vault, holding, now = new Date().toISOString()) {
  const id = holding.id || makeId()
  const existing = vault.holdings[id]

  const stored = {
    id,
    ticker: holding.ticker ?? existing?.ticker ?? '',
    qty: holding.qty ?? existing?.qty ?? 0,
    purchaseDate: holding.purchaseDate ?? existing?.purchaseDate ?? todayISO(),
    purchasePrice: holding.purchasePrice ?? existing?.purchasePrice ?? 0,
    lastPrice: holding.lastPrice !== undefined ? holding.lastPrice : (existing?.lastPrice ?? null),
    priceAsOf: holding.priceAsOf !== undefined ? holding.priceAsOf : (existing?.priceAsOf ?? null),
    deleted: holding.deleted ?? existing?.deleted ?? false,
    createdAt: existing ? existing.createdAt : (holding.createdAt ?? now),
    updatedAt: now,
  }

  vault.holdings[id] = stored
  return stored
}

// Tombstone (deleted:true + bump updatedAt) rather than hard-delete — required so the
// LWW merge propagates the deletion to other devices/tabs instead of them resurrecting
// the id as "unknown" (absence ≠ deletion). Returns the entity, or undefined if unknown.
export function removeExpense(vault, id, now = new Date().toISOString()) {
  const e = vault.expenses[id]
  if (!e) return
  e.deleted = true
  e.updatedAt = now
  return e
}

export function removeAccount(vault, id, now = new Date().toISOString()) {
  const a = vault.accounts[id]
  if (!a) return
  a.deleted = true
  a.updatedAt = now
  return a
}

export function removeHolding(vault, id, now = new Date().toISOString()) {
  const h = vault.holdings[id]
  if (!h) return
  h.deleted = true
  h.updatedAt = now
  return h
}

// Non-deleted expenses with date in [fromISO, toISO] (inclusive), sorted ascending.
export function expensesInRange(vault, fromISO, toISO) {
  return Object.values(vault.expenses)
    .filter(e => !e.deleted && e.date >= fromISO && e.date <= toISO)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// Non-deleted accounts, sorted by name.
export function openAccounts(vault) {
  return Object.values(vault.accounts)
    .filter(a => !a.deleted)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Non-deleted holdings, sorted by ticker.
export function openHoldings(vault) {
  return Object.values(vault.holdings)
    .filter(h => !h.deleted)
    .sort((a, b) => a.ticker.localeCompare(b.ticker))
}

// Union-by-id last-write-wins merge (by updatedAt) for one entity map. On equal
// updatedAt, `a` wins (stable).
function mergeEntityMap(a, b) {
  const merged = {}
  const allIds = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const id of allIds) {
    const ea = a[id]
    const eb = b[id]
    if (!ea) merged[id] = { ...eb }
    else if (!eb) merged[id] = { ...ea }
    else merged[id] = (ea.updatedAt || '') >= (eb.updatedAt || '') ? { ...ea } : { ...eb }
  }
  return merged
}

// Union-by-id LWW merge across all three entity maps. Returns a NEW vault; does not
// mutate inputs. Deterministic, commutative, idempotent — safe for file sync / cross-tab
// merge, no CRDT needed.
export function mergeVaults(a, b) {
  return {
    version: Math.max(a.version || 1, b.version || 1),
    createdAt: (a.createdAt || '￿') < (b.createdAt || '￿') ? a.createdAt : b.createdAt,
    expenses: mergeEntityMap(a.expenses || {}, b.expenses || {}),
    accounts: mergeEntityMap(a.accounts || {}, b.accounts || {}),
    holdings: mergeEntityMap(a.holdings || {}, b.holdings || {}),
  }
}
