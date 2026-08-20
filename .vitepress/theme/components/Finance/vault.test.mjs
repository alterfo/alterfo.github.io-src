import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyVault,
  upsertTransaction,
  upsertAccount,
  upsertHolding,
  upsertSettings,
  removeTransaction,
  removeAccount,
  removeHolding,
  discardHolding,
  upsertDeposit,
  removeDeposit,
  openDeposits,
  closeDeposit,
  sellHolding,
  transferBetweenAccounts,
  transactionsInRange,
  openAccounts,
  openHoldings,
  mergeVaults,
  migrateVaultV1toV2,
  migrateAccountBalances,
  migrateVault,
} from './vault.js'
import { accountBalance } from './stats.js'

describe('emptyVault', () => {
  it('has version 3, empty maps, settings with null defaultAccountId, an ISO createdAt', () => {
    const v = emptyVault()
    assert.equal(v.version, 3)
    assert.deepEqual(v.transactions, {})
    assert.deepEqual(v.accounts, {})
    assert.deepEqual(v.holdings, {})
    assert.deepEqual(v.deposits, {})
    assert.equal(v.settings.defaultAccountId, null)
    assert.ok(!Number.isNaN(Date.parse(v.createdAt)))
    assert.ok(!Number.isNaN(Date.parse(v.settings.updatedAt)))
  })
})

describe('upsertTransaction', () => {
  it('creates a new expense transaction with a generated id and defaults', () => {
    const v = emptyVault()
    const now = '2026-08-01T10:00:00.000Z'
    const t = upsertTransaction(v, { amount: 500, direction: 'expense', category: 'food' }, now)
    assert.equal(typeof t.id, 'string')
    assert.equal(t.amount, 500)
    assert.equal(t.direction, 'expense')
    assert.equal(t.category, 'food')
    assert.equal(t.accountId, null)
    assert.equal(t.note, '')
    assert.equal(typeof t.date, 'string')
    assert.equal(t.deleted, false)
    assert.equal(t.createdAt, now)
    assert.equal(t.updatedAt, now)
    assert.equal(v.transactions[t.id], t)
  })

  it('creates a new income transaction with the correct default category', () => {
    const v = emptyVault()
    const now = '2026-08-01T10:00:00.000Z'
    const t = upsertTransaction(v, { amount: 1000, direction: 'income' }, now)
    assert.equal(t.direction, 'income')
    assert.equal(t.category, 'other')
  })

  it('defaults to expense direction when omitted', () => {
    const v = emptyVault()
    const t = upsertTransaction(v, { amount: 100 }, '2026-08-01T10:00:00.000Z')
    assert.equal(t.direction, 'expense')
  })

  it('preserves direction and category across partial edits', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const t2 = '2026-08-02T10:00:00.000Z'
    const created = upsertTransaction(v, { amount: 100, direction: 'income', category: 'dividends' }, t1)
    const edited = upsertTransaction(v, { id: created.id, amount: 200 }, t2)
    assert.equal(edited.direction, 'income')
    assert.equal(edited.category, 'dividends')
    assert.equal(edited.amount, 200)
  })

  it('sets and preserves accountId', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const created = upsertTransaction(v, { amount: 100, accountId: 'acc123' }, t1)
    assert.equal(created.accountId, 'acc123')
    const edited = upsertTransaction(v, { id: created.id, amount: 200 }, '2026-08-02T10:00:00.000Z')
    assert.equal(edited.accountId, 'acc123')
  })

  it('edits an unknown id creates it fresh', () => {
    const v = emptyVault()
    const t = upsertTransaction(v, { id: 'unknown', amount: 50 }, '2026-08-01T10:00:00.000Z')
    assert.equal(t.id, 'unknown')
    assert.equal(t.amount, 50)
  })
})

describe('upsertAccount', () => {
  it('creates a new account with a generated id and defaults', () => {
    const v = emptyVault()
    const now = '2026-08-01T10:00:00.000Z'
    const a = upsertAccount(v, { name: 'Карта', openingBalance: 1000 }, now)
    assert.equal(typeof a.id, 'string')
    assert.equal(a.name, 'Карта')
    assert.equal(a.openingBalance, 1000)
    assert.equal(a.openingBalanceAsOf, now)
    assert.equal(a.deleted, false)
    assert.equal(a.createdAt, now)
    assert.equal(a.updatedAt, now)
  })

  it('partial edit keeps unspecified fields from the existing account', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const created = upsertAccount(v, { name: 'Карта', openingBalance: 1000 }, t1)
    const edited = upsertAccount(v, { id: created.id, name: 'Карта Visa' }, '2026-08-02T10:00:00.000Z')
    assert.equal(edited.name, 'Карта Visa')
    assert.equal(edited.openingBalance, 1000)
  })

  it('writing openingBalance resets openingBalanceAsOf to now, even on a partial edit', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const t2 = '2026-08-05T10:00:00.000Z'
    const created = upsertAccount(v, { name: 'Карта', openingBalance: 1000 }, t1)
    assert.equal(created.openingBalanceAsOf, t1)
    const reconciled = upsertAccount(v, { id: created.id, openingBalance: 1234.56 }, t2)
    assert.equal(reconciled.openingBalance, 1234.56)
    assert.equal(reconciled.openingBalanceAsOf, t2)
  })

  it('editing a field other than openingBalance does not reset openingBalanceAsOf', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const t2 = '2026-08-05T10:00:00.000Z'
    const created = upsertAccount(v, { name: 'Карта', openingBalance: 1000 }, t1)
    const renamed = upsertAccount(v, { id: created.id, name: 'Карта Visa' }, t2)
    assert.equal(renamed.openingBalanceAsOf, t1)
  })
})

