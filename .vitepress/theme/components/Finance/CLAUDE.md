# Finance tracker app

Encrypted personal finance tracker at `/finance`: income/expense transactions, account balances, bank term deposits, and an RU-market investment portfolio (MOEX-listed stocks/ETFs). RUB only — no multi-currency, no FX conversion.

Root component: `.vitepress/theme/components/FinanceApp.vue` (`defineAsyncComponent` in `index.mts`).
Page: `finance.md` (`layout: false`). SEO: `TOOL_CATEGORY` → `FinanceApplication` JSON-LD + sitemap 0.8.

## Modules

| File | Purpose |
|------|---------|
| `constants.js` | `makeId()`, `todayISO(date)` (local, not UTC), `EXPENSE_CATEGORIES` / `INCOME_CATEGORIES` (fixed lists), `DEFAULT_EXPENSE_CATEGORY` / `DEFAULT_INCOME_CATEGORY`. Pure |
| `vault.js` | Pure (no DOM/crypto/IndexedDB → node-testable). `emptyVault()`, `upsertTransaction`/`upsertAccount`/`upsertHolding`/`upsertDeposit` (partial-edit semantics, `createdAt` preserved, `updatedAt` bumped), `removeTransaction`/`removeAccount`/`removeHolding`/`removeDeposit`/`discardHolding` (tombstone `deleted:true`, never splice), `transferBetweenAccounts(vault, opts, now)` (single `direction:'transfer'` transaction — see "Transfers and funding" below), `adjustAccountBalance(vault, { accountId, delta, date, note }, now)` (books a manual balance-cell edit as a `category:'adjustment'` transaction instead of resetting the opening-balance baseline — see "Account balance is derived, not stored" below), selectors `transactionsInRange`/`openAccounts`/`openHoldings`/`openDeposits`, `upsertSettings(vault, partial, now)` (persists `defaultAccountId`), `migrateVaultV1toV2(vault)` + `migrateAccountBalances(vault, now)` composed into `migrateVault(vault, now)` (the one entry point UI code calls — see "V1→V2→V3 migration" below), `closeDeposit(vault, closeOpts, now)` (marks closed + creates income transaction), `addDepositContribution(vault, opts, now)` (increases an open deposit's principal, optionally debiting an account via a one-legged transfer), `sellHolding(vault, sellOpts, now)` (reduces qty/tombstones + books a two-leg payout — capital-return transfer plus a realized-gain `income`/`stock_sale` leg only on profit; `toAccountId` opt falls back to `settings.defaultAccountId`), `mergeVaults(a,b)` (runs `migrateVault` on both sides first, then LWW on `updatedAt` per entity map + settings, commutative/idempotent, `a` wins on tie). **Deliberately does NOT mutate account balance on transaction CRUD** — see "Account balance is derived, not stored" below for why (an earlier version of this fix did mutate it and a revmux review caught the resulting LWW-vs-running-total data-integrity bug before it shipped). |
| `stats.js` | Pure aggregation. `accountBalance(account, transactions)` (derives an account's current balance — see below), `totalBalance(accounts, transactions)`, `expenseByCategory(transactions, fromISO, toISO)`, `incomeByCategory(transactions, fromISO, toISO)`, `netForRange(transactions, fromISO, toISO)` → `{income, expense, net}`, `holdingValue(holding)` (`qty * (lastPrice ?? purchasePrice)`), `portfolioValue(holdings)`, `holdingGainLoss(holding)` (subtracts `purchaseCommission`), `portfolioGainLoss(holdings)`, `depositAccruedInterest(deposit, asOfISO)` (simple or daily-compounded, capped at maturity), `depositValue(deposit, asOfISO)` (`principal + accrued`), `netWorth(accounts, holdings, deposits, transactions)`, `monthlyTrend(transactions, monthsBack, referenceISO)` → array of `{month, income, expense, net}`, `periodRange(kind, referenceISO)` where `kind` ∈ `{'month', 'year', 'all-time'}` → `{fromISO, toISO}`, legacy `spendByCategory` alias. Empty input → `0`/`{}`, never `NaN` |
| `prices.js` | MOEX ISS current-price lookup — see "MOEX ISS price lookup" below. `parseMoexResponse(json, { isBond })` is pure (node-testable against fixture JSON) — converts bond LAST/PREVPRICE from percent-of-face to RUB when `isBond`; `fetchPrice(ticker)` is the browser-only `fetch` wrapper that tries the shares board then falls back to the bonds board; `MoexPriceError` typed error (`network`, `unknown-ticker`, `no-price`) |
| `recommendations.js` | Pure, deterministic dashboard nudges over the user's own vault data — no network, no LLM, no external source. `buildRecommendations({ accounts, holdings, deposits, transactions }, referenceISO)` → array of `{ id, severity, title, detail }` (`severity` ∈ `info`/`warning`), each rule independently triggered: idle cash above 6× average monthly expense, single holding above 40% of portfolio value, open deposit maturing within 30 days, and a combined "start investing" nudge when idle cash exists but there are no investments yet (suppresses the idle-cash rule to avoid double-firing). Empty array for a fresh vault. |
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

Transaction = { id, amount (RUB, positive), direction ('expense'|'income'|'transfer'),
                category (from EXPENSE_CATEGORIES/INCOME_CATEGORIES, or 'transfer'),
                accountId (string|null — source, for 'transfer'), toAccountId (string|null
                — destination; null on a funding transfer that leaves the account ledger
                entirely, e.g. buying a holding), note, date ('YYYY-MM-DD', local),
                deleted, createdAt, updatedAt }
Account     = { id, name, openingBalance (RUB), openingBalanceAsOf (ISO — the
                reconciliation point; see "Account balance is derived" below),
                deleted, createdAt, updatedAt }
Holding     = { id, ticker (MOEX SECID, e.g. 'SBER'), qty,
                purchaseDate ('YYYY-MM-DD'), purchasePrice (RUB),
                purchaseCommission (RUB, default 0),
                lastPrice (RUB|null), priceAsOf (ISO|null),
                purchaseTransactionId (string|null — the funding transfer's id, if the
                purchase was funded from an account; see "Transfers and funding" below),
                deleted, createdAt, updatedAt }
Deposit     = { id, name, principal (RUB), rate (annual fraction, e.g. 0.18),
                openDate ('YYYY-MM-DD'), maturityDate ('YYYY-MM-DD'),
                capitalization (bool), closed (bool),
                sourceTransactionId (string|null — same idea as Holding's
                purchaseTransactionId), deleted, createdAt, updatedAt }
```

`toAccountId`/`purchaseTransactionId`/`sourceTransactionId` are additive, optional fields
(absent ⇒ `null`) — no vault version bump or migration was needed to add them; `mergeVaults`
merges whole records by id per entity map, so they ride along automatically.

### Transfers and funding

A transfer between two of the user's own accounts is a **single** transaction
(`direction: 'transfer'`, `category: 'transfer'`, `accountId` = source, `toAccountId` =
destination) — one id, so it merges atomically across devices instead of two
independently-mergeable legs. `transferBetweenAccounts(vault, { fromAccountId,
toAccountId, amount, date, note }, now)` creates it; no-ops (returns `undefined`) if
either account is missing, they're equal, or `amount` isn't positive. Because
`expenseByCategory`/`incomeByCategory` (and everything built on them — `netForRange`,
`monthlyTrend`, the dashboard's «Доход»/«Расход» tiles) filter by
`direction === 'expense'|'income'`, a transfer is automatically excluded — it never
inflates income/expense totals or category breakdowns, by construction rather than by an
extra exclusion filter.

**Funding a deposit or a holding purchase** is the same shape with `toAccountId: null` —
money leaves the account ledger into a non-account asset, whose value is tracked by its
own entity (`depositValue`/`portfolioValue`), so net worth is unaffected.
`upsertDeposit`/`upsertHolding` take an optional `fromAccountId` that — **only on
create**, never on a later edit (`existing` guard) — debits that account via this
one-legged transfer and stashes the resulting transaction id as
`sourceTransactionId`/`purchaseTransactionId`. `null`/omitted `fromAccountId` preserves
the old behavior exactly (no funding transaction at all), so existing deposits/holdings
and manual entry without an account are unaffected.

**Topping up an existing open deposit** reuses the same one-legged debit:
`addDepositContribution(vault, { depositId, amount, date, fromAccountId }, now)` adds
`amount` to the deposit's `principal` and, when `fromAccountId` is set, debits that
account via `transferBetweenAccountOrAsset` (note carries the deposit name). It no-ops
on a missing/deleted/closed deposit or a non-positive amount, and does **not** stash a
transaction id for refund — top-ups are additive-only (`removeDeposit` still unwinds
only the original creation funding).

**Selling a holding** is the mirror image: `sellHolding` books a one-legged credit
transfer (`accountId: null`, `toAccountId` = payout account) returning the cost basis
(`qty * purchasePrice`, capped at `netProceeds`), then books an
`income`/`stock_sale` leg **only when there is a realized gain**
(`netProceeds - costBasis > 0`). This fixes the previous behavior where the full gross
sale proceeds were booked as income — a losing sale still showed positive income and
inflated «Чистый доход», while a gain was overstated by the return of capital. Now a
loss or breakeven books zero income, and the two legs together always credit the
account exactly `netProceeds`, matching how unrealized drawdown already stays out of
net income.

Undoing a funded purchase must **refund**, not just tombstone:
- `discardHolding(vault, id, now)` — tombstones the holding and, if `purchaseTransactionId`
  is set, tombstones that funding transaction too (money "comes back"). This is distinct
  from `removeHolding` (tombstone only), which `sellHolding` still uses internally for a
  full liquidation — a sale already pays out its own proceeds via the two-leg payout
  above, so refunding the original purchase on top would double-credit the account.
- `removeDeposit(vault, id, now)` refunds the same way, but **only if the deposit is
  still open** (`!closed`) — a deposit closed via `closeDeposit` already paid out
  separately (its own income transaction), so `removeDeposit` leaves that funding leg
  alone to avoid double-crediting.

`stats.js`'s `accountBalance` evaluates a transfer against **both** legs: it debits the
account when `accountId` matches and credits it when `toAccountId` matches (a funding
transfer's `toAccountId: null` never matches anything, so it only ever debits the
source). Both legs still respect the account's own `openingBalanceAsOf` cutoff.

FinanceApp.vue: a «Перевод между счетами» form sits under the accounts table (Счета
tab); the deposit/holding "add" forms and the sell-holding form each gained an account
`<select>` (optional — omit to preserve today's "no linkage" behavior). The «Последние
записи» table renders a transfer's note as `"<source> → <destination>"` (via
`transactionDescription`) with a neutral `⇄` sign instead of `+`/`−`.

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
`FinanceApp.vue`) books the difference as a `category:'adjustment'` transaction via
`adjustAccountBalance(vault, { accountId, delta }, now)` in `vault.js` — `delta` is
`newValue - acctBalance(account)`, computed by the caller since `vault.js` has no
dependency on `stats.js`. This does **not** touch `openingBalance`/
`openingBalanceAsOf` at all, unlike an earlier version of this feature that reset the
baseline on every edit (a silent reconciliation with no audit trail — the user asked
2026-09-16 for a record of *why* a balance changed since they couldn't otherwise
reconstruct it). `adjustAccountBalance` books an `income` leg on a positive delta and
an `expense` leg on a negative one, tagged `category:'adjustment'`; `categoryLabel` in
`FinanceApp.vue` renders it as "Корректировка" (alongside the existing
"Перевод" special-case for `category:'transfer'`). Because it's a real transaction
linked to the account, `accountBalance` picks it up through the normal live-transaction
sum — no special-casing needed there. `expenseByCategory`/`incomeByCategory` (and
`netForRange`/`monthlyTrend`/`recommendations.js` built on them) and `lastTransaction`
all filter out `category === 'adjustment'` so a manual correction never inflates real
income/expense stats or shows up as the "last entered expense" — the same
by-construction exclusion `direction:'transfer'` already got, just keyed on category
instead of direction since an adjustment still needs a real `income`/`expense`
direction for `accountBalance`'s sum to move the right way. Editing any other account
field (e.g. renaming) is unaffected. `closeDeposit`/`sellHolding` need no
special-casing — their payout/proceeds land in `vault.transactions` through the same
`upsertTransaction` path, so they're picked up by `accountBalance` automatically once
linked to an account.

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

**Categories:** `EXPENSE_CATEGORIES` (7 items): food, transport, housing, health, entertainment, shopping, other. `INCOME_CATEGORIES` (6 items): dividends, stock_sale, deposit_interest, deposit_closure, salary, other. Neither list includes `'transfer'` or `'adjustment'` — both are standalone categories outside the fixed lists (see "Transfers and funding" above and "Account balance is derived, not stored" for adjustment), deliberately excluded from the quick-add dropdowns (`getCategoriesForDirection` in `FinanceApp.vue` only ever reads these two lists). `'transfer'` self-excludes from `expenseByCategory`/`incomeByCategory` by direction (it's never `income`/`expense`); `'adjustment'` is excluded by an explicit `category !== 'adjustment'` filter in `expenseByCategory`/`incomeByCategory`/`lastTransaction` since it deliberately keeps a real `income`/`expense` direction.

## MOEX ISS price lookup — runtime-fetch exception

`prices.js` calls `iss.moex.com` (official Moscow Exchange ISS API, no key/auth) to fetch the current price for a held ticker. This is the **only** external-host runtime fetch in this repo — every other app makes zero runtime calls to external hosts. It's a deliberate, narrow, user-approved exception:

- One host, no API key. Up to **two** requests per refresh now (shares board, then bonds board on `unknown-ticker` — see below), still only the ticker symbol in the URL path.
- User-initiated only — a "refresh prices" button in `FinanceApp.vue`. Never automatic, never polling/background.
- Only the ticker symbol (public market data) goes in the URL path — no analytics/tracking payload.
- `LAST` (live trade price) is preferred; falls back to `PREVPRICE` (previous close) when `LAST` is null, which happens outside trading hours.
- On success, the price is cached onto the holding (`lastPrice`/`priceAsOf`) via `vault.js`'s `upsertHolding` so the app has a usable last-known price offline.
- See the matching note in root `CLAUDE.md`'s "Known deferred advisories" section — don't flag this as an accidental CDN/runtime-fetch violation.

**Recommendations stay local too.** The `~/dev/fin/finanalys` ("persfin") project was
evaluated as a source for the investment-recommendations feature and rejected: it's a
Python CLI that fetches live news, calls a local Ollama LLM for sentiment scoring, and
pulls MOEX market data in batch — two of those runtime external calls plus a local LLM
would violate this repo's no-runtime-external-host rule (the only approved exception is
the single user-initiated `iss.moex.com` price refresh above). `recommendations.js`
instead computes portfolio-health nudges deterministically from the vault's own data.

**Bond board fallback + percent-of-face conversion:** `fetchPrice` tries
`engines/stock/markets/shares/boards/TQBR` first (the common case — stocks/ETFs), and
only on `MoexPriceError('unknown-ticker')` falls back to
`engines/stock/markets/bonds/boards/TQOB` (federal loan bonds; corporate bonds trade
elsewhere and aren't covered). A network error or a found-but-priceless ticker
(`'no-price'`) is thrown immediately — no fallback attempt, since those aren't
board-specific. MOEX quotes bond `LAST`/`PREVPRICE` as a **percent of face value** (e.g.
`53.109` on a 1000₽-face bond = 531.09₽), unlike shares/ETFs which quote RUB directly —
`parseMoexResponse(json, { isBond })` converts using the security's own `FACEVALUE`
(added to the `securities.columns` query param; harmless extra column on the shares
path). Coupon accrued interest (dirty price) is deliberately ignored — clean price is
close enough for a personal tracker.

## Tests

Unit tests (212 total: 91 vault + 90 stats + 14 prices + 13 recommendations + 4 dashboard-component render guard):
```
node --test .vitepress/theme/components/Finance/vault.test.mjs .vitepress/theme/components/Finance/stats.test.mjs .vitepress/theme/components/Finance/prices.test.mjs .vitepress/theme/components/Finance/recommendations.test.mjs .vitepress/theme/components/Finance/components.render.test.mjs
```

Browser-only syntax check:
```
node --check .vitepress/theme/components/Finance/db.js .vitepress/theme/components/Finance/exporter.js .vitepress/theme/components/Finance/prices.js
```
