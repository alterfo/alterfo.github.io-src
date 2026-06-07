# CLAUDE.md — ar-engine

## Project overview

WebGPU audio-reactive visual engine. A C/WASM DSP core analyses incoming PCM and
exposes a small per-frame feature vector; a WebGPU particle/render layer turns those
features into visuals. Deploys from `web/` to `alterfo.github.io/ar/`.

## Key paths

- `engine/engine.c` — DSP: radix-2 FFT → `g_magnitude[half]`, 4-band RMS envelopes,
  spectral-flux beat detector, BPM, spectral descriptors (centroid/tonalness).
- `engine/engine.h` — public C ABI: `AudioFrame` struct + lifecycle functions.
- `engine/test_fft.c` — native C unit tests (compile with `cc`, no Emscripten needed).
- `engine/Makefile` — `make -C engine` rebuilds `web/engine.wasm` + `web/engine.js`
  (gitignored build artifacts) via `emcc`; `EXPORTED_FUNCTIONS` fixes the WASM surface.
- `web/audio.js` — JS↔WASM bridge; reads the `AudioFrame` floats from the WASM heap.
- `web/timbre_color.js` — timbre→colour mapping module (see below).
- `web/nova_project.js` — pure-math mirror of the Nova sphere projection/shading.
- `web/particles.js` — compute/draw pipelines, UBOs, per-frame `tick()` dispatch.
- `web/render.js` — palette/tonemap UBO + `setRenderParams`.
- `web/shaders/` — WGSL: `particles_update.wgsl` (compute: vortex / chladni / nova),
  `particles_draw.wgsl` (point-list draw, additive, `DrawUniforms`),
  `render.wgsl` (tonemap + palette + nova limbal-ring tint).

## AudioFrame ABI

`AudioFrame` (`engine/engine.h`) is read out by `web/audio.js` as a flat float array.
**Append fields only** — appending at the END keeps all existing JS heap offsets valid.
Currently **13 floats** (`FRAME_FLOATS = 13` in `web/audio.js`):

| idx | field        | meaning |
|-----|--------------|---------|
| 0   | `energy`     | RMS 0..1 (all bands) |
| 1   | `sub`        | 20–80 Hz (envelope-followed) |
| 2   | `bass`       | 80–250 Hz |
| 3   | `mid`        | 250–4000 Hz |
| 4   | `high`       | 4000–16000 Hz |
| 5   | `beat_pulse` | 0..1, spike + exp decay ~0.1 s |
| 6–9 | `onset[4]`   | per-band onset flags (0/1, with cooldown) |
| 10  | `tempo_bpm`  | rolling average BPM |
| 11  | `centroid`   | spectral centroid, log-normalized 0..1 (timbre **brightness**) |
| 12  | `tonal`      | spectral tonalness/harmonicity 0..1 (1 = tonal, 0 = noisy) |

`centroid` / `tonal` are computed in `engine_push_samples` (light EMA smoothing,
τ≈0.15 s, stored in `g_centroid`/`g_tonal`) and feed the timbre→colour module.
The standalone descriptor functions `spectral_centroid_norm()` /
`spectral_tonalness()` are non-`static` so `engine/test_fft.c` can extern-declare them.

## Timbre → colour (`web/timbre_color.js`)

Impressionistic 2D timbre map — not true instrument classification (infeasible at
60 fps). Spectral descriptors `(centroid, tonal)` index into a plane of "instrument
anchor" points; hue/sat are interpolated between anchors with inverse-distance
(Shepard) weights. Hue is averaged **circularly** (unit vectors + `atan2`) so blends
wrap correctly across the 1.0/0.0 colour-wheel seam.

Exports:
- `timbreToColor(centroid, tonal)` → `{ hue, sat, weight }` (pure, stateless).
- `circularHueMean(hues, weights)` → wrap-safe mean hue in [0,1).
- `createTimbreSmoother({ tau })` → `step(centroid, tonal, dt)` stateful EMA
  (hue smoothed circularly; first call snaps; frame-rate-correct
  `alpha = 1 − exp(−dt/τ)`).
- `ANCHORS` — **the single place to retune the timbre→colour mapping.**

`weight` is a confidence (proximity to nearest anchor × tonalness); low for
ambiguous/noisy audio so the base palette shows through downstream.

**Tunable anchor table** (`ANCHORS` in `web/timbre_color.js`):

| anchor    | c (centroid) | t (tonal) | hue  | sat  | reads as |
|-----------|--------------|-----------|------|------|----------|
| `male`    | 0.20 | 0.65 | 0.60 | 0.85 | low-warm voice → blue |
| `female`  | 0.55 | 0.55 | 0.92 | 0.90 | breathy-bright → pink |
| `strings` | 0.65 | 0.90 | 0.33 | 0.85 | harmonic-bright → green |
| `perc`    | 0.85 | 0.20 | 0.10 | 0.25 | noisy/bright → near-white |
| `bass`    | 0.10 | 0.45 | 0.00 | 0.80 | low/warm → red |

