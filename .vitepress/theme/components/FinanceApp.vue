<script setup>
// Finance tracker root component — encrypted-vault key lifecycle (unlock / create / lock)
// + expense quick-add + accounts + investments + dashboard. Mirrors DecisionJournal.vue /
// PlannerEditor.vue:
//
// Security model: the passphrase and the derived AES-GCM key are NEVER persisted — only the
// { salt, iterations, iv, ciphertext } envelope is written to IndexedDB (Finance/db.js).
// The key lives ONLY in memory (`cryptoKey` ref) for the session and is re-derived on unlock.
//
// The pure model lives in Finance/vault.js (CRUD + merge), Finance/stats.js (aggregates) and
// Finance/prices.js (MOEX ISS lookup) — all covered by node --test. This file is the
// (browser-only, manually verified) UI + crypto glue.

import { ref, computed, watch, nextTick, onMounted, onUnmounted, defineComponent } from 'vue'
import { deriveKey, randomBytes, encryptJSON, decryptJSON, packEnvelope, unpackEnvelope } from './crypto.js'
import { loadEnvelope, saveEnvelope, cancelPendingSave, saveEnvelopeNow, initCrossTabSync } from './Finance/db.js'
import { exportEnvelope, readEnvelopeFile } from './Finance/exporter.js'
import {
  emptyVault, upsertTransaction, upsertAccount, upsertHolding,
  removeTransaction, removeAccount, removeHolding,
  upsertSettings, transactionsInRange, openAccounts, openHoldings, mergeVaults,
  migrateVault, upsertDeposit, openDeposits, closeDeposit, sellHolding,
} from './Finance/vault.js'
import {
  totalBalance, accountBalance, expenseByCategory, incomeByCategory, portfolioValue, portfolioGainLoss,
  holdingGainLoss, netWorth, netForRange, monthlyTrend, periodRange, depositValue, depositAccruedInterest,
} from './Finance/stats.js'
import { fetchPrice, MoexPriceError } from './Finance/prices.js'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, DEFAULT_CATEGORY, todayISO } from './Finance/constants.js'

const CategoryBar = defineComponent({
  props: { label: String, amount: Number, total: Number },
  setup(props) {
    const fmtRub = (x) => {
      const n = Number.isFinite(x) ? x : 0
      return Math.round(n).toLocaleString('ru-RU') + ' ₽'
    }
    return { fmtRub }
  },
  template: `
    <div class="fin-category-bar">
      <div class="fin-category-label">{{ label }}</div>
      <div class="fin-category-bar-bg">
        <div class="fin-category-bar-fill" :style="{ width: (100 * (amount / (total || 1))) + '%' }"></div>
      </div>
      <div class="fin-category-amount">{{ fmtRub(amount) }}</div>
    </div>
  `
})

const TrendChart = defineComponent({
  props: { data: Array },
  setup(props) {
    const maxValue = () => {
      if (!props.data || !props.data.length) return 1
      return Math.max(...props.data.map(d => Math.max(d.income || 0, d.expense || 0, Math.abs(d.net || 0))))
    }
    const chartData = () => {
      const margin = 40
      const width = 800 - 2 * margin
      const height = 260
      const count = (props.data || []).length
      const barWidth = Math.max(20, width / Math.max(1, count * 1.5))
      return { margin, width, height, barWidth }
    }
    const fmtRub = (x) => {
      const n = Number.isFinite(x) ? x : 0
      if (Math.abs(n) >= 1000000) return (Math.round(n / 100000) / 10) + 'M'
      if (Math.abs(n) >= 1000) return (Math.round(n / 100) / 10) + 'K'
      return Math.round(n).toLocaleString('ru-RU')
    }
    return { maxValue: computed(() => maxValue()), chartData: computed(() => chartData()), fmtRub }
  },
  template: `
    <g>
      <text x="20" y="25" font-size="12" fill="var(--ds-text-muted)" dominant-baseline="middle">{{ fmtRub(maxValue) }}</text>
      <line x1="40" y1="30" x2="760" y2="30" stroke="var(--ds-border)" stroke-width="1" />
      <text x="20" y="150" font-size="12" fill="var(--ds-text-muted)" dominant-baseline="middle">0</text>
      <line x1="40" y1="150" x2="760" y2="150" stroke="var(--ds-border)" stroke-width="1" />
      <text x="20" y="270" font-size="12" fill="var(--ds-text-muted)" dominant-baseline="middle">{{ fmtRub(-maxValue) }}</text>
      <line x1="40" y1="270" x2="760" y2="270" stroke="var(--ds-border)" stroke-width="1" />

      <g v-for="(item, i) in data" :key="i">
        <rect
          :x="40 + i * (chartData.barWidth + 5)"
          :y="150 - (item.income / maxValue) * 120"
          :width="chartData.barWidth * 0.3"
          :height="(item.income / maxValue) * 120"
          fill="#3f5946"
          opacity="0.6" />
        <rect
          :x="40 + i * (chartData.barWidth + 5) + chartData.barWidth * 0.3 + 2"
          :y="150 - (item.expense / maxValue) * 120"
          :width="chartData.barWidth * 0.3"
          :height="(item.expense / maxValue) * 120"
          fill="#8a5568"
          opacity="0.6" />
        <text
          :x="40 + i * (chartData.barWidth + 5) + chartData.barWidth * 0.5"
          y="265"
          font-size="11"
          fill="var(--ds-text-muted)"
          text-anchor="middle">{{ item.month.slice(5) }}</text>
      </g>

      <g class="fin-legend" transform="translate(40, 20)">
        <rect width="12" height="12" fill="#3f5946" opacity="0.6" />
        <text x="16" y="10" font-size="12" fill="var(--ds-text-muted)">Доход</text>
        <rect x="70" width="12" height="12" fill="#8a5568" opacity="0.6" />
        <text x="86" y="10" font-size="12" fill="var(--ds-text-muted)">Расход</text>
      </g>
    </g>
  `
})

