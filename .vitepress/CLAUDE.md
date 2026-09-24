# VitePress config & design system

## Design system «Paper & Ink»

**Warm paper ground + jewel-tone accents** palette shared by the home page and all eight client-side apps. Replaces the dark «Spiral» system (2026-09-24) — a deliberate light-editorial redesign chosen from three proposed directions (see `docs/plans/20260924-design-system-redesign.md` / `completed/`), authored per the reusable, site-direction rules in `~/.claude/design/*.md` (typography.md, palette.md, spacing-grid.md, design-systems.md — global, not repo-local; imported into `~/.claude/CLAUDE.md`).
History: cosmic-violet-home / slate-apps split (generic "AI-generated site") → warm-ink earth tones (2026-07-12, first pass) → cool graphite + jewel tones «Spiral» (2026-07-12, second pass, the dark system that shipped for ~2.5 months) → **current** «Paper & Ink» light system (2026-09-24, third pass — the redesign this section now documents):
- Void/page bg: `--ds-void` `#f6f2ea` (warm paper, not pure white), panels/cards: `--ds-surface-solid` `#ffffff`, raised/hover: `--ds-raised` `#efe8db`, borders: `--ds-border`/`--ds-border-strong` (translucent warm-ink rgba, not solid hex)
- Text: `--ds-text` `#22201b` / muted `--ds-text-muted` `rgba(34,32,27,0.65)` / dim `--ds-text-dim` `rgba(34,32,27,0.51)`, strong `--ds-text-strong` `#131210`. Borders: `--ds-border` `rgba(34,32,27,0.425)` / `--ds-border-strong` `rgba(34,32,27,0.574)`.
- Danger (semantic red, deliberately NOT recolored, but its *values* were regenerated for the light ground — the old `#f87171` is a light red, illegible as text on paper): `--ds-danger` `#d70b0b`, `--ds-danger-strong` `#b50505`, `--ds-danger-bg` `#feeaea` (light rose wash, flipped from the old dark-maroon badge fill)
- Radii: `--ds-radius-sm` 5px / `--ds-radius` 8px / `--ds-radius-lg` 14px. Shadows: `--ds-shadow-panel`, `--ds-shadow-card` (now `rgba(34,32,27,…)`, not black). Pill buttons (`border-radius: 20px`/`999px`) are still deliberately avoided — a full pill/oval reads as a stock UI-kit component.
- Two deliberate light surfaces from the dark era — IDEF0 SVG canvas (`#f8fafc` "paper") and Journal lined-paper textarea (`#222` ink) — are now very close in value to the new page void; they read as less distinct than they did against dark «Spiral». Left unchanged in this pass (out of scope), flagged as a possible follow-up.
- Every WCAG contrast number in this file (spectrum, danger, neutrals) was computed programmatically (Python, real relative-luminance formula) against the paper ground, not eyeballed — see `palette.md`'s contrast-requirements section for the method.

**Translucent-ink alpha percentages do NOT transfer across a ground-color flip — this
was shipped broken and caught a day later by the user, not by the redesign itself.**
The 2026-09-24 pass regenerated the spectrum/danger/neutral *hex* values for the light
ground, but `--ds-text-muted`/`-dim`/`--ds-border`/`-strong` kept their **old alpha
numbers** (0.6 / 0.38 / 0.12 / 0.2) unchanged — only the underlying ink color flipped
from light-on-dark to dark-on-light. That silently broke every consumer: at those
alphas, `--ds-text-muted` measured 4.18–4.34:1 against the three surfaces (below the 4.5
AA line for body text), `--ds-text-dim` 2.24–2.32:1, and both border tokens 1.26–1.51:1
— borders in particular were reading as almost fully invisible hairlines across every
app, since a 12%-opacity dark overlay on white removes far less relative luminance than
the same 10%-opacity *light* overlay used to remove on near-black. **Percent opacity is
not the right mental model for "equivalent subtlety" across a light/dark flip — contrast
ratio is.** Found during a 2026-09-25 cross-app contrast audit (prompted by user report:
"плохой контраст" in the apps) and fixed by numerically re-deriving each alpha against
`--ds-surface-solid` white (worst-case of the three surfaces) for a target ratio:
muted→0.65 (5.09:1), dim→0.51 (3.31:1, deliberately below AA body-text since it's a
tertiary/de-emphasized tier, not meant to be as prominent as muted), border→0.425
(2.61:1, a real but quiet hairline), border-strong→0.574 (4.0:1, for focus/hover/
emphasis). **Any future ground-brightness flip (light↔dark) must re-derive every
translucent-ink alpha numerically, not carry the old percentages forward** — this is the
same class of mistake as the particle blend-mode bug above (values that are individually
plausible but were calibrated for the opposite ground), and like that bug it doesn't
fail a build or a test — it has to be measured or seen.

