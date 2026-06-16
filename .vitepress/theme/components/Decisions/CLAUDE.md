# Decision Journal app

Encrypted decision journal with calibration at `/decision-journal`. Records a decision + confidence % + review date; when review date arrives, you mark the outcome → Brier score + confidence-bucket calibration.

Root component: `.vitepress/theme/components/DecisionJournal.vue` (static registration in `index.mts`).
Page: `decision-journal.md` (`layout: false`). SEO: `TOOL_CATEGORY` → SoftwareApplication JSON-LD + sitemap 0.8.

## Modules

| File | Purpose |
|------|---------|
| `vault.js` | Pure (no DOM/crypto/IndexedDB → node-testable). `emptyVault()`, `makeDecisionId()`, `clampConfidence` (int 0–100, non-finite → 50), `upsertDecision`, `markReviewed(vault,id,outcome,actualOutcome,now)` (invalid outcome → null, stays queued), `removeDecision` (tombstone `deleted:true`, never splice), selectors `dueForReview`/`openDecisions`/`reviewedDecisions`, `mergeVaults(a,b)` (LWW on `updatedAt`, commutative/idempotent, `a` wins on tie) |
| `stats.js` | Pure calibration math. `brierScore(decisions)` → `mean((confidence/100 − (correct?1:0))²)` over reviewed decisions, `null` if none. `calibrationBuckets(decisions, edges=[50,60,70,80,90,101])` → per-bucket `{ label, n, avgConfidence, hitRate }` (sub-50 lands in leading `[0,50)` bucket; empty → `null`, never `NaN`). `counts(decisions, todayISO)` → `{ total, open, due, reviewed }` |
| `db.js` | Encrypted IndexedDB `decision-journal` (single envelope). `loadEnvelope`, `saveEnvelope` (debounced 300 ms + cross-tab ping on `decisions:ping`), `saveEnvelopeNow` (awaited, rejects on failure — create-vault guard), `cancelPendingSave`, `initCrossTabSync`. Browser-only |
| `exporter.js` | `exportEnvelope` → download `.decisions` file; `readEnvelopeFile` → string. Browser-only |

## Crypto model (shared with journal/planner)

`PBKDF2(passphrase, salt=16 bytes, iterations=600000, SHA-256)` → AES-GCM 256; `iv` = 12 random bytes; at-rest envelope `{salt,iterations,iv,ciphertext}` base64 — no key, no plaintext persisted.

## Vault shape

```
{ version: 1, createdAt, decisions: { [id]: Decision } }
Decision = { id, title, context, options: string[], chosen, expectedOutcome,
             confidence (0–100 int), reviewDate ('YYYY-MM-DD'|null),
             outcome (null|'correct'|'wrong'), actualOutcome,
             reviewedAt (null|ISO), deleted (false), createdAt (ISO), updatedAt (ISO) }
```

## Calibration

Brier and buckets score **only reviewed** decisions (`outcome !== null`). `correct` → 1, `wrong` → 0. Brier 0 = perfect, 0.25 = coin-flip (50 % confidence with random outcomes), 1 = maximally wrong. Well-calibrated: per-bucket `hitRate ≈ avgConfidence/100`.

## Tests

```
node --test .vitepress/theme/components/Decisions/vault.test.mjs
node --test .vitepress/theme/components/Decisions/stats.test.mjs
```