const ITERATIONS = 600000

// ---- In-memory key + salt (never persisted; dropped on lock) ----
const cryptoKey = ref(null)
let _salt = null

// ---- Reactive UI state ----
const phase = ref('loading')      // 'loading' | 'locked' | 'unlocked'
const hasVault = ref(false)
const passphrase = ref('')
const confirmPassphrase = ref('')
const error = ref('')
const busy = ref(false)

// The decrypted vault (plain object, deeply reactive via ref). Empty when locked.
const vault = ref(emptyVault())

const view = ref('dashboard') // 'dashboard' | 'accounts' | 'investments'
const dashboardPeriod = ref('month') // 'month' | 'year' | 'all-time'
const trendMonths = ref(6) // 6 or 12

// ---- Selectors over the vault ----
const accountsList = computed(() => openAccounts(vault.value))
const holdingsList = computed(() => openHoldings(vault.value))
const recentTransactions = computed(() => transactionsInRange(vault.value, '0000-01-01', todayISO()).slice(-8).reverse())

function monthRange() {
  const now = new Date()
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  return [start, todayISO()]
}

const currentPeriodRange = computed(() => {
  const { fromISO, toISO } = periodRange(dashboardPeriod.value, todayISO())
  return [fromISO, toISO || '2999-12-31']
})

const periodStats = computed(() => {
  const [from, to] = currentPeriodRange.value
  return netForRange(Object.values(vault.value.transactions), from, to)
})

const expenseByPeriodCat = computed(() => {
  const [from, to] = currentPeriodRange.value
  return expenseByCategory(Object.values(vault.value.transactions), from, to)
})

const incomeByPeriodCat = computed(() => {
  const [from, to] = currentPeriodRange.value
  return incomeByCategory(Object.values(vault.value.transactions), from, to)
})

const monthlyTrendData = computed(() => {
  return monthlyTrend(Object.values(vault.value.transactions), trendMonths.value, todayISO())
})

const monthExpense = computed(() => {
  const [from, to] = monthRange()
  return expenseByCategory(Object.values(vault.value.transactions), from, to)
})
const monthExpenseTotal = computed(() => Object.values(monthExpense.value).reduce((s, v) => s + v, 0))
const totalBalanceVal = computed(() => totalBalance(accountsList.value, Object.values(vault.value.transactions)))
const portfolioValueVal = computed(() => portfolioValue(holdingsList.value))
const portfolioGainLossVal = computed(() => portfolioGainLoss(holdingsList.value))
const netWorthVal = computed(() => netWorth(accountsList.value, holdingsList.value, depositsList.value, Object.values(vault.value.transactions)))

function acctBalance(account) {
  return accountBalance(account, Object.values(vault.value.transactions))
}

function categoryLabel(id) {
  const expenseCat = EXPENSE_CATEGORIES.find(c => c.id === id)
  if (expenseCat) return expenseCat.label
  const incomeCat = INCOME_CATEGORIES.find(c => c.id === id)
  if (incomeCat) return incomeCat.label
  return id
}

function getCategoriesForDirection(direction) {
  return direction === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
}

function mostRecentCategory(direction) {
  const list = Object.values(vault.value.transactions)
    .filter(t => !t.deleted && t.direction === direction)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  const defaultCat = direction === 'income' ? 'other' : 'other'
  return list[0]?.category || defaultCat
}

// ---- Create a brand-new vault (first run) ----
async function createVault() {
  error.value = ''
  if (!passphrase.value) {
    error.value = 'Введите пароль для защиты данных.'
    return
  }
  if (passphrase.value.length < 6) {
    error.value = 'Пароль не короче 6 символов.'
    return
  }
  if (passphrase.value !== confirmPassphrase.value) {
    error.value = 'Пароли не совпадают.'
    return
  }
  busy.value = true
  try {
    const salt = randomBytes(16)
    _salt = salt
    cryptoKey.value = await deriveKey(passphrase.value, salt)
    vault.value = emptyVault()
    // Persist the (empty) vault SYNCHRONOUSLY (awaited, not debounced) so a wrong passphrase on
    // the next visit is rejected by decrypt rather than silently "unlocking" a non-existent record.
    const { iv, ciphertext } = await encryptJSON(cryptoKey.value, vault.value)
    await saveEnvelopeNow(packEnvelope({ salt, iterations: ITERATIONS, iv, ciphertext }))
    hasVault.value = true
    phase.value = 'unlocked'
    view.value = 'dashboard'
    qaDirection.value = 'expense'
    qaCategory.value = mostRecentCategory('expense')
    qaAccount.value = vault.value.settings.defaultAccountId || null
    clearInputs()
  } catch (e) {
    error.value = 'Не удалось создать хранилище: ' + (e?.message || e)
    cryptoKey.value = null
  } finally {
    busy.value = false
  }
}

