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
    version: 3,
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

// Migrate v2 accounts (a manually-tracked running `balance`) to v3 (`openingBalance` +
// `openingBalanceAsOf`, the reconciliation point `accountBalance` in stats.js derives
// from). Idempotent: an account that already has `openingBalance` is left untouched.
// The old `balance` value becomes the opening balance as of its own `updatedAt` (or
// `createdAt`) — so live transactions already linked to the account (never reflected
// in `balance` before this migration) start counting from that point forward, and
// nothing is double-counted against balances the user already reconciled by hand.
export function migrateAccountBalances(vault, now = new Date().toISOString()) {
  const accounts = {}
  for (const [id, a] of Object.entries(vault.accounts || {})) {
    if (a.openingBalance !== undefined) {
      accounts[id] = a
      continue
    }
    const { balance, ...rest } = a
    accounts[id] = {
      ...rest,
      openingBalance: Number.isFinite(balance) ? balance : 0,
      openingBalanceAsOf: a.updatedAt || a.createdAt || now,
    }
  }
  return { ...vault, accounts, version: Math.max(vault.version || 2, 3) }
}

// Run every migration in order. The one entry point UI code should call on vault load.
export function migrateVault(vault, now = new Date().toISOString()) {
  return migrateAccountBalances(migrateVaultV1toV2(vault), now)
}

// Create or edit a transaction (expense or income). Fields present on `transaction`
// override the stored copy; missing fields fall back to the existing transaction
// (partial edit) then to a default. createdAt is preserved across edits;
// updatedAt is always bumped to `now`.
//
// Deliberately does NOT mutate the linked account's balance: transactions merge by
// union across devices (mergeEntityMap keeps every id), so any account field that
// tried to track a running total would need per-field LWW merge semantics that are
// incompatible with a running total — a concurrent add on two tabs would keep both
// transactions but only one side's increment. Account balance is instead *derived*
// at read time from `account.openingBalance`/`openingBalanceAsOf` plus the (correctly
// unioned) live transactions — see `stats.js`'s `accountBalance`.
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
    toAccountId: transaction.toAccountId ?? existing?.toAccountId ?? null,
    note: transaction.note ?? existing?.note ?? '',
    date: transaction.date ?? existing?.date ?? todayISO(),
    deleted: transaction.deleted ?? existing?.deleted ?? false,
    createdAt: existing ? existing.createdAt : (transaction.createdAt ?? now),
    updatedAt: now,
  }

  vault.transactions[id] = stored
  return stored
}

// A transfer moves money from `fromAccountId` to `toAccountId` (both required, must
// differ) as a single transaction (direction: 'transfer') — one id, so it merges
// atomically across devices instead of two independently-mergeable legs. Excluded from
// expense/income analytics (stats.js filters by direction), so it never pollutes
// income/expense totals or category breakdowns; accountBalance debits the source and
// credits the destination directly. No-op (returns undefined) on invalid input.
export function transferBetweenAccounts(vault, { fromAccountId, toAccountId, amount, date, note }, now = new Date().toISOString()) {
  if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) return
  if (!(amount > 0)) return

  return upsertTransaction(vault, {
    amount,
    direction: 'transfer',
    category: 'transfer',
    accountId: fromAccountId,
    toAccountId,
    note: note || '',
    date: date || todayISO(),
  }, now)
}

// Legacy: alias for backwards compatibility during migration phase (not used after tasks complete).
export function upsertExpense(vault, expense, now = new Date().toISOString()) {
  return upsertTransaction(vault, { ...expense, direction: 'expense' }, now)
}

