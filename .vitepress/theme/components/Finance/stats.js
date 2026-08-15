const isLive = (x) => x && !x.deleted

export function totalBalance(accounts) {
  return (accounts || []).filter(isLive).reduce((sum, a) => sum + (Number.isFinite(a.balance) ? a.balance : 0), 0)
}

export function spendByCategory(expenses, fromISO, toISO) {
  const live = (expenses || []).filter((e) => isLive(e) && e.date >= fromISO && e.date <= toISO)
  const byCategory = {}
  for (const e of live) {
    const amount = Number.isFinite(e.amount) ? e.amount : 0
    byCategory[e.category] = (byCategory[e.category] || 0) + amount
  }
  return byCategory
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
