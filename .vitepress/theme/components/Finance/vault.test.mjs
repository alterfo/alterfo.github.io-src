import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyVault,
  upsertTransaction,
  upsertAccount,
  upsertHolding,
  removeTransaction,
  removeAccount,
  removeHolding,
  transactionsInRange,
  openAccounts,
  openHoldings,
  mergeVaults,
  migrateVaultV1toV2,
} from './vault.js'

describe('emptyVault', () => {
  it('has version 2, empty maps, settings with null defaultAccountId, an ISO createdAt', () => {
    const v = emptyVault()
    assert.equal(v.version, 2)
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
    const a = upsertAccount(v, { name: 'Карта', balance: 1000 }, now)
    assert.equal(typeof a.id, 'string')
    assert.equal(a.name, 'Карта')
    assert.equal(a.balance, 1000)
    assert.equal(a.deleted, false)
    assert.equal(a.createdAt, now)
    assert.equal(a.updatedAt, now)
  })

  it('partial edit keeps unspecified fields from the existing account', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const created = upsertAccount(v, { name: 'Карта', balance: 1000 }, t1)
    const edited = upsertAccount(v, { id: created.id, balance: 1500 }, '2026-08-02T10:00:00.000Z')
    assert.equal(edited.name, 'Карта')
    assert.equal(edited.balance, 1500)
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
    assert.equal(migrated.version, 2)
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
    a.version = 2
    const b = emptyVault()
    b.createdAt = '2026-08-05T00:00:00.000Z'
    b.version = 2
    const m = mergeVaults(a, b)
    assert.equal(m.createdAt, '2026-08-01T00:00:00.000Z')
    assert.equal(m.version, 2)
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
    assert.equal(merged.version, 2)
    assert.ok(merged.transactions['e1'])
    assert.equal(merged.transactions['e1'].direction, 'expense')
  })
})