// ---- Unlock an existing vault (returning) ----
async function unlock() {
  error.value = ''
  if (!passphrase.value) {
    error.value = 'Введите пароль.'
    return
  }
  busy.value = true
  try {
    const envStr = await loadEnvelope()
    if (!envStr) {
      hasVault.value = false
      return
    }
    const { salt, iterations, iv, ciphertext } = unpackEnvelope(envStr)
    const key = await deriveKey(passphrase.value, salt, iterations)
    // A wrong key makes decryptJSON reject; caught below.
    const data = await decryptJSON(key, { iv, ciphertext })
    cryptoKey.value = key
    _salt = salt
    vault.value = data && (data.expenses || data.transactions) ? migrateVault(data) : emptyVault()
    phase.value = 'unlocked'
    view.value = 'dashboard'
    qaDirection.value = 'expense'
    qaCategory.value = mostRecentCategory('expense')
    qaAccount.value = vault.value.settings.defaultAccountId || null
    clearInputs()
  } catch {
    error.value = 'Неверный пароль или повреждённые данные.'
    cryptoKey.value = null
  } finally {
    busy.value = false
  }
}

// ---- Lock: drop the key and all decrypted state from memory ----
function lockVault() {
  cryptoKey.value = null      // null first so the autosave watcher skips the reset below
  _salt = null
  cancelPendingSave()
  vault.value = emptyVault()
  view.value = 'dashboard'
  qaAmount.value = ''
  qaDirection.value = 'expense'
  qaCategory.value = DEFAULT_CATEGORY
  qaNote.value = ''
  qaAccount.value = null
  qaError.value = ''
  naName.value = ''
  naBalance.value = ''
  accountError.value = ''
  ndName.value = ''
  ndPrincipal.value = ''
  ndRate.value = ''
  ndOpenDate.value = todayISO()
  ndMaturityDate.value = todayISO()
  ndCapitalization.value = false
  depositError.value = ''
  nhTicker.value = ''
  nhQty.value = ''
  nhPurchaseDate.value = todayISO()
  nhPurchasePrice.value = ''
  nhPurchaseCommission.value = ''
  holdingError.value = ''
  sellHoldingId.value = null
  shQty.value = ''
  shSellPrice.value = ''
  shCommission.value = ''
  shDate.value = todayISO()
  shError.value = ''
  priceStatus.value = {}
  cancelImport() // drop any in-progress import (pending envelope + typed passphrase) from memory
  phase.value = 'locked'
  clearInputs()
}

function clearInputs() {
  passphrase.value = ''
  confirmPassphrase.value = ''
  error.value = ''
}

function onPassphraseEnter() {
  if (busy.value) return
  hasVault.value ? unlock() : createVault()
}

// ---- Transaction quick-add (primary above-the-fold control) ----
const qaAmount = ref('')
const qaDirection = ref('expense')
const qaCategory = ref(DEFAULT_CATEGORY)
const qaNote = ref('')
const qaAccount = ref(null)
const qaError = ref('')
const qaAmountEl = ref(null)

function submitQuickAdd() {
  qaError.value = ''
  const amount = Number(qaAmount.value)
  if (!Number.isFinite(amount) || amount <= 0) {
    qaError.value = 'Введите сумму.'
    return
  }
  upsertTransaction(vault.value, {
    amount,
    direction: qaDirection.value,
    category: qaCategory.value,
    accountId: qaAccount.value,
    note: qaNote.value.trim(),
    date: todayISO(),
  })
  qaAmount.value = ''
  qaNote.value = ''
  nextTick(() => qaAmountEl.value?.focus())
}

function onDirectionChange() {
  qaCategory.value = mostRecentCategory(qaDirection.value)
}

function onAccountChange() {
  upsertSettings(vault.value, { defaultAccountId: qaAccount.value })
}

function deleteTransaction(id) {
  if (!confirm('Удалить эту запись?')) return
  removeTransaction(vault.value, id)
}

// ---- Accounts ----
const naName = ref('')
const naBalance = ref('')
const accountError = ref('')

// ---- Deposits ----
const depositsList = computed(() => openDeposits(vault.value))
const ndName = ref('')
const ndPrincipal = ref('')
const ndRate = ref('')
const ndOpenDate = ref(todayISO())
const ndMaturityDate = ref(todayISO())
const ndCapitalization = ref(false)
const depositError = ref('')

function addAccount() {
  accountError.value = ''
  if (!naName.value.trim()) {
    accountError.value = 'Введите название счёта.'
    return
  }
  const openingBalance = Number(naBalance.value) || 0
  upsertAccount(vault.value, { name: naName.value.trim(), openingBalance })
  naName.value = ''
  naBalance.value = ''
}

function onAccountNameChange(id, e) {
  const val = e.target.value.trim()
  if (!val) {
    e.target.value = vault.value.accounts[id]?.name || ''
    return
  }
  upsertAccount(vault.value, { id, name: val })
}
// Manually editing the balance cell is a reconciliation: it resets the account's
// opening-balance baseline to now (see upsertAccount in vault.js), not an increment.
function onAccountBalanceChange(id, e) {
  const val = Number(e.target.value)
  if (!Number.isFinite(val)) {
    e.target.value = acctBalance(vault.value.accounts[id])
    return
  }
  upsertAccount(vault.value, { id, openingBalance: val })
}
function deleteAccount(id) {
  if (!confirm('Удалить этот счёт?')) return
  removeAccount(vault.value, id)
}

function addDeposit() {
  depositError.value = ''
  if (!ndName.value.trim()) {
    depositError.value = 'Введите название вклада.'
    return
  }
  const principal = Number(ndPrincipal.value)
  const rate = Number(ndRate.value)
  if (!Number.isFinite(principal) || principal <= 0) {
    depositError.value = 'Введите сумму вклада.'
    return
  }
  if (!Number.isFinite(rate) || rate < 0) {
    depositError.value = 'Введите процентную ставку.'
    return
  }
  upsertDeposit(vault.value, {
    name: ndName.value.trim(),
    principal,
    rate: rate / 100,
    openDate: ndOpenDate.value || todayISO(),
    maturityDate: ndMaturityDate.value || todayISO(),
    capitalization: ndCapitalization.value,
  })
  ndName.value = ''
  ndPrincipal.value = ''
  ndRate.value = ''
  ndOpenDate.value = todayISO()
  ndMaturityDate.value = todayISO()
  ndCapitalization.value = false
}

