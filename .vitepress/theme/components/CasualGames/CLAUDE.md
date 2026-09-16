# Casual Games — казуальные пазлы

Client-side puzzle collection at `/casual-games`: Queens, Tango, Zip and Klondike
solitaire. Fully local: seeded level generation, hints and scoring, plain IndexedDB
persistence (no cloud, no runtime external calls). No encryption — no private data.

Root component: `.vitepress/theme/components/CasualGames.vue` (`defineAsyncComponent`
in `index.mts`). Page: `casual-games.md` (`layout: false`). SEO: `TOOL_CATEGORY`
→ `GameApplication` JSON-LD + sitemap 0.8. Design accent = games sphere color
`#3b7a85` (turquoise/бирюза) via scoped `--ds-accent*` in `CasualGames.css`.

## Modules

| File | Purpose |
|------|---------|
| `rng.js` | Seeded PRNG. `mulberry32(seed)`, `randInt(rng, n)`, `shuffle(arr, rng)`, `dailySeed(date)` — pure/deterministic |
| `queens.js` | Queens engine. `generate(size, rng)`, `regionAt`, `validate(puzzle, queens)`, `isSolved`, `hint`, `eliminatedCells(puzzle, row, col)` (row/col/region/adjacency elimination set, drives auto-✕ marks), `explainHint` — pure |
| `tango.js` | Tango (Binairo) engine. `generate(rng)`, `countSolutions`, `validate`, `isSolved`, `hint`, `explainHint` (cites constraint/run/balance rule); constants `MOON`/`SUN`/`EMPTY`/`EQUAL`/`DIFF` — pure |
| `zip.js` | Zip engine. `generate(rng)`, `countSolutions`, `validatePath`, `isSolved`, `hint`, `explainHint` (start/next-waypoint/continuation); constants `SIZE`/`EMPTY` — pure |
| `solitaire.js` | Klondike engine. `deal(rng)`, `legalMoves(state)`, `applyMove`, `autoMoveToFoundation`, `hint` (skips pointless tableau-to-tableau moves via `isUselessTableauMove` — never suggests shuffling a lone king between two empty columns, nor splitting off the top of an already-correctly-stacked run onto another pile when that split reveals nothing; only the maximal run move that actually exposes a hidden card or empties a column gets suggested, so hints don't oscillate a card back and forth), `explainHint` (names the card/target), `isWon`, `canAutoComplete` (true once every tableau card is face up and the game isn't already won), `solveRemaining` (bounded DFS + memoized visited-state search that returns a full winning move sequence once `canAutoComplete` holds — relies on the "thoughtful solitaire" theorem that a fully revealed Klondike is always solvable), `score`; helpers `SUITS`/`isRed`; label maps `RANK_LABELS`/`SUIT_LABELS`/`SUIT_TITLES` (single source, reused by `SolitaireBoard.vue`) — pure |
| `scoring.js` | Puzzle scoring helpers. `scorePuzzle`, `queensScore`, `formatClock`; penalties `HINT_PENALTY`/`TIME_PENALTY_PER_SECOND` — pure |
| `stats.js` | Pure record/serialization logic. `emptyStats`, `recordResult`, `mergeStats`, `normalizeStats`, `serializeGame`/`deserializeGame`, `hasUsableSavedGame`; `GAME_IDS` |
| `db.js` | Plain IndexedDB `casual-games` (v1): stores `stats` and `games`. `loadStats`/`saveStats`/`saveGame`/`loadGame` — browser-only |
| `QueensBoard.vue` | SVG grid board: LMB places/removes a queen (auto-marks eliminated cells with ✕ via `eliminatedCells`), RMB click-or-drag paints/erases manual ✕ marks, conflict highlighting, «новая»/«подсказка» with hint explanation |
| `TangoBoard.vue` | 6×6 grid: LMB sets ☀, RMB sets 🌙 (either click again to clear), draws `=`/`×` constraints, violation highlight, hint explanation |
| `ZipBoard.vue` | SVG grid: drag/click path between neighbours, numbered waypoints; no undo button — dragging back onto the previous cell retracts the path one step at a time; hint explanation |
| `SolitaireBoard.vue` | Klondike layout (stock/waste/foundations/tableau), click/drag moves (incl. dragging the waste card), double-click auto-move (`autoPlay`: foundation first, falls back to a legal tableau spot — waste or top tableau card), undo, hint explanation, red/black suit coloring via `--ds-danger`. Auto-triggers an animated auto-finish (`autoComplete`, ~90ms/move) once `canAutoComplete` holds — no button, fires from `sync()`/`maybeAutoComplete()`; interactions are locked (`locked` computed + `.auto-completing` pointer-events guard) while it plays out |
| `components.render.test.mjs` | SFC guard (regex) for the four board components and shell import |

## Game state model

Each board exposes `getState()` → `{ score, won, ...game-specific }` and
`restoreState(state)`. Only `SolitaireBoard.vue` also exposes `newGame`/`undo`/
`requestHint`; `QueensBoard.vue`, `TangoBoard.vue` and `ZipBoard.vue` expose only
`getState`/`restoreState`. Zip has no undo button — dragging the path backward onto the
previous cell retracts it one step at a time (`append` in `ZipBoard.vue`).
`CasualGames.vue` autosaves the active board every 2 s and on `beforeunload`; won games
are cleared instead of saved. `loadGame` returns `{ gameId, savedAt, state }`, and
`hasUsableSavedGame` accepts only `state.won === false`.

Per-game stats: `{ best, plays, wins, currentStreak, longestStreak }`.

## Persistence

IndexedDB database `casual-games` with object stores `stats` (single `main` record)
and `games` (one record per `GAME_IDS` entry). Non-private data → no `crypto.js`.

## Tests

```
node --test .vitepress/theme/components/CasualGames/*.test.mjs
```

Browser-only syntax check:
```
node --check .vitepress/theme/components/CasualGames/db.js
```
