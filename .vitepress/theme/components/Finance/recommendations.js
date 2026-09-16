// Pure recommendation engine for the Finance dashboard. No DOM, no crypto, no network:
// every rule is a deterministic heuristic over the user's own vault data. Inputs are
// live (non-deleted) arrays, matching what FinanceApp.vue already computes for its
// dashboard (`accountsList`, `holdingsList`, `depositsList`, and
// `Object.values(vault.transactions)`).

import { totalBalance, expenseByCategory, holdingValue, portfolioValue } from './stats.js'

const DAY_MS = 1000 * 60 * 60 * 24
const IDLE_CASH_MONTHS = 6
const CONCENTRATION_THRESHOLD = 0.4
const MATURING_SOON_DAYS = 30
const FULL_MONTHS = 3

const isLive = (entity) => entity && !entity.deleted

function toArray(value) {
  return Array.isArray(value) ? value : Object.values(value || {})
}

function dateOnly(iso) {
  return String(iso || '').slice(0, 10)
}

function parseDate(iso) {
  return new Date(`${dateOnly(iso)}T00:00:00Z`)
}

function formatDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

// Total expenses over the three full calendar months immediately before the reference
// month. The reference month itself is excluded because it is still in progress.
function recentFullMonthExpenses(transactions, referenceISO) {
  const reference = parseDate(referenceISO)
  if (Number.isNaN(reference.getTime())) return 0

  const from = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - FULL_MONTHS, 1))
  const to = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 0))

  const byCategory = expenseByCategory(transactions, formatDate(from), formatDate(to))
  return Object.values(byCategory).reduce((sum, amount) => sum + (Number.isFinite(amount) ? amount : 0), 0)
}

function openHoldings(holdings) {
  return toArray(holdings).filter(isLive)
}

function openDeposits(deposits) {
  return toArray(deposits).filter((deposit) => deposit && !deposit.deleted && !deposit.closed)
}

function idleCashCondition(accounts, transactions, referenceISO) {
  const balance = totalBalance(accounts, transactions)
  const averageMonthlyExpense = recentFullMonthExpenses(transactions, referenceISO) / FULL_MONTHS
  return balance > IDLE_CASH_MONTHS * averageMonthlyExpense
}

export function buildRecommendations({ accounts, holdings, deposits, transactions }, referenceISO) {
  const recommendations = []
  const liveHoldings = openHoldings(holdings)
  const liveDeposits = openDeposits(deposits)
  const hasIdleCash = idleCashCondition(accounts, transactions, referenceISO)

  if (hasIdleCash && liveHoldings.length === 0 && liveDeposits.length === 0) {
    recommendations.push({
      id: 'no-investments',
      severity: 'info',
      title: 'Нет инвестиций',
      detail: 'Свободные деньги превышают резерв на расходы, а вкладов и ценных бумаг пока нет. Начните с вклада или портфеля.',
    })
  } else if (hasIdleCash) {
    recommendations.push({
      id: 'idle-cash',
      severity: 'info',
      title: 'Свободные деньги на счетах',
      detail: 'Накопленный остаток превышает полугодовой запас среднемесячных расходов. Рассмотрите вклад или инвестиции.',
    })
  }

  const portfolio = portfolioValue(liveHoldings)
  if (portfolio > 0) {
    const concentrated = [...liveHoldings].sort((a, b) => holdingValue(b) - holdingValue(a))[0]
    if (holdingValue(concentrated) > CONCENTRATION_THRESHOLD * portfolio) {
      recommendations.push({
        id: 'portfolio-concentration',
        severity: 'warning',
        title: 'Концентрация портфеля',
        detail: `${concentrated.ticker || 'Одна бумага'} занимает более 40% портфеля. Подумайте о диверсификации.`,
      })
    }
  }

  const reference = parseDate(referenceISO)
  for (const deposit of liveDeposits) {
    if (!deposit.maturityDate) continue
    const maturity = parseDate(deposit.maturityDate)
    const daysRemaining = Math.round((maturity.getTime() - reference.getTime()) / DAY_MS)
    if (Number.isFinite(daysRemaining) && daysRemaining >= 0 && daysRemaining <= MATURING_SOON_DAYS) {
      recommendations.push({
        id: `deposit-maturing:${deposit.id}`,
        severity: 'warning',
        title: 'Скоро погашается вклад',
        detail: `${deposit.name}: осталось ${daysRemaining} дн.`,
      })
    }
  }

  return recommendations
}
