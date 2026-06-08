# CLAUDE.md — alterfo.github.io-src

## Project overview

VitePress-based personal site with three fully client-side apps:
- `/idef0` — IDEF0 diagram editor (SVG + Vue 3, FIPS 183)
- `/journal` — private encrypted daily journal (WebCrypto AES-GCM, IndexedDB, 500-words/day mechanic, file-based sync)
- `/piano` — interactive MIDI piano teacher (Web MIDI API, VexFlow notation, IndexedDB progress)

## Key paths

- `.vitepress/theme/components/IDEF0Editor.vue` — root Vue component wrapped in `<ClientOnly>`, SVG-based editor
- `.vitepress/theme/components/IDEF0Editor/` — editor modules (see below)
- `idef0.md` — page that mounts the editor
- `.vitepress/theme/components/crypto.js` — shared WebCrypto substrate (PBKDF2 → AES-GCM); reused by journal and future modules
- `.vitepress/theme/components/Journal.vue` — journal root component (`<ClientOnly>`): unlock screen, editor, sync UI
- `.vitepress/theme/components/Journal/` — journal modules (see below)
- `journal.md` — page that mounts the journal (`layout: false`)
- `.vitepress/theme/components/Piano.vue` — piano teacher root component (async/`<ClientOnly>`): topbar, stave, keyboard, metronome
- `.vitepress/theme/components/Piano/` — piano modules (see below)
- `piano.md` — page that mounts the piano teacher
- `posts.data.ts` — VitePress data loader: reads `posts/*.md`, parses frontmatter, extracts `excerpt` via `extractExcerpt()` (first non-heading/list/blockquote/HTML line, strips inline Markdown, truncates to 120 chars; returns `''` if no qualifying paragraph found); `buildPost()` throws at build time if `date` or `title` frontmatter fields are absent or if `date` is unparseable
- `.vitepress/theme/components/BlogList.vue` — blog index component; groups posts by year (`groupedPosts` computed), renders year sections with per-post title, ISO-attributed `<time>`, and optional excerpt; uses hardcoded `rgba()` values instead of `var(--vp-c-*)` tokens to match the dark portfolio theme

## IDEF0 Editor modules

| File | Purpose |
|------|---------|
| `model.js` | Reactive project/diagram/box/arrow state via Vue 3 `ref`/`reactive`; CRUD functions; `resetProject()` also resets `_idCounter` — required for test isolation |
| `renderer.js` | Pure functions → SVG attribute objects for boxes, arrows (Manhattan routing), boundary arrows, labels |
| `layout.js` | `autoLayout` (FIPS 183 diagonal placement), `fitToView` for zoom/pan |
| `icom.js` | ICOM type constants, `SIDE_FOR_TYPE`, `icomCode()`, `validateDiagram()` (FIPS 183 rules) |
| `history.js` | Snapshot-based undo/redo (50-step limit); resets on diagram navigation |
| `hierarchy.js` | `decomposeBox`, node-id scheme (A0→A1→A11…), breadcrumb, `navigateTo`, `navigateUp` |
| `db.js` | IndexedDB persistence (`loadProject` / `saveProject`, debounce 300 ms) + cross-tab sync via localStorage |
| `exporter.js` | `exportToSVG`, `exportToPNG` (2×), `exportToJSON`, `importFromJSON` |

## FIPS 183 ICOM arrow rules

| Type | Edge | Marker |
|------|------|--------|
| INPUT | left (enters block) | I |
| OUTPUT | right (exits block) | O |
| CONTROL | top (enters block) | C |
| MECHANISM | bottom (enters block) | M |
| CALL | bottom (exits block) | R |

## Journal app

### Key paths

- `crypto.js` — SHARED substrate; reused by any future module (planner, decision-journal, etc.)
- `Journal/vault.js` — pure data model and logic
- `Journal/db.js` — IndexedDB persistence (envelope only, no plaintext)
- `Journal/exporter.js` — encrypted file export/import
- `Journal.vue` — full UI (unlock, editor, progress, past entries, sync)

### Journal modules

| File | Purpose |
|------|---------|
| `components/crypto.js` | `randomBytes`, `deriveKey` (PBKDF2-SHA-256 → AES-GCM 256), `encryptJSON`/`decryptJSON`, `packEnvelope`/`unpackEnvelope` (base64 at-rest format) |
| `Journal/vault.js` | `emptyVault`, `upsertEntry`, `countWords`, `goalMet`, `computeStreak`, `mergeVaults` (per-date LWW by `updatedAt`) |
| `Journal/db.js` | IndexedDB open/save/load for a single packed envelope string; debounced save 300 ms; cross-tab sync via localStorage |
| `Journal/exporter.js` | `exportEnvelope` → download `.journal` file; `readEnvelopeFile` → string |

### Crypto model

