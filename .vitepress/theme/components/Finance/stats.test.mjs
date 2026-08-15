import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  totalBalance,
  spendByCategory,
  holdingValue,
  portfolioValue,
  holdingGainLoss,
  portfolioGainLoss,
  netWorth,
  depositAccruedInterest,
  depositValue,
} from './stats.js'

function account({ balance = 0, deleted = false } = {}) {
  return { balance, deleted }
}

function expense({ amount = 0, category = 'other', date = '2026-08-01', deleted = false } = {}) {
  return { amount, category, date, deleted }
}

function holding({ qty = 0, purchasePrice = 0, lastPrice = null, deleted = false } = {}) {
  return { qty, purchasePrice, lastPrice, deleted }
}

describe('totalBalance', () => {
  it('is 0 for an empty/undefined account list', () => {
    assert.equal(totalBalance([]), 0)
    assert.equal(totalBalance(undefined), 0)
  })

  it('sums a single account', () => {
    assert.equal(totalBalance([account({ balance: 1000 })]), 1000)
  })

  it('sums multiple accounts, excluding deleted ones', () => {
    const accounts = [
      account({ balance: 1000 }),
      account({ balance: 500 }),
      account({ balance: 9999, deleted: true }),
    ]
    assert.equal(totalBalance(accounts), 1500)
  })

  it('treats a non-finite balance as 0, never NaN', () => {
    assert.equal(totalBalance([account({ balance: NaN })]), 0)
    assert.ok(!Number.isNaN(totalBalance([account({ balance: NaN })])))
  })
})

describe('spendByCategory', () => {
  it('is an empty object for an empty/undefined expense list', () => {
    assert.deepEqual(spendByCategory([], '2026-08-01', '2026-08-31'), {})
    assert.deepEqual(spendByCategory(undefined, '2026-08-01', '2026-08-31'), {})
  })

  it('buckets a single expense under its category', () => {
    const expenses = [expense({ amount: 300, category: 'food', date: '2026-08-05' })]
    assert.deepEqual(spendByCategory(expenses, '2026-08-01', '2026-08-31'), { food: 300 })
  })

  it('aggregates multiple expenses across categories and dates, excluding out-of-range and deleted', () => {
    const expenses = [
      expense({ amount: 300, category: 'food', date: '2026-08-05' }),
      expense({ amount: 200, category: 'food', date: '2026-08-10' }),
      expense({ amount: 100, category: 'transport', date: '2026-08-15' }),
      expense({ amount: 999, category: 'food', date: '2026-07-31' }), // out of range
      expense({ amount: 999, category: 'food', date: '2026-08-20', deleted: true }), // deleted
    ]
    assert.deepEqual(spendByCategory(expenses, '2026-08-01', '2026-08-31'), {
      food: 500,
      transport: 100,
    })
  })

  it('treats a non-finite amount as 0, never NaN', () => {
    const result = spendByCategory([expense({ amount: NaN, category: 'food', date: '2026-08-01' })], '2026-08-01', '2026-08-31')
    assert.equal(result.food, 0)
  })
})

describe('holdingValue', () => {
  it('is 0 for a missing holding', () => {
    assert.equal(holdingValue(undefined), 0)
    assert.equal(holdingValue(null), 0)
  })

  it('falls back to purchasePrice when there is no cached lastPrice yet', () => {
    const h = holding({ qty: 10, purchasePrice: 250, lastPrice: null })
    assert.equal(holdingValue(h), 2500)
  })

  it('uses lastPrice when present', () => {
    const h = holding({ qty: 10, purchasePrice: 250, lastPrice: 300 })
    assert.equal(holdingValue(h), 3000)
  })
})

describe('portfolioValue', () => {
  it('is 0 for an empty/undefined holdings list', () => {
    assert.equal(portfolioValue([]), 0)
    assert.equal(portfolioValue(undefined), 0)
  })

  it('sums a single holding', () => {
    assert.equal(portfolioValue([holding({ qty: 10, purchasePrice: 250, lastPrice: 300 })]), 3000)
  })

  it('sums multiple holdings, excluding deleted ones', () => {
    const holdings = [
      holding({ qty: 10, purchasePrice: 250, lastPrice: 300 }), // 3000
      holding({ qty: 5, purchasePrice: 100, lastPrice: null }), // 500 (fallback)
      holding({ qty: 100, purchasePrice: 1, lastPrice: 1, deleted: true }),
    ]
    assert.equal(portfolioValue(holdings), 3500)
  })
})

describe('holdingGainLoss', () => {
  it('is 0 for a missing holding', () => {
    assert.equal(holdingGainLoss(undefined), 0)
  })

  it('is 0 when there is no cached price yet (value falls back to cost basis)', () => {
    const h = holding({ qty: 10, purchasePrice: 250, lastPrice: null })
    assert.equal(holdingGainLoss(h), 0)
  })

  it('computes a positive gain when lastPrice is above purchasePrice', () => {
    const h = holding({ qty: 10, purchasePrice: 250, lastPrice: 300 })
    assert.equal(holdingGainLoss(h), 500)
  })

  it('computes a negative loss when lastPrice is below purchasePrice', () => {
    const h = holding({ qty: 10, purchasePrice: 250, lastPrice: 200 })
    assert.equal(holdingGainLoss(h), -500)
  })
})

describe('portfolioGainLoss', () => {
  it('is 0 for an empty/undefined holdings list', () => {
    assert.equal(portfolioGainLoss([]), 0)
    assert.equal(portfolioGainLoss(undefined), 0)
  })

  it('aggregates gain/loss across multiple holdings, excluding deleted', () => {
    const holdings = [
      holding({ qty: 10, purchasePrice: 250, lastPrice: 300 }), // +500
      holding({ qty: 5, purchasePrice: 100, lastPrice: 80 }), // -100
      holding({ qty: 100, purchasePrice: 1, lastPrice: 1000, deleted: true }),
    ]
    assert.equal(portfolioGainLoss(holdings), 400)
  })
})