function closeDepositAction(id) {
  const deposit = vault.value.deposits[id]
  if (!deposit) return
  if (!confirm(`Закрыть вклад "${deposit.name}"?`)) return
  const payoutAmount = depositValue(deposit, new Date().toISOString())
  closeDeposit(vault.value, { depositId: id, payoutAmount, date: todayISO() })
}

// ---- Investments ----
const nhTicker = ref('')
const nhQty = ref('')
const nhPurchaseDate = ref(todayISO())
const nhPurchasePrice = ref('')
const nhPurchaseCommission = ref('')
const holdingError = ref('')

// Sell holding state
const sellHoldingId = ref(null)
const shQty = ref('')
const shSellPrice = ref('')
const shCommission = ref('')
const shDate = ref(todayISO())
const shError = ref('')

function addHolding() {
  holdingError.value = ''
  const ticker = nhTicker.value.trim().toUpperCase()
  const qty = Number(nhQty.value)
  const purchasePrice = Number(nhPurchasePrice.value)
  const purchaseCommission = Number(nhPurchaseCommission.value) || 0
  if (!ticker) {
    holdingError.value = 'Введите тикер.'
    return
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    holdingError.value = 'Введите количество.'
    return
  }
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
    holdingError.value = 'Введите цену покупки.'
    return
  }
  upsertHolding(vault.value, { ticker, qty, purchaseDate: nhPurchaseDate.value || todayISO(), purchasePrice, purchaseCommission })
  nhTicker.value = ''
  nhQty.value = ''
  nhPurchasePrice.value = ''
  nhPurchaseCommission.value = ''
  nhPurchaseDate.value = todayISO()
}

function onHoldingQtyChange(id, e) {
  const val = Number(e.target.value)
  if (!Number.isFinite(val)) return
  upsertHolding(vault.value, { id, qty: val })
}
function onHoldingPurchasePriceChange(id, e) {
  const val = Number(e.target.value)
  if (!Number.isFinite(val)) return
  upsertHolding(vault.value, { id, purchasePrice: val })
}
function onHoldingPurchaseDateChange(id, e) {
  upsertHolding(vault.value, { id, purchaseDate: e.target.value })
}
function deleteHolding(id) {
  if (!confirm('Удалить эту позицию?')) return
  removeHolding(vault.value, id)
}

function openSellForm(id) {
  sellHoldingId.value = sellHoldingId.value === id ? null : id
  shQty.value = ''
  shSellPrice.value = ''
  shCommission.value = ''
  shDate.value = todayISO()
  shError.value = ''
}

function submitSell() {
  shError.value = ''
  const holding = vault.value.holdings[sellHoldingId.value]
  if (!holding) return
  const qty = Number(shQty.value)
  const sellPrice = Number(shSellPrice.value)
  const commission = Number(shCommission.value) || 0
  if (!Number.isFinite(qty) || qty <= 0) {
    shError.value = 'Введите количество.'
    return
  }
  if (!Number.isFinite(sellPrice) || sellPrice < 0) {
    shError.value = 'Введите цену продажи.'
    return
  }
  if (qty > holding.qty) {
    shError.value = `Количество не может превышать ${holding.qty}.`
    return
  }
  const netProceeds = qty * sellPrice - commission
  if (!confirm(`Продать ${qty} шт. ${holding.ticker} по ${sellPrice} ₽/шт. = ${fmtRub(netProceeds)}`)) {
    return
  }
  sellHolding(vault.value, { holdingId: sellHoldingId.value, qty, sellPrice, commission, date: shDate.value })
  sellHoldingId.value = null
  shQty.value = ''
  shSellPrice.value = ''
  shCommission.value = ''
  shDate.value = todayISO()
  shError.value = ''
}

// Per-ticker refresh state: id -> { status: 'loading'|'ok'|'error', message? }. Never
// automatic/polling — only runs from the "Обновить цены" button click.
const priceStatus = ref({})
const refreshing = ref(false)

async function refreshPrices() {
  if (refreshing.value) return
  const holdings = holdingsList.value
  if (!holdings.length) return
  refreshing.value = true
  const next = {}
  holdings.forEach(h => { next[h.id] = { status: 'loading' } })
  priceStatus.value = next
  await Promise.all(holdings.map(async (h) => {
    try {
      const { price, asOf } = await fetchPrice(h.ticker)
      upsertHolding(vault.value, { id: h.id, lastPrice: price, priceAsOf: asOf })
      priceStatus.value = { ...priceStatus.value, [h.id]: { status: 'ok' } }
    } catch (e) {
      const message = e instanceof MoexPriceError ? e.message : 'Сеть недоступна'
      // Cached lastPrice/priceAsOf are left untouched — a stale price stays visible.
      priceStatus.value = { ...priceStatus.value, [h.id]: { status: 'error', message } }
    }
  }))
  refreshing.value = false
}

// ---- Display helpers ----
function fmtRub(x) {
  const n = Number.isFinite(x) ? x : 0
  return Math.round(n).toLocaleString('ru-RU') + ' ₽'
}
function fmtDate(iso) {
  return iso ? iso.slice(0, 10) : '—'
}

