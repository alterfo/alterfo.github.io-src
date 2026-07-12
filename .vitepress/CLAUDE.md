# VitePress config & design system

## Design system «Spiral»

**Cool graphite + jewel-tone accents** palette shared by the home page and all six apps.
History: cosmic-violet-home / slate-apps split (generic "AI-generated site", see
`[[feedback-no-generic-claude-ui]]`) → warm-ink earth tones (terracotta/ochre/olive —
2026-07-12, first pass) → **current** cool graphite + jewel tones (2026-07-12, same day,
second pass — the warm-ink version read as literal "autumn/fallen-leaves", not elite; see
`[[project-warm-ink-redesign]]` memory for the full history):
- Void/page bg: `--ds-void` `#14161a`, panels/cards: `--ds-surface-solid` `#1e2126`, raised/hover: `--ds-raised` `#262a30`, borders: `--ds-border`/`--ds-border-strong` (translucent cool-neutral rgba, not solid hex)
- Text: `--ds-text` `#e6e4e0` / muted `--ds-text-muted` / dim `--ds-text-dim` (translucent cool-neutral rgba), strong `--ds-text-strong` `#f7f6f3`
- Danger (semantic red, deliberately NOT recolored): `--ds-danger` `#f87171`, `--ds-danger-strong` `#ef4444`, `--ds-danger-bg` `#3a1a1a`
- Radii: `--ds-radius-sm` 5px / `--ds-radius` 8px / `--ds-radius-lg` 14px. Shadows: `--ds-shadow-panel`, `--ds-shadow-card`. Pill buttons (`border-radius: 20px`/`999px`) were deliberately replaced with these — a full pill/oval reads as a stock UI-kit component.
- Two deliberate light surfaces stay unrecolored: IDEF0 SVG canvas (`#f8fafc` "paper") and Journal lined-paper textarea (background images + `#222` ink)

**Each app's accent is unified with its sphere color** (previously each app had its own
unrelated brand hue — journal indigo `#5555dd`, planner blue `#2563eb`, decisions teal
`#0d9488`, piano indigo `#4040aa`, idef0 blue `#3b82f6`, openpose cyan `#4fc3f7` — all
retired in favor of `PROJECT_COLORS[sphere]`). Each app's root class (`.journal-root`,
`.planner-root`, `.dj-root`, `.piano-app`, `.idef0-root`, `.op-root`) declares its own
scoped `--ds-accent` / `--ds-accent-light` / `--ds-accent-hover` / `--ds-accent-bg`
(tints computed from the sphere hex — see the comment above each declaration) — these
are per-app, NOT global tokens; each app's CSS file owns its own values.

### AppHeader.vue — shared app top bar

`theme/components/AppHeader.vue` (registered globally in `index.mts`) replaces what used
to be six near-identical inline-styled `<div>` blocks hand-copied into each app's `.md`
frontmatter (hardcoded `background:#0f172a`/`#1e293b`, sphere hex repeated twice, and a
middot tagline bar like `"MIDI · Web API · Локально"` — a strong generated-site tell).
Usage: `<AppHeader sphere="journal" title="Дневник"><Journal /></AppHeader>` — reads
`--ds-*` tokens, colors the accent from `PROJECT_COLORS[sphere]` (`spectrum.js`), wraps
`<HomeMark :active>` and a `<ClientOnly>` around the slot. **No tagline** — don't
reintroduce the "X · Y · Локально" formula on new apps.

### Fonts — self-hosted, not system stack

`--ds-font-display: 'Cormorant', Georgia, …` (headings **≥18px only**) and
`--ds-font-body: 'Source Sans 3', -apple-system, …` (`vars.css`) — chosen 2026-07-12 to
replace **three separate generic-site tells**, found and fixed in sequence:
1. `Georgia` display serif + raw system-ui body was the exact "safe premium" pairing AI
   site generators default to.
