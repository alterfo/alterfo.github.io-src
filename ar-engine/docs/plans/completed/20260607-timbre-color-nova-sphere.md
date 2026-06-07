# Timbre-Driven Color + Nova Volumetric Sphere Flow

## Overview

Two linked features for the WebGPU audio-reactive engine:

1. **Timbre → Color.** Make particle hue respond to the *timbral character* of the
   audio so the sound's "color" reads on screen: breathy-bright (female vocal) → pink,
   low-warm (male vocal) → blue/red, harmonic-bright (strings) → green, noisy
   (percussion/cymbal) → near-white. True instrument classification (source
   separation) is **not** feasible at 60 fps in C/WASM, so we use an **impressionistic
   2D timbre map**: extract spectral descriptors from the FFT magnitude spectrum
   (already computed every hop) and interpolate hue between "instrument anchor" points
   placed in a (brightness × tonalness) plane. It *correlates* with timbre rather than
   classifying — the named cases land on the named colors.

2. **Nova volumetric sphere flow.** Replace the current Nova model (radial 2D fibers +
   a separate tangential "sclera orbit" particle set + a static shader limbal ring)
   with a single **orthographically-projected sphere meridian flow**. Particles flow
   *across the volume of a ball* from the front (toward the observer) outward over the
   surface to the rim and around to the back — "поперёк, от наблюдателя", not around the
   circumference. This produces the eyeball-volume look the user asked for, with the
   pupil as the dark front cap and a naturally bright limbus (foreshortening density).

Both features are GPU/DSP-performance-bounded; the design keeps per-particle cost at
~the current level (≈4 trig ops) and per-frame CPU cost negligible (a handful of
anchor blends).

## Context (from discovery)

- **Source of truth**: project has fully moved into the blog repo at
  `/Users/olegsidorkin/WebstormProjects/alterfo.github.io-src/ar-engine/`. The old
  standalone `/Users/olegsidorkin/AudioReactiveVideo/` git repo is obsolete (initial
  commit only, missing all recent work) and can be deleted by the user.
- **DSP layer** (`engine/engine.c`): radix-2 FFT → `g_magnitude[half]` (up to 1024
  bins @ fft_size=2048), 4-band RMS envelopes, spectral-flux beat detector, BPM.
  `AudioFrame` (`engine/engine.h`) = 11 floats:
  `energy, sub, bass, mid, high, beat_pulse, onset[4], tempo_bpm`.
- **JS↔WASM frame read** (`web/audio.js` `_raf()`): reads 11 floats from the WASM heap
  at fixed offsets; `FRAME_FLOATS = 11`. Appending fields at the END keeps all existing
  offsets valid.
- **Render/particle layer** (`web/`): `particles.js` (pipelines, UBOs, dispatch),
  `render.js` (palette/tonemap UBO + `setRenderParams`), shaders in `web/shaders/`:
  `particles_update.wgsl` (compute: vortex / chladni / nova branches),
  `particles_draw.wgsl` (point-list draw, additive, `DrawUniforms`),
  `render.wgsl` (tonemap + palette + nova limbal ring).
- **Nova current state** (this session): radial fiber bundles (N_ARMS=72 + jitter +
  curvature + wave), fountain teleport, two-zone amber/blue hue, `seed%8==7` sclera
  orbit particles, draw-shader `nova_fx` pupil fade, `render.wgsl` static limbal ring.
  The sclera-orbit + static ring are **superseded** by the sphere model.
- **Draw UBO** (`DrawUniforms`): `energy, beat_pulse, mid, high, kaleidoscope,
  nova_mode, _p2, _p3` (32 bytes / 8 floats). Two free slots (`_p2`, `_p3`).
- **Toolchain**: `emcc` (`/opt/homebrew/bin/emcc`) and `make` available;
  `make -C engine` rebuilds `web/engine.wasm` + `web/engine.js`. Existing C test
  harness: `engine/test_fft.c` (compiles natively, no Emscripten needed).

## Development Approach

- **Testing approach**: Regular (code first, then tests).
- New DSP descriptors are **pure functions of the magnitude spectrum** → unit-testable
  in C with synthetic signals (`engine/test_fft.c` pattern). This is the primary
  automated test surface.
