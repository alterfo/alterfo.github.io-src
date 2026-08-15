// Pure vault logic for the Finance tracker: no DOM, no crypto, no IndexedDB —
// fully unit-testable under Node 22. Mirrors Decisions/vault.js (id-keyed CRUD with
// tombstone deletes, LWW merge), extended to four entity types (transactions, accounts,
// holdings, deposits) plus a settings block. Shape:
//   { version, createdAt, transactions: { [id]: Transaction }, accounts: { [id]: Account },
//     holdings: { [id]: Holding }, deposits: { [id]: Deposit },
//     settings: { defaultAccountId, updatedAt } }

import { makeId, todayISO, DEFAULT_CATEGORY, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from './constants.js'

export function emptyVault() {
  const now = new Date().toISOString()
  return {
    version: 2,
    createdAt: now,
    transactions: {},
    accounts: {},
    holdings: {},
    deposits: {},
    settings: {
      defaultAccountId: null,
      updatedAt: now,
    },
  }
}

// Migrate a v1 vault (expenses-based) to v2 (transactions + deposits + settings).
// Idempotent: running on an already-migrated vault is a no-op.
export function migrateVaultV1toV2(vault) {
  if (vault.version >= 2 && vault.transactions) return vault
  const now = vault.createdAt || new Date().toISOString()
  const transactions = {}
  if (vault.expenses) {
    for (const [id, expense] of Object.entries(vault.expenses)) {
      transactions[id] = {
        id: expense.id,
        amount: expense.amount,
        direction: 'expense',
        category: expense.category,
        accountId: null,
        note: expense.note,
        date: expense.date,
        deleted: expense.deleted,
        createdAt: expense.createdAt,
        updatedAt: expense.updatedAt,
      }
    }
  }
  return {
    version: 2,
    createdAt: vault.createdAt || now,
    transactions,
    accounts: vault.accounts || {},
    holdings: vault.holdings || {},
    deposits: {},
    settings: {
      defaultAccountId: null,
      updatedAt: now,
    },
  }
}

// Create or edit a transaction (expense or income). Fields present on `transaction`
// override the stored copy; missing fields fall back to the existing transaction
// (partial edit) then to a default. createdAt is preserved across edits;
// updatedAt is always bumped to `now`.
export function upsertTransaction(vault, transaction, now = new Date().toISOString()) {
  const id = transaction.id || makeId()
  const existing = vault.transactions[id]
  const direction = transaction.direction ?? existing?.direction ?? 'expense'
  const defaultCategory = direction === 'income' ? 'other' : DEFAULT_CATEGORY

  const stored = {
    id,
    amount: transaction.amount ?? existing?.amount ?? 0,
    direction,
    category: transaction.category ?? existing?.category ?? defaultCategory,
    accountId: transaction.accountId ?? existing?.accountId ?? null,
    note: transaction.note ?? existing?.note ?? '',
    date: transaction.date ?? existing?.date ?? todayISO(),
    deleted: transaction.deleted ?? existing?.deleted ?? false,
    createdAt: existing ? existing.createdAt : (transaction.createdAt ?? now),
    updatedAt: now,
  }

  vault.transactions[id] = stored
  return stored
}

// Legacy: alias for backwards compatibility during migration phase (not used after tasks complete).
export function upsertExpense(vault, expense, now = new Date().toISOString()) {
  return upsertTransaction(vault, { ...expense, direction: 'expense' }, now)
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
export function removeTransaction(vault, id, now = new Date().toISOString()) {
  const t = vault.transactions[id]
  if (!t) return
  t.deleted = true
  t.updatedAt = now
  return t
}

// Legacy: alias for backwards compatibility during migration phase.
export function removeExpense(vault, id, now = new Date().toISOString()) {
  return removeTransaction(vault, id, now)
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

// Non-deleted transactions with date in [fromISO, toISO] (inclusive), sorted ascending.
// Optional direction filter: 'expense' | 'income' | undefined (both).
export function transactionsInRange(vault, fromISO, toISO, direction) {
  return Object.values(vault.transactions)
    .filter(t => !t.deleted && t.date >= fromISO && t.date <= toISO && (!direction || t.direction === direction))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// Legacy: alias for backwards compatibility during migration phase.
export function expensesInRange(vault, fromISO, toISO) {
  return transactionsInRange(vault, fromISO, toISO, 'expense')
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

// Merge settings by LWW on updatedAt (independent of transaction/account/holding LWW).
// Returns a merged settings object.
function mergeSettings(aSettings, bSettings) {
  const a = aSettings || { defaultAccountId: null, updatedAt: '1970-01-01T00:00:00Z' }
  const b = bSettings || { defaultAccountId: null, updatedAt: '1970-01-01T00:00:00Z' }
  const aIsNewer = (a.updatedAt || '') >= (b.updatedAt || '')
  return aIsNewer
    ? { defaultAccountId: a.defaultAccountId ?? null, updatedAt: a.updatedAt }
    : { defaultAccountId: b.defaultAccountId ?? null, updatedAt: b.updatedAt }
}

// Union-by-id LWW merge across all entity maps and settings. Returns a NEW vault; does not
// mutate inputs. Deterministic, commutative, idempotent — safe for file sync / cross-tab
// merge, no CRDT needed. Automatically migrates v1 vaults to v2 if needed.
export function mergeVaults(a, b) {
  const aMigrated = migrateVaultV1toV2(a)
  const bMigrated = migrateVaultV1toV2(b)
  return {
    version: Math.max(aMigrated.version || 2, bMigrated.version || 2),
    createdAt: (aMigrated.createdAt || '￿') < (bMigrated.createdAt || '￿') ? aMigrated.createdAt : bMigrated.createdAt,
    transactions: mergeEntityMap(aMigrated.transactions || {}, bMigrated.transactions || {}),
    accounts: mergeEntityMap(aMigrated.accounts || {}, bMigrated.accounts || {}),
    holdings: mergeEntityMap(aMigrated.holdings || {}, bMigrated.holdings || {}),
    deposits: mergeEntityMap(aMigrated.deposits || {}, bMigrated.deposits || {}),
    settings: mergeSettings(aMigrated.settings, bMigrated.settings),
  }
}
