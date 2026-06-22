# VitePress config & design system

## Design system «Spiral»

Dark slate palette shared by all six apps (since 2026-06-12):
- Page/app bg: `#0f172a`, panels/cards: `#1e293b`, raised/hover: `#273449`, controls/borders: `#334155`/`#475569`
- Text: `#e2e8f0` / muted `#94a3b8` / dim `#64748b`, danger: `#3f1d1d`/`#f87171`
- Two deliberate light surfaces: IDEF0 SVG canvas (`#f8fafc` "paper") and Journal lined-paper textarea

Each app keeps its own accent: journal indigo `#5555dd`, planner blue `#2563eb`, decisions teal `#0d9488`, music yellow `#ffe633`.

### Palette mirrors — change a color in BOTH

CSS can't be imported as JS values:
- `theme/styles/vars.css` — `--ds-*` CSS custom properties (8 spectrum colors incl. `--ds-teal: #33ffcc` 7th, `--ds-yellow: #ffe633` 8th)
- `theme/components/spectrum.js` — JS mirror: `SPECTRUM` (8 hex), `CANVAS_PALETTE` (8 rgba prefixes), `PROJECT_COLORS` (project → hex)

Unit-tested in `spectrum.test.mjs`.

### Spectrum semantics (8 spheres = 8 particle colors)

`--ds-violet` AR, `--ds-cyan` blog, `--ds-green` idef0, `--ds-pink` journal, `--ds-amber` piano, `--ds-orange` github, `--ds-teal` decisions, `--ds-yellow` music.

### LifeCircle «колесо жизни»

`theme/components/LifeCircle.vue` — donut wheel of 8 spheres, outer radius encodes readiness. `buildSegments` is generalized to `n = defs.length`: `span = 360/n`, 4° gap between spheres. Spheres/readiness: Дневник 9, IDEF0 8, AR 5, Piano 4, OpenPose 4, Планировщик 4, Решения 4, Музыка 3.

Pure helpers in `lifecircle.js` (`deg2rad`, `arcPath`, `labelXY`, `fillRadius`, `buildSegments`, `centerMark`) — all unit-tested in `lifecircle.test.mjs`.

**Center mark**: the donut hole holds an `<a class="center-mark" href="/vacuum-rogues/" target="_self">` with an inline «ship-ranger» vector (no raster) — the entry point to the game. Geometry comes from `centerMark(GEOM)` (inscribed in `innerR:55`, centered on cx/cy); light monochrome so it reads on the dark hole without competing with the colored spheres. The `target="_self"` is mandatory or the SPA router 404s the directory route (same rule as `/ar/`). **Conditional on availability**: `onMounted` does a `HEAD /vacuum-rogues/` probe and only shows the mark when it returns 200 (`gameAvailable`) — until the game is actually deployed there, the hole stays empty instead of pointing at a 404. It auto-appears when the game ships (no rebuild). `VITE_GAME_LOGO=1` forces it on for local visual testing. Out of scope by decision: `HomeMark.vue` / `public/home-wheel.svg` do NOT mirror this mark (logo only on the big home wheel).

### HomeMark.vue

Mini replica of the LifeCircle wheel (8 sphere arcs). Used as home link in every app top bar. `active` prop highlights the current app's sphere. `360/n` rotate on hover set via `--home-rot`. Registered globally in `index.mts`. Must stay in sync with: `LifeCircle.vue` SEGMENTS, `public/home-wheel.svg`, and the static SVG in `ar-engine/web/index.html`.

### Connecting particles

`ConnectingParticles.js` — single source for the 2D particle background. Pure helpers `stepParticle`, `connectionAlpha`, `createParticles` + browser factory `createField(canvas, opts)`. Used by Portfolio.vue and the 2D fallback in Layout.vue. Unit-tested in `ConnectingParticles.test.mjs`.

### Countdown «1000 дней роста»

`CountDown.vue` — 4 progress rings. Mounted in Portfolio hero (`<CountDown :countdownDays="1000" />`). **Do not pass `startDate`** (epoch hardcoded at 23/03/2025). Pure math in `countdown.js`, tested in `countdown.test.mjs`.

### Dark theme only

No light theme planned.

---

## SEO & meta pipeline

All SEO is generated in `config.mts` via helpers in `seo.js` (pure ESM, unit-tested in `seo.test.mjs`).

