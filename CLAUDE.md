# CLAUDE.md — alterfo.github.io-src

## Project overview

VitePress-based personal site with six fully client-side apps:
- `/idef0` — IDEF0 diagram editor (SVG + Vue 3, FIPS 183)
- `/journal` — private encrypted daily journal (WebCrypto AES-GCM, IndexedDB, 500-words/day mechanic, file-based sync)
- `/piano` — interactive MIDI piano teacher (Web MIDI API, VexFlow notation, IndexedDB progress)
- `/openpose` — OpenPose pose editor (MediaPipe Tasks Vision / BlazePose, WASM in-browser, drag-edit skeletons, ControlNet PNG + OpenPose v1.3 JSON export)
- `/planner` — encrypted project/task planner (WebCrypto AES-GCM, IndexedDB, kanban + list, File System Access bridge → plaintext agent-editable `tasks.json`)
- `/decision-journal` — encrypted decision journal with calibration (WebCrypto AES-GCM, IndexedDB; record a choice + confidence % + review date → mark the outcome later → Brier score + confidence-bucket calibration)

## Key paths

- `.vitepress/theme/components/IDEF0Editor.vue` — root Vue component wrapped in `<ClientOnly>`, SVG-based editor
- `.vitepress/theme/components/IDEF0Editor/` — editor modules (see below)
- `idef0.md` — page that mounts the editor
- `.vitepress/theme/components/crypto.js` — shared WebCrypto substrate (PBKDF2 → AES-GCM); reused by journal **and planner**
- `.vitepress/theme/components/Journal.vue` — journal root component (`<ClientOnly>`): unlock screen, editor, sync UI
- `.vitepress/theme/components/Journal/` — journal modules (see below)
- `journal.md` — page that mounts the journal (`layout: false`)
- `.vitepress/theme/components/Piano.vue` — piano teacher root component (async/`<ClientOnly>`): topbar, stave, keyboard, metronome
- `.vitepress/theme/components/Piano/` — piano modules (see below)
- `piano.md` — page that mounts the piano teacher
- `.vitepress/theme/components/OpenPoseEditor.vue` — OpenPose root component (`<ClientOnly>`): batch-upload queue, canvas preview, drag-edit toolbar, PNG/JSON export
- `.vitepress/theme/components/OpenPose/` — OpenPose modules (see below)
- `openpose.md` — page that mounts the editor (`layout: false`)
- `.vitepress/theme/components/PlannerEditor.vue` — planner root component (`<ClientOnly>`): unlock screen, project sidebar, kanban/list views, task detail panel, FS sync + export/import
- `.vitepress/theme/components/Planner/` — planner modules (see below)
- `planner.md` — page that mounts the planner (`layout: false`)
- `.vitepress/theme/components/DecisionJournal.vue` — decision-journal root component (`<ClientOnly>`): unlock/create screen, decision form, review cards, calibration stats panel, export/import
- `.vitepress/theme/components/Decisions/` — decision-journal modules (see below)
- `decision-journal.md` — page that mounts the decision journal (`layout: false`)
- `posts.data.ts` — VitePress data loader: reads `posts/*.md`, parses frontmatter, extracts `excerpt` via `extractExcerpt()` (first non-heading/list/blockquote/HTML line, strips inline Markdown, truncates to 120 chars; returns `''` if no qualifying paragraph found); `buildPost()` throws at build time if `date` or `title` frontmatter fields are absent or if `date` is unparseable
- `.vitepress/theme/components/BlogList.vue` — blog index component; groups posts by year (`groupedPosts` computed), renders year sections with per-post title, ISO-attributed `<time>`, and optional excerpt; uses hardcoded `rgba()` values instead of `var(--vp-c-*)` tokens to match the dark portfolio theme
- `.vitepress/theme/components/HelpModal.vue` — reusable help/info modal: `<Teleport to="body">`, `v-model:modelValue` open/close, default slot for content, Escape-key + backdrop-click dismiss. Dark local styling (NOT part of the «Spiral» design system). Used by IDEF0Editor / Journal / Piano roots (a toolbar/sidebar `?` button reopens it). OpenPose and Planner do not have one yet.
- `.vitepress/theme/components/onboarding.js` — pure `shouldShowOnboarding(key, storage = localStorage)`: returns `true` the first time `key` is seen (and records it via a `<tool>:seen-help` flag), `false` thereafter; `null`/SSR storage → safe no-op `false`. Injectable `storage` for `node --test` (same pattern as `Piano/userScores.js`). Each app root calls it and shows its `HelpModal` once: IDEF0/Piano in `onMounted`, Journal in `watch(phase)` on first `'unlocked'` (so help never covers the password screen). Tested in `onboarding.test.mjs`.
- `.vitepress/theme/components/HomeMark.vue` — home link in every app top bar: a mini replica of the LifeCircle wheel (7 sphere arcs, same uneven readiness radii; reuses `arcPath`/`fillRadius` from `lifecircle.js`), the current app's sphere highlighted via the `active` prop (`journal | idef0 | ar | piano | openpose | planner | decisions`), `360/n` rotate on hover (n = `SPHERES.length` = 7 → ≈ 51.4°, set via the `--home-rot` CSS var so the angle tracks the sphere count). The per-sphere arc span is `360 / SPHERES.length` (no hardcoded 60). Replaced the old uniform `← Главная` text links (user feedback: too recognizable as a generated-site pattern). Pure SVG, SSR-safe, no `<ClientOnly>`; registered globally in `index.mts`. Its `SPHERES` table mirrors `SEGMENTS` in `LifeCircle.vue` — keep in sync. The AR app carries a hand-maintained static copy (see SEO section). App top bars also carry the sphere color on the title + bottom border, so each tool reads as its sphere of the wheel.

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
| `Journal/sync.js` | P2P sync v2 **data layer** (WebRTC DataChannel, no server/STUN/TURN): `packBlob`/`unpackBlob` (SDP↔JSON-blob for copy-paste), `createOffer(onState?)`/`acceptOffer(blob, onState?)` (non-trickle ICE — `iceServers:[]`, wait for `iceGatheringState==='complete'`, so offer/answer are each ONE self-contained blob) → `{ blobStr, waitForChannel(onEnvelope, timeout=CHANNEL_TIMEOUT_MS=60000), acceptAnswer?, pc }`; `sendEnvelope(dc, str)`, `receiveAndMerge(cur, imported)` (→ `mergeVaults`), `diffVaultDates(before, after)` (added/updated counts for the result summary), `closeSync(pc)` (idempotent: close DataChannel + pc). `onState` mirrors `pc.connectionState` for the UI. **No QR encoder** — the original self-written one (interleaved-RS-less, non-monotonic EC table → unreadable QR for 500+-char SDP blobs, untested) was removed; blobs are exchanged by copy-paste/file. Pure helpers tested in `sync.test.mjs`; RTC paths are browser-only (manual verification) |

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
- v2 (implemented): live **P2P sync** between your own devices — WebRTC DataChannel, same-LAN, no server/STUN/TURN/cloud. `Journal/sync.js` is the data layer (see modules table); UI lives in `Journal.vue` («📡 Синхронизация» sidebar button → teleported modal, mirrors the change-password modal). Flow: initiator «Создать код» → `createOffer()` → copy the offer blob → responder pastes it, `acceptOffer()` → copies the answer blob back → initiator `acceptAnswer`. Non-trickle ICE means each side is ONE self-contained blob, exchanged by copy-paste/file (messenger/AirDrop) — **no QR** (the broken self-written encoder was removed). On channel open both sides `sendEnvelope` their **encrypted envelope** (`packEnvelope` format) — never plaintext (defense-in-depth over DTLS + password auth). **Crypto nuance:** each device has its OWN salt, so the receiver's in-memory key can't decrypt the peer's envelope — the receiver re-enters the journal password (same single user) and `deriveKey(pass, senderSalt, senderIterations)` → `decryptJSON`; `OperationError` = «wrong password» AND the guard against a foreign peer (mirrors `doImport`). Then `receiveAndMerge` → `mergeVaults` (LWW, commutative/idempotent → both sides converge with no return trip) → `persistVault` + cross-tab ping; result summary via `diffVaultDates`. Outside the LAN is not a v1 goal — fallback is the v1 file export/import. **History:** sync.js was committed earlier but its pairing UI was lost in the Journal.vue redesign (`0309acf`); this is the restored, QR-free rebuild
- Cross-tab sync: localStorage event triggers re-load + merge on other open tabs

