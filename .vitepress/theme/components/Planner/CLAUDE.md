# Planner app

Encrypted project/task planner at `/planner`. Reuses shared `components/crypto.js` (PBKDF2 → AES-GCM). Persistence is **encrypted-vault-only** (IndexedDB) plus the encrypted `.planner` export/import for backup — no plaintext ever leaves the vault.

Root component: `.vitepress/theme/components/PlannerEditor.vue` (static registration in `index.mts`).
Page: `planner.md` (`layout: false`).

## Modules

| File | Purpose |
|------|---------|
| `constants.js` | `STATUS` (array — preserves kanban column order), `PRIORITY` (label+color), `makeId()` (`randomUUID().slice(0,8)`), `todayISO(date)` (**local** `'YYYY-MM-DD'` from `Date` getters, NOT `toISOString()` which is UTC and shifts the day) |
| `store.js` | Module-level `reactive({projects,tasks})` **singleton** + `selectedProjectId`/`selectedTaskId` refs; CRUD (`addProject`/`renameProject`/`removeProject` tombstones, `addTask`/`updateTask`/`removeTask`); `loadData`/`getSnapshot`/`resetState`. Pure helpers: `isOverdue`, `isDueToday`, `visibleTasks`, `sortTasks`, `mergeProjectsFromFile` (LWW, never touch `note`), `mergeVaultTasks` (note-aware, for `.planner` import + cross-tab sync) |
| `db.js` | Encrypted IndexedDB `planner` v1: stores `vault`/`meta`. `writeVault` (awaited, non-debounced — create-vault guard), `saveVault` (debounced 300 ms + cross-tab ping), `loadVault`, `initCrossTabSync` |
| `exporter.js` | `exportEnvelope` → download `.planner` file; `readEnvelopeFile` → string |

## Crypto model (shared with journal)

`PBKDF2(passphrase, salt=16 bytes, iterations=600000, SHA-256)` → AES-GCM 256; `iv` = 12 random bytes per encrypt; at-rest envelope `{salt,iterations,iv,ciphertext}` base64 — no key, no plaintext ever persisted.

## Data model

```js
Project = { id, name, color, deleted, createdAt }
Task    = { id, projectId, title, status, priority, dueDate, tags, note, deleted, createdAt, updatedAt }
// status: 'todo'|'in-progress'|'done'   priority: 'low'|'medium'|'high'
// note: PRIVATE — encrypted only, never leaves the vault
// deleted: tombstone — removeProject tombstones project AND its tasks; never hard-splices
```

## Persistence & merge rules

State lives only in the encrypted IndexedDB vault; the encrypted `.planner` export/import is the
backup path. There is **no plaintext projection** — `note` and every other field stay encrypted.

- `mergeProjectsFromFile` (LWW, never touches `note`) and `mergeVaultTasks` (note-aware) merge an
  imported `.planner` envelope and reconcile cross-tab vault updates.
- Project deletion is **monotonic**: a remote `deleted:true` tombstones a known project, but can
  never un-delete a local tombstone.

## Tests

```
node --test .vitepress/theme/components/Planner/store.test.mjs
```
`db.js`/`exporter.js` are browser-only → `node --check` only.
