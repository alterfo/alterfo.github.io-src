# VitePress config & design system

## Design system «Spiral»

**Cool-graphite ground + jewel-tone accents**, dark-only, shared by the home page, the
blog, posts and all eight client-side apps — restored 2026-11-04 by owner request. The
short-lived «Paper & Ink» light system (2026-09-24 → 2026-11-02, with a home-page-only
dark scope bolted back on 2026-11-02) is retired; its typography (Alegreya + Manrope)
was kept, only the ground, palette and contrast values went back to «Spiral».
History: cosmic-violet-home / slate-apps split (generic "AI-generated site") → warm-ink
earth tones (2026-07-12, first pass) → cool graphite + jewel tones «Spiral» (2026-07-12,
second pass) → «Paper & Ink» light system (2026-09-24, third pass) → **«Spiral» dark
restored site-wide (2026-11-04)**:
- Void/page bg: `--ds-void` `#14161a`, panels/cards: `--ds-surface-solid` `#1e2126`, raised/hover: `--ds-raised` `#262a30`, section surface: `--ds-surface` `rgba(20,22,26,0.75)`.
- Text: `--ds-text` `#e6e4e0`, strong `--ds-text-strong` `#f7f6f3`, muted `rgba(230,228,224,0.65)` (6.15:1 on surface-solid), dim `rgba(230,228,224,0.55)` (4.80:1 — tertiary but still AA), borders `rgba(230,228,224,0.12)` / `rgba(230,228,224,0.28)`.
- Danger: `--ds-danger` `#f87171` (5.84:1 on surface-solid), `--ds-danger-strong` `#ef4444`, `--ds-danger-bg` `#3a1a1a`.
- `--ds-on-accent` `#f7f6f3` is the label color for solid accent fills; bronze (OpenPose) and graphite (music) override it to `#131210` because light ink on those fills is only 3.1:1 / 2.7:1 — see the accent section below.
- Radii: `--ds-radius-sm` 5px / `--ds-radius` 8px / `--ds-radius-lg` 14px. Shadows: `--ds-shadow-panel`/`--ds-shadow-card` use black, not ink. Pill buttons are still deliberately avoided.
- Two deliberate light surfaces survive inside the dark UI and are correct as-is: the IDEF0 SVG canvas (`#f8fafc` "paper") and the Journal lined-paper textarea (dark `#222` ink on a light paper texture). They are self-contained and must not follow the dark tokens.
- Every contrast number in this file is computed with the WCAG relative-luminance formula against `--ds-surface-solid`, not eyeballed. `theme/components/contrast.test.mjs` re-derives them from the real CSS/JS sources on every test run, so a future token or palette edit that drops a text pair below AA fails the suite instead of silently shipping.

**Translucent-ink alpha percentages do NOT transfer across a ground-color flip — this
was shipped broken twice and caught by the user, never by the redesign/build itself.**
The 2026-09-24 light pass kept the dark-era alphas (0.6 / 0.38 / 0.12 / 0.2) while
flipping the ink color, which dropped `--ds-text-muted` to 4.18–4.34:1, `--ds-text-dim`
to 2.24–2.32:1 and both border tokens to 1.26–1.51:1 on white. The 2026-11-04 return to
the dark ground re-derived them again against `--ds-surface-solid` `#1e2126` (worst case
of void/surface/raised): muted→0.65 (`6.15:1`), dim→0.55 (`4.80:1`, tertiary but still
AA), border→0.12 (quiet hairline), border-strong→0.28 (`2.32:1`, focus/hover). **Percent
opacity is not the right mental model for "equivalent subtlety" across a light/dark
flip — contrast ratio is.** Any future ground-brightness flip must re-derive every
translucent-ink alpha numerically; like the particle blend-mode bug it fails no build
and no test, it only shows up when measured or seen.

