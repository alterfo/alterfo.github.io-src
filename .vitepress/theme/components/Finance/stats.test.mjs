import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  totalBalance,
  spendByCategory,
  expenseByCategory,
  incomeByCategory,
  holdingValue,
  portfolioValue,
  holdingGainLoss,
  portfolioGainLoss,
  netWorth,
  depositAccruedInterest,
  depositValue,
  netForRange,
  periodRange,
  monthlyTrend,
} from './stats.js'

function account({ balance = 0, deleted = false } = {}) {
  return { balance, deleted }
}

function transaction({ amount = 0, direction = 'expense', category = 'other', date = '2026-08-01', deleted = false } = {}) {
  return { amount, direction, category, date, deleted }
}

function expense({ amount = 0, category = 'other', date = '2026-08-01', deleted = false } = {}) {
  return transaction({ amount, direction: 'expense', category, date, deleted })
}

function holding({ qty = 0, purchasePrice = 0, purchaseCommission = 0, lastPrice = null, deleted = false } = {}) {
  return { qty, purchasePrice, purchaseCommission, lastPrice, deleted }
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

describe('expenseByCategory', () => {
  it('is an empty object for an empty/undefined transaction list', () => {
    assert.deepEqual(expenseByCategory([], '2026-08-01', '2026-08-31'), {})
    assert.deepEqual(expenseByCategory(undefined, '2026-08-01', '2026-08-31'), {})
  })

  it('buckets a single expense under its category', () => {
    const transactions = [transaction({ amount: 300, direction: 'expense', category: 'food', date: '2026-08-05' })]
    assert.deepEqual(expenseByCategory(transactions, '2026-08-01', '2026-08-31'), { food: 300 })
  })

  it('aggregates multiple expenses across categories and dates, excluding out-of-range and deleted', () => {
    const transactions = [
      transaction({ amount: 300, direction: 'expense', category: 'food', date: '2026-08-05' }),
      transaction({ amount: 200, direction: 'expense', category: 'food', date: '2026-08-10' }),
      transaction({ amount: 100, direction: 'expense', category: 'transport', date: '2026-08-15' }),
      transaction({ amount: 999, direction: 'expense', category: 'food', date: '2026-07-31' }), // out of range
      transaction({ amount: 999, direction: 'expense', category: 'food', date: '2026-08-20', deleted: true }), // deleted
    ]
    assert.deepEqual(expenseByCategory(transactions, '2026-08-01', '2026-08-31'), {
      food: 500,
      transport: 100,
    })
  })

  it('ignores income transactions', () => {
    const transactions = [
      transaction({ amount: 300, direction: 'expense', category: 'food', date: '2026-08-05' }),
      transaction({ amount: 1000, direction: 'income', category: 'salary', date: '2026-08-10' }),
    ]
    assert.deepEqual(expenseByCategory(transactions, '2026-08-01', '2026-08-31'), { food: 300 })
  })

  it('treats a non-finite amount as 0, never NaN', () => {
    const result = expenseByCategory([transaction({ amount: NaN, direction: 'expense', category: 'food', date: '2026-08-01' })], '2026-08-01', '2026-08-31')
    assert.equal(result.food, 0)
  })
})

describe('incomeByCategory', () => {
  it('is an empty object for an empty/undefined transaction list', () => {
    assert.deepEqual(incomeByCategory([], '2026-08-01', '2026-08-31'), {})
    assert.deepEqual(incomeByCategory(undefined, '2026-08-01', '2026-08-31'), {})
  })

  it('buckets a single income under its category', () => {
    const transactions = [transaction({ amount: 500, direction: 'income', category: 'salary', date: '2026-08-05' })]
    assert.deepEqual(incomeByCategory(transactions, '2026-08-01', '2026-08-31'), { salary: 500 })
  })

  it('aggregates multiple incomes across categories and dates, excluding out-of-range and deleted', () => {
    const transactions = [
      transaction({ amount: 500, direction: 'income', category: 'salary', date: '2026-08-05' }),
      transaction({ amount: 200, direction: 'income', category: 'dividends', date: '2026-08-10' }),
      transaction({ amount: 100, direction: 'income', category: 'salary', date: '2026-08-15' }),
      transaction({ amount: 999, direction: 'income', category: 'salary', date: '2026-07-31' }), // out of range
      transaction({ amount: 999, direction: 'income', category: 'salary', date: '2026-08-20', deleted: true }), // deleted
    ]
    assert.deepEqual(incomeByCategory(transactions, '2026-08-01', '2026-08-31'), {
      salary: 600,
      dividends: 200,
    })
  })

  it('ignores expense transactions', () => {
    const transactions = [
      transaction({ amount: 300, direction: 'expense', category: 'food', date: '2026-08-05' }),
      transaction({ amount: 1000, direction: 'income', category: 'salary', date: '2026-08-10' }),
    ]
    assert.deepEqual(incomeByCategory(transactions, '2026-08-01', '2026-08-31'), { salary: 1000 })
  })
})

describe('spendByCategory', () => {
  it('is a legacy alias for expenseByCategory', () => {
    const transactions = [
      transaction({ amount: 300, direction: 'expense', category: 'food', date: '2026-08-05' }),
      transaction({ amount: 100, direction: 'expense', category: 'transport', date: '2026-08-15' }),
    ]
    assert.deepEqual(spendByCategory(transactions, '2026-08-01', '2026-08-31'), { food: 300, transport: 100 })
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

  it('subtracts purchaseCommission from gain/loss', () => {
    const h = holding({ qty: 10, purchasePrice: 250, purchaseCommission: 100, lastPrice: 300 })
    assert.equal(holdingGainLoss(h), 400)
  })

  it('reduces a positive gain when commission is present', () => {
    const h = holding({ qty: 5, purchasePrice: 100, purchaseCommission: 50, lastPrice: 150 })
    const noCommission = holding({ qty: 5, purchasePrice: 100, purchaseCommission: 0, lastPrice: 150 })
    assert.equal(holdingGainLoss(h), holdingGainLoss(noCommission) - 50)
  })

  it('makes a gain negative when commission exceeds the raw gain', () => {
    const h = holding({ qty: 10, purchasePrice: 250, purchaseCommission: 600, lastPrice: 300 })
    assert.equal(holdingGainLoss(h), -100)
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

  it('subtracts purchaseCommissions from aggregated gain/loss', () => {
    const holdings = [
      holding({ qty: 10, purchasePrice: 250, purchaseCommission: 100, lastPrice: 300 }), // +500 - 100 = +400
      holding({ qty: 5, purchasePrice: 100, purchaseCommission: 50, lastPrice: 80 }), // -100 - 50 = -150
    ]
    assert.equal(portfolioGainLoss(holdings), 250)
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

  it('excludes closed and deleted deposits', () => {
    const accounts = [account({ balance: 1000 })]
    const holdings = []
    const deposits = {
      open: { principal: 10000, rate: 0.12, openDate: '2026-08-01', maturityDate: '2027-08-01', capitalization: false, closed: false, deleted: false },
      closed: { principal: 20000, rate: 0.12, openDate: '2026-08-01', maturityDate: '2027-08-01', capitalization: false, closed: true, deleted: false },
      deleted: { principal: 30000, rate: 0.12, openDate: '2026-08-01', maturityDate: '2027-08-01', capitalization: false, closed: false, deleted: true },
    }
    const worth = netWorth(accounts, holdings, deposits)
    const withOnlyOpen = netWorth(accounts, holdings, { open: deposits.open })
    assert.equal(worth, withOnlyOpen)
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

describe('netForRange', () => {
  it('returns zero totals for an empty/undefined transaction list', () => {
    assert.deepEqual(netForRange([], '2026-08-01', '2026-08-31'), { income: 0, expense: 0, net: 0 })
    assert.deepEqual(netForRange(undefined, '2026-08-01', '2026-08-31'), { income: 0, expense: 0, net: 0 })
  })

  it('computes income, expense, and net for a single transaction', () => {
    const transactions = [transaction({ amount: 500, direction: 'income', category: 'salary', date: '2026-08-05' })]
    assert.deepEqual(netForRange(transactions, '2026-08-01', '2026-08-31'), { income: 500, expense: 0, net: 500 })
  })

  it('aggregates mixed income and expense transactions', () => {
    const transactions = [
      transaction({ amount: 1000, direction: 'income', category: 'salary', date: '2026-08-05' }),
      transaction({ amount: 300, direction: 'expense', category: 'food', date: '2026-08-10' }),
      transaction({ amount: 200, direction: 'income', category: 'dividends', date: '2026-08-15' }),
      transaction({ amount: 100, direction: 'expense', category: 'transport', date: '2026-08-20' }),
    ]
    assert.deepEqual(netForRange(transactions, '2026-08-01', '2026-08-31'), { income: 1200, expense: 400, net: 800 })
  })

  it('excludes out-of-range and deleted transactions', () => {
    const transactions = [
      transaction({ amount: 1000, direction: 'income', category: 'salary', date: '2026-08-05' }),
      transaction({ amount: 500, direction: 'income', category: 'salary', date: '2026-07-31' }), // out of range
      transaction({ amount: 300, direction: 'expense', category: 'food', date: '2026-08-10', deleted: true }), // deleted
    ]
    assert.deepEqual(netForRange(transactions, '2026-08-01', '2026-08-31'), { income: 1000, expense: 0, net: 1000 })
  })
})

describe('periodRange', () => {
  it('returns the current month range for kind="month"', () => {
    const result = periodRange('month', '2026-08-15T10:00:00Z')
    assert.equal(result.fromISO, '2026-08-01')
    assert.equal(result.toISO, '2026-08-31')
  })

  it('returns the month range for January', () => {
    const result = periodRange('month', '2026-01-15T10:00:00Z')
    assert.equal(result.fromISO, '2026-01-01')
    assert.equal(result.toISO, '2026-01-31')
  })

  it('returns the month range for February in a leap year', () => {
    const result = periodRange('month', '2024-02-15T10:00:00Z')
    assert.equal(result.fromISO, '2024-02-01')
    assert.equal(result.toISO, '2024-02-29')
  })

  it('returns the month range for February in a non-leap year', () => {
    const result = periodRange('month', '2026-02-15T10:00:00Z')
    assert.equal(result.fromISO, '2026-02-01')
    assert.equal(result.toISO, '2026-02-28')
  })

  it('returns the current year range for kind="year"', () => {
    const result = periodRange('year', '2026-08-15T10:00:00Z')
    assert.equal(result.fromISO, '2026-01-01')
    assert.equal(result.toISO, '2026-12-31')
  })

  it('returns a wide range for kind="all-time"', () => {
    const result = periodRange('all-time', '2026-08-15T10:00:00Z')
    assert.equal(result.fromISO, '1970-01-01')
    assert.equal(result.toISO, '2999-12-31')
  })

  it('returns all-time range for an unknown kind', () => {
    const result = periodRange('unknown', '2026-08-15T10:00:00Z')
    assert.equal(result.fromISO, '1970-01-01')
    assert.equal(result.toISO, '2999-12-31')
  })
})

describe('monthlyTrend', () => {
  it('returns the requested number of empty months for an empty transaction list', () => {
    const result = monthlyTrend([], 3, '2026-08-15T10:00:00Z')
    assert.equal(result.length, 3)
    assert.deepEqual(result[0], { month: '2026-06', income: 0, expense: 0, net: 0 })
    assert.deepEqual(result[1], { month: '2026-07', income: 0, expense: 0, net: 0 })
    assert.deepEqual(result[2], { month: '2026-08', income: 0, expense: 0, net: 0 })
  })

  it('aggregates transactions by month', () => {
    const transactions = [
      transaction({ amount: 1000, direction: 'income', category: 'salary', date: '2026-06-15' }),
      transaction({ amount: 300, direction: 'expense', category: 'food', date: '2026-06-20' }),
      transaction({ amount: 2000, direction: 'income', category: 'salary', date: '2026-07-15' }),
      transaction({ amount: 400, direction: 'expense', category: 'food', date: '2026-07-20' }),
      transaction({ amount: 1500, direction: 'income', category: 'salary', date: '2026-08-15' }),
      transaction({ amount: 200, direction: 'expense', category: 'food', date: '2026-08-20' }),
    ]
    const result = monthlyTrend(transactions, 3, '2026-08-15T10:00:00Z')
    assert.equal(result.length, 3)
    assert.deepEqual(result[0], { month: '2026-06', income: 1000, expense: 300, net: 700 })
    assert.deepEqual(result[1], { month: '2026-07', income: 2000, expense: 400, net: 1600 })
    assert.deepEqual(result[2], { month: '2026-08', income: 1500, expense: 200, net: 1300 })
  })

  it('returns months in chronological order (oldest first)', () => {
    const transactions = [
      transaction({ amount: 1000, direction: 'income', category: 'salary', date: '2026-08-15' }),
    ]
    const result = monthlyTrend(transactions, 5, '2026-08-15T10:00:00Z')
    assert.equal(result[0].month, '2026-04')
    assert.equal(result[4].month, '2026-08')
  })

  it('handles transactions only in some months', () => {
    const transactions = [
      transaction({ amount: 500, direction: 'income', category: 'salary', date: '2026-06-15' }),
      transaction({ amount: 300, direction: 'income', category: 'salary', date: '2026-08-15' }),
    ]
    const result = monthlyTrend(transactions, 3, '2026-08-15T10:00:00Z')
    assert.deepEqual(result[0], { month: '2026-06', income: 500, expense: 0, net: 500 })
    assert.deepEqual(result[1], { month: '2026-07', income: 0, expense: 0, net: 0 })
    assert.deepEqual(result[2], { month: '2026-08', income: 300, expense: 0, net: 300 })
  })

  it('excludes deleted transactions', () => {
    const transactions = [
      transaction({ amount: 1000, direction: 'income', category: 'salary', date: '2026-08-15' }),
      transaction({ amount: 500, direction: 'income', category: 'salary', date: '2026-08-20', deleted: true }),
    ]
    const result = monthlyTrend(transactions, 1, '2026-08-15T10:00:00Z')
    assert.deepEqual(result[0], { month: '2026-08', income: 1000, expense: 0, net: 1000 })
  })
})
