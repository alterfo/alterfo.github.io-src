# Finance tracker app

Encrypted personal finance tracker at `/finance`: expenses, account balances, and an RU-market investment portfolio (MOEX-listed stocks/ETFs). RUB only — no multi-currency, no FX conversion.

Root component: `.vitepress/theme/components/FinanceApp.vue` (`defineAsyncComponent` in `index.mts`).
Page: `finance.md` (`layout: false`). SEO: `TOOL_CATEGORY` → `FinanceApplication` JSON-LD + sitemap 0.8.

## Modules

| File | Purpose |
|------|---------|
| `constants.js` | `makeId()`, `todayISO(date)` (local, not UTC), `EXPENSE_CATEGORIES` (fixed 7-item list incl. `other`), `DEFAULT_CATEGORY`. Pure |
| `vault.js` | Pure (no DOM/crypto/IndexedDB → node-testable). `emptyVault()`, `upsertExpense`/`upsertAccount`/`upsertHolding` (partial-edit semantics, `createdAt` preserved, `updatedAt` bumped), `removeExpense`/`removeAccount`/`removeHolding` (tombstone `deleted:true`, never splice), selectors `expensesInRange`/`openAccounts`/`openHoldings`, `mergeVaults(a,b)` (LWW on `updatedAt` per entity map, commutative/idempotent, `a` wins on tie) |
| `stats.js` | Pure aggregation. `totalBalance(accounts)`, `spendByCategory(expenses, fromISO, toISO)`, `holdingValue(holding)` (`qty * (lastPrice ?? purchasePrice)`), `portfolioValue(holdings)`, `holdingGainLoss(holding)`, `portfolioGainLoss(holdings)`, `netWorth(accounts, holdings)`. Empty input → `0`, never `NaN` |
| `prices.js` | MOEX ISS current-price lookup — see "MOEX ISS price lookup" below. `parseMoexResponse(json)` is pure (node-testable against fixture JSON); `fetchPrice(ticker)` is the browser-only `fetch` wrapper; `MoexPriceError` typed error (`network`, `unknown-ticker`, `no-price`) |
| `db.js` | Encrypted IndexedDB `finance` (single envelope). `loadEnvelope`, `saveEnvelope` (debounced 300 ms + cross-tab ping on `finance:saved`), `saveEnvelopeNow` (awaited, rejects on failure — create-vault guard), `cancelPendingSave`, `initCrossTabSync`. Browser-only |
| `exporter.js` | `exportEnvelope` → download `.finance` file; `readEnvelopeFile` → string. Browser-only |

## Crypto model (shared with journal/planner/decisions)

`PBKDF2(passphrase, salt=16 bytes, iterations=600000, SHA-256)` → AES-GCM 256; `iv` = 12 random bytes; at-rest envelope `{salt,iterations,iv,ciphertext}` base64 — no key, no plaintext persisted.

## Vault shape

```
{
  version: 1,
  createdAt: ISO,
  expenses: { [id]: Expense },
  accounts: { [id]: Account },
  holdings: { [id]: Holding },
}

Expense = { id, amount (RUB), category (from EXPENSE_CATEGORIES), note,
            date ('YYYY-MM-DD', local), deleted, createdAt, updatedAt }
Account = { id, name, balance (RUB, manually entered), deleted, createdAt, updatedAt }
Holding = { id, ticker (MOEX SECID, e.g. 'SBER'), qty,
            purchaseDate ('YYYY-MM-DD'), purchasePrice (RUB),
            lastPrice (RUB|null), priceAsOf (ISO|null),
            deleted, createdAt, updatedAt }
```

## MOEX ISS price lookup — runtime-fetch exception

`prices.js` calls `iss.moex.com` (official Moscow Exchange ISS API, no key/auth) to fetch the current price for a held ticker. This is the **only** external-host runtime fetch in this repo — every other app makes zero runtime calls to external hosts. It's a deliberate, narrow, user-approved exception:

- One endpoint, one host, no API key.
- User-initiated only — a "refresh prices" button in `FinanceApp.vue`. Never automatic, never polling/background.
- Only the ticker symbol (public market data) goes in the URL path — no analytics/tracking payload.
- `LAST` (live trade price) is preferred; falls back to `PREVPRICE` (previous close) when `LAST` is null, which happens outside trading hours.
- On success, the price is cached onto the holding (`lastPrice`/`priceAsOf`) via `vault.js`'s `upsertHolding` so the app has a usable last-known price offline.
- See the matching note in root `CLAUDE.md`'s "Known deferred advisories" section — don't flag this as an accidental CDN/runtime-fetch violation.

## Tests

```
node --test .vitepress/theme/components/Finance/vault.test.mjs
node --test .vitepress/theme/components/Finance/stats.test.mjs
node --test .vitepress/theme/components/Finance/prices.test.mjs
node --check .vitepress/theme/components/Finance/db.js
node --check .vitepress/theme/components/Finance/exporter.js
node --check .vitepress/theme/components/Finance/prices.js
```
