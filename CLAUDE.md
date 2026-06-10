# CLAUDE.md — alterfo.github.io-src

## Project overview

VitePress-based personal site with four fully client-side apps:
- `/idef0` — IDEF0 diagram editor (SVG + Vue 3, FIPS 183)
- `/journal` — private encrypted daily journal (WebCrypto AES-GCM, IndexedDB, 500-words/day mechanic, file-based sync)
- `/piano` — interactive MIDI piano teacher (Web MIDI API, VexFlow notation, IndexedDB progress)
- `/openpose` — OpenPose pose editor (MediaPipe Tasks Vision / BlazePose, WASM in-browser, drag-edit skeletons, ControlNet PNG + OpenPose v1.3 JSON export)

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
- `.vitepress/theme/components/OpenPoseEditor.vue` — OpenPose root component (`<ClientOnly>`): batch-upload queue, canvas preview, drag-edit toolbar, PNG/JSON export
- `.vitepress/theme/components/OpenPose/` — OpenPose modules (see below)
- `openpose.md` — page that mounts the editor (`layout: false`)
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
- `Journal.vue` — full UI (unlock, editor, progress, past entries, read-only past-entry viewer, sync)

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
| `Piano/score.js` | Score JSON CRUD, built-in pieces, `getScaleKeys(key)`, `getNonScaleKeys()`, `getActiveKey(score, phraseIdx, measureIdx)`, `midiToNoteName(midi)`; shared importer helpers `beatsToDurationCode(beats)` (snap quarter-beats → VexFlow code) and `makeUserScoreId()` (collision-resistant `user-<ts>-<seq>` via a module-level counter shared across all importers) |
| `Piano/trainer.js` | `createLevel1State` / `createLevel2State`; `checkNote()` / `repeatSection()` generic dispatchers; `getCurrentNote()`; L1 repeats measure, L2 repeats phrase |
| `Piano/renderer.js` | VexFlow wrapper: `renderPhrase(container, phrase, cursor)`, highlight, look-ahead, wrong-note flash |
| `Piano/keyboard.js` | SVG 88-key piano: `generateKeyRects()`, `keyColor()`, `buildKeyLayout()` |
| `Piano/db.js` | IndexedDB database `piano`, object store `progress`: `loadProgress(scoreId)`, `saveProgress(scoreId, state)`, debounce 300 ms |
| `Piano/userScores.js` | Pure (no-Vue) localStorage persistence of full user-imported Score objects under key `piano:user-scores`: `loadUserScores()` / `saveUserScore(score)` / `deleteUserScore(id)`. Each takes an optional `storage` arg (defaults to `localStorage`, `null` under node/SSR → loads return `[]`, saves no-op). `saveUserScore` stamps `userImported: true` and returns a **new** array (reassign, don't mutate, to drive Vue reactivity) |
| `Piano/importer/musicxml.js` | `parseMusicXML(xmlString)` → Score; self-contained regex XML→tree parser (no DOMParser → runs under `node --test`); `<fifths>`+`<mode>` → key (major + relative-minor tables), `<staff>1/2` → right/left hand, `<chord/>` merges into a midi array; reads only the **first** `<part>` (grand staff); skips notes whose computed MIDI is non-finite |
| `Piano/importer/abc.js` | `parseABC(abcString)` → Score; dependency-free ABC subset: `^_=` accidentals, `,'` octave marks (uppercase = octave 4, C=60), `[CEG]` chords, `n/n` durations, `w:` lyrics |
| `Piano/importer/midifile.js` | `parseMIDIFile(arrayBuffer, options)` → `{ score, needsTimeSig, detectedTs }`; wraps `@tonejs/midi`. Pure converter `buildScoreFromMidi(midi, options)` is unit-tested with a mock Midi object. Returns `needsTimeSig: true` when the file has no time signature so the UI can prompt; `options.timeSignature` overrides |

### Piano bundle notes

- `Piano.vue` is registered as `defineAsyncComponent` — VexFlow loads only on `/piano`
- VexFlow is isolated via `manualChunks` in `config.mts` → separate `vexflow.[hash].js` chunk (~677 KB gzip)
- The renderer **and the three importers** (`musicxml.js` / `abc.js` / `midifile.js`) are loaded via dynamic `import()` from the Piano.vue handlers, **not** static top-level imports. This keeps the heavy `@tonejs/midi` dep (MIDI import) out of the shared `app.[hash].js` chunk that every page executes — it lands in a lazy `midifile.[hash].js` chunk instead. When adding a new importer, follow the same `await import(...)`-in-handler pattern.
- MIDI import depends on `@tonejs/midi` (npm, no CDN). Its namespace export is resolved defensively as `TonejsMidi.Midi ?? TonejsMidi.default?.Midi` because the build differs between Vite and node `--test`.
- Firefox: Web MIDI requires `dom.webmidi.enabled` flag; Safari: unsupported natively
- HD sampler loads from `/audio/salamander/` (local Salamander Grand Piano mp3s; not bundled — must be present in `public/audio/salamander/` for HD mode to work)
- Imported measures are **not** beat-sum-validated against the time signature (built-in scores are, via `score.test.mjs`). Durations are snapped to the nearest `DURATION_BEATS` code, so an imported bar may over/under-fill — `renderPhrase` uses `Voice.Mode.SOFT` + try/catch so this degrades gracefully rather than crashing. `.mxl` (zip-compressed MusicXML) is **not** supported; export uncompressed `.xml`.

## OpenPose Editor app

Client-side pose editor at `/openpose`: batch-upload images, auto-detect skeletons with MediaPipe BlazePose (in-browser WASM, up to 2 persons), drag-edit keypoints, export a black-background skeleton PNG + OpenPose v1.3 JSON for ControlNet / Stable Diffusion. A "Skeleton" is a flat 18-point array of `{ x, y, confidence }` in pixel coords; order matches `OPENPOSE_KEYPOINTS`.

### OpenPose modules

| File | Purpose |
|------|---------|
| `OpenPose/skeleton.js` | OpenPose COCO 18-keypoint defs (`OPENPOSE_KEYPOINTS`, 17-pair `OPENPOSE_CONNECTIONS`, parallel `LIMB_COLORS`), `BLAZEPOSE_TO_OPENPOSE` map, `blazeposeToOpenpose()` (33→18, Neck = shoulder-11/12 midpoint; missing landmarks → `{0,0,0}`, never throws), `emptySkeleton()` (T-pose, all confidence 1) |
| `OpenPose/model.js` | `usePoseDetection()` composable: `status`/`modelError` refs, `initModel()`, `detectPoses(img)`, `dispose()`; lazy `await import('@mediapipe/tasks-vision')` PoseLandmarker (full model, `numPoses: 2`, `runningMode: 'IMAGE'`) |
| `OpenPose/renderer.js` | `renderSkeleton(ctx, skel, colorOverride?, lineWidth?, dotRadius?)`, `renderSkeletonOnCanvas()` (photo + overlay; person 1 at 0.7 alpha), `renderSkeletonOnBlack()` (black bg, ControlNet PNG — returns `OffscreenCanvas` when available); `CONFIDENCE_THRESHOLD = 0.3` skips limbs/dots |
| `OpenPose/editor.js` | pure `moveKeypoint` / `addPerson` / `removePerson` (`MAX_PERSONS = 2`) + `useSkeletonEditor()` — transparent SVG drag overlay aligned to the canvas via `viewBox` = canvas pixel size |
| `OpenPose/exporter.js` | `toOpenPoseJSON()` (v1.3, coords normalized 0–1, one `people` entry per skeleton) + `downloadJSON` / `downloadPNG` (handles both `<canvas>.toBlob` and `OffscreenCanvas.convertToBlob`) |

### MediaPipe model + WASM (non-obvious, required for the app to run)

- WASM runtime is copied from `node_modules/@mediapipe/tasks-vision/wasm/` → `public/mediapipe/wasm/` by `scripts/copy-mediapipe-wasm.js`, run via `npm run mediapipe:copy` and auto-hooked into `predev` / `prebuild`.
- The model file `public/mediapipe/pose_landmarker_full.task` (~10.8 MB) is **gitignored** and must be downloaded once:
  ```bash
  curl -L "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task" -o public/mediapipe/pose_landmarker_full.task
  ```
  Same pattern as the Salamander piano samples. If missing, the app shows an error banner with this exact command.
- `@mediapipe/tasks-vision` is loaded via dynamic `import()` inside `initModel()` (same lazy pattern as the Piano importers) so it stays out of the shared `app` chunk and never runs during SSR — it lands in a lazy `vision_bundle.[hash].js` chunk. No `manualChunks` entry needed (dynamic-import auto-splitting). Namespace export resolved defensively as `vision.X ?? vision.default?.X`.
- `OpenPoseEditor.vue` is registered as a **static** import in `index.mts` (unlike `Piano.vue`'s `defineAsyncComponent`), but only the light OpenPose modules land in the shared chunk — the heavy MediaPipe runtime stays lazy via the dynamic import above.

## Design system «Spiral»

Unified visual identity for the **portfolio shell** (Portfolio.vue / Layout.vue / BlogList.vue / CountDown.vue). The internal UI of Journal / Piano / IDEF0 / OpenPose is **not** part of this system — those keep their own styling.

### Palette source of truth (two mirrors, same hex)

CSS cannot be imported as JS values, so the spectrum lives in two synced mirrors — **change a color in BOTH**:

- `.vitepress/theme/styles/vars.css` — `--ds-*` CSS custom properties (imported via `styles/index.css`). Holds base/void colors, text scale, the 6 spectrum colors, typography, radius, glow, and `--ds-border` (neutral separator).
- `.vitepress/theme/components/spectrum.js` — JS mirror for canvas/Vue logic: `SPECTRUM` (6 hex), `CANVAS_PALETTE` (8 `rgba(` prefixes — alpha + `)` appended at draw time, adds teal + yellow for particle richness), `PROJECT_COLORS` (project → spectrum hex).

The alternative (reading CSS vars from JS via `getComputedStyle`) was rejected as YAGNI complexity. Unit-tested in `spectrum.test.mjs`.

### Spectrum semantics (from the author's blog «Круг жизни»)

The wheel of life is split into colored spheres; «границы условны, перетекают друг в друга» = the connecting particles. The 6 project colors = 6 spheres: `--ds-violet` AR/signature/«я», `--ds-cyan` blog, `--ds-green` idef0, `--ds-pink` journal, `--ds-amber` piano, `--ds-orange` github. This ties the background, the countdown (growth), and the project grid into one story.

### Connecting particles — one module

`.vitepress/theme/components/ConnectingParticles.js` is the single source for the 2D connecting-particle background (replaced the two divergent copies that used to live in Portfolio.vue and Layout.vue). Pure, unit-tested helpers `stepParticle(p,w,h)` (torus-wrap step), `connectionAlpha(distance,maxDist)` (line fade), `createParticles(count,w,h,palette)`; plus the browser-only factory `createField(canvas, opts)` → `{ start, stop, resize, destroy }` (`opts`: `density`, `connectDistance`, `fade`, `palette`, `lineWidth`, `autoStart`, `getSize`, `count`). Portfolio.vue and the **2D fallback** in Layout.vue both call `createField`. The WebGPU 500k path (`WebGPUParticles.js`) is the premium header variant and is **untouched**. Helpers unit-tested in `ConnectingParticles.test.mjs`.

### Countdown «1000 дней роста»

`.vitepress/theme/components/CountDown.vue` renders 4 progress rings (Days/Hours/Minutes/Seconds), restyled under `--ds-*` tokens and colored from `SPECTRUM`. It is mounted in the Portfolio hero (`<CountDown class="hero-countdown" :countdownDays="1000" />`, default epoch — do **not** pass `startDate`). Pure date math is extracted to `.vitepress/theme/components/countdown.js`: `computeRemaining(startMs, days, nowMs)` and `ringOffset(value, max, circumference)`, unit-tested in `countdown.test.mjs`. Epoch: default `startDate = new Date(1742688224657)` (23/03/2025) + 1000 days → target ≈ 18/12/2027. **Do not change the epoch** (user decision — preserve the «1000 дней роста» history).

### LifeCircle «колесо жизни»

`.vitepress/theme/components/LifeCircle.vue` is the main element of the Portfolio shell — replaces the old `.projects-grid`. A donut «wheel of life» of 6 spheres (= 6 spectrum colors); each sphere's **outer radius encodes its readiness** (1–10), so the wheel is deliberately uneven and reads as «what's developed vs. not». Each sphere is an `<a href>` linking to the project (or a `<g>` for the `soon` planner, which has no link). No `<ClientOnly>` (pure SVG, no DOM API). The 6 segments are **hardcoded** in the component (`SEGMENTS`) — they only change with a release; no props.

- Geometry: `viewBox="-45 -5 490 410"` (widened so outside labels never clip; wheel itself centred at `200,200`). `INNER_R = 55`, `MAX_OUTER_R = 155`, `LABEL_R = 170`. 6 spheres × 56° + 6 × 4° gap = 360°: sphere `i` spans `startDeg = i*60 + 2 … endDeg = i*60 + 58`, midpoint `i*60 + 30`.
- Per sphere: faint full-radius track (`.seg-bg`, opacity 0.12) + readiness fill (`.seg-fill`, outer radius = `fillRadius(readiness, 55, 155)`) + crisp stroke edge (`.seg-stroke`) + outside two-line label (title + «N/10»). `soon: true` (planner) → dashed track, dim fill, «⟳ скоро» label.
- Spheres/readiness: Дневник `/journal` 9 (pink), IDEF0 `/idef0` 8 (green), AR Engine `/ar/` 5 (violet), Piano `/piano` 4 (amber), OpenPose `/openpose` 4 (cyan), Планировщик (soon, no href) 4 (orange).
- Hover: `scale(1.02)` + color-matched `drop-shadow` glow on non-`soon` spheres. `@media (max-width: 480px)` shrinks label font so it stays readable on mobile.
- Pure geometry helpers live in `.vitepress/theme/components/lifecircle.js` (`deg2rad` with 0° = top/CW, `arcPath` donut segment, `labelXY`, `fillRadius`), unit-tested in `lifecircle.test.mjs`. The SVG markup itself is verified manually (visual artifact, no DOM test).

### Dark theme only

There is no light theme and none is planned. If `color-mix` is unsupported on a target browser, fall back to `rgba()` with hex from the tokens.

## Development

- Pure-logic unit tests: `node --test .vitepress/theme/components/crypto.test.mjs` and `node --test .vitepress/theme/components/Journal/*.test.mjs`
- IDEF0 model unit tests: `node --test .vitepress/theme/components/IDEF0Editor/model.test.mjs`
- Piano unit tests: `node --test .vitepress/theme/components/Piano/*.test.mjs .vitepress/theme/components/Piano/importer/*.test.mjs` (the glob does **not** recurse — the importer suites live one level down and need their own pattern)
- OpenPose unit tests: `node --test .vitepress/theme/components/OpenPose/*.test.mjs` (skeleton, renderer, editor, exporter — renderer canvas tests mock `ctx`/`OffscreenCanvas`)
- Design-system unit tests: `node --test .vitepress/theme/components/spectrum.test.mjs .vitepress/theme/components/ConnectingParticles.test.mjs .vitepress/theme/components/countdown.test.mjs .vitepress/theme/components/lifecircle.test.mjs` (palette completeness, particle helpers, countdown date math, wheel-of-life geometry)
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

### Journal app (as of 2026-06-09)

- WebCrypto substrate: PBKDF2 key derivation + AES-GCM encrypt/decrypt + base64 envelope format
- Vault data model: entries by date, word count, streak, per-date LWW merge
- Encrypted IndexedDB persistence: only the packed envelope is stored (no plaintext, no key)
- Journal UI: unlock screen, today's textarea with live word count, 500-word progress bar, streak display, past-entries list, optional focus-lock mode
- Read-only past-entry viewer: clicking a calendar day (with an entry) or a past-entry card swaps the main zone (`viewDate` ref; null = today's editor) into a read-only full-text view (`white-space: pre-wrap`, flows in parent scroll); "← Сегодня" button (`closeViewer`) returns to the editor. No modal — same layout. `openEntry(iso)` is a no-op for empty/future days and routes today → editor. `Journal.vue`-only; vault stays decrypted in memory so no extra crypto
- Debounced autosave: edit → upsertEntry → encryptJSON → packEnvelope → db.saveEnvelope
- Cross-tab sync via localStorage events
- Sync v1: encrypted file export/import (.journal files) with LWW merge on import
- Unit tests for all pure logic (crypto, vault, exporter data layer)

### Piano Teacher app (as of 2026-06-08)

- Interactive MIDI teacher at `/piano`: Web MIDI API (no polyfill, native), VexFlow 5 via npm (no CDN)
- Modules in `.vitepress/theme/components/Piano/`:
  - `midi.js` — `useMidi()` composable: device list, reactive pressed-notes Set, noteOn/noteOff
  - `audio.js` — `usePianoAudio()` composable: Tone.js PolySynth (triangle8) + optional Salamander HD sampler; EQ3→Compressor→Reverb→Limiter chain; `playNote(midi, vel)`, `releaseNote(midi)`, `loadSampler()`, `dispose()`
  - `score.js` — Score JSON format (phrases/measures/notes), built-in pieces (C major scale, Twinkle, Minuet in G, Ode to Joy, Rachmaninoff Prelude in D major Op. 23 No. 4), `getScaleKeys()`, `getActiveKey()`; all measures must sum to `timeSignature[0]` beats (validated by beat-sum test in `score.test.mjs`)
  - `trainer.js` — `createLevel1State` / `createLevel2State`; `checkNote()` / `repeatSection()` dispatchers; L1 repeats measure, L2 repeats phrase; `triggerWrong()` calls `repeatSection()` for both levels and syncs all three cursor refs (phraseIdx, measureIdx, noteIdx)
  - `renderer.js` — VexFlow wrapper: `renderPhrase()`, current-note highlight, look-ahead (30% opacity), wrong-note flash (400 ms red overlay)
  - `keyboard.js` — SVG 88-key piano (A0–C8), `generateKeyRects()`, `keyColor()`
  - `db.js` — IndexedDB database `piano` / store `progress`, session stats (accuracy %, notesPlayed, longestStreak), debounced save 300 ms
- Full UI: topbar (score dropdown, level toggle, tempo slider, hand toggle, HD audio toggle), VexFlow stave, keyboard strip, metronome (4 beat dots), status bar (measure/phrase, accuracy, streak)
- Piano.vue registered as `defineAsyncComponent` — VexFlow only loads on `/piano`, not bundled in shared theme chunk
- VexFlow isolated in its own build chunk (`~677 KB gzip`); Piano component itself ~7 KB gzip
- Firefox note: Web MIDI API requires `dom.webmidi.enabled` flag or WebMIDIAPI shim; Safari unsupported (banner shown)
- Unit tests: `node --test .vitepress/theme/components/Piano/*.test.mjs`

### Piano score import (as of 2026-06-09)

- Import user pieces in three formats via the `/piano` topbar: `.xml` (MusicXML), `.abc`/`.txt` (typed in a modal or uploaded), `.mid`/`.midi` (MIDI, via `@tonejs/midi`)
- Importers in `Piano/importer/` (`musicxml.js`, `abc.js`, `midifile.js`) → the shared Score shape; lazy-loaded via dynamic `import()` in Piano.vue handlers so `@tonejs/midi` stays out of the shared `app` chunk
- Imported scores persist in `localStorage` (`piano:user-scores`) via `Piano/userScores.js`; ids are `user-<ts>-<seq>` (`makeUserScoreId()` in `score.js`); `userImported: true` marks them with a 🎵 in the dropdown and enables the ✕ delete button
- `currentScore` resolves user-scores first (full objects in `userScores.value`), then falls back to `loadScore()` (built-ins) — required because `loadScore()` returns `SCORES[0]` on a miss
- MIDI files often omit a time signature: `parseMIDIFile` returns `needsTimeSig: true` → Piano.vue shows a 2/4·3/4·4/4·6/8 picker, then re-parses the buffered file with the chosen meter
- `.mxl` (compressed MusicXML) is rejected with a clear error (it's a zip, not text)
- Unit tests: `node --test .vitepress/theme/components/Piano/importer/*.test.mjs` (musicxml, abc, midifile) plus `userScores.test.mjs`

### OpenPose Editor app (as of 2026-06-09)

- Client-side pose editor at `/openpose`: in-browser BlazePose detection via MediaPipe Tasks Vision WASM (no server, no CDN — WASM copied locally, model downloaded once and gitignored)
- BlazePose 33-keypoint → OpenPose COCO 18-keypoint mapping (`Neck` = shoulder midpoint); missing landmarks degrade to `{0,0,0}` rather than throwing
- Batch image upload (drag & drop / picker) → queue auto-processes in order when the model is ready (`createImageBitmap` → `detectPoses` → preview render)
- Draggable SVG keypoint overlay (transparent, aligned to the canvas via `viewBox`); per-person handle colors (blue / orange); low-confidence joints rendered hollow
- Add / remove person (max 2), re-detect; live canvas preview updates on edit
- Dual export: black-background ControlNet PNG (`renderSkeletonOnBlack` → `downloadPNG`) + OpenPose v1.3 JSON with coords normalized 0–1 (`toOpenPoseJSON` → `downloadJSON`)
- Unit tests: `node --test .vitepress/theme/components/OpenPose/*.test.mjs` (skeleton mapping, renderer with mocked canvas, editor pure helpers, exporter JSON)