- `titleTemplate: ':title — Alterfo'` globally; `index.md` sets `titleTemplate: false`.
- `transformPageData` pushes canonical, OG/Twitter, and per-page JSON-LD `<script>` onto `frontmatter.head`.
- `canonicalFor(rel)` strips `.md`, collapses `index` → directory (trailing slash kept for index pages), prefixes `SITE_URL`. Sitemap `<loc>` reuses it.
- `jsonLdFor(rel,…)`: `index.md` → `Person`; `TOOL_CATEGORY` → `SoftwareApplication`; `posts/*` → `BlogPosting` (date from filename prefix); `music.md` → `MusicGroup`. Projects pages and `blog.md` → no JSON-LD by design.
- `jsonLdScript(ld)` escapes `<`/`>`/`&`/`</script>` to `\uXXXX` — VitePress embeds `<script>` body verbatim.
- **Adding a new tool page**: add to `TOOL_CATEGORY` in `seo.js` AND add a `description` frontmatter.
- Sitemap: hand-rolled in `buildEnd`, zero deps. Priority: `/` = 1.0, `TOOL_CATEGORY` or `music.md` = 0.8, `projects/` = 0.7, else 0.6. `/ar/` added via `EXTRA_URLS` (in `seo.js`, unit-tested in `seo.test.mjs`). `/vacuum-rogues/` is NOT in `EXTRA_URLS` yet — it's a 404 until the game deploys, so it's not advertised in the sitemap.
- **`/ar/` SEO is hand-maintained** in `ar-engine/web/index.html` — invisible to VitePress pipeline.
- **`/vacuum-rogues/` is dormant until the game deploys** (decision: don't surface a route that 404s). What's wired now: `srcExclude: ['vacuum-rogues/**']`, the private git submodule, and a **gated** deploy step (build the game with `--base=/vacuum-rogues/` and copy its `dist/` into `.vitepress/dist/vacuum-rogues/`), guarded by the `VACUUM_ROGUES_DEPLOY_KEY` secret + `continue-on-error` so a missing/failed game build never breaks the main deploy. What's intentionally NOT wired until the game is live: **no `public/` placeholder, no nav entry, no `EXTRA_URLS` sitemap entry**. The home-page center mark is the entry point and self-activates via the `HEAD /vacuum-rogues/` probe. **Prerequisite before the real deploy**: optimize the game's `dist/` in the game repo (607 MB → target < ~80 MB; 22–26 MB PNG backdrops → WebP/AVIF). When the game ships, re-add the nav + `EXTRA_URLS` entries.
- **OG image**: `public/og-source.svg` → `public/og.png`. Regenerate via headless Chrome (macOS `sips`/`qlmanage` mis-handle non-square aspect).

---

## Typography pipeline (nbsp before em dash)

`an em dash «—» is always preceded by U+00A0`, never a plain space.

- Helpers in `typography.js`: `nbspBeforeDash(text)` (matches literal «—» AND raw `&mdash;` entity) and `applyNbspToInlineTokens(children)`. Tested in `typography.test.mjs`.
- Markdown content fixed at **build time** by a `markdown.config(md)` core rule in `config.mts`, pushed AFTER markdown-it-anchor (running earlier changes heading slugs → broken anchors).
- Out of the markdown rule's reach — fix by hand: raw HTML blocks in `.md`, `.vue` UI strings, frontmatter `description`, `ar-engine/web/index.html`. Meta tags/JSON-LD go through `nbspBeforeDash` in `transformPageData`.
- **Don't grep for a literal nbsp in shell** — shells normalize U+00A0 → plain space silently. Use ` ` escapes in code.

---

## VitePress client-runtime gotchas

These bugs pass `npm run build` green — TS not typechecked (esbuild strips types), SSR never navigates.

- **Default-theme config lives in `themeConfig`**: a top-level `nav` is silently ignored.
- **`public/home-wheel.svg`** is a third static mirror of the wheel — change it together with `HomeMark.vue` and `ar-engine/web/index.html`.
- **Router skips anchors with ANY `target` attribute**. Links to `/ar/` must carry `target="_self"` or they SPA-404.
- **Prefetch crashes on SVG anchors**: `SVGAElement` has no `.pathname` → `pathToFile(undefined)` throws. `LifeCircle.vue` polyfills `pathname`/`hostname` in `onMounted` — keep that.
- **`Layout.vue` site-header height**: comes ONLY from `initHeader()` setting `style.height`. One canvas = one context type (WebGPU vs 2d). `webgpuInit` is single-flight. `boundEl` tracks canvas recreation. `WebGPUParticles.reseed()` on every SPA page change.