**A second, wider bug class found in the same audit: hardcoded saturated "status" colors
designed for a dark ground, sprinkled across every app as plain text with no
accompanying background.** Distinct from the spectrum/danger tokens (which *were*
recalculated), these were ad hoc per-file hex values — e.g. `#34d399` (green,
"success"/"positive"/"income", 8+ call sites across Finance/Decisions/IDEF0),
`#ffd479`/`#fbbf24` (amber, "loading"/"due"), `#4a9eff` (blue, Piano status notes),
`#ff7744` (orange, Piano scale hint), `#4caf50`/`#ff9800`/`#f44336` (Piano MIDI status) —
all light/saturated colors that read fine as text on the old dark void but measured
1.4–3.7:1 against white (found by grepping every hardcoded `color: #hex` across
`.vitepress/theme/components/` and batch-checking contrast, then confirming by
screenshot which ones were **plain text on a light surface** — genuinely broken — versus
which were **paired with their own hardcoded dark background** in the same rule or an
adjacent one, e.g. Piano's `.key-badge`/`.mod-badge`, Journal's `.cal-chip.cal-partial`/
`.cal-goal`, IDEF0's `.tb-btn-doc` — those are self-contained dark chips, correct
regardless of page theme, and were deliberately left untouched). Fixed by deepening each
distinct hue via the same HSL-lightness-search method used for the spectrum (target
~4.8:1 against white), consolidating near-duplicate hues into one shared value per
semantic meaning rather than one-off per file: success-green `#1c805c`, warning-amber
`#936a03`, info-blue `#006ce8`, hint-orange `#d33900` (plus reusing `var(--ds-danger)`
where the semantic was really "error", e.g. Piano's `.unsupported` state). **This
project has no `--ds-success`/`--ds-warning`/`--ds-info` tokens** — these four are
consolidated but still hardcoded per file, not tokenized; worth promoting to real `--ds-*`
tokens in vars.css if a future pass touches this again, so this class of drift can't
recur silently. One inverted-pair bug was also found in this sweep: IDEF0's
`.drag-hint` had an explicitly dark chip background (`rgba(36,31,27,0.87)`) but used
`var(--ds-text-strong)` for its text — correct in the dark era (text-strong was light),
broken after the flip (text-strong is now dark ink, invisible on a dark chip) — fixed to
a hardcoded light `#f7f6f3`, since this chip is deliberately dark regardless of page
theme and must not follow the text-strong token.

**Each app's accent is unified with its sphere color** (previously each app had its own
unrelated brand hue — journal indigo `#5555dd`, planner blue `#2563eb`, decisions teal
`#0d9488`, piano indigo `#4040aa`, idef0 blue `#3b82f6`, openpose cyan `#4fc3f7` — all
retired in favor of `PROJECT_COLORS[sphere]`). Each app's root class (`.journal-root`,
`.planner-root`, `.dj-root`, `.piano-app`, `.idef0-root`, `.op-root`, `.cg-root`) declares its own
scoped `--ds-accent` / `--ds-accent-light` / `--ds-accent-hover` / `--ds-accent-bg`
(tints computed from the sphere hex — see the comment above each declaration) — these
are per-app, NOT global tokens; each app's CSS file owns its own values.