describe('netWorth', () => {
  it('is 0 for empty accounts and holdings', () => {
    assert.equal(netWorth([], []), 0)
    assert.equal(netWorth(undefined, undefined), 0)
  })

  it('sums account balances and portfolio value', () => {
    const accounts = [account({ balance: 1000 }), account({ balance: 500 })]
    const holdings = [holding({ qty: 10, purchasePrice: 250, lastPrice: 300 })]
    assert.equal(netWorth(accounts, holdings), 1000 + 500 + 3000)
  })

  it('includes deposit values when deposits are provided', () => {
    const accounts = [account({ balance: 1000 })]
    const holdings = []
    const deposits = {
      d1: { principal: 10000, rate: 0.12, openDate: '2026-08-01', maturityDate: '2027-08-01', capitalization: false, closed: false, deleted: false },
    }
    const worth = netWorth(accounts, holdings, deposits)
    assert.ok(worth > 11000)
  })
})

function deposit({ principal = 0, rate = 0, openDate = '2026-08-01', maturityDate = '2026-12-31', capitalization = false, closed = false, deleted = false } = {}) {
  return { principal, rate, openDate, maturityDate, capitalization, closed, deleted }
}

describe('depositAccruedInterest', () => {
  it('is 0 for a missing deposit', () => {
    assert.equal(depositAccruedInterest(undefined, '2026-08-15T10:00:00Z'), 0)
  })

  it('is 0 for a closed deposit', () => {
    const d = deposit({ principal: 10000, rate: 0.12, openDate: '2026-08-01', maturityDate: '2026-12-31', closed: true })
    assert.equal(depositAccruedInterest(d, '2026-08-15T10:00:00Z'), 0)
  })

  it('is 0 when asOfDate is before openDate', () => {
    const d = deposit({ principal: 10000, rate: 0.12, openDate: '2026-08-01', maturityDate: '2026-12-31' })
    assert.equal(depositAccruedInterest(d, '2026-07-31T10:00:00Z'), 0)
  })

  it('computes simple interest for a non-capitalized deposit after a few days', () => {
    const d = deposit({ principal: 10000, rate: 0.12, openDate: '2026-08-01', maturityDate: '2026-12-31', capitalization: false })
    const interest = depositAccruedInterest(d, '2026-08-15T10:00:00Z')
    const expected = 10000 * 0.12 * (14 / 365)
    assert.ok(Math.abs(interest - expected) < 1)
  })

  it('computes daily compound interest for a capitalized deposit', () => {
    const d = deposit({ principal: 10000, rate: 0.12, openDate: '2026-08-01', maturityDate: '2026-12-31', capitalization: true })
    const interest = depositAccruedInterest(d, '2026-08-15T10:00:00Z')
    const dailyRate = 0.12 / 365
    let balance = 10000
    for (let i = 0; i < 14; i++) {
      balance *= 1 + dailyRate
    }
    const expected = balance - 10000
    assert.ok(Math.abs(interest - expected) < 1)
  })

  it('caps interest accrual at maturity date for simple interest', () => {
    const d = deposit({ principal: 10000, rate: 0.12, openDate: '2026-08-01', maturityDate: '2026-08-15', capitalization: false })
    const interest1 = depositAccruedInterest(d, '2026-08-15T10:00:00Z')
    const interest2 = depositAccruedInterest(d, '2026-09-01T10:00:00Z')
    assert.equal(interest1, interest2)
  })

  it('caps interest accrual at maturity date for compounded interest', () => {
    const d = deposit({ principal: 10000, rate: 0.12, openDate: '2026-08-01', maturityDate: '2026-08-15', capitalization: true })
    const interest1 = depositAccruedInterest(d, '2026-08-15T10:00:00Z')
    const interest2 = depositAccruedInterest(d, '2026-09-01T10:00:00Z')
    assert.equal(interest1, interest2)
  })

  it('returns 0 when elapsed days is 0', () => {
    const d = deposit({ principal: 10000, rate: 0.12, openDate: '2026-08-01', maturityDate: '2026-12-31', capitalization: false })
    assert.equal(depositAccruedInterest(d, '2026-08-01T10:00:00Z'), 0)
  })

  it('treats non-finite principal and rate as 0', () => {
    const d = deposit({ principal: NaN, rate: 0.12, openDate: '2026-08-01', maturityDate: '2026-12-31' })
    assert.equal(depositAccruedInterest(d, '2026-08-15T10:00:00Z'), 0)
  })
})

describe('depositValue', () => {
  it('is 0 for a missing deposit', () => {
    assert.equal(depositValue(undefined, '2026-08-15T10:00:00Z'), 0)
  })

  it('returns principal when no interest has accrued', () => {
    const d = deposit({ principal: 10000, rate: 0.12, openDate: '2026-08-01', maturityDate: '2026-12-31' })
    assert.equal(depositValue(d, '2026-08-01T10:00:00Z'), 10000)
  })

  it('returns principal + accrued interest', () => {
    const d = deposit({ principal: 10000, rate: 0.12, openDate: '2026-08-01', maturityDate: '2026-12-31', capitalization: false })
    const value = depositValue(d, '2026-08-15T10:00:00Z')
    const interest = depositAccruedInterest(d, '2026-08-15T10:00:00Z')
    assert.equal(value, 10000 + interest)
  })
})