- Shader (WGSL) and visual-color behavior have **no test harness** (vanilla JS + WASM,
  no npm). Verification for those is: (a) `make -C engine` builds clean, (b) page loads
  with no WGSL validation / console errors, (c) manual visual check. Manual visual
  scenarios live in Post-Completion (no checkboxes).
- Complete each task fully (build clean + tests pass) before the next.
- Keep per-particle GPU cost flat; keep per-frame CPU color cost O(anchors).
- Maintain backward compatibility of the `AudioFrame` ABI by appending fields only.

## Testing Strategy

- **Unit tests (C)**: `engine/test_fft.c` extended with cases for `spectral_centroid`
  and `spectral_tonalness` (harmonicity) using synthetic spectra:
  - pure sine (single bin) → centroid ≈ its frequency, tonalness ≈ 1 (very tonal)
  - white-noise-like flat spectrum → tonalness ≈ 0 (noisy), centroid ≈ mid-band
  - low sine vs high sine → centroid ordering (low < high)
  - silence / empty spectrum → safe defaults, no NaN/Inf
  Build & run: `cc -O2 -lm engine/engine.c engine/test_fft.c -o /tmp/test_fft && /tmp/test_fft`
  (test file may `#include` or extern-declare the descriptor functions).
- **No E2E**: project has no Playwright/Cypress; UI is a single static page.
- **Manual visual** (Post-Completion): described per feature, run by the user.

## Progress Tracking

- Mark completed items `[x]` immediately when done.
- Newly discovered tasks: `➕` prefix. Blockers: `⚠️` prefix.
- Keep this file in sync with actual work.

## What Goes Where

- **Implementation Steps** (`[ ]`): C/JS/WGSL changes + C unit tests + build checks.
- **Post-Completion** (no checkboxes): manual visual verification, deleting the obsolete
  `AudioReactiveVideo` folder, committing in the blog repo.

## Implementation Steps

### Task 1: Spectral descriptors in the C engine
- [x] Add `spectral_centroid_norm(void)` in `engine/engine.c`: single pass
      over `g_magnitude[1..half)`, compute `C = Σ(f_i·m_i)/Σ(m_i)` in Hz, then normalize
      logarithmically `c = clamp(log2(C/150)/log2(6000/150), 0, 1)`. Guard `Σm≈0` → 0.
      (Made non-static, not `static`, so the native test harness can extern-declare it;
      WASM surface is fixed by the Makefile EXPORTED_FUNCTIONS list, so this is safe.)
- [x] Add `spectral_tonalness(void)`: spectral flatness over the
      150–6000 Hz band = `geo_mean/arith_mean` (geo via `expf(mean(logf(m+eps)))`),
      return `tonalness = clamp(1 - flatness, 0, 1)`. Guard empty band. (Non-static, same
      reason as above.)
- [x] Used a dedicated pass per descriptor over ≤1024 bins per hop (~86/s) — acceptable
      per plan; kept them as clear standalone testable functions rather than folding into
      the band_rms/flux loops.
- [x] Apply light smoothing (simple EMA, τ≈0.15 s) to both descriptors so hue doesn't
      flicker; store smoothed values in `g_centroid` / `g_tonal` (computed in
      `engine_push_samples`, reset in `engine_init`).
- [x] write tests in `engine/test_fft.c` for `spectral_centroid_norm` (low<high sine,
      silence) — success + edge cases.
- [x] write tests for `spectral_tonalness` (pure sine ≈ tonal, flat noise ≈ noisy,
      empty ≈ safe default).
- [x] run C tests: `cc -O2 -lm engine/engine.c engine/test_fft.c -o /tmp/test_fft && /tmp/test_fft` — 17 passed, 0 failed.

### Task 2: Expose descriptors through AudioFrame ABI
- [x] Append to `AudioFrame` in `engine/engine.h` (AFTER `tempo_bpm`):
      `float centroid;` (norm 0..1) and `float tonal;` (0..1). Order matters — append only.
- [x] Populate `g_frame.centroid` / `g_frame.tonal` at the end of `engine_push_samples`
      (copied from smoothed `g_centroid`/`g_tonal`).
