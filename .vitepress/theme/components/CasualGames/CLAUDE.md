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
| `queens.js` | Queens engine. `generate(size, rng)`, `regionAt`, `validate(puzzle, queens)`, `isSolved`, `hint` — pure |
| `tango.js` | Tango (Binairo) engine. `generate(rng)`, `countSolutions`, `validate`, `isSolved`, `hint`; constants `MOON`/`SUN`/`EMPTY`/`EQUAL`/`DIFF` — pure |
| `zip.js` | Zip engine. `generate(rng)`, `countSolutions`, `validatePath`, `isSolved`, `hint`; constants `SIZE`/`EMPTY` — pure |
| `solitaire.js` | Klondike engine. `deal(rng)`, `legalMoves(state)`, `applyMove`, `autoMoveToFoundation`, `hint`, `isWon`, `score`; helpers `SUITS`/`isRed` — pure |
| `scoring.js` | Puzzle scoring helpers. `scorePuzzle`, `queensScore`, `formatClock`; penalties `HINT_PENALTY`/`TIME_PENALTY_PER_SECOND` — pure |
| `stats.js` | Pure record/serialization logic. `emptyStats`, `recordResult`, `mergeStats`, `normalizeStats`, `serializeGame`/`deserializeGame`, `toPlain`/`fromPlain`, `hasUsableSavedGame`; `GAME_IDS` |
| `db.js` | Plain IndexedDB `casual-games` (v1): stores `stats` and `games`. `loadStats`/`saveStats`/`saveGame`/`loadGame` — browser-only |
| `QueensBoard.vue` | SVG grid board: place/remove queen, conflict highlighting, «новая»/«подсказка», score |
| `TangoBoard.vue` | 6×6 grid: click cycles empty→☀→🌙, draws `=`/`×` constraints, violation highlight |
| `ZipBoard.vue` | SVG grid: drag/click path between neighbours, numbered waypoints, undo segment |
| `SolitaireBoard.vue` | Klondike layout (stock/waste/foundations/tableau), click/drag moves, double-click auto-move, undo |
| `components.render.test.mjs` | SFC guard (regex) for the four board components and shell import |

## Game state model

Each board exposes `getState()` → `{ score, won, ...game-specific }` and
`restoreState(state)` (plus `newGame`/`undo`/`requestHint`). `CasualGames.vue`
autosaves the active board every 2 s and on `beforeunload`; won games are cleared
instead of saved. `loadGame` returns `{ gameId, savedAt, state }`, and
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
