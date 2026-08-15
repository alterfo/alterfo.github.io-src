# Finance tracker app

Encrypted personal finance tracker at `/finance`: income/expense transactions, account balances, bank term deposits, and an RU-market investment portfolio (MOEX-listed stocks/ETFs). RUB only — no multi-currency, no FX conversion.

Root component: `.vitepress/theme/components/FinanceApp.vue` (`defineAsyncComponent` in `index.mts`).
Page: `finance.md` (`layout: false`). SEO: `TOOL_CATEGORY` → `FinanceApplication` JSON-LD + sitemap 0.8.

## Modules

| File | Purpose |
|------|---------|
| `constants.js` | `makeId()`, `todayISO(date)` (local, not UTC), `EXPENSE_CATEGORIES` / `INCOME_CATEGORIES` (fixed lists), `DEFAULT_EXPENSE_CATEGORY` / `DEFAULT_INCOME_CATEGORY`. Pure |
| `vault.js` | Pure (no DOM/crypto/IndexedDB → node-testable). `emptyVault()`, `upsertTransaction`/`upsertAccount`/`upsertHolding`/`upsertDeposit` (partial-edit semantics, `createdAt` preserved, `updatedAt` bumped), `removeTransaction`/`removeAccount`/`removeHolding`/`removeDeposit` (tombstone `deleted:true`, never splice), selectors `transactionsInRange`/`openAccounts`/`openHoldings`/`openDeposits`, `upsertSettings(vault, partial, now)` (persists `defaultAccountId`), `migrateVaultV1toV2(vault)` (one-time migration from expense-only schema), `closeDeposit(vault, closeOpts, now)` (marks closed + creates income transaction), `sellHolding(vault, sellOpts, now)` (reduces qty/tombstones + creates income transaction), `mergeVaults(a,b)` (LWW on `updatedAt` per entity map + settings, commutative/idempotent, `a` wins on tie) |
| `stats.js` | Pure aggregation. `totalBalance(accounts)`, `expenseByCategory(transactions, fromISO, toISO)`, `incomeByCategory(transactions, fromISO, toISO)`, `netForRange(transactions, fromISO, toISO)` → `{income, expense, net}`, `holdingValue(holding)` (`qty * (lastPrice ?? purchasePrice)`), `portfolioValue(holdings)`, `holdingGainLoss(holding)` (subtracts `purchaseCommission`), `portfolioGainLoss(holdings)`, `depositAccruedInterest(deposit, asOfISO)` (simple or daily-compounded, capped at maturity), `depositValue(deposit, asOfISO)` (`principal + accrued`), `netWorth(accounts, holdings, deposits)`, `monthlyTrend(transactions, monthsBack, referenceISO)` → array of `{month, income, expense, net}`, `periodRange(kind, referenceISO)` where `kind` ∈ `{'month', 'year', 'all-time'}` → `{fromISO, toISO}`, legacy `spendByCategory` alias. Empty input → `0`/`{}`, never `NaN` |
| `prices.js` | MOEX ISS current-price lookup — see "MOEX ISS price lookup" below. `parseMoexResponse(json)` is pure (node-testable against fixture JSON); `fetchPrice(ticker)` is the browser-only `fetch` wrapper; `MoexPriceError` typed error (`network`, `unknown-ticker`, `no-price`) |
| `db.js` | Encrypted IndexedDB `finance` (single envelope). `loadEnvelope`, `saveEnvelope` (debounced 300 ms + cross-tab ping on `finance:saved`), `saveEnvelopeNow` (awaited, rejects on failure — create-vault guard), `cancelPendingSave`, `initCrossTabSync`. Browser-only |
| `exporter.js` | `exportEnvelope` → download `.finance` file; `readEnvelopeFile` → string. Browser-only |

## Crypto model (shared with journal/planner/decisions)

`PBKDF2(passphrase, salt=16 bytes, iterations=600000, SHA-256)` → AES-GCM 256; `iv` = 12 random bytes; at-rest envelope `{salt,iterations,iv,ciphertext}` base64 — no key, no plaintext persisted.

## Vault shape (v2)

```
{
  version: 2,
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
Account     = { id, name, balance (RUB, manually entered), deleted, createdAt, updatedAt }
Holding     = { id, ticker (MOEX SECID, e.g. 'SBER'), qty,
                purchaseDate ('YYYY-MM-DD'), purchasePrice (RUB),
                purchaseCommission (RUB, default 0),
                lastPrice (RUB|null), priceAsOf (ISO|null),
                deleted, createdAt, updatedAt }
Deposit     = { id, name, principal (RUB), rate (annual fraction, e.g. 0.18),
                openDate ('YYYY-MM-DD'), maturityDate ('YYYY-MM-DD'),
                capitalization (bool), closed (bool), deleted, createdAt, updatedAt }
```

**V1→V2 migration:** `migrateVaultV1toV2()` is called automatically on vault load. Converts `expenses` → `transactions` (all become `direction: 'expense'`, `accountId: null`), adds empty `deposits: {}` and `settings: { defaultAccountId: null, updatedAt: createdAt }`, bumps `version: 2`. Idempotent — running on an already-migrated vault is a no-op.

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

Unit tests (121 total: 54 vault + 61 stats + 6 prices):
```
node --test .vitepress/theme/components/Finance/vault.test.mjs .vitepress/theme/components/Finance/stats.test.mjs .vitepress/theme/components/Finance/prices.test.mjs
```

Browser-only syntax check:
```
node --check .vitepress/theme/components/Finance/db.js .vitepress/theme/components/Finance/exporter.js .vitepress/theme/components/Finance/prices.js
```