- [x] Update `web/audio.js`: `FRAME_FLOATS = 13`; read `centroid: F[fp+11]`,
      `tonal: F[fp+12]` into `_currentFrame` (+ `_emptyFrame()`); `_framePtr` malloc uses
      `FRAME_FLOATS * 4` so it scales to 13 floats automatically (no hardcoded 11).
- [x] Rebuild WASM: `make -C engine` → `web/engine.wasm` + `web/engine.js` regenerated
      (gitignored build artifacts), exit 0.
- [x] write/extend a C test asserting `engine_get_frame` returns finite `centroid`/`tonal`
      in [0,1] after pushing a synthetic tone (success + silence edge case) —
      `test_frame_descriptors_tone` + `test_frame_descriptors_silence`.
- [x] run C tests + confirm `make -C engine` exits 0 — 19 passed, 0 failed; make exit 0.

### Task 3: Timbre→hue color module (JS)
- [x] Create `web/timbre_color.js` exporting `timbreToColor(centroid, tonal)` →
      `{ hue, sat, weight }`. Implement inverse-distance (Shepard) interpolation over
      anchor points in (centroid, tonal) space with **circular** hue mean (sum unit
      vectors `(cos2πh, sin2πh)` weighted, `atan2` back). Anchors (tunable):
      - male voice    `(c0.20, t0.65)` → hue 0.60 (blue), sat 0.85
      - female voice  `(c0.55, t0.55)` → hue 0.92 (pink), sat 0.90
      - strings       `(c0.65, t0.90)` → hue 0.33 (green), sat 0.85
      - percussion    `(c0.85, t0.20)` → hue 0.10 (warm), sat 0.25 (near-white)
      - bass/low      `(c0.10, t0.45)` → hue 0.00 (red),  sat 0.80
      (Done: exports `timbreToColor`, `circularHueMean`, `ANCHORS`. `EPS=1e-4` softens
      the 1/d² singularity at an anchor.)
- [x] `weight` = confidence: higher when close to an anchor and when `tonal` is high
      (tonal content has a clearer "color"); low for ambiguous/noisy → lets base palette
      show through. EMA-smooth hue (circularly), sat, weight in the module (τ≈0.25 s).
      (Done: `weight = proximity·(0.3+0.7·tonal)`, proximity from nearest-anchor distance,
      `PROX_SCALE=0.35`. EMA via `createTimbreSmoother({tau})` — frame-rate-correct
      `alpha = 1−exp(−dt/τ)`, hue smoothed circularly as a unit vector, first call snaps.)
- [x] write tests `web/timbre_color.test.mjs` (plain `node --test` or assert script):
      female-ish input → hue near 0.92; strings-ish → near 0.33; verify circular mean
      wraps (blend of 0.95 and 0.05 → near 0.0, not 0.5); weight monotonic w/ tonal.
      (Done: 9 tests incl. anchor round-trip, out-of-range clamping, smoother snap+converge.
      Wrap assert is circular: 0.95&0.05 → ~1.0 ≡ 0.0.)
- [x] run: `node --test web/timbre_color.test.mjs` (or `node web/timbre_color.test.mjs`) — must pass before Task 4. — 9 passed, 0 failed (Node v22.15.0; .js loads as ESM via syntax detection).

