# CLAUDE.md — alterfo.github.io-src

## Project overview

VitePress-based personal site with six fully client-side apps and one content page:
- `/idef0` — IDEF0 diagram editor (SVG + Vue 3, FIPS 183)
- `/journal` — private encrypted daily journal (WebCrypto AES-GCM, IndexedDB, 500-words/day, file-based sync)
- `/piano` — interactive MIDI piano teacher (Web MIDI API, VexFlow notation, IndexedDB progress)
- `/openpose` — OpenPose pose editor (MediaPipe BlazePose WASM, drag-edit skeletons, ControlNet PNG + JSON export)
- `/planner` — encrypted project/task planner (WebCrypto AES-GCM, IndexedDB, kanban + list, encrypted `.planner` export/import)
- `/decision-journal` — encrypted decision journal with calibration (Brier score + confidence-bucket table)
- `/music` — music page: Alterfo albums (Яндекс.Музыка), lazy embed player

Plus two **external apps served as subpaths** (not in-tree client apps, copied into `dist/<subpath>/` at deploy, mirroring each other):
- `/ar` — AR Engine (`ar-engine/`, SEO hand-maintained in `ar-engine/web/index.html`)
- `/vacuum-rogues` — browser game (private repo `alterfo/vacuum-rogues`, Vite + PixiJS + onnxruntime-web; vendored as a git submodule at `vacuum-rogues/`, built in CI gated on the `VACUUM_ROGUES_DEPLOY_KEY` secret, placeholder until then). Its entry point is the **ship-ranger logo in the center of the LifeCircle donut** on the home page (`<a href="/vacuum-rogues/" target="_self">`).

## Key entry points

| Path | Role |
|------|------|
| `.vitepress/config.mts` | VitePress config, SEO hooks, sitemap |
| `.vitepress/theme/index.mts` | Theme entry: global component registration |
| `.vitepress/theme/components/crypto.js` | Shared WebCrypto substrate (PBKDF2 → AES-GCM); reused by journal, planner, decisions |
| `.vitepress/theme/components/IDEF0Editor.vue` | IDEF0 root (`<ClientOnly>`); modules in `IDEF0Editor/` |
| `.vitepress/theme/components/Journal.vue` | Journal root (`<ClientOnly>`); modules in `Journal/` |
| `.vitepress/theme/components/Piano.vue` | Piano root (`defineAsyncComponent`); modules in `Piano/` |
| `.vitepress/theme/components/OpenPoseEditor.vue` | OpenPose root (static); modules in `OpenPose/` |
| `.vitepress/theme/components/PlannerEditor.vue` | Planner root (static); modules in `Planner/` |
| `.vitepress/theme/components/DecisionJournal.vue` | Decisions root (static); modules in `Decisions/` |
| `.vitepress/theme/components/MusicAlbums.vue` | Music page component |
| `.vitepress/theme/components/spectrum.js` | Design system JS mirror (palette, CANVAS_PALETTE, PROJECT_COLORS) |
| `posts.data.ts` | VitePress data loader: reads `posts/*.md`, parses frontmatter, extracts excerpt |
| `blog.md` | Blog listing page at `/blog` — uses `<BlogList :posts="posts" />` |

For detailed docs on each app, see `CLAUDE.md` in the relevant module subfolder.
For design system, SEO, typography, and VitePress gotchas, see `.vitepress/CLAUDE.md`.

## Development

```
# Dev server (use npm, not yarn — yarn is broken)
npm run dev

# Build
npm run build

# Unit tests
node --test .vitepress/theme/components/crypto.test.mjs
node --test .vitepress/theme/components/Journal/*.test.mjs
node --test .vitepress/theme/components/IDEF0Editor/model.test.mjs
node --test .vitepress/theme/components/Piano/*.test.mjs .vitepress/theme/components/Piano/importer/*.test.mjs
node --test .vitepress/theme/components/OpenPose/*.test.mjs
node --test .vitepress/theme/components/Planner/store.test.mjs
node --test .vitepress/theme/components/Decisions/vault.test.mjs .vitepress/theme/components/Decisions/stats.test.mjs
node --test .vitepress/theme/components/music.test.mjs
node --test .vitepress/theme/components/spectrum.test.mjs .vitepress/theme/components/ConnectingParticles.test.mjs .vitepress/theme/components/countdown.test.mjs .vitepress/theme/components/lifecircle.test.mjs
node --test .vitepress/seo.test.mjs
node --test .vitepress/theme/components/onboarding.test.mjs
```

- **`vitepress preview` 404s new hashed assets after rebuild** — restart preview after every build.
- **CDP debugging**: `chrome --headless=new --remote-debugging-port=N --user-data-dir=/tmp/x about:blank`; create tab via `/json/new?url=about:blank` then `Page.navigate`; subscribe to `Runtime.exceptionThrown`; WebGPU canvases only via `Page.captureScreenshot`.
- Plan files: `docs/plans/` (git-ignored, local only).

## Code intelligence — GitNexus

Repo is GitNexus-indexed; prefer `mcp__gitnexus__*` over grep. Before editing a symbol: `impact({target, direction:"upstream"})`. Before committing: `detect_changes({scope:"compare", base_ref:"master"})`. Explore with `query`/`context`; rename via `rename` (not find-replace). Refresh: `node .gitnexus/run.cjs analyze`. Full rules: `.claude/skills/gitnexus/*/SKILL.md` and `AGENTS.md` (Claude Code does not load AGENTS.md, so the detail there is token-free in-session).