**Hardcoded saturated "status" colors were a second, wider bug class.** The 2026-11-04
dark restore reverted them to their dark-era values (success green `#34d399`/`#77cc77`/
`#6ee787`, warning amber `#fbbf24`/`#ffd479`/`#f59e0b`, info blue `#4a9eff`, hint orange
`#ff7744`), which all measure 5.4–12.9:1 on `#1e2126`. Two leftovers from the light pass
needed a nudge: Journal's `.cal-goal .cal-chip-w` (`#dd6666` → `#e88888`, 4.45→6.0:1 on
the chip's `#3a1e1e`) and Piano's MIDI `.unsupported` state (`#f44336` → `var(--ds-danger)`,
4.38→5.84:1). Many of these are deliberately **self-contained dark chips** —
Piano's `.key-badge`/`.mod-badge`, Journal's `.cal-chip.cal-partial`/`.cal-goal`, IDEF0's
`.tb-btn-doc`, Planner's `.planner-card-due.due-today` — and are correct regardless of
page theme; do not "fix" them to follow the ink tokens. IDEF0's `.drag-hint` is the same
shape: a hardcoded dark chip (`rgba(36,31,27,0.87)`) whose label is a hardcoded light
`#f7f6f3`, never `--ds-text-strong` (that would be invisible in a light theme and is the
wrong token for a chip that is dark by definition). **This project still has no
`--ds-success`/`--ds-warning`/`--ds-info` tokens** — worth promoting if a future pass
touches this again. The 2026-11-04 audit also caught three genuine dark-theme failures
that no test covered: the `.app-title` in `AppHeader.vue` was painting the raw sphere hex
(1.6–3.3:1 on the app bar — now `color-mix(… 45%, var(--ds-text))`, 5.7–9.0:1), IDEF0's
`.nav-id` was 4.0:1 on the raised nav (`--ds-accent-light` lifted to `#9caaa0`), and
tertiary hints using `--ds-text-dim` sat at 3.0:1 (the dim token itself was lifted to
0.55). All visible text on every page now passes the AA threshold in an automated CDP
audit; `contrast.test.mjs` keeps the token-level pairs honest.

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
read from `PROJECT_COLORS` at runtime, they duplicate its values by hand: journal
`#8a5568`/`#b3919d`, piano `#4a6178`/`#8998a7`, idef0 `#3f5946`/`#9caaa0`, planner
`#6b5a48`/`#9f9488`, decisions `#2d5654`/`#86a09f`, finance `#4a3868`/`#938aa8`, games
`#3b7a85`/`#8fb2b8`, openpose `#a8874a`/`#c6b189` (`accent`/`accent-light`). The
`accent-light` values are the dark-era ones lifted where the active-tab pair
(`accent-light` on `accent-bg` wash over `#1e2126`) fell under 4.5:1 — decisions,
finance and idef0 were the three that needed it; do not drop them back. Update these by
hand alongside vars.css/spectrum.js whenever the spectrum changes, same discipline as
the other mirrors. **Solid accent fills (`--ds-accent` backgrounds) label themselves with
`--ds-on-accent`, never `--ds-accent-light` and never a hover that swaps the background
to `accent-light`** (light ink on `#8998a7` is 2.4:1): hover states darken to
`--ds-accent-hover` instead. A few sphere-hex duplicates also live outside the token
system entirely (FinanceApp.vue chart gradient stops, CasualGames board SVG fills, an
inline IDEF0 focus-ring `box-shadow`) — grep for the old hex values across
`.vitepress/theme/` if a future palette change seems incomplete after updating the four
official mirrors.

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
options, per the reusable rule in `~/.agents/design/typography.md` ("verify Cyrillic
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
- `theme/styles/vars.css` — `--ds-*` CSS custom properties (10 spectrum colors incl. `--ds-teal: #2d5654` 7th/decisions, `--ds-yellow: #9098a8` 8th/music, `--ds-indigo: #4a3868` 9th/finance, `--ds-turquoise: #3b7a85` 10th/games)
- `theme/components/spectrum.js` — JS mirror: `SPECTRUM` (10 hex), `CANVAS_PALETTE` (10 rgba prefixes), `PROJECT_COLORS` (project → hex)

Unit-tested in `spectrum.test.mjs`. `WebGPUParticles.js`'s `COLORS` array is an
**independent** normalized-RGB mirror of the same 10 jewel-tone hues — it is now
**test-guarded by `contrast.test.mjs`** (as is its `clearValue`, which must match
`--ds-void`, same as the 2D `bg` default). **A fourth, unofficial mirror** also exists —
see "these 8 hardcoded per-app accent blocks" above. There is no scoped override file
any more: the dark values live directly in `vars.css` and apply site-wide.

### Spectrum semantics (10 spheres = 10 particle colors, jewel/gallery tones)

The dark «Spiral» values, restored 2026-11-04 (the 2026-09-24 light pass had deepened all
ten for paper; those values are retired), same 10 hues/roles throughout:
`--ds-violet` `#7a3348` бордо/wine (AR), `--ds-cyan` `#a8874a` бронза/bronze
(blog/openpose), `--ds-green` `#3f5946` хвоя/pine (idef0), `--ds-pink` `#8a5568`
мальва/mauve (journal), `--ds-amber` `#4a6178` сталь/steel-blue (piano), `--ds-orange`
`#6b5a48` каштан/chestnut (github/planner), `--ds-teal` `#2d5654` антрацит-тил/deep-teal
(decisions), `--ds-yellow` `#9098a8` графит/graphite (music), `--ds-indigo` `#4a3868`
индиго/indigo (finance), `--ds-turquoise` `#3b7a85` бирюза/turquoise (games). On the
dark ground these are **fill** colors (wheel segments, board regions, chips) and only
1.6–5.6:1 as plain text — accent-colored text uses the lifted `accent-light`/`color-mix`
variants described above, never the raw spectrum hex.

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

**No persistence — hard clear + instant redraw every frame.** Every frame does a full opaque repaint to `bg` (`ctx.fillStyle = bg; ctx.fillRect(...)`, normal blend), then dots and connection lines are drawn fresh from the particles' current positions with `globalCompositeOperation = 'lighter'` on top — additive glow builds up *within that one frame*, but nothing carries over into the next frame. Connection lines use a true two-color gradient (`ctx.createLinearGradient` between the two particles' own colors), not one particle's flat color for the whole line.

