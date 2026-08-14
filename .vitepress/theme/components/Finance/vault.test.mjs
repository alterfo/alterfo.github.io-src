import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyVault,
  upsertExpense,
  upsertAccount,
  upsertHolding,
  removeExpense,
  removeAccount,
  removeHolding,
  expensesInRange,
  openAccounts,
  openHoldings,
  mergeVaults,
} from './vault.js'

describe('emptyVault', () => {
  it('has version 1, empty maps, an ISO createdAt', () => {
    const v = emptyVault()
    assert.equal(v.version, 1)
    assert.deepEqual(v.expenses, {})
    assert.deepEqual(v.accounts, {})
    assert.deepEqual(v.holdings, {})
    assert.ok(!Number.isNaN(Date.parse(v.createdAt)))
  })
})

describe('upsertExpense', () => {
  it('creates a new expense with a generated id and defaults', () => {
    const v = emptyVault()
    const now = '2026-08-01T10:00:00.000Z'
    const e = upsertExpense(v, { amount: 500, category: 'food' }, now)
    assert.equal(typeof e.id, 'string')
    assert.equal(e.amount, 500)
    assert.equal(e.category, 'food')
    assert.equal(e.note, '')
    assert.equal(typeof e.date, 'string')
    assert.equal(e.deleted, false)
    assert.equal(e.createdAt, now)
    assert.equal(e.updatedAt, now)
    assert.equal(v.expenses[e.id], e)
  })

  it('falls back to the default category when omitted', () => {
    const v = emptyVault()
    const e = upsertExpense(v, { amount: 100 }, '2026-08-01T10:00:00.000Z')
    assert.equal(e.category, 'other')
  })

  it('edits an existing expense: preserves createdAt, bumps updatedAt', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const t2 = '2026-08-02T10:00:00.000Z'
    const created = upsertExpense(v, { amount: 100, category: 'food' }, t1)
    const edited = upsertExpense(v, { id: created.id, amount: 200 }, t2)
    assert.equal(edited.id, created.id)
    assert.equal(edited.amount, 200)
    assert.equal(edited.category, 'food')
    assert.equal(edited.createdAt, t1)
    assert.equal(edited.updatedAt, t2)
    assert.equal(Object.keys(v.expenses).length, 1)
  })

  it('editing an unknown id creates it fresh rather than throwing', () => {
    const v = emptyVault()
    const e = upsertExpense(v, { id: 'unknown', amount: 50 }, '2026-08-01T10:00:00.000Z')
    assert.equal(e.id, 'unknown')
    assert.equal(e.amount, 50)
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

describe('removeExpense / removeAccount / removeHolding', () => {
  it('tombstones (deleted:true) and bumps updatedAt, never hard-deletes', () => {
    const v = emptyVault()
    const t1 = '2026-08-01T10:00:00.000Z'
    const t2 = '2026-08-02T10:00:00.000Z'
    const e = upsertExpense(v, { amount: 100 }, t1)
    removeExpense(v, e.id, t2)
    assert.equal(v.expenses[e.id].deleted, true)
    assert.equal(v.expenses[e.id].updatedAt, t2)
    assert.equal(Object.keys(v.expenses).length, 1)

    const a = upsertAccount(v, { name: 'x' }, t1)
    removeAccount(v, a.id, t2)
    assert.equal(v.accounts[a.id].deleted, true)

    const h = upsertHolding(v, { ticker: 'SBER' }, t1)
    removeHolding(v, h.id, t2)
    assert.equal(v.holdings[h.id].deleted, true)
  })

  it('is a no-op for an unknown id', () => {
    const v = emptyVault()
    assert.equal(removeExpense(v, 'nope'), undefined)
    assert.equal(removeAccount(v, 'nope'), undefined)
    assert.equal(removeHolding(v, 'nope'), undefined)
  })
})

describe('expensesInRange', () => {
  it('includes dates within range (inclusive), excludes outside and deleted', () => {
    const v = emptyVault()
    upsertExpense(v, { id: 'a', amount: 1, date: '2026-07-31' }, '2026-05-01T00:00:00.000Z')
    upsertExpense(v, { id: 'b', amount: 2, date: '2026-08-01' }, '2026-05-01T00:00:00.000Z')
    upsertExpense(v, { id: 'c', amount: 3, date: '2026-08-15' }, '2026-05-01T00:00:00.000Z')
    upsertExpense(v, { id: 'd', amount: 4, date: '2026-09-01' }, '2026-05-01T00:00:00.000Z')
    upsertExpense(v, { id: 'e', amount: 5, date: '2026-08-10' }, '2026-05-01T00:00:00.000Z')
    removeExpense(v, 'e', '2026-08-11T00:00:00.000Z')

    const inRange = expensesInRange(v, '2026-08-01', '2026-08-31').map(x => x.id)
    assert.deepEqual(inRange, ['b', 'c'])
  })

  it('returns an empty array for an empty vault', () => {
    const v = emptyVault()
    assert.deepEqual(expensesInRange(v, '2026-08-01', '2026-08-31'), [])
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

describe('mergeVaults', () => {
  it('union by id across all three entity maps', () => {
    const a = emptyVault()
    upsertExpense(a, { id: 'e1', amount: 1 }, '2026-08-01T00:00:00.000Z')
    const b = emptyVault()
    upsertAccount(b, { id: 'a1', name: 'x' }, '2026-08-01T00:00:00.000Z')
    upsertHolding(b, { id: 'h1', ticker: 'SBER' }, '2026-08-01T00:00:00.000Z')
    const m = mergeVaults(a, b)
    assert.ok(m.expenses['e1'])
    assert.ok(m.accounts['a1'])
    assert.ok(m.holdings['h1'])
  })

  it('LWW: newer updatedAt wins on a shared id, regardless of merge order', () => {
    const a = emptyVault()
    upsertExpense(a, { id: 'x', amount: 100 }, '2026-08-01T00:00:00.000Z')
    const b = emptyVault()
    upsertExpense(b, { id: 'x', amount: 200 }, '2026-08-05T00:00:00.000Z')
    assert.equal(mergeVaults(a, b).expenses['x'].amount, 200)
    assert.equal(mergeVaults(b, a).expenses['x'].amount, 200)
  })

  it('a tombstone with a newer updatedAt wins over a live older copy', () => {
    const a = emptyVault()
    upsertAccount(a, { id: 'x', name: 'live' }, '2026-08-01T00:00:00.000Z')
    const b = emptyVault()
    upsertAccount(b, { id: 'x', name: 'live' }, '2026-08-01T00:00:00.000Z')
    removeAccount(b, 'x', '2026-08-05T00:00:00.000Z')
    assert.equal(mergeVaults(a, b).accounts['x'].deleted, true)
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

  it('is idempotent: merging a vault with itself is equivalent', () => {
    const a = emptyVault()
    upsertExpense(a, { id: 'x', amount: 100 }, '2026-08-01T00:00:00.000Z')
    const m = mergeVaults(a, a)
    assert.equal(Object.keys(m.expenses).length, 1)
    assert.equal(m.expenses['x'].amount, 100)
  })

  it('does not mutate inputs', () => {
    const a = emptyVault()
    upsertExpense(a, { id: 'x', amount: 100 }, '2026-08-01T00:00:00.000Z')
    const b = emptyVault()
    upsertExpense(b, { id: 'x', amount: 200 }, '2026-08-05T00:00:00.000Z')
    mergeVaults(a, b)
    assert.equal(a.expenses['x'].amount, 100)
    assert.equal(b.expenses['x'].amount, 200)
  })

  it('uses the earliest createdAt and the higher version', () => {
    const a = emptyVault()
    a.createdAt = '2026-08-01T00:00:00.000Z'
    a.version = 2
    const b = emptyVault()
    b.createdAt = '2026-08-05T00:00:00.000Z'
    b.version = 1
    const m = mergeVaults(a, b)
    assert.equal(m.createdAt, '2026-08-01T00:00:00.000Z')
    assert.equal(m.version, 2)
  })
})