describe('migrateAccountBalances / migrateVault', () => {
  it('converts a v2 account balance to openingBalance as of its own updatedAt', () => {
    const v = {
      version: 2,
      transactions: {},
      accounts: {
        a1: { id: 'a1', name: 'Карта', balance: 1000, deleted: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' },
      },
      holdings: {},
      deposits: {},
      settings: { defaultAccountId: null, updatedAt: '2026-01-01T00:00:00.000Z' },
    }
    const migrated = migrateAccountBalances(v)
    assert.equal(migrated.accounts.a1.openingBalance, 1000)
    assert.equal(migrated.accounts.a1.openingBalanceAsOf, '2026-06-01T00:00:00.000Z')
    assert.equal(migrated.accounts.a1.balance, undefined)
    assert.equal(migrated.version, 3)
  })

  it('is idempotent: an account that already has openingBalance is left untouched', () => {
    const v = emptyVault()
    const a = upsertAccount(v, { name: 'Карта', openingBalance: 500 }, '2026-08-01T10:00:00.000Z')
    const migrated = migrateAccountBalances(v)
    assert.deepEqual(migrated.accounts[a.id], a)
  })

  it('migrateVault runs v1→v2 then the account-balance migration', () => {
    const v1 = {
      expenses: {
        e1: { id: 'e1', amount: 100, category: 'food', note: '', date: '2026-08-01', deleted: false, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
      },
      accounts: {
        a1: { id: 'a1', name: 'Карта', balance: 2000, deleted: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      },
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const migrated = migrateVault(v1)
    assert.equal(migrated.version, 3)
    assert.equal(migrated.transactions.e1.direction, 'expense')
    assert.equal(migrated.accounts.a1.openingBalance, 2000)
    assert.equal(migrated.accounts.a1.openingBalanceAsOf, '2026-01-01T00:00:00.000Z')
  })
})

describe('upsertHolding', () => {
  it('creates a new holding with generated id, null lastPrice/priceAsOf', () => {
    const v = emptyVault()
    const now = '2026-08-01T10:00:00.000Z'
    const h = upsertHolding(v, { ticker: 'SBER', qty: 10, purchasePrice: 250 }, now)
    assert.equal(typeof h.id, 'string')
    assert.equal(h.ticker, 'SBER')
    assert.equal(h.qty, 10)
    assert.equal(h.purchasePrice, 250)
    assert.equal(h.lastPrice, null)
    assert.equal(h.priceAsOf, null)
    assert.equal(typeof h.purchaseDate, 'string')
  })

  it('sets lastPrice/priceAsOf on a follow-up upsert (price refresh)', () => {
    const v = emptyVault()
    const created = upsertHolding(v, { ticker: 'SBER', qty: 10, purchasePrice: 250 }, '2026-08-01T10:00:00.000Z')
    const refreshed = upsertHolding(
      v,
      { id: created.id, lastPrice: 300, priceAsOf: '2026-08-02T12:00:00.000Z' },
      '2026-08-02T12:00:00.000Z',
    )
    assert.equal(refreshed.lastPrice, 300)
    assert.equal(refreshed.priceAsOf, '2026-08-02T12:00:00.000Z')
    assert.equal(refreshed.ticker, 'SBER')
    assert.equal(refreshed.qty, 10)
  })

  it('explicit null clears lastPrice/priceAsOf (vs. undefined which preserves)', () => {
    const v = emptyVault()
    const created = upsertHolding(v, { ticker: 'SBER', qty: 10 }, '2026-08-01T10:00:00.000Z')
    upsertHolding(v, { id: created.id, lastPrice: 300, priceAsOf: '2026-08-02T00:00:00.000Z' }, '2026-08-02T00:00:00.000Z')
    const cleared = upsertHolding(v, { id: created.id, lastPrice: null, priceAsOf: null }, '2026-08-03T00:00:00.000Z')
    assert.equal(cleared.lastPrice, null)
    assert.equal(cleared.priceAsOf, null)

    const preserved = upsertHolding(v, { id: created.id, qty: 12 }, '2026-08-04T00:00:00.000Z')
    assert.equal(preserved.qty, 12)
  })

  it('sets and persists purchaseCommission through CRUD', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const created = upsertHolding(v, { ticker: 'SBER', qty: 10, purchasePrice: 250, purchaseCommission: 50 }, t1)
    assert.equal(created.purchaseCommission, 50)
    const edited = upsertHolding(v, { id: created.id, qty: 12 }, '2026-08-02T10:00:00.000Z')
    assert.equal(edited.purchaseCommission, 50)
    assert.equal(edited.qty, 12)
  })

  it('defaults purchaseCommission to 0 when omitted', () => {
    const v = emptyVault()
    const h = upsertHolding(v, { ticker: 'SBER', qty: 10 }, '2026-08-01T10:00:00.000Z')
    assert.equal(h.purchaseCommission, 0)
  })
})

describe('upsertSettings', () => {
  it('sets defaultAccountId and bumps updatedAt', () => {
    const v = emptyVault()
    const now = '2026-08-01T10:00:00.000Z'
    const s = upsertSettings(v, { defaultAccountId: 'acc123' }, now)
    assert.equal(s.defaultAccountId, 'acc123')
    assert.equal(s.updatedAt, now)
    assert.equal(v.settings.defaultAccountId, 'acc123')
  })

  it('clears defaultAccountId by setting to null', () => {
    const v = emptyVault()
    upsertSettings(v, { defaultAccountId: 'acc1' }, '2026-08-01T10:00:00.000Z')
    const cleared = upsertSettings(v, { defaultAccountId: null }, '2026-08-02T10:00:00.000Z')
    assert.equal(cleared.defaultAccountId, null)
    assert.equal(cleared.updatedAt, '2026-08-02T10:00:00.000Z')
  })

  it('preserves defaultAccountId when omitted from partial edit', () => {
    const v = emptyVault()
    upsertSettings(v, { defaultAccountId: 'acc1' }, '2026-08-01T10:00:00.000Z')
    const edited = upsertSettings(v, {}, '2026-08-02T10:00:00.000Z')
    assert.equal(edited.defaultAccountId, 'acc1')
    assert.equal(edited.updatedAt, '2026-08-02T10:00:00.000Z')
  })
})

describe('removeTransaction / removeAccount / removeHolding', () => {
  it('tombstones (deleted:true) and bumps updatedAt, never hard-deletes', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const t2 = '2026-08-02T10:00:00.000Z'
    const tx = upsertTransaction(v, { amount: 100 }, t1)
    removeTransaction(v, tx.id, t2)
    assert.equal(v.transactions[tx.id].deleted, true)
    assert.equal(v.transactions[tx.id].updatedAt, t2)
    assert.equal(Object.keys(v.transactions).length, 1)

    const a = upsertAccount(v, { name: 'x' }, t1)
    removeAccount(v, a.id, t2)
    assert.equal(v.accounts[a.id].deleted, true)

    const h = upsertHolding(v, { ticker: 'SBER' }, t1)
    removeHolding(v, h.id, t2)
    assert.equal(v.holdings[h.id].deleted, true)
  })

  it('is a no-op for an unknown id', () => {
    const v = emptyVault()
    assert.equal(removeTransaction(v, 'nope'), undefined)
    assert.equal(removeAccount(v, 'nope'), undefined)
    assert.equal(removeHolding(v, 'nope'), undefined)
  })
})

describe('transactionsInRange', () => {
  it('includes dates within range (inclusive), excludes outside and deleted', () => {
    const v = emptyVault()
    upsertTransaction(v, { id: 'a', amount: 1, direction: 'expense', date: '2026-07-31' }, '2026-05-01T00:00:00.000Z')
    upsertTransaction(v, { id: 'b', amount: 2, direction: 'expense', date: '2026-08-01' }, '2026-05-01T00:00:00.000Z')
    upsertTransaction(v, { id: 'c', amount: 3, direction: 'expense', date: '2026-08-15' }, '2026-05-01T00:00:00.000Z')
    upsertTransaction(v, { id: 'd', amount: 4, direction: 'expense', date: '2026-09-01' }, '2026-05-01T00:00:00.000Z')
    upsertTransaction(v, { id: 'e', amount: 5, direction: 'expense', date: '2026-08-10' }, '2026-05-01T00:00:00.000Z')
    removeTransaction(v, 'e', '2026-08-11T00:00:00.000Z')

    const inRange = transactionsInRange(v, '2026-08-01', '2026-08-31').map(x => x.id)
    assert.deepEqual(inRange, ['b', 'c'])
  })

  it('filters by direction when specified', () => {
    const v = emptyVault()
    upsertTransaction(v, { id: 'a', amount: 100, direction: 'expense', date: '2026-08-01' }, '2026-08-01T00:00:00.000Z')
    upsertTransaction(v, { id: 'b', amount: 1000, direction: 'income', date: '2026-08-01' }, '2026-08-01T00:00:00.000Z')
    upsertTransaction(v, { id: 'c', amount: 50, direction: 'expense', date: '2026-08-02' }, '2026-08-02T00:00:00.000Z')

    const expenses = transactionsInRange(v, '2026-08-01', '2026-08-31', 'expense').map(x => x.id)
    assert.deepEqual(expenses, ['a', 'c'])

    const income = transactionsInRange(v, '2026-08-01', '2026-08-31', 'income').map(x => x.id)
    assert.deepEqual(income, ['b'])

    const all = transactionsInRange(v, '2026-08-01', '2026-08-31').map(x => x.id)
    assert.deepEqual(all, ['a', 'b', 'c'])
  })

  it('returns an empty array for an empty vault', () => {
    const v = emptyVault()
    assert.deepEqual(transactionsInRange(v, '2026-08-01', '2026-08-31'), [])
  })
})

describe('openAccounts / openHoldings', () => {
  it('openAccounts excludes deleted, sorts by name', () => {
    const v = emptyVault()
    upsertAccount(v, { id: 'b', name: 'Б' }, '2026-08-01T00:00:00.000Z')
    upsertAccount(v, { id: 'a', name: 'А' }, '2026-08-01T00:00:00.000Z')
    upsertAccount(v, { id: 'd', name: 'Д' }, '2026-08-01T00:00:00.000Z')
    removeAccount(v, 'd', '2026-08-02T00:00:00.000Z')
    assert.deepEqual(openAccounts(v).map(a => a.id), ['a', 'b'])
  })

  it('openHoldings excludes deleted, sorts by ticker', () => {
    const v = emptyVault()
    upsertHolding(v, { id: 'y', ticker: 'YDEX' }, '2026-08-01T00:00:00.000Z')
    upsertHolding(v, { id: 's', ticker: 'SBER' }, '2026-08-01T00:00:00.000Z')
    upsertHolding(v, { id: 'p', ticker: 'PLZL' }, '2026-08-01T00:00:00.000Z')
    removeHolding(v, 'p', '2026-08-02T00:00:00.000Z')
    assert.deepEqual(openHoldings(v).map(h => h.id), ['s', 'y'])
  })
})

describe('migrateVaultV1toV2', () => {
  it('converts v1 expenses to v2 transactions with direction:expense and accountId:null', () => {
    const v1 = {
      version: 1,
      createdAt: '2026-08-01T00:00:00.000Z',
      expenses: {
        'e1': {
          id: 'e1',
          amount: 100,
          category: 'food',
          note: 'lunch',
          date: '2026-08-01',
          deleted: false,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      },
      accounts: {},
      holdings: {},
    }
    const v2 = migrateVaultV1toV2(v1)
    assert.equal(v2.version, 2)
    assert.ok(v2.transactions['e1'])
    assert.equal(v2.transactions['e1'].direction, 'expense')
    assert.equal(v2.transactions['e1'].accountId, null)
    assert.equal(v2.transactions['e1'].amount, 100)
    assert.equal(v2.transactions['e1'].category, 'food')
    assert.ok(v2.deposits)
    assert.deepEqual(v2.settings.defaultAccountId, null)
  })

  it('is idempotent: running on an already-migrated vault is a no-op', () => {
    const v2 = emptyVault()
    upsertTransaction(v2, { id: 'tx1', amount: 50, direction: 'income' }, '2026-08-01T00:00:00.000Z')
    const migrated = migrateVaultV1toV2(v2)
    assert.deepEqual(migrated.transactions['tx1'], v2.transactions['tx1'])
    assert.equal(migrated.version, v2.version)
  })

  it('preserves all fields from the original expense', () => {
    const v1 = {
      version: 1,
      createdAt: '2026-08-01T00:00:00.000Z',
      expenses: {
        'ex': {
          id: 'ex',
          amount: 999,
          category: 'other',
          note: 'test note',
          date: '2026-08-15',
          deleted: true,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      },
      accounts: {},
      holdings: {},
    }
    const v2 = migrateVaultV1toV2(v1)
    const tx = v2.transactions['ex']
    assert.equal(tx.amount, 999)
    assert.equal(tx.category, 'other')
    assert.equal(tx.note, 'test note')
    assert.equal(tx.date, '2026-08-15')
    assert.equal(tx.deleted, true)
    assert.equal(tx.createdAt, '2026-07-01T00:00:00.000Z')
    assert.equal(tx.updatedAt, '2026-08-01T00:00:00.000Z')
  })
})

describe('mergeVaults', () => {
  it('union by id across all entity maps including deposits and settings', () => {
    const a = emptyVault()
    upsertTransaction(a, { id: 'tx1', amount: 1 }, '2026-08-01T00:00:00.000Z')
    const b = emptyVault()
    upsertAccount(b, { id: 'a1', name: 'x' }, '2026-08-01T00:00:00.000Z')
    upsertHolding(b, { id: 'h1', ticker: 'SBER' }, '2026-08-01T00:00:00.000Z')
    const m = mergeVaults(a, b)
    assert.ok(m.transactions['tx1'])
    assert.ok(m.accounts['a1'])
    assert.ok(m.holdings['h1'])
    assert.ok(m.deposits)
    assert.ok(m.settings)
  })

  it('LWW: newer updatedAt wins on a shared transaction id, regardless of merge order', () => {
    const a = emptyVault()
    upsertTransaction(a, { id: 'x', amount: 100 }, '2026-08-01T00:00:00.000Z')
    const b = emptyVault()
    upsertTransaction(b, { id: 'x', amount: 200 }, '2026-08-05T00:00:00.000Z')
    assert.equal(mergeVaults(a, b).transactions['x'].amount, 200)
    assert.equal(mergeVaults(b, a).transactions['x'].amount, 200)
  })

  it('merges settings by LWW on updatedAt', () => {
    const a = emptyVault()
    a.settings.defaultAccountId = 'acc1'
    a.settings.updatedAt = '2026-08-01T00:00:00.000Z'
    const b = emptyVault()
    b.settings.defaultAccountId = 'acc2'
    b.settings.updatedAt = '2026-08-05T00:00:00.000Z'
    const m1 = mergeVaults(a, b)
    assert.equal(m1.settings.defaultAccountId, 'acc2')
    const m2 = mergeVaults(b, a)
    assert.equal(m2.settings.defaultAccountId, 'acc2')
  })

  it('merges settings: a wins on tie (equal updatedAt)', () => {
    const a = emptyVault()
    a.settings.defaultAccountId = 'acc1'
    a.settings.updatedAt = '2026-08-01T00:00:00.000Z'
    const b = emptyVault()
    b.settings.defaultAccountId = 'acc2'
    b.settings.updatedAt = '2026-08-01T00:00:00.000Z'
    const m1 = mergeVaults(a, b)
    assert.equal(m1.settings.defaultAccountId, 'acc1')
    const m2 = mergeVaults(b, a)
    assert.equal(m2.settings.defaultAccountId, 'acc2')
  })

  it('is commutative (same result regardless of argument order)', () => {
    const a = emptyVault()
    upsertHolding(a, { id: 'shared', ticker: 'OLD' }, '2026-08-01T00:00:00.000Z')
    upsertHolding(a, { id: 'onlyA', ticker: 'A' }, '2026-08-01T00:00:00.000Z')
    const b = emptyVault()
    upsertHolding(b, { id: 'shared', ticker: 'NEW' }, '2026-08-09T00:00:00.000Z')
    upsertHolding(b, { id: 'onlyB', ticker: 'B' }, '2026-08-01T00:00:00.000Z')
    const ab = mergeVaults(a, b)
    const ba = mergeVaults(b, a)
    assert.deepEqual(ab.holdings, ba.holdings)
    assert.equal(ab.holdings['shared'].ticker, 'NEW')
  })

  it('is idempotent: merging a vault with itself returns equivalent state', () => {
    const a = emptyVault()
    upsertTransaction(a, { id: 'x', amount: 100 }, '2026-08-01T00:00:00.000Z')
    const m = mergeVaults(a, a)
    assert.equal(Object.keys(m.transactions).length, 1)
    assert.equal(m.transactions['x'].amount, 100)
  })

  it('does not mutate inputs', () => {
    const a = emptyVault()
    upsertTransaction(a, { id: 'x', amount: 100 }, '2026-08-01T00:00:00.000Z')
    const b = emptyVault()
    upsertTransaction(b, { id: 'x', amount: 200 }, '2026-08-05T00:00:00.000Z')
    mergeVaults(a, b)
    assert.equal(a.transactions['x'].amount, 100)
    assert.equal(b.transactions['x'].amount, 200)
  })

  it('uses the earliest createdAt and the higher version', () => {
    const a = emptyVault()
    a.createdAt = '2026-08-01T00:00:00.000Z'
    a.version = 3
    const b = emptyVault()
    b.createdAt = '2026-08-05T00:00:00.000Z'
    b.version = 3
    const m = mergeVaults(a, b)
    assert.equal(m.createdAt, '2026-08-01T00:00:00.000Z')
    assert.equal(m.version, 3)
  })

  it('automatically migrates v1 vaults during merge', () => {
    const v1 = {
      version: 1,
      createdAt: '2026-08-01T00:00:00.000Z',
      expenses: {
        'e1': {
          id: 'e1',
          amount: 100,
          category: 'food',
          note: '',
          date: '2026-08-01',
          deleted: false,
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      },
      accounts: {},
      holdings: {},
    }
    const v2 = emptyVault()
    const merged = mergeVaults(v1, v2)
    assert.equal(merged.version, 3)
    assert.ok(merged.transactions['e1'])
    assert.equal(merged.transactions['e1'].direction, 'expense')
  })

  it('migrates account balance to openingBalance on both sides before the per-account LWW pick', () => {
    const a = {
      version: 2,
      createdAt: '2026-08-01T00:00:00.000Z',
      transactions: {},
      accounts: {
        acc1: { id: 'acc1', name: 'Карта', balance: 1000, deleted: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      },
      holdings: {},
      deposits: {},
      settings: { defaultAccountId: null, updatedAt: '2026-01-01T00:00:00.000Z' },
    }
    const b = emptyVault()
    const merged = mergeVaults(a, b)
    assert.equal(merged.accounts.acc1.openingBalance, 1000)
    assert.equal(merged.accounts.acc1.openingBalanceAsOf, '2026-01-01T00:00:00.000Z')
    assert.equal(merged.accounts.acc1.balance, undefined)
  })

  it('concurrent same-account transaction adds both survive the merge (union, no LWW drop)', () => {
    const a = emptyVault()
    const acc = upsertAccount(a, { id: 'acc1', name: 'Карта', openingBalance: 1000 }, '2026-08-01T00:00:00.000Z')
    upsertTransaction(a, { id: 'tA', amount: 100, direction: 'expense', accountId: acc.id }, '2026-08-02T10:00:00.000Z')
    const b = emptyVault()
    upsertAccount(b, { id: 'acc1', name: 'Карта', openingBalance: 1000 }, '2026-08-01T00:00:00.000Z')
    upsertTransaction(b, { id: 'tB', amount: 50, direction: 'expense', accountId: acc.id }, '2026-08-02T11:00:00.000Z')
    const merged = mergeVaults(a, b)
    assert.ok(merged.transactions.tA)
    assert.ok(merged.transactions.tB)
    assert.equal(accountBalance(merged.accounts.acc1, Object.values(merged.transactions)), 850)
  })

  it('merges deposits by LWW on updatedAt', () => {
    const a = emptyVault()
    upsertDeposit(a, { id: 'd1', name: 'Вклад 1', principal: 10000 }, '2026-08-01T00:00:00.000Z')
    const b = emptyVault()
    upsertDeposit(b, { id: 'd1', name: 'Вклад 1 (Updated)', principal: 15000 }, '2026-08-05T00:00:00.000Z')
    const m = mergeVaults(a, b)
    assert.equal(m.deposits['d1'].principal, 15000)
  })
})

describe('upsertDeposit', () => {
  it('creates a new deposit with generated id and defaults', () => {
    const v = emptyVault()
    const now = '2026-08-01T10:00:00.000Z'
    const d = upsertDeposit(v, { name: 'Вклад', principal: 50000, rate: 0.12 }, now)
    assert.equal(typeof d.id, 'string')
    assert.equal(d.name, 'Вклад')
    assert.equal(d.principal, 50000)
    assert.equal(d.rate, 0.12)
    assert.equal(d.capitalization, false)
    assert.equal(d.closed, false)
    assert.equal(d.deleted, false)
    assert.equal(typeof d.openDate, 'string')
    assert.equal(typeof d.maturityDate, 'string')
    assert.equal(d.createdAt, now)
    assert.equal(d.updatedAt, now)
    assert.equal(v.deposits[d.id], d)
  })

  it('partial edit preserves unspecified fields', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const t2 = '2026-08-02T10:00:00.000Z'
    const created = upsertDeposit(v, { name: 'Вклад', principal: 50000, rate: 0.12, capitalization: true }, t1)
    const edited = upsertDeposit(v, { id: created.id, principal: 60000 }, t2)
    assert.equal(edited.name, 'Вклад')
    assert.equal(edited.principal, 60000)
    assert.equal(edited.rate, 0.12)
    assert.equal(edited.capitalization, true)
  })

  it('sets and preserves open/maturity dates', () => {
    const v = emptyVault()
    const d = upsertDeposit(v, { name: 'Вклад', openDate: '2026-08-01', maturityDate: '2027-08-01' }, '2026-08-01T00:00:00.000Z')
    assert.equal(d.openDate, '2026-08-01')
    assert.equal(d.maturityDate, '2027-08-01')
  })

  it('on create with fromAccountId, funds the principal via a transfer and stashes sourceTransactionId', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const d = upsertDeposit(v, { name: 'Мой вклад', principal: 50000, rate: 0.12, fromAccountId: 'acc1' }, t1)
    assert.ok(d.sourceTransactionId)
    const funding = v.transactions[d.sourceTransactionId]
    assert.equal(funding.direction, 'transfer')
    assert.equal(funding.accountId, 'acc1')
    assert.equal(funding.toAccountId, null)
    assert.equal(funding.amount, 50000)
    assert.ok(funding.note.includes('Мой вклад'))
  })

  it('without fromAccountId, does not create a funding transaction', () => {
    const v = emptyVault()
    const d = upsertDeposit(v, { name: 'Вклад', principal: 50000 }, '2026-08-01T00:00:00.000Z')
    assert.equal(d.sourceTransactionId, null)
    assert.equal(Object.keys(v.transactions).length, 0)
  })

  it('editing an existing deposit never re-funds, even if fromAccountId is passed again', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const created = upsertDeposit(v, { name: 'Вклад', principal: 50000, fromAccountId: 'acc1' }, t1)
    upsertDeposit(v, { id: created.id, principal: 60000, fromAccountId: 'acc1' }, '2026-08-02T10:00:00.000Z')
    const transferTxs = Object.values(v.transactions).filter(t => t.direction === 'transfer')
    assert.equal(transferTxs.length, 1)
  })
})

describe('removeDeposit', () => {
  it('tombstones (deleted:true) and bumps updatedAt', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const t2 = '2026-08-02T10:00:00.000Z'
    const d = upsertDeposit(v, { name: 'Вклад' }, t1)
    removeDeposit(v, d.id, t2)
    assert.equal(v.deposits[d.id].deleted, true)
    assert.equal(v.deposits[d.id].updatedAt, t2)
  })

  it('is a no-op for an unknown id', () => {
    const v = emptyVault()
    assert.equal(removeDeposit(v, 'nope'), undefined)
  })

  it('refunds the source account by tombstoning the funding transaction when still open', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const d = upsertDeposit(v, { name: 'Вклад', principal: 50000, fromAccountId: 'acc1' }, t1)
    const t2 = '2026-08-02T10:00:00.000Z'
    removeDeposit(v, d.id, t2)
    assert.equal(v.transactions[d.sourceTransactionId].deleted, true)
  })

  it('does not touch the funding transaction once the deposit is closed (closeDeposit already paid out)', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const d = upsertDeposit(v, { name: 'Вклад', principal: 50000, fromAccountId: 'acc1' }, t1)
    closeDeposit(v, { depositId: d.id, payoutAmount: 52000, date: '2026-08-15' }, '2026-08-15T10:00:00.000Z')
    removeDeposit(v, d.id, '2026-08-16T10:00:00.000Z')
    assert.equal(v.transactions[d.sourceTransactionId].deleted, false)
  })

  it('a deposit created without fromAccountId has nothing to refund', () => {
    const v = emptyVault()
    const d = upsertDeposit(v, { name: 'Вклад', principal: 50000 }, '2026-08-01T00:00:00.000Z')
    removeDeposit(v, d.id, '2026-08-02T00:00:00.000Z')
    assert.equal(Object.keys(v.transactions).length, 0)
  })
})

