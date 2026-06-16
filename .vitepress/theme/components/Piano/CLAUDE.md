# Piano Teacher app

Root component: `.vitepress/theme/components/Piano.vue` (registered as `defineAsyncComponent` — VexFlow loads only on `/piano`).
Page: `piano.md`.

## Modules

| File | Purpose |
|------|---------|
| `midi.js` | `useMidi()` composable: `requestMIDIAccess`, reactive `pressedNotes` Set, `onNoteOn`/`onNoteOff`, `deviceName`, `status` |
| `audio.js` | `usePianoAudio()` composable: Tone.js PolySynth (triangle8) + optional Salamander HD sampler; EQ3→Compressor→Reverb→Limiter; `playNote`/`releaseNote`/`loadSampler`/`dispose`; `mode` ref (`'synth'`\|`'sampler'`) |
| `score.js` | Score JSON CRUD, built-in pieces, `getScaleKeys`, `getNonScaleKeys`, `getActiveKey`, `midiToNoteName`; shared importer helpers `beatsToDurationCode` and `makeUserScoreId` (`user-<ts>-<seq>`). **Note shape:** `{ midi: number\|number[], duration, hand, lyric?, rest? }`. `DURATION_BEATS` includes `'8t'` (triplet eighth = 1/3 beat). |
| `trainer.js` | `createLevel1State`/`createLevel2State`; `checkNote`/`repeatSection` dispatchers; L1 repeats measure, L2 repeats phrase. `_skipRests` auto-advances past `rest:true` notes on init/advance/repeat, rolling across measure/phrase/all-rest-measure boundaries |
| `renderer.js` | OSMD (`opensheetmusicdisplay`) wrapper: `renderPhrase(container, phrase, cursor, score)` serializes via `phraseToMusicXML`, renders, highlights current note. `AutoBeamNotes` must stay OFF (ignores tuplet boundaries → crooked beams); OSMD uses explicit `<beam>` elements from the exporter |
| `musicxml.js` | Score → MusicXML exporter consumed by `renderer.js`. `DIVISIONS=12` per quarter (triplet eighth = integer duration). Grand-staff RH/LH split via `<backup>`. `'8t'` → `<time-modification>` 3:2. `rest:true` → `<rest/>`. `lyric` → `<lyric>`. `computeBeamSpecs`/`beamGroupDiv` emit explicit `<beam>`/`<tuplet>` elements |
| `keyboard.js` | SVG 88-key piano: `generateKeyRects`, `keyColor`, `buildKeyLayout` |
| `db.js` | IndexedDB `piano` / store `progress`: `loadProgress`/`saveProgress`, debounce 300 ms |
| `userScores.js` | Pure localStorage persistence under `piano:user-scores`. Optional `storage` arg (null → SSR no-op). `saveUserScore` returns a NEW array (don't mutate — Vue reactivity) |
| `importer/musicxml.js` | `parseMusicXML(xmlString)` → Score. Self-contained regex XML→tree parser (no DOMParser → runs under `node --test`). Reads only the first `<part>` |
| `importer/abc.js` | `parseABC(abcString)` → Score. Dependency-free ABC subset: accidentals, octave marks, chords, durations, lyrics |
| `importer/midifile.js` | `parseMIDIFile(arrayBuffer, options)` → `{ score, needsTimeSig, detectedTs }`. Wraps `@tonejs/midi`. Returns `needsTimeSig:true` when no time signature in file → UI shows picker |

## Bundle notes

- VexFlow isolated via `manualChunks` in `config.mts` → `vexflow.[hash].js` (~677 KB gzip)
- The renderer and all three importers are loaded via dynamic `import()` inside Piano.vue handlers — NOT static imports. `@tonejs/midi` stays out of the shared `app` chunk → lazy `midifile.[hash].js`. When adding an importer, follow this same pattern.
- `@tonejs/midi` namespace resolved defensively as `TonejsMidi.Midi ?? TonejsMidi.default?.Midi` (build vs `node --test` differ).
- HD sampler loads from `/audio/salamander/` (local mp3s, not bundled — must be present in `public/audio/salamander/`).
- Firefox: Web MIDI requires `dom.webmidi.enabled` flag. Safari: unsupported natively.
- `.mxl` (zip-compressed MusicXML) is NOT supported; export uncompressed `.xml`.
- Imported measures are NOT beat-sum-validated; `renderPhrase` uses `Voice.Mode.SOFT` + try/catch so over/under-filled bars degrade gracefully.

## Tests

```
node --test .vitepress/theme/components/Piano/*.test.mjs
node --test .vitepress/theme/components/Piano/importer/*.test.mjs
```