### Task 4: Plumb timbre color into the draw pipeline
- [x] In `web/particles.js` `tick()`: smooth `frame.centroid`/`frame.tonal` via a
      per-pipeline `createTimbreSmoother({tau:0.25})` (frame-rate-correct dt, clamped to
      [1/240, 0.1] s so idle-throttle gaps don't snap colour), write `hue`/`sat`/`weight`
      into `DrawUniforms`. Widened `DrawUniforms` to 12 floats (48 bytes): `DRAW_UBO_BYTES`
      = 48, `_drawArr[6..8]` = timbre hue/sat/weight, struct in `particles_draw.wgsl`
      updated together. (Used the stateful smoother rather than raw `timbreToColor` so hue
      tracks smoothly and circularly.)
- [x] In `particles_draw.wgsl`: added `timbre_hue, timbre_sat, timbre_weight` fields;
      base hue/sat now blend toward timbre: `hue = mix(base_hue, timbre_hue, weight·0.7)`,
      `sat = mix(base_sat, timbre_sat, weight·0.7)` (`BLEND=0.7`). Applies to all modes.
- [x] Nova zone/per-fiber hue preserved: timbre shifts the whole iris hue via the same
      blend; zone contrast still carried by `zone_scale` (brightness) and per-fiber
      `nova_fx`, and `val` (lightness) is untouched by the timbre blend.
- [x] verify (manual): page loads, no WGSL/console errors — WebGPU not runnable in CI;
      verified by proxy (JS syntax OK, DrawUniforms 12-float/48-byte layout consistent
      between JS `_drawArr` and WGSL struct, existing JS+C tests still pass). Visual hue
      shift = manual (Post-Completion).
- [x] confirm clean load + no console errors — manual (not automatable here); deferred to
      Post-Completion visual check. Static validation (syntax + UBO byte consistency) clean.

### Task 5: Nova sphere meridian flow (compute shader)
- [x] Rewrote the `nova_mode` branch in `particles_update.wgsl` to the sphere model.
      No struct change: meridian azimuth `θ` derived from `seed` (`arm_id` over 72
      bundles + permanent jitter ±2.1° + per-fiber meridian wave); flow parameter
      `φ = age·π` (`age` repurposed as the normalized polar flow coordinate).
- [x] Geometry (orthographic, ASPECT-corrected):
      `R_sphere = 0.295`; `phi_pupil = asin(clamp(R_pupil/R_sphere,0,0.92))`;
      `r_screen = R_sphere·sin(φ)`; `pos = (cx + r_screen·cosθ/ASPECT, cy + r_screen·sinθ)`;
      depth `d = cos(φ)` (consumed by the draw shader in Task 6).
- [x] Flow dynamics: `dphi = 0.0060 + beat·0.030 + energy·0.010`; advance
      `age += (dphi/π)·speed`. Beat dilates `R_pupil` (`+beat·0.070 +bass·0.018`) →
      larger `phi_pupil` (mydriasis). Respawn when `age ≥ 1 − phi_pupil/π` (past back
      pole) → reset to `age = phi_pupil/π + uf01(hash)·0.05` at the front edge (per-seed
      random offset desyncs dashes). seed (θ bundle) kept stable across respawn.
- [x] Per-particle θ jitter (±2.1°, < half the 5° arm spacing → bundles stay separated)
      thickens meridians into wrapping fiber bands; two-zone hue kept (collarette amber
      → blue-grey by `r_screen`, ±18° per-fiber `seed` tint); `φ` clamped to `≥ phi_pupil`
      so the pupil interior stays empty.
- [x] Removed the obsolete `seed%8==7` sclera-orbit block (superseded by sphere volume).
- [x] Extracted the projection to a testable JS mirror `web/nova_project.js`
      (`novaProject(theta, phi)`, `phiPupil`, `R_SPHERE`, `ASPECT`) + tests
      `web/nova_project.test.mjs`: rim `φ=π/2`→`r_screen=R_SPHERE`; pupil edge
      `φ→phi_pupil`→`r_screen≈R_pupil`; depth sign front(+)/rim(0)/back(−); aspect
      mapping; `phiPupil` monotonic + asin-domain clamp; finiteness over the φ sweep.
      `node --test web/nova_project.test.mjs` — 8 passed, 0 failed.
- [x] verify clean load + no errors — WebGPU/WGSL not runnable in CI (naga not installed);
      verified by proxy: shader braces/parens balanced, no dangling removed vars
      (`R_iris`/`dxs`/sclera all gone), JS mirror tests pass, C suite 19/19, timbre 9/9.
      Visual "particles flow center→rim over a ball" = manual (Post-Completion).

### Task 6: Nova volumetric shading (draw + render)
- [x] In `particles_draw.wgsl` `nova_mode`: compute `depth = cos(clamp(p.age,0,1)·π)`;
      `front_shade = smoothstep(-0.25, 0.55, depth)`; `nova_fx = front_shade` (multiplies
      alpha) so the back hemisphere flows dimly "behind" the ball (occlusion illusion).
      Per-fiber brightness variation kept (`0.65 + uf01·0.70`). Dropped the old
      screen-radius pupil-edge fade — the sphere model leaves a clean pupil hole on its
      own (`φ` clamped `≥ φ_pupil` ⇒ `r_screen ≥ R_pupil`), so the removed `R_pu/dx_/dy_/sr_`
      vars are gone.
- [x] Tune limbus: rely on natural `sin(φ)` foreshortening density for the bright rim;
      reduced the **static** `render.wgsl` limbal ring to a faint dark border tint sitting
      just outside the sphere rim (`smoothstep(0.290,0.298)·(1−smoothstep(0.302,0.330))`,
      `mix(col, col·0.45, limbal·0.30)` — was a harder `col·0.22 · 0.50` ring).
- [x] Confirm `nova_mode` plumbing unchanged + consistent: `render.js` `_novaMode_r` →
      `_uf[7]` (render.wgsl `nova_mode` offset 7); `particles.js` `_drawArr[5]` = `_novaMode`
      (draw `nova_mode` index 5). Verified by grep, not touched by these edits.
- [x] Extracted the new shading math to the JS mirror `web/nova_project.js`
      (`frontShade(age)`) + 4 tests in `web/nova_project.test.mjs` (front pole lit, back
      pole occluded, monotonic decrease, rim partial, age clamp). `node --test
      web/nova_project.test.mjs` — 12 passed, 0 failed.
- [x] manual visual ("3D eyeball: bright domed front, dense limbus, dim back, dilating
      pupil") skipped — not automatable (WebGPU not runnable in CI; no naga/tint installed).
      Verified by proxy: WGSL braces/parens balanced in both shaders, removed vars gone,
      JS mirror tests pass, C suite 19/19, timbre 9/9. Visual = Post-Completion.
- [x] manual clean-load / no-console-errors check skipped (not automatable here); deferred
      to Post-Completion visual check. Static validation (syntax + UBO/plumbing consistency)
      clean.

### Task 7: Verify acceptance criteria
- [x] Timbre color: hue tracks vocal vs instrumental passages (manual A/B on a track).
      manual visual (skipped - not automatable; WebGPU/audio not runnable in CI). Deferred
      to Post-Completion. Static proxy: timbre_color tests 9/9 confirm anchor mapping.
- [x] Nova: particles flow across the ball volume front→rim→back (not around the rim);
      eyeball illusion holds; pupil dilates on beat.
      manual visual (skipped - not automatable; WebGPU not runnable in CI). Deferred to
      Post-Completion. Static proxy: nova_project tests confirm projection + shading math.
- [x] Performance: 60 fps maintained at the tier's particle count (no regression vs
      pre-change Nova; per-particle trig count unchanged).
      manual (skipped - requires GPU profiling on target machine, not automatable in CI).
      Design keeps per-particle trig count flat (≈4 trig) per the plan's cost analysis.
- [x] `make -C engine` builds clean; all C tests pass; JS color tests pass.
      verified: `make -C engine` exit 0; C tests 19 passed / 0 failed; JS tests 21 passed
      / 0 failed (9 timbre_color + 12 nova_project).
- [x] No WGSL validation or runtime console errors on load in Chrome 113+.
      manual (skipped - not automatable; no naga/tint in env, WebGPU not runnable in CI).
      Static proxy: WGSL braces/parens balanced, removed vars gone, UBO layouts consistent.

### Task 8: [Final] Update documentation
- [x] Update `ar-engine/CLAUDE.md` (or `web/` README) `AudioFrame` struct to include
      `centroid` / `tonal`; note the timbre-color module and Nova sphere model.
      (Created `ar-engine/CLAUDE.md`: AudioFrame 13-float ABI table incl. centroid/tonal,
      timbre→colour module section, Nova orthographic sphere meridian-flow section,
      DrawUniforms layout, build/test commands.)
- [x] Note the new `web/timbre_color.js` + tunable anchor table location for future tweaks.
      (Documented `ANCHORS` as the single retune point with the full anchor table + tuning
      knobs EPS/PROX_SCALE/BLEND/τ in `ar-engine/CLAUDE.md`.)

## Technical Details

### Model 1 — Timbre → Color

Magnitude spectrum `m_i`, frequency `f_i = i · (sample_rate/fft_size)`, bins `i∈[1,half)`.

- **Spectral centroid (brightness)**: `C = Σ(f_i·m_i) / Σ(m_i)`.
  Normalize log: `c = clamp( log2(C/150) / log2(6000/150), 0, 1 )`.
- **Spectral tonalness (harmonicity)**: flatness
  `F = exp( (1/N)·Σ ln(m_i+ε) ) / ( (1/N)·Σ m_i )`, band 150–6000 Hz.
  `tonal = clamp(1 − F, 0, 1)` (1 = pure/harmonic, 0 = noisy).
- **2D anchor interpolation** (CPU/JS): anchors `k` at `(c_k,t_k)` with
  `(hue_k,sat_k)`. Weight `w_k = 1/(‖(c,t)−(c_k,t_k)‖² + ε)`.
  Circular hue mean: `H = atan2(Σ w_k sin2πh_k, Σ w_k cos2πh_k)/2π (mod 1)`;
  `sat = Σ w_k sat_k / Σ w_k`. `weight` (confidence) rises with proximity to nearest
  anchor and with `tonal`. EMA-smooth (hue circularly) at τ≈0.25 s.
- Shader blend: `hue = mix(base_hue, H, weight·BLEND)`, same for sat, `BLEND≈0.7`.

Cost: one extra spectrum pass (or folded into existing loops) per hop in C; ~5-anchor
blend per frame in JS. Negligible.

### Model 2 — Nova orthographic sphere meridian flow

Sphere radius `R = 0.295` at screen center, view axis = z (toward observer).
Per particle: fixed meridian azimuth `θ(seed)`, flowing polar angle `φ = age·π`.

```
r_screen = R · sin(φ)
x = cx + r_screen · cos(θ) / ASPECT
y = cy + r_screen · sin(θ)
depth d = cos(φ)            // +1 front (toward viewer) … −1 back
```

- `φ` advances over time → particle streams front pole → rim (`φ=π/2`) → back pole.
- `dr_screen/dφ = R·cos(φ) → 0` at the rim ⇒ particles bunch at the limbus ⇒ natural
  bright eye edge (no special-case code).
- Pupil = front cap: valid `φ ∈ [φ_pupil, π−φ_pupil]`, `φ_pupil = asin(R_pupil/R)`.
  Beat raises `R_pupil` ⇒ `φ_pupil` grows ⇒ outward push = mydriasis.
- Shading: `front_shade = smoothstep(−0.25, 0.55, d)`; back hemisphere dim (occluded) ⇒
  3D ball illusion. `age` doubles as φ/π — no particle-struct change; respawn at front
  edge with random meridian phase to avoid synchronized waves.

Cost: per particle ≈ `sin/cos(φ)` + `cos/sin(θ)` (~4 trig) — same order as current Nova;
draw adds one `cos(age·π)`. No new buffers.

### ABI / struct changes

- `AudioFrame`: 11 → 13 floats (append `centroid`, `tonal`). `web/audio.js`
  `FRAME_FLOATS = 13`, read `fp+11`, `fp+12`; verify `_framePtr` allocation.
- `DrawUniforms`: 8 → up to 12 floats (add `timbre_hue/sat/weight`); update
  `DRAW_UBO_BYTES`, WGSL struct, and `_drawArr` writes together.

## Post-Completion

**Manual verification** (run by user in Chrome 113+):
- Play a track with clear female vocal → iris/particles trend pink; male vocal →
  blue/red; sustained strings → green; drum-heavy → near-white. Confirm smooth, not
  flickery, transitions.
- Nova: confirm particles flow across the ball volume (front→rim→back), dense bright
  limbus, dim back, dark dilating pupil — reads as a 3D eyeball, not a flat ring.
- Confirm 60 fps on the target machine.

**Cleanup / repo**:
- Delete obsolete `/Users/olegsidorkin/AudioReactiveVideo/` (user-confirmed obsolete).
- Commit changes in the blog repo (`alterfo.github.io-src`); `ar-engine/web/` is what
  deploys to `alterfo.github.io/ar/`.

**Tuning notes**:
- Anchor table in `web/timbre_color.js` is the single place to retune the
  timbre→color mapping; `BLEND` and EMA τ control how strongly/quickly color tracks.
