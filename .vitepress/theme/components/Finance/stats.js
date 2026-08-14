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
  return holdingValue(holding) - qty * purchasePrice
}

export function portfolioGainLoss(holdings) {
  return (holdings || []).filter(isLive).reduce((sum, h) => sum + holdingGainLoss(h), 0)
}

export function netWorth(accounts, holdings) {
  return totalBalance(accounts) + portfolioValue(holdings)
}