### Reusable vault substrate

`components/crypto.js` + `Journal/vault.js` + `Journal/db.js` are designed for reuse. Future modules (planner, decision-journal, habit tracker) import the same crypto.js and can define their own vault shape and db.js variant without any shared-code changes.

### Tests

Unit tests run with `node --test` (Node 22, native `crypto.subtle`):
- `crypto.test.mjs` — derive→encrypt→decrypt round-trip; wrong passphrase rejects; envelope pack/unpack; large-buffer base64 (byte-loop, no spread-overflow)
- `Journal/vault.test.mjs` — `countWords`, `upsertEntry`, `computeStreak`, `mergeVaults`
- `Journal/exporter.test.mjs` — encrypt→pack→unpack→decrypt→merge round-trip; tampered ciphertext rejects
- `Journal/change-password.test.mjs` — re-key data-layer round-trip mirroring `doChangePassword()` without DOM/Vue: verify current password → fresh salt → derive new key → encrypt → pack → unpack → decrypt = same vault; asserts `encryptJSON` returns raw `{iv, ciphertext}`, fresh-salt regeneration, old password rejected after change (`OperationError`), and wrong current password aborts (`OperationError`) before any new envelope is produced

## Piano Teacher app

### Piano modules

| File | Purpose |
|------|---------|
| `Piano/midi.js` | `useMidi()` composable: `requestMIDIAccess`, reactive `pressedNotes` Set, `onNoteOn(cb)` / `onNoteOff(cb)` event hooks, `deviceName`, `status` |
| `Piano/audio.js` | `usePianoAudio()` composable: Tone.js PolySynth (triangle8) + optional Salamander HD sampler; EQ3→Compressor→Reverb→Limiter chain; `playNote(midi, vel)`, `releaseNote(midi)`, `loadSampler()`, `dispose()`; `mode` ref (`'synth'`\|`'sampler'`), `samplerReady`, `samplerLoading` |
| `Piano/score.js` | Score JSON CRUD, built-in pieces, `getScaleKeys(key)`, `getNonScaleKeys()`, `getActiveKey(score, phraseIdx, measureIdx)`, `midiToNoteName(midi)`; shared importer helpers `beatsToDurationCode(beats)` (snap quarter-beats → duration code) and `makeUserScoreId()` (collision-resistant `user-<ts>-<seq>` via a module-level counter shared across all importers). **Note shape:** `{ midi: number \| number[], duration, hand, lyric?, rest? }` — `midi` is an int or chord array; `DURATION_BEATS` adds `'8t'` (triplet eighth = 1/3 beat) to `w/h/q/8/16` (+ dotted); `lyric` (RH only) and `rest: true` (no `midi`) drive the MusicXML exporter |
| `Piano/trainer.js` | `createLevel1State` / `createLevel2State`; `checkNote()` / `repeatSection()` generic dispatchers; `getCurrentNote()`; L1 repeats measure, L2 repeats phrase. `_skipRests` auto-advances the cursor past `rest: true` notes (on init, every advance, and repeat), rolling across measure/phrase boundaries and skipping all-rest measures — so a score may open/contain rests (e.g. Rachmaninoff's 2-bar RH rest) without stalling or completing early |
| `Piano/renderer.js` | OSMD (`opensheetmusicdisplay`) wrapper: `renderPhrase(container, phrase, cursor, score)` serializes via `phraseToMusicXML` then renders; current-note highlight, look-ahead, wrong-note flash. Notation problems are fixed in the **generated MusicXML**, not via OSMD rules: `AutoBeamNotes` must stay OFF (it ignores tuplet boundaries → crooked two-note beams); OSMD uses the explicit `<beam>` elements from the exporter. Spacing tweaks (`MinNoteDistance`, `VoiceSpacingMultiplierVexflow`) are the only renderer-side rules |
| `Piano/musicxml.js` | Score → MusicXML **exporter** consumed by `renderer.js`. Pure, no DOM; tested in `renderer.test.mjs`. `phraseToMusicXML`/`noteXML`/`lyricXML`/`FIFTHS_MAP`/`DURATION_MAP`; `DIVISIONS = 12` per quarter so a triplet eighth has an integer `<duration>`; grand-staff RH/LH split via `<backup>`; `'8t'` → `<time-modification>` 3:2 (OSMD draws the triplet bracket); `rest: true` → `<rest/>`; `lyric` → `<lyric>` (trailing `-` → `syllabic=begin`, else `single`; XML-escaped) on the principal chord note only. **Explicit beaming**: `computeBeamSpecs(notes, groupDiv)` + `beamGroupDiv(beats, beatType)` emit `<beam>`/`<tuplet>` per voice — triplets group in threes from run start, plain 8th/16th by beat (dotted quarter for compound meters), rests/longer notes break groups, single-note groups keep their flag, 16ths get level-2 beams with partial hooks; beams/tuplets attach to the principal chord note only |
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
- **CI/prod:** `deploy.yml` downloads the model itself (curl + `actions/cache`) and runs `npm run build` — NOT `npx vitepress build` — because only the npm script triggers the `prebuild` → `mediapipe:copy` hook. Both were once missing → /openpose was dead on prod with the model and the WASM both 404ing (fixed 2026-06-10, `69338a0`). If you change the build step, keep the hook path alive.
- `@mediapipe/tasks-vision` is loaded via dynamic `import()` inside `initModel()` (same lazy pattern as the Piano importers) so it stays out of the shared `app` chunk and never runs during SSR — it lands in a lazy `vision_bundle.[hash].js` chunk. No `manualChunks` entry needed (dynamic-import auto-splitting). Namespace export resolved defensively as `vision.X ?? vision.default?.X`.
- `OpenPoseEditor.vue` is registered as a **static** import in `index.mts` (unlike `Piano.vue`'s `defineAsyncComponent`), but only the light OpenPose modules land in the shared chunk — the heavy MediaPipe runtime stays lazy via the dynamic import above.

## Planner app

Client-side, encrypted project/task planner at `/planner`. Projects hold tasks with status, priority, due date, tags, and a **private note**. Everything is encrypted at rest with the **shared** `components/crypto.js` (PBKDF2 → AES-GCM, identical model to the journal) and persisted in IndexedDB. The distinguishing feature is a **File System Access bridge** that writes a *plaintext* `tasks.json` (everything **except** notes) to a user-chosen local folder so an agent (Claude Code) can read/edit tasks directly on disk; edits flow back into the app on window `focus` via a deterministic last-write-wins merge.

### Planner modules

| File | Purpose |
|------|---------|
| `Planner/constants.js` | `STATUS` (array — preserves kanban column order), `PRIORITY` (label+color), `makeId()` (`randomUUID().slice(0,8)`), `todayISO(date)` (**local** `'YYYY-MM-DD'` from `Date` getters, NOT `toISOString()` which is UTC and shifts the day) |
| `Planner/store.js` | Module-level `reactive({projects,tasks})` **singleton** (mirrors `IDEF0Editor/model.js`, NOT a `useXxx()` composable) + `selectedProjectId`/`selectedTaskId` refs; CRUD (`addProject`/`renameProject`/`removeProject` (**tombstones** project + its tasks, never hard-splices), `addTask`/`updateTask`/`removeTask`); `loadData`/`getSnapshot`/`resetState`. **Pure helpers** (take plain args, no reactivity → node-testable): `isOverdue`, `isDueToday`, `visibleTasks` (drops `deleted` tombstones; `tag` single / `tags` multi-OR / `priority` / `status` / `hideDone`), `sortTasks` (priority/status by rank not alphabetical, null `dueDate` sorts last), `projectForFile` (**strips `note`** — security), `mergeFromFile` / `mergeProjectsFromFile` (LWW from the plaintext file, never touch `note`; clamp unknown `priority`/`status` to safe defaults; project deletion is **monotonic** — a file can tombstone but never resurrect a known project), `mergeVaultTasks` (full task-level LWW of a decrypted remote vault for **cross-tab sync** — note-aware, since the remote IS the encrypted vault) |
| `Planner/db.js` | Encrypted IndexedDB `planner` v1, three stores (`keyPath:'id'`): `vault` (`{id:'data',env}`), `meta` (salt as plain array), `fs` (dir handle). `loadSalt`/`saveSalt`, `writeVault` (**awaited, non-debounced** — used by the create-vault guard so the record exists before the screen unlocks, closing the wrong-passphrase-on-empty-vault race), `saveVault` (**debounced 300 ms** → `encryptJSON`→`packEnvelope`→put + `localStorage` cross-tab ping), `loadVault` (wrong key → `decryptJSON` rejects → "wrong passphrase"), `saveDirHandle`/`loadDirHandle` (handle stored **directly** — structured-cloneable, do NOT serialize), `initCrossTabSync` |
| `Planner/fsbridge.js` | File System Access API. `fsSupported` (Chrome/Edge only), `pickDirectory`/`ensurePermission` (**must run inside a click gesture**), `checkPermission` (no prompt — safe on start), `writeTasksJson` (atomic via `createWritable`→`close`), `readTasksJson` (→ `null` if missing/invalid). No file-watch API → re-read on window `focus` |
| `Planner/exporter.js` | `exportEnvelope` → download `.planner` envelope file; `readEnvelopeFile` → string (mirrors `Journal/exporter.js`) |

### Crypto model (shared with journal)

Identical to the journal: `PBKDF2(passphrase, salt=16 bytes, iterations=600000, SHA-256)` → AES-GCM 256; `iv` = 12 random bytes per encrypt; at-rest envelope `{salt,iterations,iv,ciphertext}` base64 — **no key, no plaintext ever persisted**. The derived key lives only in memory (`cryptoKey` ref in `PlannerEditor.vue`, re-derived on unlock; the in-memory `_salt` is kept for export and dropped on Lock).

### Data model

```js
Project = { id, name, color, deleted, createdAt }
Task = { id, projectId, title, status, priority, dueDate, tags, note, deleted, createdAt, updatedAt }
// status: 'todo' | 'in-progress' | 'done'   priority: 'low' | 'medium' | 'high'
// dueDate: 'YYYY-MM-DD' | null   tags: string[]   note: PRIVATE (encrypted only, NEVER in tasks.json)
// deleted: tombstone   timestamps: epoch-ms numbers
```

`removeProject` **tombstones** (sets `deleted:true` on the project AND bumps `deleted:true` on its tasks) — it never hard-splices. A hard delete is incompatible with the "absence ≠ deletion" merge model: a cross-tab sync or a stale `tasks.json` would re-add the project/tasks as "unknown ids" and silently resurrect them. The UI renders `liveProjects` (`state.projects.filter(p => !p.deleted)`), so tombstoned projects vanish from the sidebar/filters while still propagating the deletion.

### tasks.json contract (agent-editable on disk — read this before editing tasks)

`projectForFile(state)` writes a plaintext projection to the connected folder's `tasks.json`. Shape:

```json
{
  "_readme": "Edit tasks below. To signal a change set updatedAt to Date.now() (epoch ms). Set deleted:true to remove. Notes are private and not shown here.",
  "projects": [{ "id": "...", "name": "...", "color": "...", "deleted": false, "createdAt": 0 }],
  "tasks": [{ "id": "...", "projectId": "...", "title": "...", "status": "todo", "priority": "high", "dueDate": "2026-06-15", "tags": ["seo"], "deleted": false, "createdAt": 0, "updatedAt": 0 }]
}
```

**Rules for an agent editing this file:**
- **`note` is NEVER in `tasks.json`** (a `store.test.mjs` `projectForFile` test enforces this) — there is no way to read or write a private note from disk.
- To signal an edit, **bump `updatedAt` to `Date.now()`** (epoch ms). On the app's next window `focus`, `mergeFromFile` runs single-user LWW: a file task wins **only if `updatedAt` is strictly greater** than the app's copy; equal-or-older file versions are ignored.
- A **new** task object (id the app hasn't seen) is added with `note:''`.
- To **delete**, set `deleted:true` (and bump `updatedAt`) — a tombstone. **Absence ≠ deletion**: a task missing from the file is KEPT (no data loss), so removing a line never deletes anything.
- Project name/color edits flow back via `mergeProjectsFromFile` (file is source of truth for known ids; unknown ids added; locals absent from the file kept). Project **deletion is monotonic**: a file `deleted:true` tombstones a known project, but a file can never un-delete a local tombstone (projects carry no `updatedAt`/LWW, so "deletion wins" prevents a stale file from resurrecting a deleted project). There is no project-restore UI.

### Page + registration

`planner.md` (`layout: false`, dark header with a `<HomeMark active="planner"/>` home link) → `<ClientOnly><PlannerEditor/></ClientOnly>`. `PlannerEditor` is a **static** `app.component(...)` registration in `.vitepress/theme/index.mts` (like OpenPose, unlike the async Piano). Nav entry in `config.mts`; the homepage `LifeCircle.vue` planner sphere now links to `/planner` (no longer `soon`).

### Tests

`node --test .vitepress/theme/components/Planner/store.test.mjs` (pure helpers incl. note-stripping + merge cases) and the shared `crypto.test.mjs`. `db.js`/`fsbridge.js`/`exporter.js` are browser-only (IndexedDB / FS Access / Blob) → `node --check` only; runtime behaviour verified manually in a Chromium browser.

## Decision Journal app

Client-side, encrypted **decision journal with calibration** at `/decision-journal`. You record a decision made under uncertainty (context, options, the chosen option, expected outcome, confidence 0–100 %, a review date); when the review date arrives the app surfaces it, you mark the actual outcome (correct/wrong + free text), and it computes your **calibration** — a Brier score plus a confidence-bucket table («заявлено 70% → сбылось X%»). No local-first OSS analogue exists — the strongest novelty in the backlog. Reuses the **shared** `components/crypto.js` substrate (PBKDF2 → AES-GCM, identical model to journal/planner; only the `{salt,iterations,iv,ciphertext}` envelope is persisted — no key, no plaintext). Its own IndexedDB (`decision-journal`), its own salt; the password may coincide with the journal's but there is no link.

### Decision Journal modules

| File | Purpose |
|------|---------|
| `Decisions/vault.js` | Pure vault logic (no DOM/crypto/IndexedDB → node-testable). `emptyVault()` → `{ version:1, createdAt, decisions:{} }`; `makeDecisionId()` (`randomUUID().slice(0,8)`, mirrors Planner `makeId`); `clampConfidence` (int 0–100, non-finite → 50); `upsertDecision` (create/partial-edit, preserves `createdAt`, bumps `updatedAt`); `markReviewed(vault,id,outcome,actualOutcome,now)` (records outcome/actualOutcome/reviewedAt, invalid outcome → null so it stays queued); `removeDecision` (**tombstone** `deleted:true` + bump, never splice — so LWW propagates the deletion); selectors `dueForReview(vault,todayISO)` (not-deleted, `outcome==null`, `reviewDate<=today` inclusive, sorted by reviewDate) / `openDecisions` / `reviewedDecisions`; `mergeVaults(a,b)` (union-by-id LWW on `updatedAt`, returns a NEW vault, commutative/idempotent, `a` wins on tie — mirrors Planner `mergeVaultTasks` / Journal `mergeVaults`) |
| `Decisions/stats.js` | Pure calibration math (array of Decision in, no reactivity). `brierScore(decisions)` → `mean((confidence/100 − (outcome==='correct'?1:0))²)` over **reviewed** decisions, `null` if none; `calibrationBuckets(decisions, edges=[50,60,70,80,90,101])` → per-bucket `{ label, n, avgConfidence, hitRate }` with an implicit `0` floor prepended (sub-50 confidence lands in a leading `[0,50)` bucket; empty buckets report `null`, never `NaN`); `counts(decisions, todayISO)` → `{ total, open, due, reviewed }` (all ignore `deleted` tombstones; `due` = open with `reviewDate<=today`). No streak stats (YAGNI) |
| `Decisions/db.js` | Encrypted IndexedDB `decision-journal` (single envelope string, no key/plaintext) — mirror of `Journal/db.js`: `loadEnvelope`, `saveEnvelope` (debounced 300 ms + cross-tab ping on `decisions:ping`), `saveEnvelopeNow` (awaited, **rejects** on failure — used by the create-vault guard to close the wrong-passphrase-on-empty-vault race; `{notify:true}` pings), `cancelPendingSave`, `initCrossTabSync`. Browser-only → `node --check`, no unit tests (repo convention) |
| `Decisions/exporter.js` | `exportEnvelope` → download `.decisions` envelope file; `readEnvelopeFile` → string (mirrors `Journal/exporter.js`). Browser-only |

### Crypto model (shared)

Identical to journal/planner: `PBKDF2(passphrase, salt=16 bytes, iterations=600000, SHA-256)` → AES-GCM 256; `iv` = 12 random bytes per encrypt; at-rest envelope `{salt,iterations,iv,ciphertext}` base64 — no key, no plaintext ever persisted. Key lives only in memory, re-derived on unlock.

### Vault shape

```
{ version: 1, createdAt, decisions: { [id]: Decision } }
Decision = { id, title, context, options: string[], chosen, expectedOutcome,
             confidence (0–100 int), reviewDate ('YYYY-MM-DD' | null),
             outcome (null | 'correct' | 'wrong'), actualOutcome (''),
             reviewedAt (null | ISO), deleted (false), createdAt (ISO), updatedAt (ISO) }
```

### Merge (single-user LWW)

Union by id; on a shared id keep the decision with the greater `updatedAt` (`a` wins on tie). Deterministic, commutative, idempotent — safe for file sync / cross-tab merge, no CRDT. Deletes are tombstones (`deleted:true`) so absence ≠ deletion.

### Calibration

Brier and buckets score **only reviewed** decisions (`outcome !== null`); `correct` → 1, `wrong` → 0. Brier 0 = perfect, 0.25 = a coin-flip (50 % confidence with random results), 1 = maximally wrong-and-sure. A well-calibrated author has per-bucket `hitRate ≈ avgConfidence/100`.

### Page + registration + SEO

`decision-journal.md` (`layout: false`, dark header with `<HomeMark active="decisions"/>`, teal `#33ffcc` title + `rgba(51,255,204,.3)` border) → `<ClientOnly><DecisionJournal/></ClientOnly>`. `DecisionJournal` is a **static** `app.component(...)` registration in `index.mts` (like PlannerEditor/OpenPose). `'decision-journal.md'` is in `TOOL_CATEGORY` (`.vitepress/seo.js`, `applicationCategory: 'BusinessApplication'`) → `SoftwareApplication` JSON-LD + sitemap 0.8 tier; the page carries a `description` frontmatter (RU, nbsp before «—»). The LifeCircle `decisions` sphere links here.

### Tests

`node --test .vitepress/theme/components/Decisions/vault.test.mjs .vitepress/theme/components/Decisions/stats.test.mjs` (vault: upsert/markReviewed/tombstone, dueForReview boundary, merge new-id/LWW/commutativity; stats: Brier on known examples + bucket boundaries with no NaN) plus the shared `crypto.test.mjs`. `db.js`/`exporter.js` are browser-only → `node --check` + manual browser verification.

## Design system «Spiral»

Unified visual identity for the **portfolio shell** (Portfolio.vue / Layout.vue / BlogList.vue / CountDown.vue). The internal UI of Journal / Piano / IDEF0 / OpenPose is **not** part of this system — those keep their own styling.

### Palette source of truth (two mirrors, same hex)

CSS cannot be imported as JS values, so the spectrum lives in two synced mirrors — **change a color in BOTH**:

- `.vitepress/theme/styles/vars.css` — `--ds-*` CSS custom properties (imported via `styles/index.css`). Holds base/void colors, text scale, the 7 spectrum colors (incl. `--ds-teal: #33ffcc`, the 7th), typography, radius, glow, and `--ds-border` (neutral separator).
- `.vitepress/theme/components/spectrum.js` — JS mirror for canvas/Vue logic: `SPECTRUM` (7 hex — teal `#33ffcc` is the 7th, after orange), `CANVAS_PALETTE` (8 `rgba(` prefixes — alpha + `)` appended at draw time: the 7 spectrum colors + yellow for particle richness; teal is now part of the spectrum, no longer decoration-only), `PROJECT_COLORS` (project → spectrum hex, incl. `decisions: '#33ffcc'`).

The alternative (reading CSS vars from JS via `getComputedStyle`) was rejected as YAGNI complexity. Unit-tested in `spectrum.test.mjs`.

### Spectrum semantics (from the author's blog «Круг жизни»)

The wheel of life is split into colored spheres; «границы условны, перетекают друг в друга» = the connecting particles. The 7 project colors = 7 spheres: `--ds-violet` AR/signature/«я», `--ds-cyan` blog, `--ds-green` idef0, `--ds-pink` journal, `--ds-amber` piano, `--ds-orange` github, `--ds-teal` decisions (журнал решений). This ties the background, the countdown (growth), and the project grid into one story.

### Connecting particles — one module

`.vitepress/theme/components/ConnectingParticles.js` is the single source for the 2D connecting-particle background (replaced the two divergent copies that used to live in Portfolio.vue and Layout.vue). Pure, unit-tested helpers `stepParticle(p,w,h)` (torus-wrap step), `connectionAlpha(distance,maxDist)` (line fade), `createParticles(count,w,h,palette)`; plus the browser-only factory `createField(canvas, opts)` → `{ start, stop, resize, destroy }` (`opts`: `density`, `connectDistance`, `fade`, `palette`, `lineWidth`, `autoStart`, `getSize`, `count`). Portfolio.vue and the **2D fallback** in Layout.vue both call `createField`. The WebGPU 500k path (`WebGPUParticles.js`) is the premium header variant and is **untouched**. Helpers unit-tested in `ConnectingParticles.test.mjs`.

### Countdown «1000 дней роста»

`.vitepress/theme/components/CountDown.vue` renders 4 progress rings (Days/Hours/Minutes/Seconds), restyled under `--ds-*` tokens and colored from `SPECTRUM`. It is mounted in the Portfolio hero (`<CountDown class="hero-countdown" :countdownDays="1000" />`, default epoch — do **not** pass `startDate`). Pure date math is extracted to `.vitepress/theme/components/countdown.js`: `computeRemaining(startMs, days, nowMs)` and `ringOffset(value, max, circumference)`, unit-tested in `countdown.test.mjs`. Epoch: default `startDate = new Date(1742688224657)` (23/03/2025) + 1000 days → target ≈ 18/12/2027. **Do not change the epoch** (user decision — preserve the «1000 дней роста» history).

### LifeCircle «колесо жизни»

`.vitepress/theme/components/LifeCircle.vue` is the main element of the Portfolio shell — replaces the old `.projects-grid`. A donut «wheel of life» of 7 spheres (= 7 spectrum colors); each sphere's **outer radius encodes its readiness** (1–10), so the wheel is deliberately uneven and reads as «what's developed vs. not». Each sphere is an `<a href>` linking to the project; the component also supports a linkless `soon` sphere (rendered as a `<g>` with no href), though **no sphere currently sets `soon: true`** since the planner shipped. No `<ClientOnly>` (pure SVG, no DOM API). The 7 segments are **hardcoded** in the component (`SEGMENTS`) — they only change with a release; no props.

- Geometry: `viewBox="-45 -5 490 410"` (widened so outside labels never clip; wheel itself centred at `200,200`). The `.vue` passes `GEOM = { cx: 200, cy: 200, innerR: 55, maxOuterR: 155, labelR: 170 }`. `buildSegments` is **generalized to n = `defs.length` spheres**: `span = 360/n`, sphere `i` spans `startDeg = i*span + 2 … endDeg = (i+1)*span − 2` (a 4° gap), midpoint `i*span + span/2`, so n × (span−4) + n × 4 = 360°. For n = 6 → span 60° (the original layout); for n = 7 → span ≈ 51.43°, last sphere ends at 358°.
- Per sphere: faint full-radius track (`.seg-bg`, opacity 0.12) + readiness fill (`.seg-fill`, outer radius = `fillRadius(readiness, 55, 155)`) + crisp stroke edge (`.seg-stroke`) + outside two-line label (title + «N/10»). `soon: true` (currently unused) → dashed track, dim fill, «⟳ скоро» label.
- Spheres/readiness: Дневник `/journal` 9 (pink), IDEF0 `/idef0` 8 (green), AR Engine `/ar/` 5 (violet), Piano `/piano` 4 (amber), OpenPose `/openpose` 4 (cyan), Планировщик `/planner` 4 (orange), Решения `/decision-journal` 4 (teal). The `decisions` sphere is the 7th (after `planner`); existing spheres are **not** recolored — teal was only appended.
- Hover: `scale(1.02)` + color-matched `drop-shadow` glow on non-`soon` spheres. `@media (max-width: 480px)` shrinks label font so it stays readable on mobile.
- Pure helpers live in `.vitepress/theme/components/lifecircle.js` (`deg2rad` with 0° = top/CW, `arcPath` donut segment, `labelXY`, `fillRadius`, and `buildSegments(defs, geom)` which composes the whole per-sphere render record — paths, label, `text-anchor`), all unit-tested in `lifecircle.test.mjs`. `LifeCircle.vue` only maps `SEGMENTS` through `buildSegments` and renders the result, so the geometry/anchor logic is fully tested; only the static SVG markup is verified manually (visual artifact, no DOM test).

### Dark theme only

There is no light theme and none is planned. If `color-mix` is unsupported on a target browser, fall back to `rgba()` with hex from the tokens.

## SEO & meta pipeline

Per-page SEO is generated centrally in `.vitepress/config.mts` — there are **no** per-page `<head>` blocks in frontmatter (only an optional `description`, plus the standalone `/ar/` app which is hand-maintained, see below).

- **Pure helpers live in `.vitepress/seo.js`** (a plain ESM module, imported by `config.mts`) so the URL / JSON-LD / sitemap logic is unit-testable with `node --test` — same `.js` + `.test.mjs` convention as `lifecircle.js` etc. Tests: `.vitepress/seo.test.mjs`. Exports: `SITE_URL`, `AUTHOR`, `canonicalPath`/`canonicalFor`, `PERSON`, `TOOL_CATEGORY`, `jsonLdFor`, `jsonLdScript`, `sitemapPriority`.
- **`titleTemplate: ':title — Alterfo'`** globally; `index.md` sets `titleTemplate: false` so the homepage isn't "Alterfo — Alterfo".
- **`transformPageData(pageData)`** pushes onto `pageData.frontmatter.head`: a canonical link, the full Open Graph + Twitter card set (`og:image`/`twitter:image` always `SITE_URL + '/og.png'`), and a per-page JSON-LD `<script>`. `desc` = `pageData.description` (VitePress already infers this from frontmatter `description`, else `''`) → a hardcoded fallback. **`pageData.description` already equals frontmatter `description`** — do not add a redundant `frontmatter.description` rung.
- **`canonicalFor(rel)`** strips `.md`, collapses a trailing `index` to its directory (`index.md` → `/`, `blog/index.md` → `/blog/` — note the **kept trailing slash**), prefixes `SITE_URL`. The sitemap `<loc>` reuses `canonicalFor` so it never drifts from the page's own canonical (they previously diverged on that trailing slash).
- **`jsonLdFor(rel,…)`** + the reusable `PERSON` node emits: `index.md` → `Person`; any key in **`TOOL_CATEGORY`** → `SoftwareApplication` (free `offers`, `author: PERSON`); `posts/*` → `BlogPosting` with `datePublished` parsed from the `YYYY-MM-DD` filename prefix (omitted if the filename isn't dated). Case-study `projects/*` pages and `blog/index.md` get **no JSON-LD by design** (only meta tags) → `null`.
- **`jsonLdScript(ld)`** must wrap the JSON before embedding: VitePress inserts a `<script>` body **verbatim** (no HTML-escaping, no esbuild pass for `type="application/ld+json"`), and `JSON.stringify` does not escape `<`/`>`/`&`/`</script>`, so an author-controlled title could break out. It escapes those to `\uXXXX` (still valid JSON).
- **Adding a new tool page:** add its `*.md` filename to `TOOL_CATEGORY` (→ `SoftwareApplication` JSON-LD **and** the sitemap 0.8 priority tier, keyed off the same map) **and** give the page a `description` frontmatter — otherwise it shares the generic fallback description with every other description-less page.
- **Sitemap:** the same `buildEnd(siteConfig)` hook that writes post redirect stubs hand-rolls `sitemap.xml` from `siteConfig.pages` (zero-dep — no `sitemap` package; redirect stubs auto-excluded as they aren't source `.md` pages). Priority via `sitemapPriority`: `/` = 1.0, any `TOOL_CATEGORY` page = 0.8, `projects/` = 0.7, else 0.6. `EXTRA_URLS = ['/ar/']` appends the static app (0.8) since it isn't a VitePress page. `lastmod` from source-file mtime. The post-redirect `catch` sets `files = []` (not early `return`) so a missing `posts/` dir still emits the sitemap. `public/robots.txt` points crawlers at it. `srcExclude` lists `CLAUDE.md`/`README.md`/`docs/**`/`ar-engine/**` so dev-doc URLs never leak into the sitemap.
- **`/ar/` SEO is hand-maintained.** The standalone static app (`ar-engine/web/index.html`, copied to `dist/ar/` by `.github/workflows/deploy.yml`) is invisible to VitePress's page pipeline, so its `<head>` (title, canonical, full OG/Twitter set → `/og.png`) and the `#home-link` mini-wheel (a static SVG copy of `HomeMark.vue`, AR sphere highlighted) are edited **directly in the HTML**, mirroring the `transformPageData` tags / the Vue component by hand. Keep them in sync if the global SEO format or the wheel mark changes.
- **OG image:** `public/og-source.svg` (1200×630) is the source; `public/og.png` is the committed raster referenced by all OG/Twitter meta. To regenerate, rasterize via headless Chrome (`--headless=new --window-size=1200,630 --force-device-scale-factor=1 --screenshot` of a zero-margin HTML wrapper embedding the SVG) — macOS `sips`/`qlmanage` mis-handle the non-square aspect; Chrome is exact. No build-time dependency.

### Portfolio case studies (`projects/`)

Long-form RU case-study pages (default layout) — one per portfolio item: `projects/ar-engine.md`, `projects/idef0-editor.md`. Each has `title` + `description` frontmatter (so `transformPageData` emits canonical + OG/Twitter), a live-demo link, a "Зачем / Как устроено / Что было сложно / Текущее состояние" structure, and an "Из блога" section cross-linking relevant posts. They are reachable from the nav «Проекты» dropdown (`config.mts`) and a `.case-study-links` row below the wheel in `Portfolio.vue`. The `LifeCircle` spheres link to the **live apps**; these pages are the long-form «разборы» and intentionally carry no JSON-LD.

## Typography pipeline (nbsp before em dash)

Site-wide RU typography rule (user decision, «всегда»): an em dash «—» is always preceded by a **non-breaking space** (U+00A0), never a plain space, so the dash can't wrap away from its word.

- **Pure helpers in `.vitepress/typography.js`** (same `.js` + `.test.mjs` convention as `seo.js`): `nbspBeforeDash(text)` (string level; matches both the literal «—» **and the raw `&mdash;` entity** — with `html: true` VitePress's markdown-it keeps entities as raw text inside `text` tokens, NOT `text_special`) and `applyNbspToInlineTokens(children)` (token level: recurses into image `alt` children; collapses a `softbreak` directly before a dash into a nbsp text token). Tests: `.vitepress/typography.test.mjs`.
- **Markdown content is fixed at build time** by a `markdown.config(md)` core rule in `config.mts` — write posts with plain spaces, the build corrects them. The rule is pushed at the **end** of the core ruler, deliberately AFTER markdown-it-anchor: running earlier would change heading slugs and break inbound `#`-anchors. Consequence: permalink `aria-label`s keep a plain space (accepted — invisible).
- **Out of the markdown rule's reach** (fix by hand with a literal U+00A0): raw HTML blocks inside `.md` (e.g. `<img alt>`, `<iframe>` fallbacks), `.vue` UI strings, frontmatter `description`, and the hand-maintained `ar-engine/web/index.html`. Meta tags/JSON-LD go through `nbspBeforeDash` in `transformPageData`; blog excerpts in `posts.data.ts` (they're extracted from raw markdown, bypassing markdown-it).
- **Verification:** scan `dist` HTML checking `charCodeAt(idx-1) === 32` before each «—»/`&mdash;`. Don't grep with a literal nbsp in an inline shell command — shells/tooling silently normalize U+00A0 to a plain space (this also breaks Edit-tool `old_string` matching; prefer \u00A0 escapes in written code).
- Code comments are exempt (not user-facing).

## Development

- Pure-logic unit tests: `node --test .vitepress/theme/components/crypto.test.mjs` and `node --test .vitepress/theme/components/Journal/*.test.mjs`
- IDEF0 model unit tests: `node --test .vitepress/theme/components/IDEF0Editor/model.test.mjs`
- Piano unit tests: `node --test .vitepress/theme/components/Piano/*.test.mjs .vitepress/theme/components/Piano/importer/*.test.mjs` (the glob does **not** recurse — the importer suites live one level down and need their own pattern)
- OpenPose unit tests: `node --test .vitepress/theme/components/OpenPose/*.test.mjs` (skeleton, renderer, editor, exporter — renderer canvas tests mock `ctx`/`OffscreenCanvas`)
- Planner unit tests: `node --test .vitepress/theme/components/Planner/store.test.mjs` (pure helpers, note-stripping, merge)
- Decision Journal unit tests: `node --test .vitepress/theme/components/Decisions/vault.test.mjs .vitepress/theme/components/Decisions/stats.test.mjs` (vault upsert/markReviewed/tombstone/dueForReview/merge; stats Brier + calibration buckets)
- Design-system unit tests: `node --test .vitepress/theme/components/spectrum.test.mjs .vitepress/theme/components/ConnectingParticles.test.mjs .vitepress/theme/components/countdown.test.mjs .vitepress/theme/components/lifecircle.test.mjs` (palette completeness, particle helpers, countdown date math, wheel-of-life geometry)
- SEO unit tests: `node --test .vitepress/seo.test.mjs` (canonical/sitemap URL building, JSON-LD per page type, JSON-LD `<script>` escaping, sitemap priority tiers)
- Onboarding gate unit tests: `node --test .vitepress/theme/components/onboarding.test.mjs` (first-visit `true` + flag write, return-visit `false`, key isolation, SSR/null-storage no-op)
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
- Sync v2 (live P2P, added 2026-06-10): `📡 Синхронизация` sidebar button → teleported modal (mirrors the change-password modal). WebRTC DataChannel, same-LAN, no server/STUN/TURN. Initiator «Создать код» (`createOffer`) → copy offer blob → responder pastes it (`acceptOffer`) → copies answer blob back → initiator `acceptAnswer`; non-trickle ICE so each blob is self-contained (copy-paste/file, no QR — the broken self-written encoder was removed). On channel open both sides `sendEnvelope` their encrypted envelope; receiver re-enters the journal password (peer has its own salt) → `deriveKey`/`decryptJSON` → `receiveAndMerge` (LWW, commutative → both converge with no return trip) → `persistVault` + cross-tab ping; wrong password (`OperationError`) keeps the channel open for retry; result summary via `diffVaultDates`. `lockVault`/modal-close/unmount tear down the connection (`closeSync`, also cancels the 60 s channel-open timeout). UI lost in `0309acf` (Journal.vue redesign) and restored here. `Journal.vue` + `Journal/sync.js`; pure helpers unit-tested in `sync.test.mjs` (RTC paths browser-only)
- Change password (re-key, added 2026-06-10): sidebar button → teleported modal (current / new / confirm). Verifies the current password by re-deriving from the **stored** envelope's own salt/iterations and decrypting (wrong → `OperationError` → "Неверный текущий пароль"), generates a **fresh salt** (full re-keying, not just re-encryption), folds in any in-progress today's text, re-encrypts the in-memory vault, cancels pending debounced/old-key saves, then writes durably via `saveEnvelopeNow` (awaited, **rejects on failure** so a failed write keeps the old key) and pings other tabs. In-memory `_key`/`_salt`/`_iterations` swap only **after** the write succeeds → a failed write leaves the old envelope and key intact (no data loss). Other open tabs hold the stale old key; the re-key ping makes their cross-tab handler hit `OperationError` and `lockVault(reason, { flush: false })` (no flush → no clobber of the new envelope). `Journal.vue` + `Journal/db.js` (`saveEnvelopeNow`) only. New-password rules: non-empty, matches confirm, ≥ 6 chars
- Unit tests for all pure logic (crypto, vault, exporter data layer)

### Piano Teacher app (as of 2026-06-08)

- Interactive MIDI teacher at `/piano`: Web MIDI API (no polyfill, native), VexFlow 5 via npm (no CDN)
- Modules in `.vitepress/theme/components/Piano/`:
  - `midi.js` — `useMidi()` composable: device list, reactive pressed-notes Set, noteOn/noteOff
  - `audio.js` — `usePianoAudio()` composable: Tone.js PolySynth (triangle8) + optional Salamander HD sampler; EQ3→Compressor→Reverb→Limiter chain; `playNote(midi, vel)`, `releaseNote(midi)`, `loadSampler()`, `dispose()`
  - `score.js` — Score JSON format (phrases/measures/notes), built-in pieces (C major scale, Twinkle, Minuet in G, Ode to Joy — with German "An die Freude" lyrics, Rachmaninoff Prelude in D major Op. 23 No. 4 — 3/4 @ ♩=50, triplet-eighth LH arpeggios + a 2-bar RH-rest intro), `getScaleKeys()`, `getActiveKey()`; per-hand measures must sum to `timeSignature[0]` beats (beat-sum test in `score.test.mjs`, compared within an epsilon since `'8t'` = 1/3)
  - `trainer.js` — `createLevel1State` / `createLevel2State`; `checkNote()` / `repeatSection()` dispatchers; L1 repeats measure, L2 repeats phrase; `triggerWrong()` calls `repeatSection()` for both levels and syncs all three cursor refs (phraseIdx, measureIdx, noteIdx); `_skipRests` keeps the cursor off `rest: true` notes (see modules table)
  - `renderer.js` — OSMD (`opensheetmusicdisplay`) wrapper via `phraseToMusicXML` (`Piano/musicxml.js`): `renderPhrase()`, current-note highlight, look-ahead (30% opacity), wrong-note flash (400 ms red overlay)
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

### Planner app (as of 2026-06-10)

- Encrypted, fully client-side project/task planner at `/planner` reusing the **shared** `components/crypto.js` substrate (PBKDF2 → AES-GCM; only the `{salt,iterations,iv,ciphertext}` envelope is persisted — no key, no plaintext)
- Module-level `reactive({projects,tasks})` store singleton (mirrors `IDEF0Editor/model.js`) with pure, node-testable helpers (`isOverdue`, `isDueToday`, `visibleTasks`, `sortTasks`, `projectForFile`, `mergeFromFile`, `mergeProjectsFromFile`)
- Encrypted IndexedDB persistence (`planner` DB: `vault`/`meta`/`fs` stores; debounced 300 ms save; cross-tab sync via localStorage); unlock screen with create-vault / unlock / lock; wrong passphrase → decrypt rejects → clear error
- Project sidebar (add/rename/delete, color dots, live task counts); kanban view (native HTML5 drag-and-drop, no library) + sortable/filterable list view; task detail panel with private `note` textarea
- **File System Access bridge** (`fsbridge.js`, Chrome/Edge only, degrades gracefully): "Connect folder" writes a plaintext `tasks.json` (**notes stripped**) the agent can edit; re-read + LWW merge on window `focus`; reconnect flow for lapsed permissions on reload
- Encrypted file export/import: `.planner` envelope download + import → decrypt (passphrase prompt) → LWW merge → save
- Unit tests: `node --test .vitepress/theme/components/Planner/store.test.mjs` (pure helpers incl. note-stripping + merge) + shared `crypto.test.mjs`; `db.js`/`fsbridge.js`/`exporter.js` are browser-only → `node --check` + manual browser verification

### Decision Journal app (as of 2026-06-10)

- Encrypted, fully client-side **decision journal with calibration** at `/decision-journal` reusing the **shared** `components/crypto.js` substrate (PBKDF2 → AES-GCM; only the `{salt,iterations,iv,ciphertext}` envelope is persisted — no key, no plaintext). Own IndexedDB (`decision-journal`), own salt
- Pure, node-testable modules: `Decisions/vault.js` (`emptyVault`/`upsertDecision`/`markReviewed`/`removeDecision` tombstone/`dueForReview`/`openDecisions`/`reviewedDecisions`/`mergeVaults` LWW-by-`updatedAt`) and `Decisions/stats.js` (`brierScore`, `calibrationBuckets`, `counts`)
- UI: unlock/create-vault screen (create-vault guard via awaited `saveEnvelopeNow` to close the empty-vault race, mirrors PlannerEditor); decision form (title, context, dynamic options list, chosen-option select, expected outcome, confidence range 0–100, review date defaulting +30 days); «⏰ На ревью (N)» queue + open/reviewed lists; review cards (expected vs. actual, Сбылось? Да/Нет → `markReviewed`); calibration stats panel (Brier score with «0 — идеал, 0.25 — монетка», bucket table «заявлено → сбылось», counts, empty states)
- Debounced autosave (watch vault → `encryptJSON`→`packEnvelope`→`saveEnvelope`); cross-tab merge via `initCrossTabSync` (LWW `mergeVaults`); encrypted `.decisions` file export/import (paste-password on import); Lock clears key/vault from memory
- LifeCircle gained a 7th sphere «Решения» (teal `#33ffcc`, readiness 4); `buildSegments` generalized 6→7 (span = 360/n); palette extended in both mirrors (`--ds-teal`, `SPECTRUM[6]`, `PROJECT_COLORS.decisions`); `HomeMark` SPHERES 7 + `360/n` hover rotate; AR static SVG mini-wheel recomputed to 7; SEO: `decision-journal.md` in `TOOL_CATEGORY` → SoftwareApplication JSON-LD + sitemap 0.8
- Unit tests: `node --test .vitepress/theme/components/Decisions/vault.test.mjs .vitepress/theme/components/Decisions/stats.test.mjs` + updated `lifecircle.test.mjs` / `spectrum.test.mjs`; `db.js`/`exporter.js` browser-only → `node --check` + manual browser verification