- Key derivation: `PBKDF2(passphrase, salt=16 bytes, iterations=600000, SHA-256)` → AES-GCM 256
- Per-encryption: `iv` = 12 random bytes; `salt` is per-vault (generated once on vault creation)
- At-rest envelope: `{ salt, iterations, iv, ciphertext }` all base64-encoded — no key, no plaintext ever persisted
- Key lives only in memory for the session; re-derived on unlock

### Vault shape

```
{ version, createdAt, entries: { "YYYY-MM-DD": { text, words, createdAt, updatedAt } } }
```

### Merge (single-user LWW)

Union of dates; for a shared date keep the entry with the greater `updatedAt`. Deterministic, idempotent, commutative — safe for file sync, no CRDT needed.

### Streak

Walk back from today; a day counts if `goalMet` (≥ 500 words); first miss ends the streak. Today's in-progress entry does not break a prior streak until the day rolls over.

### Sync

- v1 (implemented): encrypted file export/import — Export downloads a `.journal` envelope; Import reads it, decrypts with current key (or prompts separately), merges with LWW, saves
- Cross-tab sync: localStorage event triggers re-load + merge on other open tabs

### Reusable vault substrate

`components/crypto.js` + `Journal/vault.js` + `Journal/db.js` are designed for reuse. Future modules (planner, decision-journal, habit tracker) import the same crypto.js and can define their own vault shape and db.js variant without any shared-code changes.

### Tests

Unit tests run with `node --test` (Node 22, native `crypto.subtle`):
- `crypto.test.mjs` — derive→encrypt→decrypt round-trip; wrong passphrase rejects; envelope pack/unpack; large-buffer base64 (byte-loop, no spread-overflow)
- `Journal/vault.test.mjs` — `countWords`, `upsertEntry`, `computeStreak`, `mergeVaults`
- `Journal/exporter.test.mjs` — encrypt→pack→unpack→decrypt→merge round-trip; tampered ciphertext rejects

## Piano Teacher app

### Piano modules

| File | Purpose |
|------|---------|
| `Piano/midi.js` | `useMidi()` composable: `requestMIDIAccess`, reactive `pressedNotes` Set, `onNoteOn(cb)` / `onNoteOff(cb)` event hooks, `deviceName`, `status` |
| `Piano/audio.js` | `usePianoAudio()` composable: Tone.js PolySynth (triangle8) + optional Salamander HD sampler; EQ3→Compressor→Reverb→Limiter chain; `playNote(midi, vel)`, `releaseNote(midi)`, `loadSampler()`, `dispose()`; `mode` ref (`'synth'`\|`'sampler'`), `samplerReady`, `samplerLoading` |
| `Piano/score.js` | Score JSON CRUD, built-in pieces, `getScaleKeys(key)`, `getNonScaleKeys()`, `getActiveKey(score, phraseIdx, measureIdx)`, `midiToNoteName(midi)` |
| `Piano/trainer.js` | `createLevel1State` / `createLevel2State`; `checkNote()` / `repeatSection()` generic dispatchers; `getCurrentNote()`; L1 repeats measure, L2 repeats phrase |
| `Piano/renderer.js` | VexFlow wrapper: `renderPhrase(container, phrase, cursor)`, highlight, look-ahead, wrong-note flash |
| `Piano/keyboard.js` | SVG 88-key piano: `generateKeyRects()`, `keyColor()`, `buildKeyLayout()` |
| `Piano/db.js` | IndexedDB database `piano`, object store `progress`: `loadProgress(scoreId)`, `saveProgress(scoreId, state)`, debounce 300 ms |

### Piano bundle notes

- `Piano.vue` is registered as `defineAsyncComponent` — VexFlow loads only on `/piano`
- VexFlow is isolated via `manualChunks` in `config.mts` → separate `vexflow.[hash].js` chunk (~677 KB gzip)
- Firefox: Web MIDI requires `dom.webmidi.enabled` flag; Safari: unsupported natively
- HD sampler loads from `/audio/salamander/` (local Salamander Grand Piano mp3s; not bundled — must be present in `public/audio/salamander/` for HD mode to work)

## Development

- Pure-logic unit tests: `node --test .vitepress/theme/components/crypto.test.mjs` and `node --test .vitepress/theme/components/Journal/*.test.mjs`
- IDEF0 model unit tests: `node --test .vitepress/theme/components/IDEF0Editor/model.test.mjs`
- Piano unit tests: `node --test .vitepress/theme/components/Piano/*.test.mjs`
- DOM/IndexedDB/file UI: manual browser verification (no automated harness)
- Dev server: `npm run dev` (VitePress) — **use npm, not yarn** (yarn is broken in this repo)
- Build: `npm run build`

## Key patterns