describe('openDeposits', () => {
  it('excludes deleted and closed deposits, sorts by name', () => {
    const v = emptyVault()
    upsertDeposit(v, { id: 'b', name: 'Б' }, '2026-08-01T00:00:00.000Z')
    upsertDeposit(v, { id: 'a', name: 'А' }, '2026-08-01T00:00:00.000Z')
    upsertDeposit(v, { id: 'd', name: 'Д' }, '2026-08-01T00:00:00.000Z')
    removeDeposit(v, 'd', '2026-08-02T00:00:00.000Z')
    upsertDeposit(v, { id: 'c', name: 'В', closed: true }, '2026-08-01T00:00:00.000Z')
    const open = openDeposits(v).map(d => d.id)
    assert.deepEqual(open, ['a', 'b'])
  })

  it('returns an empty array for a vault with no open deposits', () => {
    const v = emptyVault()
    assert.deepEqual(openDeposits(v), [])
  })
})

describe('closeDeposit', () => {
  it('marks deposit closed:true and creates an income transaction for the payout', () => {
    const v = emptyVault()
    const depositId = upsertDeposit(v, { name: 'Мой вклад', principal: 10000 }, '2026-08-01T10:00:00.000Z').id
    upsertSettings(v, { defaultAccountId: 'acc1' }, '2026-08-01T10:00:00.000Z')
    const now = '2026-08-15T10:00:00.000Z'
    const payout = 10500
    closeDeposit(v, { depositId, payoutAmount: payout, date: '2026-08-15' }, now)

    const deposit = v.deposits[depositId]
    assert.equal(deposit.closed, true)
    assert.equal(deposit.updatedAt, now)

    const txs = Object.values(v.transactions).filter(t => !t.deleted && t.category === 'deposit_closure')
    assert.equal(txs.length, 1)
    assert.equal(txs[0].amount, payout)
    assert.equal(txs[0].direction, 'income')
    assert.equal(txs[0].accountId, 'acc1')
    assert.ok(txs[0].note.includes('Мой вклад'))
  })

  it('uses null accountId when settings.defaultAccountId is not set', () => {
    const v = emptyVault()
    const depositId = upsertDeposit(v, { name: 'Вклад' }, '2026-08-01T10:00:00.000Z').id
    closeDeposit(v, { depositId, payoutAmount: 1000, date: '2026-08-15' }, '2026-08-15T10:00:00.000Z')
    const txs = Object.values(v.transactions).filter(t => t.category === 'deposit_closure')
    assert.equal(txs[0].accountId, null)
  })

  it('is a no-op for an unknown depositId', () => {
    const v = emptyVault()
    assert.equal(closeDeposit(v, { depositId: 'nope', payoutAmount: 1000, date: '2026-08-15' }, '2026-08-15T10:00:00.000Z'), undefined)
  })

  it('does not double-close a deposit', () => {
    const v = emptyVault()
    const depositId = upsertDeposit(v, { name: 'Вклад' }, '2026-08-01T10:00:00.000Z').id
    closeDeposit(v, { depositId, payoutAmount: 1000, date: '2026-08-15' }, '2026-08-15T10:00:00.000Z')
    closeDeposit(v, { depositId, payoutAmount: 1100, date: '2026-08-16' }, '2026-08-16T10:00:00.000Z')

    const txs = Object.values(v.transactions).filter(t => t.category === 'deposit_closure')
    assert.equal(txs.length, 2)
  })
})

