import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildRecommendations } from './recommendations.js'

function account({ id = 'acc', openingBalance = 0, openingBalanceAsOf = '1970-01-01T00:00:00.000Z', deleted = false } = {}) {
  return { id, openingBalance, openingBalanceAsOf, deleted }
}

function expense({ amount = 0, date = '2026-06-15', deleted = false } = {}) {
  return {
    amount,
    direction: 'expense',
    category: 'other',
    accountId: null,
    date,
    createdAt: `${date}T00:00:00.000Z`,
    deleted,
  }
}

function holding({ id = 'h', ticker = 'TICK', qty = 1, purchasePrice = 1000, lastPrice = 1000, deleted = false } = {}) {
  return { id, ticker, qty, purchasePrice, lastPrice, deleted }
}

function deposit({ id = 'd', name = 'Вклад', maturityDate = '2026-09-20', closed = false, deleted = false } = {}) {
  return { id, name, maturityDate, closed, deleted }
}

function find(list, id) {
  return list.find((rec) => rec.id === id)
}

describe('buildRecommendations', () => {
  it('returns an empty array for a fresh vault with no accounts, holdings, deposits, or transactions', () => {
    assert.deepEqual(buildRecommendations({
      accounts: [],
      holdings: [],
      deposits: [],
      transactions: [],
    }, '2026-09-06'), [])
  })

  describe('idle cash', () => {
    it('triggers when cash exceeds six months of average expenses', () => {
      const recs = buildRecommendations({
        accounts: [account({ openingBalance: 10000 })],
        holdings: [],
        deposits: [deposit({ maturityDate: '2027-01-01' })],
        transactions: [
          expense({ amount: 1000, date: '2026-06-15' }),
          expense({ amount: 1000, date: '2026-07-15' }),
          expense({ amount: 1000, date: '2026-08-15' }),
        ],
      }, '2026-09-06')

      const rec = find(recs, 'idle-cash')
      assert.ok(rec)
      assert.equal(rec.severity, 'info')
      assert.ok(rec.title.length > 0)
      assert.ok(rec.detail.length > 0)
    })

    it('does not trigger when cash is below the six-month threshold', () => {
      const recs = buildRecommendations({
        accounts: [account({ openingBalance: 5000 })],
        holdings: [],
        deposits: [deposit({ maturityDate: '2027-01-01' })],
        transactions: [
          expense({ amount: 1000, date: '2026-06-15' }),
          expense({ amount: 1000, date: '2026-07-15' }),
          expense({ amount: 1000, date: '2026-08-15' }),
        ],
      }, '2026-09-06')

      assert.equal(find(recs, 'idle-cash'), undefined)
      assert.equal(find(recs, 'no-investments'), undefined)
    })

    it('ignores deleted accounts and expenses', () => {
      const recs = buildRecommendations({
        accounts: [account({ openingBalance: 10000, deleted: true })],
        holdings: [],
        deposits: [],
        transactions: [expense({ amount: 1000, date: '2026-08-15', deleted: true })],
      }, '2026-09-06')

      assert.deepEqual(recs, [])
    })
  })

  describe('portfolio concentration', () => {
    it('triggers when one holding is more than 40% of the portfolio', () => {
      const recs = buildRecommendations({
        accounts: [],
        holdings: [
          holding({ id: 'big', ticker: 'BIG', qty: 8, purchasePrice: 1000, lastPrice: 1000 }),
          holding({ id: 'small', ticker: 'SML', qty: 1, purchasePrice: 1000, lastPrice: 1000 }),
        ],
        deposits: [],
        transactions: [],
      }, '2026-09-06')

      const rec = find(recs, 'portfolio-concentration')
      assert.ok(rec)
      assert.equal(rec.severity, 'warning')
      assert.ok(rec.detail.includes('BIG'))
    })

    it('does not trigger when holdings are roughly balanced', () => {
      const recs = buildRecommendations({
        accounts: [],
        holdings: [
          holding({ id: 'a', ticker: 'AAA', qty: 35, purchasePrice: 10, lastPrice: 10 }),
          holding({ id: 'b', ticker: 'BBB', qty: 33, purchasePrice: 10, lastPrice: 10 }),
          holding({ id: 'c', ticker: 'CCC', qty: 32, purchasePrice: 10, lastPrice: 10 }),
        ],
        deposits: [],
        transactions: [],
      }, '2026-09-06')

      assert.equal(find(recs, 'portfolio-concentration'), undefined)
    })

    it('skips the rule when portfolio value is zero', () => {
      const recs = buildRecommendations({
        accounts: [],
        holdings: [holding({ qty: 0, purchasePrice: 1000, lastPrice: 1000 })],
        deposits: [],
        transactions: [],
      }, '2026-09-06')

      assert.equal(find(recs, 'portfolio-concentration'), undefined)
    })
  })

  describe('deposit maturing soon', () => {
    it('triggers for an open deposit maturing within 30 days, with name and days remaining', () => {
      const recs = buildRecommendations({
        accounts: [],
        holdings: [],
        deposits: [deposit({ id: 'd1', name: 'Накопительный', maturityDate: '2026-09-20' })],
        transactions: [],
      }, '2026-09-06')

      const rec = find(recs, 'deposit-maturing:d1')
      assert.ok(rec)
      assert.equal(rec.severity, 'warning')
      assert.ok(rec.detail.includes('Накопительный'))
      assert.ok(rec.detail.includes('14'))
    })

    it('triggers at the 30-day boundary', () => {
      const recs = buildRecommendations({
        accounts: [],
        holdings: [],
        deposits: [deposit({ id: 'd1', maturityDate: '2026-10-06' })],
        transactions: [],
      }, '2026-09-06')

      assert.ok(find(recs, 'deposit-maturing:d1'))
    })

    it('does not trigger more than 30 days out', () => {
      const recs = buildRecommendations({
        accounts: [],
        holdings: [],
        deposits: [deposit({ id: 'd1', maturityDate: '2026-10-20' })],
        transactions: [],
      }, '2026-09-06')

      assert.equal(find(recs, 'deposit-maturing:d1'), undefined)
    })

    it('ignores closed and deleted deposits', () => {
      const recs = buildRecommendations({
        accounts: [],
        holdings: [],
        deposits: [
          deposit({ id: 'closed', closed: true, maturityDate: '2026-09-20' }),
          deposit({ id: 'deleted', deleted: true, maturityDate: '2026-09-20' }),
        ],
        transactions: [],
      }, '2026-09-06')

      assert.deepEqual(recs, [])
    })
  })

  describe('no investments yet vs idle cash', () => {
    it('fires only the combined start-investing nudge when idle cash exists and there are no investments', () => {
      const recs = buildRecommendations({
        accounts: [account({ openingBalance: 10000 })],
        holdings: [],
        deposits: [],
        transactions: [
          expense({ amount: 1000, date: '2026-06-15' }),
          expense({ amount: 1000, date: '2026-07-15' }),
          expense({ amount: 1000, date: '2026-08-15' }),
        ],
      }, '2026-09-06')

      assert.equal(recs.length, 1)
      assert.equal(recs[0].id, 'no-investments')
      assert.equal(recs[0].severity, 'info')
      assert.equal(find(recs, 'idle-cash'), undefined)
    })

    it('fires idle-cash instead when at least one investment exists', () => {
      const recs = buildRecommendations({
        accounts: [account({ openingBalance: 10000 })],
        holdings: [holding({ ticker: 'TICK', qty: 1, purchasePrice: 100, lastPrice: 100 })],
        deposits: [],
        transactions: [
          expense({ amount: 1000, date: '2026-06-15' }),
          expense({ amount: 1000, date: '2026-07-15' }),
          expense({ amount: 1000, date: '2026-08-15' }),
        ],
      }, '2026-09-06')

      assert.ok(find(recs, 'idle-cash'))
      assert.equal(find(recs, 'no-investments'), undefined)
    })
  })
})