2. Worse: every app root (`.journal-root`, `.piano-app`, `.idef0-root`, etc.) had its
   *own* hardcoded system-font stack (`'Segoe UI'`, `system-ui`, `-apple-system`, even a
   never-vendored `'PT Sans Caption'`) instead of `var(--ds-font-body)` — app UI text was
   silently rendering in the raw OS default font site-wide. **Every app root must set
   `font-family: var(--ds-font-body)`** (and anything teleported to `<body>` —
   `HelpModal.vue`, `Journal.css` `.cp-modal` — needs its own explicit declaration; it
   won't inherit from the app root).
3. The first display-font pick, Source Serif 4, turned out to be the wrong *kind* of
   serif: it's a **text** serif (moderate contrast, legible small — designed for body
   copy), so blown up as a headline it just reads as "a nicer default serif", not
   distinctive — a subtler version of the same genericness. Replaced with **Cormorant**,
   a genuine **display-only** high-contrast Garamond revival (dramatic thin-hairline vs.
   thick-stem strokes) — that contrast is what actually reads as elite/editorial rather
   than generic. The tradeoff: it's too delicate to read well under ~18px, so anything
   smaller (`AppHeader.vue` `.app-title` 14px, `DecisionJournal.css` `.dj-review-q` 15px,
   `BlogList.vue` `.year-header` 12px, `CountDown.vue` `.cd-caption`) uses
   `var(--ds-font-body)` at a heavier weight instead — **don't add a new heading under
   18px to `--ds-font-display` without checking it renders legibly first.**

Fraunces/Newsreader/Public Sans were considered before Source Serif 4 and rejected:
**Latin-only, no Cyrillic** — a dealbreaker since most headings on this site are Russian
(`fonts.google.com/metadata/fonts` → `subsets` — check this BEFORE picking a display font
for this site). Bodoni Moda (the highest-contrast, most dramatic "elite" option) was
considered when replacing Source Serif 4 and rejected for the same reason. Cormorant and
Source Sans 3 both have Cyrillic and both ship as **variable fonts** (single file covers
the whole weight axis).

