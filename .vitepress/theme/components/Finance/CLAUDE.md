# Finance tracker app

Encrypted personal finance tracker at `/finance`: income/expense transactions, account balances, bank term deposits, and an RU-market investment portfolio (MOEX-listed stocks/ETFs). RUB only — no multi-currency, no FX conversion.

Root component: `.vitepress/theme/components/FinanceApp.vue` (`defineAsyncComponent` in `index.mts`).
Page: `finance.md` (`layout: false`). SEO: `TOOL_CATEGORY` → `FinanceApplication` JSON-LD + sitemap 0.8.

## Modules

| File | Purpose |
|------|---------|
| `constants.js` | `makeId()`, `todayISO(date)` (local, not UTC), `EXPENSE_CATEGORIES` / `INCOME_CATEGORIES` (fixed lists), `DEFAULT_EXPENSE_CATEGORY` / `DEFAULT_INCOME_CATEGORY`. Pure |
| `vault.js` | Pure (no DOM/crypto/IndexedDB → node-testable). `emptyVault()`, `upsertTransaction`/`upsertAccount`/`upsertHolding`/`upsertDeposit` (partial-edit semantics, `createdAt` preserved, `updatedAt` bumped), `removeTransaction`/`removeAccount`/`removeHolding`/`removeDeposit` (tombstone `deleted:true`, never splice), selectors `transactionsInRange`/`openAccounts`/`openHoldings`/`openDeposits`, `upsertSettings(vault, partial, now)` (persists `defaultAccountId`), `migrateVaultV1toV2(vault)` + `migrateAccountBalances(vault, now)` composed into `migrateVault(vault, now)` (the one entry point UI code calls — see "V1→V2→V3 migration" below), `closeDeposit(vault, closeOpts, now)` (marks closed + creates income transaction), `sellHolding(vault, sellOpts, now)` (reduces qty/tombstones + creates income transaction), `mergeVaults(a,b)` (runs `migrateVault` on both sides first, then LWW on `updatedAt` per entity map + settings, commutative/idempotent, `a` wins on tie). **Deliberately does NOT mutate account balance on transaction CRUD** — see "Account balance is derived, not stored" below for why (an earlier version of this fix did mutate it and a revmux review caught the resulting LWW-vs-running-total data-integrity bug before it shipped). |
| `stats.js` | Pure aggregation. `accountBalance(account, transactions)` (derives an account's current balance — see below), `totalBalance(accounts, transactions)`, `expenseByCategory(transactions, fromISO, toISO)`, `incomeByCategory(transactions, fromISO, toISO)`, `netForRange(transactions, fromISO, toISO)` → `{income, expense, net}`, `holdingValue(holding)` (`qty * (lastPrice ?? purchasePrice)`), `portfolioValue(holdings)`, `holdingGainLoss(holding)` (subtracts `purchaseCommission`), `portfolioGainLoss(holdings)`, `depositAccruedInterest(deposit, asOfISO)` (simple or daily-compounded, capped at maturity), `depositValue(deposit, asOfISO)` (`principal + accrued`), `netWorth(accounts, holdings, deposits, transactions)`, `monthlyTrend(transactions, monthsBack, referenceISO)` → array of `{month, income, expense, net}`, `periodRange(kind, referenceISO)` where `kind` ∈ `{'month', 'year', 'all-time'}` → `{fromISO, toISO}`, legacy `spendByCategory` alias. Empty input → `0`/`{}`, never `NaN` |
| `prices.js` | MOEX ISS current-price lookup — see "MOEX ISS price lookup" below. `parseMoexResponse(json)` is pure (node-testable against fixture JSON); `fetchPrice(ticker)` is the browser-only `fetch` wrapper; `MoexPriceError` typed error (`network`, `unknown-ticker`, `no-price`) |
| `db.js` | Encrypted IndexedDB `finance` (single envelope). `loadEnvelope`, `saveEnvelope` (debounced 300 ms + cross-tab ping on `finance:saved`), `saveEnvelopeNow` (awaited, rejects on failure — create-vault guard), `cancelPendingSave`, `initCrossTabSync`. Browser-only |
| `exporter.js` | `exportEnvelope` → download `.finance` file; `readEnvelopeFile` → string. Browser-only |
| `CategoryBar.vue` | Dashboard helper SFC — one income/expense category row (label, proportional bar, amount). Used twice in `FinanceApp.vue`'s «Категории доходов»/«Категории расходов» sections |
| `TrendChart.vue` | Dashboard helper SFC — inline-SVG `<g>` monthly income/expense bar chart, mounted inside `FinanceApp.vue`'s `<svg>`. Used once, in «Тренд за последние месяцы» |

## Crypto model (shared with journal/planner/decisions)

`PBKDF2(passphrase, salt=16 bytes, iterations=600000, SHA-256)` → AES-GCM 256; `iv` = 12 random bytes; at-rest envelope `{salt,iterations,iv,ciphertext}` base64 — no key, no plaintext persisted.

## Vault shape (v3)

```
{
  version: 3,
  createdAt: ISO,
  transactions: { [id]: Transaction },
  accounts: { [id]: Account },
  holdings: { [id]: Holding },
  deposits: { [id]: Deposit },
  settings: { defaultAccountId: string|null, updatedAt: ISO },
}

Transaction = { id, amount (RUB, positive), direction ('expense'|'income'),
                category (from EXPENSE_CATEGORIES or INCOME_CATEGORIES),
                accountId (string|null), note, date ('YYYY-MM-DD', local),
                deleted, createdAt, updatedAt }
Account     = { id, name, openingBalance (RUB), openingBalanceAsOf (ISO — the
                reconciliation point; see "Account balance is derived" below),
                deleted, createdAt, updatedAt }
Holding     = { id, ticker (MOEX SECID, e.g. 'SBER'), qty,
                purchaseDate ('YYYY-MM-DD'), purchasePrice (RUB),
                purchaseCommission (RUB, default 0),
                lastPrice (RUB|null), priceAsOf (ISO|null),
                deleted, createdAt, updatedAt }
Deposit     = { id, name, principal (RUB), rate (annual fraction, e.g. 0.18),
                openDate ('YYYY-MM-DD'), maturityDate ('YYYY-MM-DD'),
                capitalization (bool), closed (bool), deleted, createdAt, updatedAt }
```

### Dashboard helper components must be SFCs, not string templates

`CategoryBar.vue` / `TrendChart.vue` are separate `.vue` SFC files, not
`defineComponent({ template: '…' })` consts inlined in `FinanceApp.vue`. That inline
form was the original shape (2026-08-15, `df0cecb`) and it silently broke the entire
dashboard analytics block — no error surfaced during `npm run build`, no unit test
caught it (the pure `stats.js` aggregation was correct all along), only the browser
render failed. Root cause: a string `template:` option requires Vue's **runtime**
template compiler, but VitePress bundles the **runtime-only** `esm-bundler` Vue build
with no `vue → vue/dist/vue.esm-bundler.js` alias — mounting such a component throws
"Component provided template option but runtime compilation is not supported in this
build of Vue", which aborted the whole `<CategoryBar>`/`<TrendChart>` subtree render.
SFC `<template>` blocks are compiled at build time by `@vitejs/plugin-vue`, sidestepping
the runtime compiler entirely. **Never add a `template:` string to a `defineComponent`
anywhere in this app** — always use a real `.vue` SFC (or an inline `<script setup>`
template block in the parent). `Finance/components.render.test.mjs` statically greps
for this anti-pattern as a regression guard.

Scoped-CSS note: `FinanceApp.vue` loads `<style scoped src="./FinanceApp.css">`, and
Vue scoped styles reach a child component's root element but not its inner elements.
`CategoryBar.vue` therefore carries its own `<style scoped>` (the `.fin-category-*`
rules moved out of `FinanceApp.css`); `TrendChart.vue` needs none — it's inline-SVG
attributes only, no CSS classes with rules.

### Account balance is derived, not stored

`stats.js`'s `accountBalance(account, transactions)` computes the current balance at
read time as `openingBalance` + every **live** transaction linked to that account
(`accountId` match) with `createdAt >= openingBalanceAsOf`. Nothing in `vault.js`
mutates a balance field on transaction add/edit/delete — `upsertTransaction`/
`removeTransaction` only ever touch `vault.transactions`.

This is load-bearing, not a style choice. An earlier version of the expense-decrement
fix (2026-08-15) mutated `account.balance` as a running total (`+=`/`-=` on every
transaction CRUD). A revmux review of the whole module caught that this is
incompatible with the sync model before it shipped: accounts merge per-record LWW on
`updatedAt` (`mergeEntityMap`), but transactions merge by **union** — every id from
both sides survives. Two tabs adding a same-account expense concurrently would keep
*both* transactions after merge, but LWW would only keep *one* side's balance
mutation, silently and permanently dropping the other's decrement. Deriving balance
from the (correctly unioned) transaction ledger instead of mutating an LWW-merged
field sidesteps the conflict entirely: `account` only carries the rarely-changing
`openingBalance`/`openingBalanceAsOf` pair, for which per-field LWW is fine.

Editing the balance cell in the accounts table (`onAccountBalanceChange` in
`FinanceApp.vue`) is a **reconciliation**, not an increment: it calls `upsertAccount`
with a new `openingBalance`, which per `upsertAccount`'s semantics always resets
`openingBalanceAsOf` to `now` — so the new number becomes the baseline and only
transactions added from that moment forward count on top of it. Editing any other
account field (e.g. renaming) leaves the baseline untouched. `closeDeposit`/
`sellHolding` need no special-casing — their payout/proceeds land in
`vault.transactions` through the same `upsertTransaction` path, so they're picked up
by `accountBalance` automatically once linked to an account.

Full float precision throughout — no rounding of computed balances, only display
formatting (`fmtRub`-style helpers) rounds.

**No transaction-edit UI exists yet** (only quick-add + delete) — but `upsertTransaction`
supports partial edits generically, and the `createdAt >= openingBalanceAsOf` cutoff
means editing a transaction's amount *after* the account's baseline was last reconciled
is picked up correctly (its current amount is summed, not an incremental delta), while
editing one from *before* the baseline is not reflected — same limitation as a paper
bank statement: a reconciled balance doesn't retroactively move when a transaction that
predates it is corrected.

**V1→V2→V3 migration:** `migrateVault(vault, now)` in `vault.js` is the one entry point UI
code calls (`FinanceApp.vue`'s `unlock()`) — it composes `migrateVaultV1toV2` (converts
`expenses` → `transactions`, all `direction: 'expense'`/`accountId: null`, adds empty
`deposits: {}` and `settings`, bumps `version: 2`) then `migrateAccountBalances`
(converts each account's old `balance` field to `openingBalance` = that value,
`openingBalanceAsOf` = the account's own `updatedAt`/`createdAt`, bumps `version: 3`).
Both migrations are idempotent — v1→v2 no-ops once `transactions` exists, and the
balance migration no-ops once an account already has `openingBalance`. `mergeVaults`
also runs `migrateVault` on both inputs before merging (not just v1→v2) — an unmigrated
account must never win the per-account LWW pick and leak the old `balance` shape into
the merged vault.

**Categories:** `EXPENSE_CATEGORIES` (7 items, unchanged from v1): food, transport, utilities, health, entertainment, shopping, other. `INCOME_CATEGORIES` (6 items, new): dividends, stock_sale, deposit_interest, deposit_closure, salary, other.

## MOEX ISS price lookup — runtime-fetch exception

`prices.js` calls `iss.moex.com` (official Moscow Exchange ISS API, no key/auth) to fetch the current price for a held ticker. This is the **only** external-host runtime fetch in this repo — every other app makes zero runtime calls to external hosts. It's a deliberate, narrow, user-approved exception:

- One endpoint, one host, no API key.
- User-initiated only — a "refresh prices" button in `FinanceApp.vue`. Never automatic, never polling/background.
- Only the ticker symbol (public market data) goes in the URL path — no analytics/tracking payload.
- `LAST` (live trade price) is preferred; falls back to `PREVPRICE` (previous close) when `LAST` is null, which happens outside trading hours.
- On success, the price is cached onto the holding (`lastPrice`/`priceAsOf`) via `vault.js`'s `upsertHolding` so the app has a usable last-known price offline.
- See the matching note in root `CLAUDE.md`'s "Known deferred advisories" section — don't flag this as an accidental CDN/runtime-fetch violation.

## Tests

Unit tests (139 total: 61 vault + 68 stats + 6 prices + 4 dashboard-component render guard):
```
node --test .vitepress/theme/components/Finance/vault.test.mjs .vitepress/theme/components/Finance/stats.test.mjs .vitepress/theme/components/Finance/prices.test.mjs .vitepress/theme/components/Finance/components.render.test.mjs
```

Browser-only syntax check:
```
node --check .vitepress/theme/components/Finance/db.js .vitepress/theme/components/Finance/exporter.js .vitepress/theme/components/Finance/prices.js
```