describe('sellHolding', () => {
  it('full sell removes the holding and creates an income transaction', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const holdingId = upsertHolding(v, { ticker: 'SBER', qty: 10, purchasePrice: 250, purchaseCommission: 50 }, t1).id
    upsertSettings(v, { defaultAccountId: 'acc1' }, t1)

    const t2 = '2026-08-15T10:00:00.000Z'
    sellHolding(v, { holdingId, qty: 10, sellPrice: 300, commission: 30, date: '2026-08-15' }, t2)

    const holding = v.holdings[holdingId]
    assert.equal(holding.deleted, true)
    assert.equal(holding.updatedAt, t2)

    const txs = Object.values(v.transactions).filter(t => !t.deleted && t.category === 'stock_sale')
    assert.equal(txs.length, 1)
    assert.equal(txs[0].amount, 2970)
    assert.equal(txs[0].direction, 'income')
    assert.equal(txs[0].accountId, 'acc1')
    assert.equal(txs[0].note, 'SBER')
  })

  it('partial sell reduces qty and creates an income transaction', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const holdingId = upsertHolding(v, { ticker: 'SBER', qty: 20, purchasePrice: 250, purchaseCommission: 100 }, t1).id
    upsertSettings(v, { defaultAccountId: 'acc1' }, t1)

    const t2 = '2026-08-15T10:00:00.000Z'
    sellHolding(v, { holdingId, qty: 8, sellPrice: 300, commission: 20, date: '2026-08-15' }, t2)

    const holding = v.holdings[holdingId]
    assert.equal(holding.deleted, false)
    assert.equal(holding.qty, 12)
    assert.equal(holding.updatedAt, t2)

    const txs = Object.values(v.transactions).filter(t => t.category === 'stock_sale')
    assert.equal(txs.length, 1)
    assert.equal(txs[0].amount, 2380)
  })

  it('oversell is rejected (returns undefined)', () => {
    const v = emptyVault()
    const holdingId = upsertHolding(v, { ticker: 'SBER', qty: 10, purchasePrice: 250 }, '2026-08-01T10:00:00.000Z').id
    const result = sellHolding(v, { holdingId, qty: 15, sellPrice: 300, commission: 0, date: '2026-08-15' }, '2026-08-15T10:00:00.000Z')
    assert.equal(result, undefined)

    const holding = v.holdings[holdingId]
    assert.equal(holding.qty, 10)
    assert.equal(holding.deleted, false)

    const txs = Object.values(v.transactions).filter(t => t.category === 'stock_sale')
    assert.equal(txs.length, 0)
  })

  it('commission reduces net proceeds', () => {
    const v = emptyVault()
    const holdingId = upsertHolding(v, { ticker: 'SBER', qty: 5, purchasePrice: 100 }, '2026-08-01T10:00:00.000Z').id

    sellHolding(v, { holdingId, qty: 5, sellPrice: 200, commission: 150, date: '2026-08-15' }, '2026-08-15T10:00:00.000Z')

    const txs = Object.values(v.transactions).filter(t => t.category === 'stock_sale')
    assert.equal(txs[0].amount, 850)
  })

  it('is a no-op for an unknown holdingId', () => {
    const v = emptyVault()
    const result = sellHolding(v, { holdingId: 'nope', qty: 10, sellPrice: 300, commission: 0, date: '2026-08-15' }, '2026-08-15T10:00:00.000Z')
    assert.equal(result, undefined)
    assert.equal(Object.keys(v.transactions).length, 0)
  })

  it('uses null accountId when settings.defaultAccountId is not set', () => {
    const v = emptyVault()
    const holdingId = upsertHolding(v, { ticker: 'SBER', qty: 5 }, '2026-08-01T10:00:00.000Z').id
    sellHolding(v, { holdingId, qty: 5, sellPrice: 300, commission: 10, date: '2026-08-15' }, '2026-08-15T10:00:00.000Z')

    const txs = Object.values(v.transactions).filter(t => t.category === 'stock_sale')
    assert.equal(txs[0].accountId, null)
  })

  it('an explicit toAccountId overrides settings.defaultAccountId', () => {
    const v = emptyVault()
    upsertSettings(v, { defaultAccountId: 'acc-default' }, '2026-08-01T10:00:00.000Z')
    const holdingId = upsertHolding(v, { ticker: 'SBER', qty: 5 }, '2026-08-01T10:00:00.000Z').id
    sellHolding(v, { holdingId, qty: 5, sellPrice: 300, commission: 0, date: '2026-08-15', toAccountId: 'acc-chosen' }, '2026-08-15T10:00:00.000Z')

    const txs = Object.values(v.transactions).filter(t => t.category === 'stock_sale')
    assert.equal(txs[0].accountId, 'acc-chosen')
  })
})