Self-hosted per `[[no-cdn-rule]]` — no Google Fonts `<link>` at runtime:
- `public/fonts/*.woff2` — Cormorant: `latin` + `cyrillic` only (2 files, ~57 KB —
  display-only usage doesn't need `latin-ext`/`cyrillic-ext`). Source Sans 3: all 4
  subsets (`latin`, `latin-ext`, `cyrillic`, `cyrillic-ext`, ~136 KB — it's the body font,
  needs full coverage). One file per subset, not per weight — the variable-font src is
  byte-identical across all static weights Google's CSS2 API offers, so only the unique
  URLs were fetched.
- `theme/styles/fonts.css` (imported by `styles/index.css`) — the `@font-face` rules,
  `font-weight` range per family (declares the variable range) + `unicode-range` per
  subset so the browser only fetches the file(s) actually needed for the text on the page.
- Regenerate/add a weight, subset, or swap the display font again: fetch
  `https://fonts.googleapis.com/css2?family=…` with a modern Chrome UA (needed for woff2;
  a plain UA returns ttf), parse out the `latin`/`latin-ext`/`cyrillic`/`cyrillic-ext`
  blocks, download each unique URL into `public/fonts/`, update `fonts.css`. **Check
  Cyrillic subset support first** (see above) — this has bitten the choice twice already.
- `.exp-icon` in `Portfolio.vue` (the 𝄞 treble-clef glyph, U+1D11E) deliberately stays on
  the system serif fallback — that Unicode block isn't in Cormorant's coverage either.

### Palette mirrors — change a color in BOTH

CSS can't be imported as JS values:
- `theme/styles/vars.css` — `--ds-*` CSS custom properties (8 spectrum colors incl. `--ds-teal: #2d5654` 7th/decisions, `--ds-yellow: #9098a8` 8th/music)
- `theme/components/spectrum.js` — JS mirror: `SPECTRUM` (8 hex), `CANVAS_PALETTE` (8 rgba prefixes), `PROJECT_COLORS` (project → hex)

Unit-tested in `spectrum.test.mjs`. `WebGPUParticles.js`'s `COLORS` array is an
**independent** normalized-RGB mirror of the same 8 jewel-tone hues — not test-guarded,
edit by hand if the spectrum changes.

### Spectrum semantics (8 spheres = 8 particle colors, jewel/gallery tones)

`--ds-violet` `#7a3348` бордо/wine (AR), `--ds-cyan` `#a8874a` бронза/bronze
(blog/openpose), `--ds-green` `#3f5946` хвоя/pine (idef0), `--ds-pink` `#8a5568`
мальва/mauve (journal), `--ds-amber` `#4a6178` сталь/steel-blue (piano), `--ds-orange`
`#6b5a48` каштан/chestnut (github/planner), `--ds-teal` `#2d5654` антрацит-тил/deep-teal
(decisions), `--ds-yellow` `#9098a8` графит/graphite (music).

### LifeCircle «колесо жизни»

`theme/components/LifeCircle.vue` — donut wheel of 8 spheres, outer radius encodes readiness. `buildSegments` is generalized to `n = defs.length`: `span = 360/n`, 4° gap between spheres. Spheres/readiness: Дневник 9, IDEF0 8, AR 5, Piano 4, OpenPose 4, Планировщик 4, Решения 4, Музыка 3.

Pure helpers in `lifecircle.js` (`deg2rad`, `arcPath`, `labelXY`, `fillRadius`, `buildSegments`, `centerMark`) — all unit-tested in `lifecircle.test.mjs`.

**Center mark**: the donut hole holds an `<a class="center-mark" href="/vacuum-rogues/" target="_self">` with an inline «ship-ranger» vector (no raster) — the entry point to the game. Geometry comes from `centerMark(GEOM)` (inscribed in `innerR:55`, centered on cx/cy); light monochrome so it reads on the dark hole without competing with the colored spheres. The `target="_self"` is mandatory or the SPA router 404s the directory route (same rule as `/ar/`). **Conditional on availability**: `onMounted` does a `HEAD /vacuum-rogues/` probe and only shows the mark when it returns 200 (`gameAvailable`) — until the game is actually deployed there, the hole stays empty instead of pointing at a 404. It auto-appears when the game ships (no rebuild). `VITE_GAME_LOGO=1` forces it on for local visual testing. Out of scope by decision: `HomeMark.vue` / `public/home-wheel.svg` do NOT mirror this mark (logo only on the big home wheel).

### HomeMark.vue

Mini replica of the LifeCircle wheel (8 sphere arcs). Used as home link in every app top bar. `active` prop highlights the current app's sphere. `360/n` rotate on hover set via `--home-rot`. Registered globally in `index.mts`. Must stay in sync with: `LifeCircle.vue` SEGMENTS, `public/home-wheel.svg`, and the static SVG in `ar-engine/web/index.html`.

**Regression guard**: `lifecircle-mirrors.test.mjs` parses all four sources (`LifeCircle.vue` SEGMENTS is the source of truth, the other three are compared against it) and asserts the 8 spheres agree on id/color/order. Run it after touching any one mirror.

### Connecting particles

**Hand-written by the user — the signature animation of this site. Only improve, never simplify away or mute into invisibility without asking first.** (2026-07-12: got this wrong repeatedly in one session — muted the connection alpha, then removed the line pass entirely reasoning it read as a generic tech-startup network-mesh backdrop; user reverted both and was explicit the connections are the whole point. Then tried adding a "glowing trail" (canvas-pixel persistence via translucent `fade` repaint, then a history-based bounded-trail redesign, then a connection-trail on top of that, then a longer 4s trail duration) — none of it stuck. User's final call after seeing the fully-tuned trail version: «фигня получилась, убери трейлы» (turned out crap, remove the trails). Back to the pre-trail design below: hard clear + instant per-frame draw, no persistence of any kind. See `[[feedback-dont-touch-handwritten-code-without-asking]]` and `[[feedback-verify-visual-impact-not-just-correctness]]` memories — do not re-propose a trail effect here without the user asking again first.)

`ConnectingParticles.js` — single source for the 2D particle background. Pure helpers `stepParticle`, `gravityAccel`, `applyGravity`, `connectionAlpha`, `createParticles`, `prefersReducedMotion(mql)` + browser factory `createField(canvas, opts)`. Used by Portfolio.vue and the 2D fallback in Layout.vue. Unit-tested in `ConnectingParticles.test.mjs`.

**Motion is gravitational, not linear drift.** `applyGravity(particles)` runs once per frame, before `stepParticle`, on a single position snapshot: every particle pulls every OTHER particle within `GRAVITY_RANGE` (130px) toward it, force ∝ `puller.r / distance²` (true inverse-square — bigger dot = more mass = harder pull; motion visibly accelerates the closer two particles get), softened (`distance² + softening²` in the denominator) so the force stays finite instead of spiking to infinity as distance → 0. `stepParticle` still does the actual position update + torus-wrap using the velocity `applyGravity` just modified. Two failure modes were found and fixed while building this (2026-07-12):
- **Global collapse:** a first version let every particle pull on every other regardless of distance — with ~100 particles the net pull always drifts everyone toward the crowd's overall center of mass, and by t≈20-40s (verified via CDP time-lapse) the whole field visibly collapsed into one dense clump. Fixed by capping the interaction range (`GRAVITY_RANGE`) so particles only feel nearby neighbors — interactions stay local swirls/close passes instead of summing into one global attractor.
- **Reads as magnets, not gravity:** a short-range repel-below-threshold branch was added to stop particles literally coinciding — but the discontinuous flip from strong attraction to strong repulsion at a fixed radius reads as magnets snapping/bouncing off each other, not orbital motion. User: «они сейчас отталкиваются как магниты, а должны вести себя как планеты в космосе». Removed the repel branch entirely — attraction-only, relying purely on softening to keep force finite and `GRAVITY_MAX_SPEED` to cap resulting velocity. A close pair now curves and slingshots past on its own momentum (the real gravitational look) instead of bouncing off an invisible wall.

Don't reintroduce a repulsion force here without the user asking — it was tried and explicitly rejected as reading wrong. If tuning the gravity constants (`GRAVITY_STRENGTH`/`GRAVITY_SOFTENING`/`GRAVITY_RANGE`/`GRAVITY_MAX_SPEED`), verify with a CDP time-lapse running well past 30s, not just the first few seconds — the global-collapse failure mode only shows up after the field has had time to drift.

**No persistence — hard clear + instant redraw every frame.** Every frame does a full opaque repaint to `bg` (`ctx.fillStyle = bg; ctx.fillRect(...)`, normal blend), then dots and connection lines are drawn fresh from the particles' current positions with `globalCompositeOperation = 'lighter'` (additive) on top — overlapping deposits brighten each other *within that one frame*, but nothing carries over into the next frame. Connection lines use a true two-color gradient (`ctx.createLinearGradient` between the two particles' own colors), not one particle's flat color for the whole line.

**Do not reintroduce a trail/glow-persistence effect (translucent fade OR bounded position-history array) without the user asking first** — both were tried at length in the 2026-07-12 session (see project-warm-ink-redesign memory rounds 7–9) and ultimately rejected outright, not just re-tuned. If a change here needs verifying, the Chrome extension's `computer` screenshot tool waits for `document_idle`, which never fires on this page because of the continuous rAF loop — use headless Chrome via raw CDP (`Page.captureScreenshot` over the DevTools WebSocket) instead, per the CDP debugging note above.

`createField(canvas, opts)` option set (see JSDoc above the function for the authoritative list): `density`, `count` (number or `() => number`, overrides `density`), `connectDistance`, `bg` (solid clear color, hard-repainted every frame — NOT a translucent fade), `palette`, `lineWidth`, `autoStart` (default `true`), `getSize` (default reads `canvas.offsetWidth/Height`), `reducedMotion` (default reads the live `prefers-reduced-motion` media query via `osReducedMotion()`; when true, `start()` is a no-op and a single static frame is drawn instead of starting the rAF loop). The two call sites use different dialects of this same option set — both valid, not drift:
- `Portfolio.vue`: `{ density: 12, connectDistance: 100 }` — fixed CSS-sized canvas, default `autoStart`/`getSize`/`bg`.
- `Layout.vue`: `{ count: () => Math.floor(height / 2.5), connectDistance: 120, bg: 'rgb(20,22,26)', autoStart: false, getSize: () => ({ w: width, h: height }) }` — header canvas is resized/animation-toggled externally, so it drives `start()`/`stop()` itself and supplies its own tracked `width`/`height` instead of reading `offsetWidth/Height`.

Both call sites get the reduced-motion gate for free (no call-site changes needed) since `reducedMotion` defaults to the live media query inside `createField` itself. `bg`'s RGB must match `--ds-void` — update it alongside the void token if that ever changes again.

**The WebGPU path (`WebGPUParticles.js` + `public/particles/render.wgsl`+`point.wgsl`, used for the header when `gpuAvailable()`) does NOT have the history-based trail** — it kept `loadOp: 'clear'` (hard clear every frame, zero persistence, matching its original pre-2026-07-12 behavior), deliberately, rather than porting the trail design to WebGPU. Building an equivalent required a per-particle position history in a GPU storage buffer (a compute-shader ring-buffer update + a new draw call reading it) — meaningfully more involved than the 2D canvas version and not verifiable in this environment's headless-Chrome WebGPU support, so it was left as a possible follow-up rather than risking an unverified change to the header canvas. It does share the other 2026-07-12 fixes: true particle color (no `1.5x+0.2` brightness boost, which washed dots toward white), a true per-vertex gradient on connection lines (interpolated by WGSL between the two line vertices, not a single blended-average color), and the current cool-graphite `COLORS` palette (was still on the old warm-ink normalized values until this pass — check this file specifically whenever the palette changes again, it's easy to miss since it's a hand-maintained mirror, not test-guarded).

`WebGPUParticles.js` has no reduced-motion awareness of its own — its `start()` always runs the rAF loop. So on a WebGPU-capable browser, the gate has to happen one level up: `Layout.vue`'s `reducedMotionPreferred()` (reuses the exported `prefersReducedMotion` pure helper) feeds into `headerAction()` in `headerLifecycle.js`, which routes reduced-motion sessions to `'field-2d'` instead of `'init'` so the WebGPU branch is never taken at all.

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
- **`/vacuum-rogues/` is dormant until the game deploys** (decision: don't surface a route that 404s). What's wired now: `srcExclude: ['vacuum-rogues/**']`, the private git submodule, and a **gated** deploy step (build the game with `--base=/vacuum-rogues/` and copy its `dist/` into `.vitepress/dist/vacuum-rogues/`), guarded by the `VACUUM_ROGUES_DEPLOY_KEY` secret + `continue-on-error` so a missing/failed game build never breaks the main deploy. What's intentionally NOT wired until the game is live: **no `public/` placeholder, no nav entry, no `EXTRA_URLS` sitemap entry**. The home-page center mark is the entry point and self-activates via the `HEAD /vacuum-rogues/` probe. **Game `dist/` size**: already optimized in the game repo (was ~607 MB; heavy PNG backdrops → WebP/AVIF) — no longer a deploy blocker. When the game ships, re-add the nav + `EXTRA_URLS` entries.
- **OG image**: `public/og-source.svg` → `public/og.png`. Regenerate via headless Chrome (macOS `sips`/`qlmanage` mis-handle non-square aspect).
- **Favicon family / theme-color**: `SITE_HEAD` + `THEME_COLOR` in `seo.js`, wired into `config.mts`'s top-level `head` (static across all pages, unlike the per-page `transformPageData` entries above). Sourced from `public/home-wheel.svg` (the square «колесо жизни» mark, not `og-source.svg` which is the 1200×630 OG card — wrong shape for an icon): SVG favicon served directly, plus `apple-touch-icon.png` (180×180) and `favicon.png` (48×48) rasterized locally via headless Chrome over `--ds-void` `#14161a`. `seo.test.mjs` asserts the icon/apple-touch-icon/theme-color entries exist and that every linked `href` resolves under `public/`.

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
- **`WebGPUParticles.js` is a dynamic `import()`**, not a static one — `Layout.vue` only calls it (and only then pulls in the shader/pipeline code) when `gpuAvailable()` (`!!navigator.gpu`) is true. `ConnectingParticles` (2D fallback) stays a static import. The branch decisions around this — single-flight init, the `init`/`field-2d`/`reseed-render`/`noop` action table, the canvas-recreation guard — are extracted as pure helpers into `headerLifecycle.js` (`shouldStartInit`, `headerAction`, `shouldResetForNewCanvas`), unit-tested in `headerLifecycle.test.mjs`, and kept as a separate module from `WebGPUParticles.js` so `Layout.vue` can import them statically without re-pulling the GPU class into the eager entry chunk.
- **Lazy chunks still get a build-time preload *hint*, scoped per page** — Vite's default `modulePreload` walks every dynamic `import()` reachable from the shared SPA entry and would otherwise tag the five app-root chunks + `WebGPUParticles.js` as eager `<link rel="modulepreload">` on **every** page (incl. the home page, which renders none of them) regardless of route or `gpuAvailable()`. `shouldPreloadLink` in `seo.js` (wired via `shouldPreload` in `config.mts`) demotes each lazy chunk to a low-priority `<link rel="prefetch">` everywhere except the one page that actually renders it; `WebGPUParticles` has no dedicated page so it is always prefetch-tier, never eager. This does not eliminate the fetch entirely (prefetch still runs on browser idle) — it removes the eager/critical-path cost, which is what the chunk split is for.