// Create or edit an account. Same partial-edit semantics as upsertExpense.
// `openingBalance` is a reconciliation point, not a running total: writing it always
// resets `openingBalanceAsOf` to `now`, so `stats.js`'s `accountBalance` derives the
// current balance as openingBalance + every live linked transaction created since.
// Editing another field (e.g. renaming) leaves the baseline untouched.
export function upsertAccount(vault, account, now = new Date().toISOString()) {
  const id = account.id || makeId()
  const existing = vault.accounts[id]
  const openingBalanceProvided = account.openingBalance !== undefined

  const stored = {
    id,
    name: account.name ?? existing?.name ?? '',
    openingBalance: account.openingBalance ?? existing?.openingBalance ?? 0,
    openingBalanceAsOf: openingBalanceProvided ? now : (existing?.openingBalanceAsOf ?? now),
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
// `fromAccountId` only takes effect on CREATE (no `existing`) — it funds the purchase
// with a transfer debiting that account (amount qty*purchasePrice + purchaseCommission),
// and the resulting transaction id is stashed as `purchaseTransactionId` so a later
// `discardHolding` can refund it. Editing an existing holding (qty/price cell edits,
// price refresh) never re-funds, even if `fromAccountId` is passed again.
export function upsertHolding(vault, holding, now = new Date().toISOString()) {
  const id = holding.id || makeId()
  const existing = vault.holdings[id]

  const stored = {
    id,
    ticker: holding.ticker ?? existing?.ticker ?? '',
    qty: holding.qty ?? existing?.qty ?? 0,
    purchaseDate: holding.purchaseDate ?? existing?.purchaseDate ?? todayISO(),
    purchasePrice: holding.purchasePrice ?? existing?.purchasePrice ?? 0,
    purchaseCommission: holding.purchaseCommission ?? existing?.purchaseCommission ?? 0,
    lastPrice: holding.lastPrice !== undefined ? holding.lastPrice : (existing?.lastPrice ?? null),
    priceAsOf: holding.priceAsOf !== undefined ? holding.priceAsOf : (existing?.priceAsOf ?? null),
    purchaseTransactionId: existing ? (existing.purchaseTransactionId ?? null) : null,
    deleted: holding.deleted ?? existing?.deleted ?? false,
    createdAt: existing ? existing.createdAt : (holding.createdAt ?? now),
    updatedAt: now,
  }

  if (!existing && holding.fromAccountId) {
    const funding = transferBetweenAccountOrAsset(vault, {
      fromAccountId: holding.fromAccountId,
      amount: stored.qty * stored.purchasePrice + stored.purchaseCommission,
      date: stored.purchaseDate,
      note: stored.ticker,
    }, now)
    stored.purchaseTransactionId = funding?.id ?? null
  }

  vault.holdings[id] = stored
  return stored
}

// Internal helper: a one-legged transfer that debits `fromAccountId` with no matching
// `toAccountId` credit — used when money leaves the account ledger into a non-account
// asset (deposit principal, holding purchase). Same direction:'transfer'/category:'transfer'
// shape as transferBetweenAccounts so accountBalance and stats.js treat it identically
// (excluded from expense/income analytics, debits the source account).
function transferBetweenAccountOrAsset(vault, { fromAccountId, amount, date, note }, now) {
  if (!fromAccountId || !(amount > 0)) return
  return upsertTransaction(vault, {
    amount,
    direction: 'transfer',
    category: 'transfer',
    accountId: fromAccountId,
    toAccountId: null,
    note: note || '',
    date: date || todayISO(),
  }, now)
}

// Update vault settings (defaultAccountId). Partial-edit semantics:
// fields present on `settings` override the stored value, missing fields
// fall back to the existing value. updatedAt is always bumped to `now`.
export function upsertSettings(vault, settings, now = new Date().toISOString()) {
  const existing = vault.settings || { defaultAccountId: null, updatedAt: '1970-01-01T00:00:00Z' }

  vault.settings = {
    defaultAccountId: settings.defaultAccountId !== undefined ? settings.defaultAccountId : existing.defaultAccountId,
    updatedAt: now,
  }

  return vault.settings
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

// Used by sellHolding (a sale that fully liquidates a position) — deliberately does NOT
// refund the funding transaction, since the sale itself pays out proceeds separately.
export function removeHolding(vault, id, now = new Date().toISOString()) {
  const h = vault.holdings[id]
  if (!h) return
  h.deleted = true
  h.updatedAt = now
  return h
}

// UI-facing "delete this position" (no sale involved): tombstones the holding AND, if
// it was funded via upsertHolding's `fromAccountId`, refunds the source account by
// tombstoning the funding transaction. Distinct from removeHolding (used by sellHolding,
// which must NOT refund — the sale's own proceeds transaction is the payout).
export function discardHolding(vault, id, now = new Date().toISOString()) {
  const h = vault.holdings[id]
  if (!h) return
  if (h.purchaseTransactionId) {
    removeTransaction(vault, h.purchaseTransactionId, now)
  }
  return removeHolding(vault, id, now)
}

export function sellHolding(vault, { holdingId, qty, sellPrice, commission, date, toAccountId }, now = new Date().toISOString()) {
  const holding = vault.holdings[holdingId]
  if (!holding) return
  const holdingQty = Number.isFinite(holding.qty) ? holding.qty : 0
  if (qty > holdingQty) return

  const netProceeds = qty * sellPrice - commission

  if (qty === holdingQty) {
    removeHolding(vault, holdingId, now)
  } else {
    upsertHolding(vault, { id: holdingId, qty: holdingQty - qty }, now)
  }

  upsertTransaction(vault, {
    amount: netProceeds,
    direction: 'income',
    category: 'stock_sale',
    accountId: toAccountId ?? vault.settings?.defaultAccountId ?? null,
    note: holding.ticker,
    date,
  }, now)

  return holding
}

// `fromAccountId` only takes effect on CREATE (no `existing`) — same funding semantics
// as upsertHolding's `fromAccountId`, see there. Stashed as `sourceTransactionId` so
// `removeDeposit` can refund it if the deposit is discarded while still open.
export function upsertDeposit(vault, deposit, now = new Date().toISOString()) {
  const id = deposit.id || makeId()
  const existing = vault.deposits[id]

  const stored = {
    id,
    name: deposit.name ?? existing?.name ?? '',
    principal: deposit.principal ?? existing?.principal ?? 0,
    rate: deposit.rate ?? existing?.rate ?? 0,
    openDate: deposit.openDate ?? existing?.openDate ?? todayISO(),
    maturityDate: deposit.maturityDate ?? existing?.maturityDate ?? todayISO(),
    capitalization: deposit.capitalization ?? existing?.capitalization ?? false,
    closed: deposit.closed ?? existing?.closed ?? false,
    sourceTransactionId: existing ? (existing.sourceTransactionId ?? null) : null,
    deleted: deposit.deleted ?? existing?.deleted ?? false,
    createdAt: existing ? existing.createdAt : (deposit.createdAt ?? now),
    updatedAt: now,
  }

  if (!existing && deposit.fromAccountId) {
    const funding = transferBetweenAccountOrAsset(vault, {
      fromAccountId: deposit.fromAccountId,
      amount: stored.principal,
      date: stored.openDate,
      note: `Вклад: ${stored.name}`,
    }, now)
    stored.sourceTransactionId = funding?.id ?? null
  }

  vault.deposits[id] = stored
  return stored
}

// Tombstones the deposit and, if it was still open and funded via upsertDeposit's
// `fromAccountId`, refunds the source account by tombstoning the funding transaction
// (money "comes back" to the account it left). A deposit closed via closeDeposit
// already has closed:true, so its funding leg is left alone here — closeDeposit pays
// out separately via its own income transaction, refunding on top would double-credit.
export function removeDeposit(vault, id, now = new Date().toISOString()) {
  const d = vault.deposits[id]
  if (!d) return
  if (!d.closed && d.sourceTransactionId) {
    removeTransaction(vault, d.sourceTransactionId, now)
  }
  d.deleted = true
  d.updatedAt = now
  return d
}

export function openDeposits(vault) {
  return Object.values(vault.deposits)
    .filter(d => !d.deleted && !d.closed)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function closeDeposit(vault, { depositId, payoutAmount, date }, now = new Date().toISOString()) {
  const deposit = vault.deposits[depositId]
  if (!deposit) return

  deposit.closed = true
  deposit.updatedAt = now

  upsertTransaction(vault, {
    amount: payoutAmount,
    direction: 'income',
    category: 'deposit_closure',
    accountId: vault.settings?.defaultAccountId ?? null,
    note: `Вклад: ${deposit.name}`,
    date,
  }, now)

  return deposit
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
// merge, no CRDT needed. Runs the full migration chain on both inputs first (not just
// v1→v2): an unmigrated account (still carrying `balance` instead of `openingBalance`)
// must never win the per-account LWW pick and leak the old shape into the merged vault.
export function mergeVaults(a, b) {
  const aMigrated = migrateVault(a)
  const bMigrated = migrateVault(b)
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
