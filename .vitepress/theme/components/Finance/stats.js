const isLive = (x) => x && !x.deleted

export function totalBalance(accounts) {
  return (accounts || []).filter(isLive).reduce((sum, a) => sum + (Number.isFinite(a.balance) ? a.balance : 0), 0)
}

export function expenseByCategory(transactions, fromISO, toISO) {
  const live = (transactions || []).filter((t) => isLive(t) && t.direction === 'expense' && t.date >= fromISO && t.date <= toISO)
  const byCategory = {}
  for (const t of live) {
    const amount = Number.isFinite(t.amount) ? t.amount : 0
    byCategory[t.category] = (byCategory[t.category] || 0) + amount
  }
  return byCategory
}

export function incomeByCategory(transactions, fromISO, toISO) {
  const live = (transactions || []).filter((t) => isLive(t) && t.direction === 'income' && t.date >= fromISO && t.date <= toISO)
  const byCategory = {}
  for (const t of live) {
    const amount = Number.isFinite(t.amount) ? t.amount : 0
    byCategory[t.category] = (byCategory[t.category] || 0) + amount
  }
  return byCategory
}

export function spendByCategory(expenses, fromISO, toISO) {
  return expenseByCategory(expenses, fromISO, toISO)
}

export function holdingValue(holding) {
  if (!holding) return 0
  const qty = Number.isFinite(holding.qty) ? holding.qty : 0
  const price = Number.isFinite(holding.lastPrice) ? holding.lastPrice : holding.purchasePrice
  return qty * (Number.isFinite(price) ? price : 0)
}

export function portfolioValue(holdings) {
  return (holdings || []).filter(isLive).reduce((sum, h) => sum + holdingValue(h), 0)
}

export function holdingGainLoss(holding) {
  if (!holding) return 0
  const qty = Number.isFinite(holding.qty) ? holding.qty : 0
  const purchasePrice = Number.isFinite(holding.purchasePrice) ? holding.purchasePrice : 0
  const purchaseCommission = Number.isFinite(holding.purchaseCommission) ? holding.purchaseCommission : 0
  return holdingValue(holding) - qty * purchasePrice - purchaseCommission
}

export function portfolioGainLoss(holdings) {
  return (holdings || []).filter(isLive).reduce((sum, h) => sum + holdingGainLoss(h), 0)
}

export function depositAccruedInterest(deposit, asOfISO) {
  if (!deposit || deposit.closed) return 0
  const principal = Number.isFinite(deposit.principal) ? deposit.principal : 0
  const rate = Number.isFinite(deposit.rate) ? deposit.rate : 0
  const openDate = new Date(deposit.openDate + 'T00:00:00Z')
  const maturityDate = new Date(deposit.maturityDate + 'T00:00:00Z')
  const asOfDate = new Date(asOfISO)

  if (asOfDate < openDate) return 0

  const depositTermDays = Math.floor((maturityDate.getTime() - openDate.getTime()) / (1000 * 60 * 60 * 24))
  const elapsedDays = Math.floor((asOfDate.getTime() - openDate.getTime()) / (1000 * 60 * 60 * 24))
  const accrualDays = Math.min(elapsedDays, depositTermDays)

  if (accrualDays <= 0) return 0

  if (!deposit.capitalization) {
    return principal * rate * (accrualDays / 365)
  }

  const dailyRate = rate / 365
  let balance = principal
  for (let i = 0; i < accrualDays; i++) {
    balance *= 1 + dailyRate
  }
  return balance - principal
}

export function depositValue(deposit, asOfISO) {
  if (!deposit) return 0
  const principal = Number.isFinite(deposit.principal) ? deposit.principal : 0
  const interest = depositAccruedInterest(deposit, asOfISO)
  return principal + interest
}

export function netWorth(accounts, holdings, deposits) {
  let worth = totalBalance(accounts) + portfolioValue(holdings)
  if (deposits) {
    worth += Object.values(deposits)
      .filter(isLive)
      .reduce((sum, d) => sum + depositValue(d, new Date().toISOString()), 0)
  }
  return worth
}

export function netForRange(transactions, fromISO, toISO) {
  const expense = Object.values(expenseByCategory(transactions, fromISO, toISO))
    .reduce((sum, val) => sum + val, 0)
  const income = Object.values(incomeByCategory(transactions, fromISO, toISO))
    .reduce((sum, val) => sum + val, 0)
  return {
    income,
    expense,
    net: income - expense,
  }
}

export function periodRange(kind, referenceISO) {
  const refDate = new Date(referenceISO)
  const year = refDate.getFullYear()
  const month = refDate.getMonth()

  if (kind === 'month') {
    const fromDate = new Date(year, month, 1)
    const toDate = new Date(year, month + 1, 0)
    return {
      fromISO: `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`,
      toISO: `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`,
    }
  }

  if (kind === 'year') {
    const fromDate = new Date(year, 0, 1)
    const toDate = new Date(year, 11, 31)
    return {
      fromISO: `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`,
      toISO: `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`,
    }
  }

  if (kind === 'all-time') {
    return {
      fromISO: '1970-01-01',
      toISO: '2999-12-31',
    }
  }

  return { fromISO: '1970-01-01', toISO: '2999-12-31' }
}

export function monthlyTrend(transactions, monthsBack, referenceISO) {
  const refDate = new Date(referenceISO)
  const result = []

  for (let i = monthsBack - 1; i >= 0; i--) {
    const monthDate = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1)
    const year = monthDate.getFullYear()
    const monthNum = monthDate.getMonth()

    const fromDate = new Date(year, monthNum, 1)
    const toDate = new Date(year, monthNum + 1, 0)

    const fromISO = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`
    const toISO = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`

    const range = netForRange(transactions, fromISO, toISO)

    result.push({
      month: `${year}-${String(monthNum + 1).padStart(2, '0')}`,
      income: range.income,
      expense: range.expense,
      net: range.net,
    })
  }

  return result
}