**Blend mode is ground-dependent — `'lighter'` (additive) only works on a dark ground.** It was `'lighter'` in the dark «Spiral» era, switched to `'multiply'` for the 2026-09-24 light «Paper & Ink» ground (additive on bright paper washes every dot toward white — the field was re-colored but the blend mode was missed, so it was functionally invisible; user reported "почти не видно"), and switched back to `'lighter'` in the 2026-11-04 dark restore. The WebGPU header path had the same bug in reverse: its blend factors were alpha-over (`srcFactor:'src-alpha', dstFactor:'one-minus-src-alpha'`) for the light ground and are additive again (`srcFactor:'src-alpha', dstFactor:'one'`) on dark. **When flipping ground brightness, re-derive the blend mode itself, not just the palette** — the bug throws nothing, fails no test, and each color is individually correct; it only shows as an overall loss of glow, so it has to be seen. (Canvas 2D `'multiply'` and GPU blend factors are not interchangeable: the line shader's alpha carries a real distance fade, so the two paths need different factor pairs for the same visual intent.)

**Do not reintroduce a trail/glow-persistence effect (translucent fade OR bounded position-history array) without the user asking first** — both were tried at length in the 2026-07-12 session (see project-warm-ink-redesign memory rounds 7–9) and ultimately rejected outright, not just re-tuned. If a change here needs verifying, the Chrome extension's `computer` screenshot tool waits for `document_idle`, which never fires on this page because of the continuous rAF loop — use headless Chrome via raw CDP (`Page.captureScreenshot` over the DevTools WebSocket) instead, per the CDP debugging note above.

`createField(canvas, opts)` option set (see JSDoc above the function for the authoritative list): `density`, `count` (number or `() => number`, overrides `density`), `connectDistance`, `bg` (solid clear color, hard-repainted every frame — NOT a translucent fade; default `'rgb(20,22,26)'`), `palette`, `blend` (composite op for dots/lines; default `'lighter'` for this dark ground), `lineWidth`, `autoStart` (default `true`), `getSize` (default reads `canvas.offsetWidth/Height`), `reducedMotion` (default reads the live `prefers-reduced-motion` media query via `osReducedMotion()`; when true, `start()` is a no-op and a single static frame is drawn instead of starting the rAF loop). Both call sites rely on the dark defaults now, so neither passes `bg` or `blend`:
- `Portfolio.vue`: `{ density: 12, connectDistance: 100 }` — fixed CSS-sized canvas, default `autoStart`/`getSize`.
- `Layout.vue`: `{ count: () => Math.floor(height / 2.5), connectDistance: 120, autoStart: false, getSize: () => ({ w: width, h: height }) }` — header canvas is resized/animation-toggled externally, so it drives `start()`/`stop()` itself and supplies its own tracked `width`/`height` instead of reading `offsetWidth/Height`.

Both call sites get the reduced-motion gate for free (no call-site changes needed) since `reducedMotion` defaults to the live media query inside `createField` itself. `bg`'s RGB must match `--ds-void` (`rgb(20,22,26)` / `#14161a`) — there is exactly one ground now, so the default is the whole story; `contrast.test.mjs` asserts it against `vars.css` and against the WebGPU `clearValue`.

**The WebGPU path (`WebGPUParticles.js` + `public/particles/render.wgsl`+`point.wgsl`, used for the header when `gpuAvailable()`) does NOT have the history-based trail** — it kept `loadOp: 'clear'` (hard clear every frame, zero persistence, matching its original pre-2026-07-12 behavior), deliberately, rather than porting the trail design to WebGPU. Building an equivalent required a per-particle position history in a GPU storage buffer (a compute-shader ring-buffer update + a new draw call reading it) — meaningfully more involved than the 2D canvas version and not verifiable in this environment's headless-Chrome WebGPU support, so it was left as a possible follow-up rather than risking an unverified change to the header canvas. It does share the other 2026-07-12 fixes: true particle color (no `1.5x+0.2` brightness boost, which washed dots toward white), a true per-vertex gradient on connection lines (interpolated by WGSL between the two line vertices, not a single blended-average color), and the current cool-graphite `COLORS` palette (was still on the old warm-ink normalized values until this pass — check this file specifically whenever the palette changes again — `contrast.test.mjs` now guards its `COLORS` and `clearValue`, so drift fails the suite).

`WebGPUParticles.js` has no reduced-motion awareness of its own — its `start()` always runs the rAF loop. So on a WebGPU-capable browser, the gate has to happen one level up: `Layout.vue`'s `reducedMotionPreferred()` (reuses the exported `prefersReducedMotion` pure helper) feeds into `headerAction()` in `headerLifecycle.js`, which routes reduced-motion sessions to `'field-2d'` instead of `'init'` so the WebGPU branch is never taken at all.

### Countdown «1000 дней роста»

`CountDown.vue` — 4 progress rings. Mounted in Portfolio hero (`<CountDown :countdownDays="1000" />`). **Do not pass `startDate`** (epoch hardcoded at 23/03/2025). Pure math in `countdown.js`, tested in `countdown.test.mjs`.

### Dark theme, forced site-wide

No theme toggle, no `prefers-color-scheme` following: `appearance: 'force-dark'` in
`config.mts` pins VitePress's own dark theme (the `--vp-c-*` tokens used by the blog,
posts, sidebar and search) and removes the sun/moon toggle. **`'force-light'` is NOT a
valid VitePress `appearance` value** (the type is `boolean | 'dark' | 'force-dark' |
'force-auto' | object` — there is no light equivalent because light is the unconditional
default); the typo silently degrades to `'auto'`, which reads the OS preference and
writes `'auto'` to `localStorage`, producing a half-themed site. `appearance: false`
would also be wrong here: it disables VitePress dark mode entirely, leaving the blog and
docs pages on the default light `--vp-c-*` palette while the `--ds-*` components stay
dark. Verify any appearance change by checking the live `<html>` class after JS runs,
not just the static HTML (the inline check-dark-mode script is only half the story; the
`useDark()` composable is the other half).