describe('transferBetweenAccounts', () => {
  it('creates a single direction:transfer transaction debiting the source and crediting the destination', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const tx = transferBetweenAccounts(v, { fromAccountId: 'acc1', toAccountId: 'acc2', amount: 500, date: '2026-08-01', note: 'На отпуск' }, t1)
    assert.equal(tx.direction, 'transfer')
    assert.equal(tx.category, 'transfer')
    assert.equal(tx.accountId, 'acc1')
    assert.equal(tx.toAccountId, 'acc2')
    assert.equal(tx.amount, 500)
    assert.equal(tx.note, 'На отпуск')
    assert.equal(Object.keys(v.transactions).length, 1)
  })

  it('is a no-op when fromAccountId equals toAccountId', () => {
    const v = emptyVault()
    const result = transferBetweenAccounts(v, { fromAccountId: 'acc1', toAccountId: 'acc1', amount: 100, date: '2026-08-01' }, '2026-08-01T10:00:00.000Z')
    assert.equal(result, undefined)
    assert.equal(Object.keys(v.transactions).length, 0)
  })

  it('is a no-op when either account is missing, or amount is not positive', () => {
    const v = emptyVault()
    assert.equal(transferBetweenAccounts(v, { fromAccountId: null, toAccountId: 'acc2', amount: 100, date: '2026-08-01' }), undefined)
    assert.equal(transferBetweenAccounts(v, { fromAccountId: 'acc1', toAccountId: null, amount: 100, date: '2026-08-01' }), undefined)
    assert.equal(transferBetweenAccounts(v, { fromAccountId: 'acc1', toAccountId: 'acc2', amount: 0, date: '2026-08-01' }), undefined)
    assert.equal(transferBetweenAccounts(v, { fromAccountId: 'acc1', toAccountId: 'acc2', amount: -5, date: '2026-08-01' }), undefined)
    assert.equal(Object.keys(v.transactions).length, 0)
  })
})