**These 8 hardcoded per-app accent blocks are an unofficial fourth palette mirror** (in
addition to vars.css / spectrum.js / WebGPUParticles.js COLORS below) — they don't
read from `PROJECT_COLORS` at runtime, they duplicate its values by hand. Found and
fixed during the 2026-09-24 light-theme flip: all 8 files (Journal.css, Piano.css,
PlannerEditor.css, OpenPoseEditor.vue, CasualGames.css, DecisionJournal.css,
FinanceApp.css, IDEF0Editor.css) had `--ds-accent`/`-hover`/`-light`/`-bg` still set to
the old dark-ground hexes — update these by hand alongside vars.css/spectrum.js
whenever the spectrum changes, same discipline as the other mirrors. A few other
sphere-hex duplicates were also found hardcoded outside the token system entirely
(FinanceApp.vue chart gradient stops, CasualGames board SVG fills, an inline IDEF0
focus-ring `box-shadow`) — grep for the old hex values across `.vitepress/theme/` if a
future palette change seems incomplete after updating the four official mirrors.

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

`--ds-font-display: 'Alegreya', Georgia, …` (headings **≥18px only**) and
`--ds-font-body: 'Manrope', -apple-system, …` (`vars.css`) — Alegreya chosen 2026-09-25,
replacing Playfair Display (itself only hours old — the first «Paper & Ink» pick,
2026-09-24) after user feedback that it read as "safe editorial elegance" with no
connection to the site's actual subject: music + code. Replacing Cormorant/Source Sans 3
before that (the dark «Spiral» era pair, chosen 2026-07-12 — see the design-system
section above for the three generic-site tells that pairing fixed). The role split and
the ≥18px display-serif legibility cutoff carry over unchanged across all three
generations — what changes each time is the specific typeface:
- **Alegreya** — a calligraphic serif with dynamic, rhythmic stroke contrast. Picked
  specifically to fit "music + code": its flowing calligraphic character reads as
  musical/expressive in a way Playfair's safer high-contrast elegance didn't, while
  "code" identity is carried by the existing `--ds-font-mono` accents (the `// ` prefixes,
  footer wordmark) rather than the display face itself — a deliberate choice not to make
  one font do both jobs (see the font-pairing options considered below). Same fragility
  tradeoff as Cormorant/Playfair before it — too delicate under ~18px, so anything smaller
  (`AppHeader.vue` `.app-title` 14px, `DecisionJournal.css` `.dj-review-q` 15px,
  `BlogList.vue` `.year-header` 12px, `CountDown.vue` `.cd-caption`) uses
  `var(--ds-font-body)` at a heavier weight instead — **don't add a new heading under
  18px to `--ds-font-display` without checking it renders legibly first.**