The site's own ground is pinned in `theme/styles/index.css` (`html { color-scheme: dark;
background-color: var(--ds-void) }` and the same on `body`) so overscroll, scrollbars and
the pre-hydration paint match `#14161a` instead of VitePress's `--vp-c-bg`. The dark
values live directly in `vars.css`; there is no scoped override file any more
(`home-dark.css` and the `html.home-dark` class toggle in `Portfolio.vue` were removed
2026-11-04 — every page is dark, so a scope would only be dead weight).

- `Portfolio.vue` no longer touches `<html>`; it passes only `{ density: 12,
  connectDistance: 100 }` to `createField` and relies on the dark `bg`/`blend` defaults.
  Its text colors are `color-mix(in srgb, var(--ds-text) N%, transparent)`; accent text
  (`.case-study-links a`, `.title-mono`, `.exp-icon`) mixes the violet/cyan hues toward
  `--ds-text` (45–65% hue) because the raw spectrum hex is only 2.1:1 on near-black. The
  staff-divider lines use `currentColor` + `stroke-opacity`.
- `AppHeader.vue` renders `.app-title` as `color-mix(in srgb, <sphere hex> 45%,
  var(--ds-text))` for the same reason; the border tint stays the raw hex at ~30% alpha.
- **Deliberate light surfaces** (not bugs): the IDEF0 SVG canvas `#f8fafc` and the
  Journal lined-paper textarea (`#222` ink over `paper.png`/`lines.png`) are self-contained
  "paper" surfaces inside the dark chrome.
- `public/og-source.svg`/`og.png`, `public/home-wheel.svg`, `favicon.png` and
  `apple-touch-icon.png` are back on the dark ground (restored with the rest of the
  palette) — regenerate them together with `--ds-void` if it ever changes.

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
- **Favicon family / theme-color**: `SITE_HEAD` + `THEME_COLOR` in `seo.js`, wired into `config.mts`'s top-level `head` (static across all pages, unlike the per-page `transformPageData` entries above). Sourced from `public/home-wheel.svg` (the square «колесо жизни» mark, not `og-source.svg` which is the 1200×630 OG card — wrong shape for an icon): SVG favicon served directly, plus `apple-touch-icon.png` (180×180) and `favicon.png` (48×48) rasterized locally via headless Chrome over `--ds-void` (`#14161a`, restored 2026-11-04 with the dark ground). `seo.test.mjs` asserts the icon/apple-touch-icon/theme-color entries exist and that every linked `href` resolves under `public/`. `public/og.png` is likewise a rasterized `public/og-source.svg` — that SVG hand-mirrors the Portfolio hero (name/roles font, spectrum dot colors, void gradient) so it needs its own manual edit (not test-guarded) whenever the palette/void changes; regenerate both via `chrome --headless=new --window-size=<w>,<h> --screenshot=out.png file://…/wrapper.html` (wrap the raw SVG in a bare `<html><body>` with no margin so the screenshot crops exactly to size — see the CDP debugging note above for the headless-Chrome invocation pattern this reuses).

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