// ---- Export / Import encrypted .finance files ----
async function onExport() {
  if (!cryptoKey.value || !_salt) return
  try {
    const { iv, ciphertext } = await encryptJSON(cryptoKey.value, vault.value)
    exportEnvelope(packEnvelope({ salt: _salt, iterations: ITERATIONS, iv, ciphertext }))
  } catch (e) {
    console.warn('[finance] export failed:', e)
  }
}

const importPhase = ref('idle') // 'idle' | 'awaiting-passphrase' | 'merging'
const importPassphrase = ref('')
const importError = ref('')
let _pendingImportStr = null
const fileInputEl = ref(null)

function onImport() {
  importError.value = ''
  if (fileInputEl.value) {
    fileInputEl.value.value = '' // allow re-picking the same file
    fileInputEl.value.click()
  }
}

async function onImportFileChange(e) {
  const file = e.target.files[0]
  if (!file) return
  try {
    _pendingImportStr = await readEnvelopeFile(file)
    importPassphrase.value = ''
    importError.value = ''
    importPhase.value = 'awaiting-passphrase'
  } catch {
    importError.value = 'Не удалось прочитать файл.'
    importPhase.value = 'idle'
  }
}

async function doImport() {
  if (!_pendingImportStr || !cryptoKey.value || importPhase.value === 'merging') return
  if (!importPassphrase.value.trim()) {
    importError.value = 'Введите пароль импортируемого файла.'
    return
  }
  importPhase.value = 'merging'
  importError.value = ''
  try {
    const { salt, iterations, iv, ciphertext } = unpackEnvelope(_pendingImportStr)
    const importKey = await deriveKey(importPassphrase.value, salt, iterations)
    const imported = await decryptJSON(importKey, { iv, ciphertext })
    // LWW merge (commutative/idempotent) of the imported vault into the current one.
    vault.value = mergeVaults(vault.value, imported)
    importPassphrase.value = ''
    _pendingImportStr = null
    importPhase.value = 'idle'
    view.value = 'dashboard'
  } catch {
    importError.value = 'Не удалось расшифровать — проверьте пароль.'
    importPhase.value = 'awaiting-passphrase'
  }
}

function cancelImport() {
  _pendingImportStr = null
  importPassphrase.value = ''
  importError.value = ''
  importPhase.value = 'idle'
}

// ---- Autosave: re-encrypt on every vault change while unlocked ----
// _applyingRemote is set while we adopt another tab's just-saved snapshot (cross-tab sync):
// that data is already persisted in the shared IndexedDB, so re-saving would ping-pong forever.
let _applyingRemote = false
const stopAutosave = watch(
  vault,
  async (v) => {
    if (!cryptoKey.value || _applyingRemote) return
    try {
      const { iv, ciphertext } = await encryptJSON(cryptoKey.value, v)
      saveEnvelope(packEnvelope({ salt: _salt, iterations: ITERATIONS, iv, ciphertext }))
    } catch (e) {
      console.warn('[finance] autosave failed:', e)
    }
  },
  { deep: true }
)

// ---- Cross-tab sync: another tab saved → reload its envelope and LWW-merge it in ----
let _cleanupSync = () => {}
async function onCrossTabSave() {
  if (!cryptoKey.value) return
  try {
    const envStr = await loadEnvelope()
    if (!envStr) return
    const { iv, ciphertext } = unpackEnvelope(envStr)
    const remote = await decryptJSON(cryptoKey.value, { iv, ciphertext })
    _applyingRemote = true
    vault.value = mergeVaults(vault.value, remote)
    await nextTick() // let the autosave watcher fire (and skip) before re-enabling saves
  } catch (e) {
    console.warn('[finance] cross-tab sync failed:', e)
  } finally {
    _applyingRemote = false
  }
}

onMounted(async () => {
  _cleanupSync = initCrossTabSync(onCrossTabSave)
  const env = await loadEnvelope()
  hasVault.value = env != null
  phase.value = 'locked'
})

onUnmounted(() => {
  _cleanupSync()
  cancelPendingSave()
  stopAutosave()
  cryptoKey.value = null
})
</script>