- SVG viewport: fixed `viewBox="0 0 1200 800"`, zoom via CSS `scale(zoom)`, pan via `translate(panX, panY)`
- Blocks: `<rect>` white fill + 1px stroke, label centered, number in bottom-right; red stroke on validation error; `[+]` marker if decomposed
- Arrows: Manhattan L-shaped routing (min 2 segments, 90° corners); internal = solid, boundary = `stroke-dasharray="5,5"`; arrowhead = filled 6px triangle
- Boundary arrows attach to diagram edges; ICOM code (I1/C1/O1/M1/R1) shown at edge attachment point
- Double-click block → inline `<foreignObject><input>` label editor; Enter/blur saves, Escape cancels
- Ctrl+Z / Ctrl+Y → undo/redo; Hover block → ICOM handles appear for drawing arrows
- Decompose: toolbar "↳ Войти" button navigates into child diagram; breadcrumb for navigation
- Plan files live in `docs/plans/` and are git-ignored (local only)

## Completed features

### IDEF0 editor (as of 2026-06-07)

- Full rewrite: canvas → SVG + Vue 3, strictly following FIPS 183
- Reactive model (model.js): Project / Diagram / Box / Arrow / BoundaryArrow data structures
- SVG rendering: boxes, internal arrows (Manhattan routing), boundary arrows with ICOM codes
- Auto-layout: FIPS 183 diagonal placement (box 1 top-left, box N bottom-right)
- Block drag-and-drop; arrow routing updates on drag; click-to-select; Delete to remove
- Arrow drawing: hover handles on block sides → drag to connect → ICOM type popup
- Inline label editing: double-click block or arrow label
- Diagram hierarchy: decompose box → child diagram with boundary arrows; breadcrumb navigation
- Undo/redo (Ctrl+Z / Ctrl+Y), 50-step snapshots, resets on diagram switch
- IndexedDB persistence (auto-save debounced 300 ms) + cross-tab sync via localStorage
- Export: SVG, PNG (2×), JSON; Import: JSON round-trip
- FIPS 183 validation panel: errors shown in sidebar, red border on offending blocks
- Remove decomposition: "✕ Декомп." toolbar button (enabled only when selected box has `childDiagramId`) recursively deletes child diagram subtree from `project.diagrams` and `project.childMap`, clears `box.childDiagramId`, navigates away if current view is inside the deleted subtree

### Journal app (as of 2026-06-08)

- WebCrypto substrate: PBKDF2 key derivation + AES-GCM encrypt/decrypt + base64 envelope format
- Vault data model: entries by date, word count, streak, per-date LWW merge
- Encrypted IndexedDB persistence: only the packed envelope is stored (no plaintext, no key)
- Journal UI: unlock screen, today's textarea with live word count, 500-word progress bar, streak display, past-entries list, optional focus-lock mode
- Debounced autosave: edit → upsertEntry → encryptJSON → packEnvelope → db.saveEnvelope
- Cross-tab sync via localStorage events
- Sync v1: encrypted file export/import (.journal files) with LWW merge on import
- Unit tests for all pure logic (crypto, vault, exporter data layer)

### Piano Teacher app (as of 2026-06-08)

- Interactive MIDI teacher at `/piano`: Web MIDI API (no polyfill, native), VexFlow 5 via npm (no CDN)
- Modules in `.vitepress/theme/components/Piano/`:
  - `midi.js` — `useMidi()` composable: device list, reactive pressed-notes Set, noteOn/noteOff
  - `score.js` — Score JSON format (phrases/measures/notes), built-in pieces (C major scale, Twinkle, Minuet in G, Ode to Joy, Rachmaninoff Sym. 2 Adagio), `getScaleKeys()`, `getActiveKey()`; all measures must sum to `timeSignature[0]` beats (validated by beat-sum test in `score.test.mjs`)
  - `trainer.js` — `createLevel1State` / `createLevel2State`; `checkNote()` / `repeatSection()` dispatchers; L1 repeats measure, L2 repeats phrase
  - `renderer.js` — VexFlow wrapper: `renderPhrase()`, current-note highlight, look-ahead (30% opacity), wrong-note flash (400 ms red overlay)
  - `keyboard.js` — SVG 88-key piano (A0–C8), `generateKeyRects()`, `keyColor()`
  - `db.js` — IndexedDB database `piano` / store `progress`, session stats (accuracy %, notesPlayed, longestStreak), debounced save 300 ms
- Full UI: topbar (score dropdown, level toggle, tempo slider, hand toggle), VexFlow stave, keyboard strip, metronome (4 beat dots), status bar (measure/phrase, accuracy, streak)
- Piano.vue registered as `defineAsyncComponent` — VexFlow only loads on `/piano`, not bundled in shared theme chunk
- VexFlow isolated in its own build chunk (`~677 KB gzip`); Piano component itself ~7 KB gzip
- Firefox note: Web MIDI API requires `dom.webmidi.enabled` flag or WebMIDIAPI shim; Safari unsupported (banner shown)
- Unit tests: `node --test .vitepress/theme/components/Piano/*.test.mjs`