Tuning knobs: edit `ANCHORS` to remap colours; `EPS` softens the 1/d² singularity at
an anchor; `PROX_SCALE` sets the distance at which proximity confidence ≈ 0.5; the
draw-shader `BLEND` (≈0.7) and EMA `τ` control how strongly/quickly colour tracks.

### Plumbing into the draw pipeline

`particles.js` `tick()` runs a per-pipeline `createTimbreSmoother({ tau: 0.25 })`
(dt clamped to [1/240, 0.1] s so idle-throttle gaps don't snap colour) and writes
`hue/sat/weight` into `DrawUniforms`. `DrawUniforms` is **12 floats / 48 bytes**
(`DRAW_UBO_BYTES = 48`); `_drawArr[6..8]` = timbre hue/sat/weight, matching the WGSL
struct fields `timbre_hue/timbre_sat/timbre_weight`. In `particles_draw.wgsl` the base
hue/sat blend toward timbre: `hue = mix(base_hue, timbre_hue, weight·BLEND)` (same for
sat), applied to all modes; lightness (`val`) is left untouched.

## Nova orthographic sphere meridian flow

Replaces the old Nova model (radial 2D fibers + separate tangential sclera-orbit set +
static shader limbal ring) with a single orthographically-projected sphere whose
particles flow *across the volume* of a ball: front (toward the observer) → over the
surface → rim/limbus → around to the back. Produces an eyeball-volume look: pupil =
dark front cap, naturally bright limbus from foreshortening density.

Geometry (mirrored in `web/nova_project.js`, tested by `web/nova_project.test.mjs` —
keep the two in sync with the WGSL):

```
R_SPHERE = 0.295,  ASPECT = 16/9
φ = age · π                       // polar flow angle: 0 front, π/2 rim, π back
r_screen = R_SPHERE · sin(φ)
x = cx + r_screen·cos(θ)/ASPECT
y = cy + r_screen·sin(θ)
depth d = cos(φ)                  // +1 front … −1 back
```

- `θ` = fixed meridian azimuth from `seed` (72 arm bundles + ≤±2.1° jitter + per-fiber
  wave). `age` is repurposed as the normalized polar flow coordinate (no particle-struct
  change).
- Pupil = front cap: valid `φ ∈ [φ_pupil, π−φ_pupil]`, `φ_pupil = asin(R_pupil/R_SPHERE)`
  (asin domain clamped). Beat dilates `R_pupil` → larger `φ_pupil` = mydriasis. Respawn
  past the back pole resets to the front edge with a per-seed random phase offset.
- Limbus brightness comes for free from `sin(φ)` foreshortening density (no special
  case). The `render.wgsl` ring is reduced to a faint dark border tint just outside the
  rim.
- Shading (`particles_draw.wgsl` + `frontShade` in `nova_project.js`):
  `front_shade = smoothstep(−0.25, 0.55, cos(age·π))` multiplies alpha so the back
  hemisphere flows dimly "behind" the ball (occlusion illusion).

`nova_mode` plumbing: `render.js` `_novaMode_r` → `render.wgsl` `nova_mode` (UBO offset
7); `particles.js` `_drawArr[5]` → draw shader `nova_mode` (index 5).

## DrawUniforms layout (`particles_draw.wgsl`)

12 floats / 48 bytes: `energy, beat_pulse, mid, high, kaleidoscope, nova_mode,
timbre_hue, timbre_sat, timbre_weight, _p3, _p4, _p5`. JS writer = `_drawArr` in
`particles.js`. Change the WGSL struct, `DRAW_UBO_BYTES`, and `_drawArr` writes together.

## Development & testing

- **Build WASM**: `make -C engine` (needs `emcc`); must exit 0.
- **C unit tests**: `cc -O2 -lm engine/engine.c engine/test_fft.c -o /tmp/test_fft &&
  /tmp/test_fft`. New DSP descriptors are pure functions of the magnitude spectrum →
  unit-testable with synthetic spectra (the primary automated test surface).
- **JS tests** (no npm; plain `node --test`):
  `node --test web/timbre_color.test.mjs` and `node --test web/nova_project.test.mjs`.
  `.js` modules load as ESM via Node syntax detection.
- **WGSL / visual**: no test harness (vanilla JS + WASM, no naga/tint in env, WebGPU
  not runnable in CI). Verified by proxy (build clean, syntax/UBO-layout consistency,
  JS mirror tests) + manual visual check in Chrome 113+.
- Maintain `AudioFrame` ABI back-compat by appending fields only. Keep per-particle GPU
  cost flat (~4 trig ops) and per-frame CPU colour cost O(anchors).
- Plan files live in `docs/plans/` (git-ignored, local only).