describe('upsertHolding funding (fromAccountId)', () => {
  it('on create with fromAccountId, funds the purchase via a transfer and stashes purchaseTransactionId', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const h = upsertHolding(v, { ticker: 'SBER', qty: 10, purchasePrice: 250, purchaseCommission: 50, fromAccountId: 'acc1' }, t1)
    assert.ok(h.purchaseTransactionId)
    const funding = v.transactions[h.purchaseTransactionId]
    assert.equal(funding.direction, 'transfer')
    assert.equal(funding.accountId, 'acc1')
    assert.equal(funding.toAccountId, null)
    assert.equal(funding.amount, 2550) // 10*250 + 50
    assert.equal(funding.note, 'SBER')
  })

  it('without fromAccountId, does not create a funding transaction', () => {
    const v = emptyVault()
    const h = upsertHolding(v, { ticker: 'SBER', qty: 10, purchasePrice: 250 }, '2026-08-01T10:00:00.000Z')
    assert.equal(h.purchaseTransactionId, null)
    assert.equal(Object.keys(v.transactions).length, 0)
  })

  it('editing an existing holding never re-funds, even if fromAccountId is passed again', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const created = upsertHolding(v, { ticker: 'SBER', qty: 10, purchasePrice: 250, fromAccountId: 'acc1' }, t1)
    upsertHolding(v, { id: created.id, qty: 12, fromAccountId: 'acc1' }, '2026-08-02T10:00:00.000Z')
    const transferTxs = Object.values(v.transactions).filter(t => t.direction === 'transfer')
    assert.equal(transferTxs.length, 1)
  })
})