- **Manrope** — geometric-humanist body sans, unchanged since the Playfair-era swap.
  **Every app root must set `font-family: var(--ds-font-body)`** (and anything teleported
  to `<body>` — `HelpModal.vue`, `Journal.css` `.cp-modal` — needs its own explicit
  declaration; it won't inherit from the app root) — this rule from the 2026-07-12 pass
  still applies.

**Other candidates considered and rejected for the music+code brief** (all Cyrillic-
verified before rejection, per the process below — rejected on character fit, not
technical grounds): **Unbounded** (bold geometric sans, confident/engineered but reads
more "code" than "music"; still a good candidate if the balance should shift technical)
and **Martian Mono** (literal monospace with a retro-glitch character, closer to synth/
electronic album art than a terminal — the most literal "code" reading of the three, most
divergent from "elite/editorial"). Both remain viable if a future request wants the
display face itself to lean harder into "code" rather than splitting the roles the way
Alegreya + the mono accents currently do. Instrument Serif, Bricolage Grotesque, Syne,
and Space Grotesk were also considered — **all rejected outright: no Cyrillic support**
(confirmed via the same verification method below), despite being strong candidates on
character alone. This is now three-for-three font swaps where a Latin-only or Cyrillic-
partial font was the actual bottleneck — **always verify Cyrillic before presenting a
font as a candidate**, not just before adopting the final pick.

All display-face candidates verified for Cyrillic support **before** being presented as
options, per the reusable rule in `~/.claude/design/typography.md` ("verify Cyrillic
subset before falling in love with it") — checked via
`curl -A "<chrome-UA>" "https://fonts.googleapis.com/css2?family=…"` and confirming a
`/* cyrillic */` block with a real `unicode-range` is present (the legacy
`family=…&subset=cyrillic` API silently ignores the subset param now and always returns
the default block — don't trust it for verification, use the css2 multi-block response
instead). Alegreya and Manrope both have Cyrillic and both ship as **variable fonts**
(single file covers the whole weight axis).

Self-hosted per `[[no-cdn-rule]]` — no Google Fonts `<link>` at runtime:
- `public/fonts/*.woff2` — Alegreya: `latin` + `cyrillic` only (2 files, ~67 KB —
  display-only usage doesn't need `latin-ext`/`cyrillic-ext`, same precedent as
  Cormorant/Playfair). Manrope: all 4 subsets (`latin`, `latin-ext`, `cyrillic`,
  `cyrillic-ext`, ~57 KB — it's the body font, needs full coverage). One file per subset,
  not per weight. The retired Cormorant/Source Sans 3 AND Playfair Display files are all
  still sitting in `public/fonts/` unused (deleting tracked files was held back for
  explicit user sign-off, twice now) — safe to remove in a follow-up once confirmed
  nothing else references them.
- `theme/styles/fonts.css` (imported by `styles/index.css`) — the `@font-face` rules,
  `font-weight` range per family (declares the variable range) + `unicode-range` per
  subset so the browser only fetches the file(s) actually needed for the text on the page.
- Regenerate/add a weight, subset, or swap the display font again: fetch
  `https://fonts.googleapis.com/css2?family=…` with a modern Chrome UA (needed for woff2;
  a plain UA returns ttf), parse out the `latin`/`latin-ext`/`cyrillic`/`cyrillic-ext`
  blocks, download each unique URL into `public/fonts/`, update `fonts.css`. **Check
  Cyrillic subset support first** (see above) — this has bitten the choice repeatedly.
- `.exp-icon` in `Portfolio.vue` (the 𝄞 treble-clef glyph, U+1D11E) deliberately stays on
  the system serif fallback — that Unicode block isn't in Alegreya's coverage either
  (same gap Cormorant/Playfair had).

### Palette mirrors — change a color in BOTH

CSS can't be imported as JS values:
- `theme/styles/vars.css` — `--ds-*` CSS custom properties (10 spectrum colors incl. `--ds-teal: #2b5855` 7th/decisions, `--ds-yellow: #616b7f` 8th/music, `--ds-indigo: #4a366a` 9th/finance, `--ds-turquoise: #34737e` 10th/games)
- `theme/components/spectrum.js` — JS mirror: `SPECTRUM` (10 hex), `CANVAS_PALETTE` (10 rgba prefixes), `PROJECT_COLORS` (project → hex)

Unit-tested in `spectrum.test.mjs`. `WebGPUParticles.js`'s `COLORS` array is an
**independent** normalized-RGB mirror of the same 10 jewel-tone hues — not test-guarded,
edit by hand if the spectrum changes (its `clearValue` for the canvas clear color must
also match `--ds-void`, same as the 2D `bg` option below). **A fourth, unofficial
mirror** also exists — see "these 8 hardcoded per-app accent blocks" above.

### Spectrum semantics (10 spheres = 10 particle colors, jewel/gallery tones)

Deepened 2026-09-24 for AA contrast (≥4.5:1) against the new `#f6f2ea` paper ground —
same 10 hues/roles as the dark «Spiral» spectrum, values regenerated via HSL-lightness
search in Python (not eyeballed), verified with the real WCAG relative-luminance formula:
`--ds-violet` `#7d3047` бордо/wine (AR), `--ds-cyan` `#806634` бронза/bronze
(blog/openpose), `--ds-green` `#3e5a46` хвоя/pine (idef0), `--ds-pink` `#8c5367`
мальва/mauve (journal), `--ds-amber` `#48617a` сталь/steel-blue (piano), `--ds-orange`
`#6c5a47` каштан/chestnut (github/planner), `--ds-teal` `#2b5855` антрацит-тил/deep-teal
(decisions), `--ds-yellow` `#616b7f` графит/graphite (music), `--ds-indigo` `#4a366a`
индиго/indigo (finance), `--ds-turquoise` `#34737e` бирюза/turquoise (games).

### LifeCircle «колесо жизни»

`theme/components/LifeCircle.vue` — donut wheel of 10 spheres, outer radius encodes readiness. `buildSegments` is generalized to `n = defs.length`: `span = 360/n`, 4° gap between spheres. Spheres/readiness: Дневник 9, IDEF0 8, AR 5, Piano 4, OpenPose 4, Планировщик 4, Решения 4, Музыка 3, Финансы 2, Пазлы 2.

Pure helpers in `lifecircle.js` (`deg2rad`, `arcPath`, `labelXY`, `fillRadius`, `buildSegments`, `centerMark`) — all unit-tested in `lifecircle.test.mjs`.

**Center mark**: the donut hole holds an `<a class="center-mark" href="/vacuum-rogues/" target="_self">` with an inline «ship-ranger» vector (no raster) — the entry point to the game. Geometry comes from `centerMark(GEOM)` (inscribed in `innerR:55`, centered on cx/cy); light monochrome so it reads on the dark hole without competing with the colored spheres. The `target="_self"` is mandatory or the SPA router 404s the directory route (same rule as `/ar/`). **Conditional on availability**: `onMounted` does a `HEAD /vacuum-rogues/` probe and only shows the mark when it returns 200 (`gameAvailable`) — until the game is actually deployed there, the hole stays empty instead of pointing at a 404. It auto-appears when the game ships (no rebuild). `VITE_GAME_LOGO=1` forces it on for local visual testing. Out of scope by decision: `HomeMark.vue` / `public/home-wheel.svg` do NOT mirror this mark (logo only on the big home wheel).

### HomeMark.vue

Mini replica of the LifeCircle wheel (10 sphere arcs). Used as home link in every app top bar. `active` prop highlights the current app's sphere. `360/n` rotate on hover set via `--home-rot`. Registered globally in `index.mts`. Must stay in sync with: `LifeCircle.vue` SEGMENTS, `public/home-wheel.svg`, and the static SVG in `ar-engine/web/index.html`.

**Regression guard**: `lifecircle-mirrors.test.mjs` parses all four sources (`LifeCircle.vue` SEGMENTS is the source of truth, the other three are compared against it) and asserts the 10 spheres agree on id/color/order. Run it after touching any one mirror.

### Connecting particles

**Hand-written by the user — the signature animation of this site. Only improve, never simplify away or mute into invisibility without asking first.** (2026-07-12: got this wrong repeatedly in one session — muted the connection alpha, then removed the line pass entirely reasoning it read as a generic tech-startup network-mesh backdrop; user reverted both and was explicit the connections are the whole point. Then tried adding a "glowing trail" (canvas-pixel persistence via translucent `fade` repaint, then a history-based bounded-trail redesign, then a connection-trail on top of that, then a longer 4s trail duration) — none of it stuck. User's final call after seeing the fully-tuned trail version: «фигня получилась, убери трейлы» (turned out crap, remove the trails). Back to the pre-trail design below: hard clear + instant per-frame draw, no persistence of any kind. See `[[feedback-dont-touch-handwritten-code-without-asking]]` and `[[feedback-verify-visual-impact-not-just-correctness]]` memories — do not re-propose a trail effect here without the user asking again first.)

`ConnectingParticles.js` — single source for the 2D particle background. Pure helpers `stepParticle`, `gravityAccel`, `applyGravity`, `connectionAlpha`, `createParticles`, `prefersReducedMotion(mql)` + browser factory `createField(canvas, opts)`. Used by Portfolio.vue and the 2D fallback in Layout.vue. Unit-tested in `ConnectingParticles.test.mjs`.

**Motion is gravitational, not linear drift.** `applyGravity(particles)` runs once per frame, before `stepParticle`, on a single position snapshot: every particle pulls every OTHER particle within `GRAVITY_RANGE` (130px) toward it, force ∝ `puller.r / distance²` (true inverse-square — bigger dot = more mass = harder pull; motion visibly accelerates the closer two particles get), softened (`distance² + softening²` in the denominator) so the force stays finite instead of spiking to infinity as distance → 0. `stepParticle` still does the actual position update + torus-wrap using the velocity `applyGravity` just modified. Two failure modes were found and fixed while building this (2026-07-12):
- **Global collapse:** a first version let every particle pull on every other regardless of distance — with ~100 particles the net pull always drifts everyone toward the crowd's overall center of mass, and by t≈20-40s (verified via CDP time-lapse) the whole field visibly collapsed into one dense clump. Fixed by capping the interaction range (`GRAVITY_RANGE`) so particles only feel nearby neighbors — interactions stay local swirls/close passes instead of summing into one global attractor.
- **Reads as magnets, not gravity:** a short-range repel-below-threshold branch was added to stop particles literally coinciding — but the discontinuous flip from strong attraction to strong repulsion at a fixed radius reads as magnets snapping/bouncing off each other, not orbital motion. User: «они сейчас отталкиваются как магниты, а должны вести себя как планеты в космосе». Removed the repel branch entirely — attraction-only, relying purely on softening to keep force finite and `GRAVITY_MAX_SPEED` to cap resulting velocity. A close pair now curves and slingshots past on its own momentum (the real gravitational look) instead of bouncing off an invisible wall.

Don't reintroduce a repulsion force here without the user asking — it was tried and explicitly rejected as reading wrong. If tuning the gravity constants (`GRAVITY_STRENGTH`/`GRAVITY_SOFTENING`/`GRAVITY_RANGE`/`GRAVITY_MAX_SPEED`), verify with a CDP time-lapse running well past 30s, not just the first few seconds — the global-collapse failure mode only shows up after the field has had time to drift.

**No persistence — hard clear + instant redraw every frame.** Every frame does a full opaque repaint to `bg` (`ctx.fillStyle = bg; ctx.fillRect(...)`, normal blend), then dots and connection lines are drawn fresh from the particles' current positions with `globalCompositeOperation = 'multiply'` on top — overlapping deposits darken/richen each other *within that one frame*, but nothing carries over into the next frame. Connection lines use a true two-color gradient (`ctx.createLinearGradient` between the two particles' own colors), not one particle's flat color for the whole line.

**Blend mode is ground-dependent — `'lighter'` (additive) only works on a dark ground.** Was `'lighter'` throughout the dark «Spiral» era: additive blending pushes colors toward white, which reads as *glow* on a dark background. When the site flipped to the light «Paper & Ink» ground (2026-09-24), the particle field was re-colored (new deep spectrum, new `bg`) but the blend mode was left untouched — the result was correct colors that were *functionally invisible*, because additive blending on an already-bright paper background pushes every dot and line straight toward white. Reported by the user as "почти не видно" (barely visible) and fixed the same day by switching to `'multiply'`, the light-ground analog: strokes darken the paper instead of brightening it, so overlaps still read as deliberate ink build-up rather than a wash-out. **When flipping ground brightness (dark↔light) on anything using additive/`'lighter'` blending, the blend mode itself needs re-deriving, not just the color values** — this is easy to miss because the bug doesn't throw, doesn't fail a test, and doesn't look "wrong" in isolation (each color is individually correct) — it only shows up as an overall loss of visual presence, which a code review of the diff won't catch; it has to be seen. The WebGPU header path (`WebGPUParticles.js`, used when `gpuAvailable()`) had the equivalent bug in its GPU blend state (`dstFactor:'one', operation:'add'` — additive) and got the equivalent fix, but to **alpha-over compositing** (`srcFactor:'src-alpha', dstFactor:'one-minus-src-alpha'`) rather than a literal multiply: the line shader's alpha channel carries a real per-line distance fade (`vsLine`'s `distAlpha² * 0.8`), and a source-factor-only multiply blend (`srcFactor:'dst', dstFactor:'zero'`) would silently discard that alpha, making far/faint lines render as strong as near ones. Canvas 2D's `'multiply'` doesn't have this problem — the 2D compositing model always factors in source alpha as part of every blend mode, unlike a raw GPU blend-factor pair — so the two fixes had to diverge for a real technical reason, not just a preference. **The WebGPU fix could not be visually verified in this environment** (this repo's headless Chrome has no reliable WebGPU support, a known limitation noted elsewhere in this file) — the logic was verified by hand and against the shader source, not by screenshot; treat it as unverified until checked in a real WebGPU-capable browser.

**Do not reintroduce a trail/glow-persistence effect (translucent fade OR bounded position-history array) without the user asking first** — both were tried at length in the 2026-07-12 session (see project-warm-ink-redesign memory rounds 7–9) and ultimately rejected outright, not just re-tuned. If a change here needs verifying, the Chrome extension's `computer` screenshot tool waits for `document_idle`, which never fires on this page because of the continuous rAF loop — use headless Chrome via raw CDP (`Page.captureScreenshot` over the DevTools WebSocket) instead, per the CDP debugging note above.

`createField(canvas, opts)` option set (see JSDoc above the function for the authoritative list): `density`, `count` (number or `() => number`, overrides `density`), `connectDistance`, `bg` (solid clear color, hard-repainted every frame — NOT a translucent fade), `palette`, `lineWidth`, `autoStart` (default `true`), `getSize` (default reads `canvas.offsetWidth/Height`), `reducedMotion` (default reads the live `prefers-reduced-motion` media query via `osReducedMotion()`; when true, `start()` is a no-op and a single static frame is drawn instead of starting the rAF loop). The two call sites use different dialects of this same option set — both valid, not drift:
- `Portfolio.vue`: `{ density: 12, connectDistance: 100 }` — fixed CSS-sized canvas, default `autoStart`/`getSize`/`bg`.
- `Layout.vue`: `{ count: () => Math.floor(height / 2.5), connectDistance: 120, bg: 'rgb(20,22,26)', autoStart: false, getSize: () => ({ w: width, h: height }) }` — header canvas is resized/animation-toggled externally, so it drives `start()`/`stop()` itself and supplies its own tracked `width`/`height` instead of reading `offsetWidth/Height`.

Both call sites get the reduced-motion gate for free (no call-site changes needed) since `reducedMotion` defaults to the live media query inside `createField` itself. `bg`'s RGB must match `--ds-void` (currently `rgb(246,242,234)`) — update it alongside the void token if that ever changes again; both the `ConnectingParticles.js` default and `Layout.vue`'s explicit override need the edit.

**The WebGPU path (`WebGPUParticles.js` + `public/particles/render.wgsl`+`point.wgsl`, used for the header when `gpuAvailable()`) does NOT have the history-based trail** — it kept `loadOp: 'clear'` (hard clear every frame, zero persistence, matching its original pre-2026-07-12 behavior), deliberately, rather than porting the trail design to WebGPU. Building an equivalent required a per-particle position history in a GPU storage buffer (a compute-shader ring-buffer update + a new draw call reading it) — meaningfully more involved than the 2D canvas version and not verifiable in this environment's headless-Chrome WebGPU support, so it was left as a possible follow-up rather than risking an unverified change to the header canvas. It does share the other 2026-07-12 fixes: true particle color (no `1.5x+0.2` brightness boost, which washed dots toward white), a true per-vertex gradient on connection lines (interpolated by WGSL between the two line vertices, not a single blended-average color), and the current cool-graphite `COLORS` palette (was still on the old warm-ink normalized values until this pass — check this file specifically whenever the palette changes again, it's easy to miss since it's a hand-maintained mirror, not test-guarded).

`WebGPUParticles.js` has no reduced-motion awareness of its own — its `start()` always runs the rAF loop. So on a WebGPU-capable browser, the gate has to happen one level up: `Layout.vue`'s `reducedMotionPreferred()` (reuses the exported `prefersReducedMotion` pure helper) feeds into `headerAction()` in `headerLifecycle.js`, which routes reduced-motion sessions to `'field-2d'` instead of `'init'` so the WebGPU branch is never taken at all.

### Countdown «1000 дней роста»

`CountDown.vue` — 4 progress rings. Mounted in Portfolio hero (`<CountDown :countdownDays="1000" />`). **Do not pass `startDate`** (epoch hardcoded at 23/03/2025). Pure math in `countdown.js`, tested in `countdown.test.mjs`.

### Light theme only

No dark theme planned. `appearance: false` in `config.mts` disables VitePress's whole
dark-mode feature (no toggle button, no `dark` class, no localStorage check) — this is
the correct way to permanently pin one theme. **`'force-light'` is NOT a valid VitePress
`appearance` value** (the type is `boolean | 'dark' | 'force-dark' | 'force-auto' |
object` — no light equivalent to `'force-dark'` exists because light is already the
unconditional default). Using the string `'force-light'` doesn't error — it silently
degrades to VitePress's `'auto'` behavior (reads `prefers-color-scheme`, writes
`'auto'` to `localStorage`), so on a system/browser that reports a dark preference the
site would randomly render its VitePress-default-themed pages (blog, posts — anything
using `--vp-c-*` rather than this site's own `--ds-*` tokens) in VitePress's own dark
mode while the custom `--ds-*` components stayed light. Caught during the 2026-09-24
redesign by diffing `document.documentElement.className` before/after in headless
Chrome (which itself defaults to reporting a dark OS preference) — if a future
appearance-related change to `config.mts` needs verifying, check the live `<html>`
class and `localStorage.getItem('vitepress-theme-appearance')` after JS runs, not just
the static built HTML (the inline check-dark-mode script is only half the story; the
`useDark()` runtime composable is the other half and validates the enum more strictly).

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
- **Favicon family / theme-color**: `SITE_HEAD` + `THEME_COLOR` in `seo.js`, wired into `config.mts`'s top-level `head` (static across all pages, unlike the per-page `transformPageData` entries above). Sourced from `public/home-wheel.svg` (the square «колесо жизни» mark, not `og-source.svg` which is the 1200×630 OG card — wrong shape for an icon): SVG favicon served directly, plus `apple-touch-icon.png` (180×180) and `favicon.png` (48×48) rasterized locally via headless Chrome over `--ds-void` (currently `#f6f2ea`, updated 2026-09-24 for the light redesign — was `#14161a`). `seo.test.mjs` asserts the icon/apple-touch-icon/theme-color entries exist and that every linked `href` resolves under `public/`. `public/og.png` is likewise a rasterized `public/og-source.svg` — that SVG hand-mirrors the Portfolio hero (name/roles font, spectrum dot colors, void gradient) so it needs its own manual edit (not test-guarded) whenever the palette/void changes; regenerate both via `chrome --headless=new --window-size=<w>,<h> --screenshot=out.png file://…/wrapper.html` (wrap the raw SVG in a bare `<html><body>` with no margin so the screenshot crops exactly to size — see the CDP debugging note above for the headless-Chrome invocation pattern this reuses).

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
- **Lazy chunks still get a build-time preload *hint*, scoped per page** — Vite's default `modulePreload` walks every dynamic `import()` reachable from the shared SPA entry and would otherwise tag the eight app-root chunks + `WebGPUParticles.js` as eager `<link rel="modulepreload">` on **every** page (incl. the home page, which renders none of them) regardless of route or `gpuAvailable()`. `shouldPreloadLink` in `seo.js` (wired via `shouldPreload` in `config.mts`) demotes each lazy chunk to a low-priority `<link rel="prefetch">` everywhere except the one page that actually renders it; `WebGPUParticles` has no dedicated page so it is always prefetch-tier, never eager. This does not eliminate the fetch entirely (prefetch still runs on browser idle) — it removes the eager/critical-path cost, which is what the chunk split is for.
