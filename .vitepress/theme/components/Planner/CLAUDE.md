# Planner app

Encrypted project/task planner at `/planner`. Reuses shared `components/crypto.js` (PBKDF2 → AES-GCM). Distinguishing feature: **File System Access bridge** writes a plaintext `tasks.json` (notes stripped) to a user folder so Claude Code can edit tasks on disk; changes merge back on window `focus`.

Root component: `.vitepress/theme/components/PlannerEditor.vue` (static registration in `index.mts`).
Page: `planner.md` (`layout: false`).

## Modules

| File | Purpose |
|------|---------|
| `constants.js` | `STATUS` (array — preserves kanban column order), `PRIORITY` (label+color), `makeId()` (`randomUUID().slice(0,8)`), `todayISO(date)` (**local** `'YYYY-MM-DD'` from `Date` getters, NOT `toISOString()` which is UTC and shifts the day) |
| `store.js` | Module-level `reactive({projects,tasks})` **singleton** + `selectedProjectId`/`selectedTaskId` refs; CRUD (`addProject`/`renameProject`/`removeProject` tombstones, `addTask`/`updateTask`/`removeTask`); `loadData`/`getSnapshot`/`resetState`. Pure helpers: `isOverdue`, `isDueToday`, `visibleTasks`, `sortTasks`, `projectForFile` (**strips `note`** — security), `mergeFromFile`/`mergeProjectsFromFile` (LWW, never touch `note`), `mergeVaultTasks` (note-aware, for cross-tab sync) |
| `db.js` | Encrypted IndexedDB `planner` v1: stores `vault`/`meta`/`fs`. `writeVault` (awaited, non-debounced — create-vault guard), `saveVault` (debounced 300 ms + cross-tab ping), `loadVault`, `saveDirHandle`/`loadDirHandle` (stored directly — structured-cloneable, do NOT serialize), `initCrossTabSync` |
| `fsbridge.js` | File System Access API. `fsSupported` (Chrome/Edge only), `pickDirectory`/`ensurePermission` (**must run inside a click gesture**), `checkPermission` (no prompt — safe on start), `writeTasksJson` (atomic via `createWritable`→`close`), `readTasksJson` (→ `null` if missing/invalid) |
| `exporter.js` | `exportEnvelope` → download `.planner` file; `readEnvelopeFile` → string |

## Crypto model (shared with journal)

`PBKDF2(passphrase, salt=16 bytes, iterations=600000, SHA-256)` → AES-GCM 256; `iv` = 12 random bytes per encrypt; at-rest envelope `{salt,iterations,iv,ciphertext}` base64 — no key, no plaintext ever persisted.

## Data model

```js
Project = { id, name, color, deleted, createdAt }
Task    = { id, projectId, title, status, priority, dueDate, tags, note, deleted, createdAt, updatedAt }
// status: 'todo'|'in-progress'|'done'   priority: 'low'|'medium'|'high'
// note: PRIVATE — encrypted only, NEVER in tasks.json
// deleted: tombstone — removeProject tombstones project AND its tasks; never hard-splices
```

## tasks.json contract (agent-editable — read before editing tasks)

`projectForFile(state)` writes a plaintext projection. Shape:

```json
{
  "_readme": "Edit tasks below. To signal a change set updatedAt to Date.now() (epoch ms). Set deleted:true to remove. Notes are private and not shown here.",
  "projects": [{ "id": "...", "name": "...", "color": "...", "deleted": false, "createdAt": 0 }],
  "tasks": [{ "id": "...", "projectId": "...", "title": "...", "status": "todo", "priority": "high", "dueDate": "2026-06-15", "tags": [], "deleted": false, "createdAt": 0, "updatedAt": 0 }]
}
```

**Rules:**
- `note` is NEVER in `tasks.json` — no way to read or write a private note from disk.
- To signal an edit, **bump `updatedAt` to `Date.now()`**. A file task wins only if `updatedAt` is strictly greater than the app's copy.
- A new task object (unknown id) is added with `note:''`.
- To delete: set `deleted:true` + bump `updatedAt`. **Absence ≠ deletion** — a missing task line is KEPT.
- Project deletion is **monotonic**: file `deleted:true` tombstones a known project, but can never un-delete a local tombstone.

## Tests

```
node --test .vitepress/theme/components/Planner/store.test.mjs
```
`db.js`/`fsbridge.js`/`exporter.js` are browser-only → `node --check` only.