describe('discardHolding', () => {
  it('tombstones the holding and refunds the funding transaction', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const h = upsertHolding(v, { ticker: 'SBER', qty: 10, purchasePrice: 250, fromAccountId: 'acc1' }, t1)
    const t2 = '2026-08-02T10:00:00.000Z'
    discardHolding(v, h.id, t2)
    assert.equal(v.holdings[h.id].deleted, true)
    assert.equal(v.transactions[h.purchaseTransactionId].deleted, true)
  })

  it('is a no-op for an unknown id', () => {
    const v = emptyVault()
    assert.equal(discardHolding(v, 'nope'), undefined)
  })

  it('a holding created without fromAccountId has nothing to refund', () => {
    const v = emptyVault()
    const h = upsertHolding(v, { ticker: 'SBER', qty: 10 }, '2026-08-01T10:00:00.000Z')
    discardHolding(v, h.id, '2026-08-02T10:00:00.000Z')
    assert.equal(v.holdings[h.id].deleted, true)
    assert.equal(Object.keys(v.transactions).length, 0)
  })

  it('sellHolding (full sale via removeHolding) does NOT refund the funding transaction', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const h = upsertHolding(v, { ticker: 'SBER', qty: 10, purchasePrice: 250, fromAccountId: 'acc1' }, t1)
    sellHolding(v, { holdingId: h.id, qty: 10, sellPrice: 300, commission: 0, date: '2026-08-15' }, '2026-08-15T10:00:00.000Z')
    assert.equal(v.transactions[h.purchaseTransactionId].deleted, false)
  })
})