<template>
  <div class="fin-root">
    <!-- Loading -->
    <div v-if="phase === 'loading'" class="fin-center">
      <span class="fin-muted">Загрузка…</span>
    </div>

    <!-- Lock / create screen -->
    <div v-else-if="phase === 'locked'" class="fin-center">
      <div class="fin-lock-card">
        <div class="fin-lock-icon">💰</div>
        <p class="fin-lock-title">
          {{ hasVault ? 'Открыть финансы' : 'Создать финансовый трекер' }}
        </p>
        <p class="fin-lock-desc">
          {{ hasVault
            ? 'Введите пароль для расшифровки данных о расходах, счетах и портфеле.'
            : 'Придумайте пароль. Данные хранятся зашифрованными только на вашем устройстве.' }}
        </p>
        <input
          v-model="passphrase"
          type="password"
          class="fin-input"
          :placeholder="hasVault ? 'Пароль' : 'Новый пароль'"
          :autocomplete="hasVault ? 'current-password' : 'new-password'"
          @keydown.enter="onPassphraseEnter"
        />
        <input
          v-if="!hasVault"
          v-model="confirmPassphrase"
          type="password"
          class="fin-input"
          placeholder="Повторите пароль"
          autocomplete="new-password"
          @keydown.enter="onPassphraseEnter"
        />
        <div class="fin-lock-actions">
          <button
            class="fin-btn fin-btn-primary"
            :disabled="busy"
            @click="hasVault ? unlock() : createVault()"
          >
            {{ hasVault ? 'Открыть' : 'Создать' }}
          </button>
        </div>
        <p v-if="error" class="fin-error">{{ error }}</p>
      </div>
    </div>

    <!-- Unlocked -->
    <div v-else class="fin-unlocked">
      <header class="fin-topbar">
        <nav class="fin-tabs">
          <button class="fin-tab" :class="{ active: view === 'dashboard' }" @click="view = 'dashboard'">Дашборд</button>
          <button class="fin-tab" :class="{ active: view === 'accounts' }" @click="view = 'accounts'">Счета</button>
          <button class="fin-tab" :class="{ active: view === 'investments' }" @click="view = 'investments'">Инвестиции</button>
        </nav>
        <div class="fin-topbar-actions">
          <button class="fin-btn-sm" @click="onExport">Экспорт</button>
          <button class="fin-btn-sm" @click="onImport">Импорт</button>
          <button class="fin-btn-sm fin-lock-btn" @click="lockVault">🔒 Заблокировать</button>
        </div>

        <!-- Hidden picker for .finance import -->
        <input
          ref="fileInputEl"
          type="file"
          accept=".finance"
          style="display:none"
          @change="onImportFileChange"
        />

        <!-- Import passphrase dialog -->
        <div v-if="importPhase !== 'idle'" class="fin-import-dialog">
          <div class="fin-import-label">Пароль импортируемого файла:</div>
          <input
            v-model="importPassphrase"
            type="password"
            class="fin-import-input"
            placeholder="Пароль"
            autocomplete="off"
            @keydown.enter="doImport"
          />
          <div class="fin-import-actions">
            <button class="fin-btn-sm fin-import-merge" :disabled="importPhase === 'merging'" @click="doImport">
              {{ importPhase === 'merging' ? 'Расшифровка…' : 'Объединить' }}
            </button>
            <button class="fin-btn-sm" @click="cancelImport">Отмена</button>
          </div>
          <p v-if="importError" class="fin-import-error">{{ importError }}</p>
        </div>
        <p v-if="importError && importPhase === 'idle'" class="fin-import-error">{{ importError }}</p>
      </header>

      <main class="fin-main">
        <!-- Transaction quick-add: primary above-the-fold control, single line, Enter submits -->
        <section class="fin-quickadd">
          <button
            class="fin-btn fin-direction-toggle"
            :class="{ income: qaDirection === 'income' }"
            @click="qaDirection = qaDirection === 'expense' ? 'income' : 'expense'; onDirectionChange()"
          >
            {{ qaDirection === 'income' ? 'Доход' : 'Расход' }}
          </button>
          <input
            ref="qaAmountEl"
            v-model="qaAmount"
            type="number"
            step="0.01"
            min="0"
            class="fin-qa-amount"
            placeholder="Сумма"
            @keydown.enter="submitQuickAdd"
          />
          <select v-model="qaCategory" class="fin-qa-category">
            <option v-for="c in getCategoriesForDirection(qaDirection)" :key="c.id" :value="c.id">{{ c.label }}</option>
          </select>
          <select v-model="qaAccount" class="fin-qa-account" @change="onAccountChange">
            <option :value="null">Счёт (опционально)</option>
            <option v-for="a in accountsList" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <input
            v-model="qaNote"
            type="text"
            class="fin-qa-note"
            placeholder="Заметка (необязательно)"
            @keydown.enter="submitQuickAdd"
          />
          <button class="fin-btn fin-btn-primary fin-qa-submit" @click="submitQuickAdd">{{ qaDirection === 'income' ? '+ Доход' : '+ Расход' }}</button>
        </section>
        <p v-if="qaError" class="fin-form-error">{{ qaError }}</p>

        <!-- Dashboard -->
        <div v-if="view === 'dashboard'" class="fin-panel">
          <div class="fin-summary">
            <div class="fin-summary-card">
              <span class="fin-summary-n">{{ fmtRub(netWorthVal) }}</span>
              <span class="fin-summary-l">Чистые активы</span>
            </div>
            <div class="fin-summary-card">
              <span class="fin-summary-n">{{ fmtRub(totalBalanceVal) }}</span>
              <span class="fin-summary-l">На счетах</span>
            </div>
            <div class="fin-summary-card">
              <span class="fin-summary-n">{{ fmtRub(portfolioValueVal) }}</span>
              <span class="fin-summary-l">Портфель</span>
            </div>
            <div class="fin-summary-card">
              <span class="fin-summary-n" :class="portfolioGainLossVal >= 0 ? 'ok' : 'bad'">{{ fmtRub(portfolioGainLossVal) }}</span>
              <span class="fin-summary-l">Прибыль/убыток</span>
            </div>
          </div>

          <div class="fin-period-selector">
            <button :class="{ active: dashboardPeriod === 'month' }" @click="dashboardPeriod = 'month'">Месяц</button>
            <button :class="{ active: dashboardPeriod === 'year' }" @click="dashboardPeriod = 'year'">Год</button>
            <button :class="{ active: dashboardPeriod === 'all-time' }" @click="dashboardPeriod = 'all-time'">Всё время</button>
          </div>

          <div class="fin-analytics">
            <div class="fin-analytics-tile">
              <div class="fin-analytics-label">Доход</div>
              <div class="fin-analytics-value">{{ fmtRub(periodStats.income) }}</div>
            </div>
            <div class="fin-analytics-tile">
              <div class="fin-analytics-label">Расход</div>
              <div class="fin-analytics-value">{{ fmtRub(periodStats.expense) }}</div>
            </div>
            <div class="fin-analytics-tile">
              <div class="fin-analytics-label">Чистый доход</div>
              <div class="fin-analytics-value" :class="periodStats.net >= 0 ? 'positive' : 'negative'">{{ fmtRub(periodStats.net) }}</div>
            </div>
          </div>

          <h2 class="fin-panel-title">Категории доходов</h2>
          <div v-if="Object.keys(incomeByPeriodCat).length" class="fin-category-list">
            <CategoryBar
              v-for="(amount, cat) in incomeByPeriodCat"
              :key="cat"
              :label="categoryLabel(cat)"
              :amount="amount"
              :total="periodStats.income"
            />
          </div>
          <p v-else class="fin-empty-hint">Нет доходов в этом периоде.</p>

          <h2 class="fin-panel-title">Категории расходов</h2>
          <div v-if="Object.keys(expenseByPeriodCat).length" class="fin-category-list">
            <CategoryBar
              v-for="(amount, cat) in expenseByPeriodCat"
              :key="cat"
              :label="categoryLabel(cat)"
              :amount="amount"
              :total="periodStats.expense"
            />
          </div>
          <p v-else class="fin-empty-hint">Нет расходов в этом периоде.</p>

          <div class="fin-trend-controls">
            <h2 class="fin-panel-title">Тренд за последние месяцы</h2>
            <div class="fin-trend-selector">
              <button :class="{ active: trendMonths === 6 }" @click="trendMonths = 6">6 месяцев</button>
              <button :class="{ active: trendMonths === 12 }" @click="trendMonths = 12">12 месяцев</button>
            </div>
          </div>
          <div v-if="monthlyTrendData.length" class="fin-trend-chart">
            <svg class="fin-chart-svg" viewBox="0 0 800 300" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="trendIncomeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style="stop-color:#3f5946;stop-opacity:0.4" />
                  <stop offset="100%" style="stop-color:#3f5946;stop-opacity:0.1" />
                </linearGradient>
                <linearGradient id="trendExpenseGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style="stop-color:#8a5568;stop-opacity:0.4" />
                  <stop offset="100%" style="stop-color:#8a5568;stop-opacity:0.1" />
                </linearGradient>
              </defs>
              <TrendChart :data="monthlyTrendData" />
            </svg>
          </div>
          <p v-else class="fin-empty-hint">Нет данных за выбранный период.</p>

          <h2 class="fin-panel-title">Последние записи</h2>
          <table v-if="recentTransactions.length" class="fin-table">
            <tbody>
              <tr v-for="t in recentTransactions" :key="t.id">
                <td class="fin-table-date">{{ t.date }}</td>
                <td>{{ categoryLabel(t.category) }}</td>
                <td class="fin-table-note">{{ t.note }}</td>
                <td class="fin-table-num" :class="{ income: t.direction === 'income' }">
                  {{ t.direction === 'income' ? '+' : '−' }}{{ fmtRub(t.amount) }}
                </td>
                <td><button class="fin-row-del" title="Удалить" aria-label="Удалить" @click="deleteTransaction(t.id)">✕</button></td>
              </tr>
            </tbody>
          </table>
          <p v-else class="fin-empty-hint">Пока нет ни одной записи. Добавьте первую запись выше.</p>
        </div>

        <!-- Accounts -->
        <div v-else-if="view === 'accounts'" class="fin-panel">
          <h2 class="fin-panel-title">Счета — итого {{ fmtRub(totalBalanceVal) }}</h2>
          <table v-if="accountsList.length" class="fin-table">
            <thead><tr><th>Название</th><th>Баланс</th><th></th></tr></thead>
            <tbody>
              <tr v-for="a in accountsList" :key="a.id">
                <td><input class="fin-cell-input" :value="a.name" @change="onAccountNameChange(a.id, $event)" /></td>
                <td><input class="fin-cell-input fin-cell-num" type="number" step="0.01" :value="acctBalance(a)" @change="onAccountBalanceChange(a.id, $event)" /></td>
                <td><button class="fin-row-del" title="Удалить" aria-label="Удалить" @click="deleteAccount(a.id)">✕</button></td>
              </tr>
            </tbody>
          </table>
          <p v-else class="fin-empty-hint">Пока нет счетов.</p>

          <div class="fin-add-row">
            <input v-model="naName" class="fin-text" placeholder="Название счёта" @keydown.enter="addAccount" />
            <input v-model="naBalance" type="number" step="0.01" class="fin-text fin-text-num" placeholder="Баланс" @keydown.enter="addAccount" />
            <button class="fin-btn fin-btn-primary" @click="addAccount">+ Счёт</button>
          </div>
          <p v-if="accountError" class="fin-form-error">{{ accountError }}</p>

          <h2 class="fin-panel-title">Вклады</h2>
          <table v-if="depositsList.length" class="fin-table">
            <thead><tr><th>Название</th><th>Сумма</th><th>Процент</th><th>Срок</th><th>Начислено</th><th>Текущая стоимость</th><th></th></tr></thead>
            <tbody>
              <tr v-for="d in depositsList" :key="d.id">
                <td>{{ d.name }}</td>
                <td class="fin-table-num">{{ fmtRub(d.principal) }}</td>
                <td class="fin-table-num">{{ (d.rate * 100).toFixed(2) }}%</td>
                <td>{{ d.openDate }} – {{ d.maturityDate }}</td>
                <td class="fin-table-num">{{ fmtRub(depositAccruedInterest(d, new Date().toISOString())) }}</td>
                <td class="fin-table-num">{{ fmtRub(depositValue(d, new Date().toISOString())) }}</td>
                <td><button class="fin-row-del" title="Закрыть" aria-label="Закрыть" @click="closeDepositAction(d.id)">✕</button></td>
              </tr>
            </tbody>
          </table>
          <p v-else class="fin-empty-hint">Пока нет активных вкладов.</p>

          <div class="fin-add-row">
            <input v-model="ndName" class="fin-text" placeholder="Название вклада" @keydown.enter="addDeposit" />
            <input v-model="ndPrincipal" type="number" step="0.01" class="fin-text fin-text-num" placeholder="Сумма" @keydown.enter="addDeposit" />
            <input v-model="ndRate" type="number" step="0.01" class="fin-text fin-text-num" placeholder="Процент %" @keydown.enter="addDeposit" />
            <input v-model="ndOpenDate" type="date" class="fin-text" @keydown.enter="addDeposit" />
            <input v-model="ndMaturityDate" type="date" class="fin-text" @keydown.enter="addDeposit" />
            <label class="fin-checkbox">
              <input v-model="ndCapitalization" type="checkbox" />
              Капитализация
            </label>
            <button class="fin-btn fin-btn-primary" @click="addDeposit">+ Вклад</button>
          </div>
          <p v-if="depositError" class="fin-form-error">{{ depositError }}</p>
        </div>

        <!-- Investments -->
        <div v-else-if="view === 'investments'" class="fin-panel">
          <div class="fin-panel-head">
            <h2 class="fin-panel-title">Портфель — {{ fmtRub(portfolioValueVal) }}</h2>
            <button class="fin-btn fin-btn-ghost" :disabled="refreshing || !holdingsList.length" @click="refreshPrices">
              {{ refreshing ? 'Обновление…' : '↻ Обновить цены' }}
            </button>
          </div>
          <table v-if="holdingsList.length" class="fin-table">
            <thead>
              <tr><th>Тикер</th><th>Кол-во</th><th>Дата покупки</th><th>Цена покупки</th><th>Тек. цена</th><th>П/У</th><th></th></tr>
            </thead>
            <tbody>
              <template v-for="h in holdingsList" :key="h.id">
                <tr>
                  <td>{{ h.ticker }}</td>
                  <td><input class="fin-cell-input fin-cell-num" type="number" step="1" :value="h.qty" @change="onHoldingQtyChange(h.id, $event)" /></td>
                  <td><input class="fin-cell-input" type="date" :value="h.purchaseDate" @change="onHoldingPurchaseDateChange(h.id, $event)" /></td>
                  <td><input class="fin-cell-input fin-cell-num" type="number" step="0.01" :value="h.purchasePrice" @change="onHoldingPurchasePriceChange(h.id, $event)" /></td>
                  <td class="fin-price-cell">
                    <span>{{ h.lastPrice != null ? fmtRub(h.lastPrice) : fmtRub(h.purchasePrice) + ' (покупка)' }}</span>
                    <span v-if="h.priceAsOf" class="fin-price-asof">на {{ fmtDate(h.priceAsOf) }}</span>
                    <span v-if="priceStatus[h.id]?.status === 'loading'" class="fin-price-status">…</span>
                    <span v-else-if="priceStatus[h.id]?.status === 'error'" class="fin-price-status bad" :title="priceStatus[h.id].message">⚠</span>
                    <span v-else-if="priceStatus[h.id]?.status === 'ok'" class="fin-price-status ok">✓</span>
                  </td>
                  <td :class="holdingGainLoss(h) >= 0 ? 'ok' : 'bad'">{{ fmtRub(holdingGainLoss(h)) }}</td>
                  <td>
                    <button class="fin-row-btn" title="Продать" aria-label="Продать" @click="openSellForm(h.id)">$ Продать</button>
                    <button class="fin-row-del" title="Удалить" aria-label="Удалить" @click="deleteHolding(h.id)">✕</button>
                  </td>
                </tr>
                <tr v-if="sellHoldingId === h.id" class="fin-sell-form-row">
                  <td colspan="7">
                    <div class="fin-sell-form">
                      <div class="fin-sell-fields">
                        <input v-model="shQty" type="number" step="0.01" class="fin-text fin-text-num" placeholder="Кол-во" @keydown.enter="submitSell" />
                        <input v-model="shSellPrice" type="number" step="0.01" class="fin-text fin-text-num" placeholder="Цена продажи" @keydown.enter="submitSell" />
                        <input v-model="shCommission" type="number" step="0.01" class="fin-text fin-text-num" placeholder="Комиссия" @keydown.enter="submitSell" />
                        <input v-model="shDate" type="date" class="fin-text" @keydown.enter="submitSell" />
                        <button class="fin-btn fin-btn-primary" @click="submitSell">Продать</button>
                        <button class="fin-btn" @click="openSellForm(h.id)">Отмена</button>
                      </div>
                      <p v-if="shError" class="fin-form-error">{{ shError }}</p>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
          <p v-else class="fin-empty-hint">Пока нет позиций в портфеле.</p>

          <div class="fin-add-row">
            <input v-model="nhTicker" class="fin-text" placeholder="Тикер (SBER)" @keydown.enter="addHolding" />
            <input v-model="nhQty" type="number" step="1" class="fin-text fin-text-num" placeholder="Кол-во" @keydown.enter="addHolding" />
            <input v-model="nhPurchaseDate" type="date" class="fin-text" @keydown.enter="addHolding" />
            <input v-model="nhPurchasePrice" type="number" step="0.01" class="fin-text fin-text-num" placeholder="Цена покупки" @keydown.enter="addHolding" />
            <input v-model="nhPurchaseCommission" type="number" step="0.01" class="fin-text fin-text-num" placeholder="Комиссия" @keydown.enter="addHolding" />
            <button class="fin-btn fin-btn-primary" @click="addHolding">+ Позиция</button>
          </div>
          <p v-if="holdingError" class="fin-form-error">{{ holdingError }}</p>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped src="./FinanceApp.css"></style>
