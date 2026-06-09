# OpenPose Editor

## Overview

New client-side Vue app at `/openpose` — batch-upload images, auto-detect OpenPose skeletons
using MediaPipe Tasks Vision (BlazePose, up to 2 persons), manual drag-edit keypoints, export
black-background PNG skeleton overlay + OpenPose v1.3 JSON for use with ControlNet / Stable Diffusion.

Key requirements:
- Batch image upload (drag & drop / click)
- MediaPipe PoseLandmarker (full model, numPoses=2) runs in-browser via WASM — no server
- Keypoint mapping: BlazePose 33kp → OpenPose 18kp (Neck = midpoint of shoulders)
- Interactive SVG editor: drag keypoints to adjust, add/remove persons (max 2)
- Export PNG: **black background + colored skeleton only** (ControlNet preprocessor format)
- Export JSON: OpenPose v1.3 `pose_keypoints_2d` flat array per person

Follows the existing app pattern: `openpose.md` + `<ClientOnly><OpenPoseEditor /></ClientOnly>`.

## Context (from discovery)

- Existing pattern: `piano.md` → `<ClientOnly><Piano /></ClientOnly>`, Piano.vue + Piano/ modules
- Theme entry: `.vitepress/theme/index.mts` — static import + `app.component()`
- No CDN rule: all deps via npm or local files; WASM served from `public/mediapipe/wasm/`
- Model file pattern: same as Salamander piano samples — downloaded once to `public/mediapipe/`,
  gitignored; app shows clear error with download instructions if missing
- Tests run with: `node --test .vitepress/theme/components/OpenPose/*.test.mjs`
- Build: `npm run build` (not yarn)

## Development Approach

- **Testing approach**: Regular (code first, then tests for pure functions)
- WASM files: npm script `scripts/copy-mediapipe-wasm.js` copies from node_modules to `public/`
- Complete each task fully before moving to the next
- All tests must pass before starting next task

## Testing Strategy

- Unit tests for pure functions: `skeleton.js` (keypoint mapping), `exporter.js` (JSON format)
- No automated tests for DOM/canvas/MediaPipe (requires browser)
- Test runner: `node --test .vitepress/theme/components/OpenPose/*.test.mjs`

## What Goes Where

- **Implementation Steps**: code changes, tests, config
- **Post-Completion**: manual browser testing, model download steps

## Implementation Steps

### Task 1: Project setup — deps, WASM copy, page scaffold

- [x] `npm install @mediapipe/tasks-vision`
- [x] create `scripts/copy-mediapipe-wasm.js` — copies `node_modules/@mediapipe/tasks-vision/wasm/*` to `public/mediapipe/wasm/` using Node.js `fs` (no extra deps)
- [x] add `"mediapipe:copy": "node scripts/copy-mediapipe-wasm.js"` to `package.json` scripts; also add `predev` and `prebuild` hooks that call it
- [x] add `public/mediapipe/*.task` to `.gitignore`; create `public/mediapipe/.gitkeep`
- [x] create `openpose.md` at repo root — `layout: false`, imports `OpenPoseEditor`, same structure as `piano.md`
- [x] create `.vitepress/theme/components/OpenPoseEditor.vue` — stub component (empty template + `<ClientOnly>` note)
- [x] register `OpenPoseEditor` in `.vitepress/theme/index.mts` (static import, `app.component(...)`)
- [x] create directory `.vitepress/theme/components/OpenPose/` with empty stub files: `skeleton.js`, `model.js`, `renderer.js`, `editor.js`, `exporter.js`
- [x] verify `npm run dev` — `/openpose` serves without errors (verified via `npm run build`: openpose.html renders + WASM served as static asset)

### Task 2: Keypoint definitions and mapping (`OpenPose/skeleton.js`)

- [ ] define `OPENPOSE_KEYPOINTS` — 18 names in standard order:
  `['Nose','Neck','RShoulder','RElbow','RWrist','LShoulder','LElbow','LWrist','RHip','RKnee','RAnkle','LHip','LKnee','LAnkle','REye','LEye','REar','LEar']`
- [ ] define `OPENPOSE_CONNECTIONS` — 17 pairs `[fromIdx, toIdx]` using standard CMU connections
- [ ] define `LIMB_COLORS` — parallel array of `[R, G, B]` tuples; use standard OpenPose palette
- [ ] define `BLAZEPOSE_TO_OPENPOSE` — array of 18 entries; each entry is either a BlazePose index (0–32) or `null` for Neck (computed separately)
- [ ] implement `blazeposeToOpenpose(landmarks, imageWidth, imageHeight)` — converts MediaPipe `NormalizedLandmark[]` (33 items, `{x, y, z, visibility}`) to `{x, y, confidence}[18]` pixel-coord array; `x = landmark.x * imageWidth`, `y = landmark.y * imageHeight`; Neck (index 1) = midpoint of landmarks[11] + landmarks[12]; confidence = `visibility ?? 0` clamped 0–1
- [ ] implement `emptySkeleton(cx, cy, scale)` — returns a T-pose `{x, y, confidence: 1}[18]` centered at `(cx, cy)`; used when adding a person manually; `scale` controls spread (default 80px)
- [ ] write `OpenPose/skeleton.test.mjs`:
  - test `OPENPOSE_KEYPOINTS.length === 18`
  - test `OPENPOSE_CONNECTIONS.length === 17`
  - test `LIMB_COLORS.length === 17`
  - test `blazeposeToOpenpose`: build synthetic 33-element landmarks array; verify index 0 maps to `Nose`, index 1 is midpoint of landmarks[11]+landmarks[12]; verify pixel denormalization
  - test `emptySkeleton` returns 18 points all with `confidence: 1`
- [ ] run `node --test .vitepress/theme/components/OpenPose/skeleton.test.mjs` — must pass before task 3

**BlazePose → OpenPose mapping table:**
```
OpenPose  Name        BlazePose
0         Nose        0
1         Neck        midpoint(11, 12)  ← computed
2         RShoulder   12
3         RElbow      14
4         RWrist      16
5         LShoulder   11
6         LElbow      13
7         LWrist      15
8         RHip        24
9         RKnee       26
10        RAnkle      28
11        LHip        23
12        LKnee       25
13        LAnkle      27
14        REye        5
15        LEye        2
16        REar        8
17        LEar        7
```

### Task 3: Canvas renderer (`OpenPose/renderer.js`)

- [ ] implement `renderSkeleton(ctx, skeleton, colorOverride, lineWidth=4, dotRadius=6)` — draws 17 limb lines using `LIMB_COLORS`; low-confidence keypoints (`< 0.3`) skip connection rendering; draws joint circles at each point; `colorOverride` (array `[R,G,B]`) overrides all limb colors (used for second person at reduced saturation)
- [ ] implement `renderSkeletonOnCanvas(canvas, imageBitmap, skeletons)` — clears canvas, draws `imageBitmap` scaled to fit canvas, then renders `skeletons[0]` with normal LIMB_COLORS and `skeletons[1]` (if present) with same LIMB_COLORS at 70% alpha; returns canvas for chaining
- [ ] implement `renderSkeletonOnBlack(width, height, skeletons)` — creates an `OffscreenCanvas` (or regular `<canvas>`) `width × height`, fills black, renders all skeletons with LIMB_COLORS at full opacity; returns the canvas element (for PNG export)
- [ ] write `OpenPose/renderer.test.mjs` (canvas mocked via a minimal stub since no DOM in node):
  - test that `renderSkeleton` does not throw given a valid 18-point skeleton and a mock `ctx` with jest-style no-op methods
  - test that keypoints with confidence < 0.3 cause their connections to be skipped (mock ctx records `moveTo`/`lineTo` calls, verify count)
- [ ] run `node --test .vitepress/theme/components/OpenPose/renderer.test.mjs` — must pass before task 4

### Task 4: MediaPipe model wrapper (`OpenPose/model.js`)

- [ ] implement `usePoseDetection()` composable (Vue 3 `ref`/`reactive`):
  - `status` ref: `'idle' | 'loading' | 'ready' | 'error'`
  - `modelError` ref: error message string (shown to user with download instructions)
  - `async initModel()` — dynamically imports `@mediapipe/tasks-vision`, loads `FilesetResolver` from `/mediapipe/wasm/`, loads `PoseLandmarker` model from `/mediapipe/pose_landmarker_full.task` with `numPoses: 2, runningMode: 'IMAGE'`; catches 404/network errors and sets `status = 'error'` with instructions string
  - `async detectPoses(htmlImageElement)` — runs `poseLandmarker.detect(el)`, maps each result via `blazeposeToOpenpose`, returns `Skeleton[]` (0–2 items)
- [ ] no unit tests (requires real MediaPipe WASM + browser env)

### Task 5: Batch queue UI (`OpenPoseEditor.vue` — upload and queue)

- [ ] layout: topbar (back link to `/`, title "OpenPose", upload button, model status), sidebar (scrollable image queue 220px), main canvas area, bottom toolbar
- [ ] drag & drop zone on the full page + file input `accept="image/*" multiple`; on drop/change, create queue entries: `{ id: crypto.randomUUID(), file, name, dataURL, status: 'pending'|'processing'|'done'|'error', skeletons: [], imageBitmap: null }`
- [ ] queue sidebar: thumbnail from `dataURL`, filename, status badge (spinner / ✓ / ✗)
- [ ] selecting a queue item updates `selectedId` ref; main area shows canvas for that image
- [ ] on mount: call `initModel()`; show loading banner; show error banner with download command if `status === 'error'`
- [ ] auto-process: when `status === 'ready'`, walk queue in order; for each `'pending'` item: set `'processing'`, create `ImageBitmap`, call `detectPoses`, set `skeletons`, set `'done'`; then call `renderSkeletonOnCanvas` on selected item's canvas
- [ ] re-render canvas on `selectedId` change and on skeleton edit
- [ ] no unit tests (UI)

### Task 6: Interactive skeleton editor (`OpenPose/editor.js` + toolbar)

- [ ] implement `useSkeletonEditor(canvasEl, getSkeletons, onUpdate)` composable — creates a transparent SVG overlay absolutely positioned over the canvas; renders a draggable `<circle r="8">` at each keypoint; on `pointerdown` + `pointermove` updates `skeleton[i].x` and `skeleton[i].y`, sets `confidence = 1.0`, calls `onUpdate()`; person 0 circles: `#4fc3f7` (blue), person 1 circles: `#ffb74d` (orange); low-confidence keypoints (`< 0.3`) rendered as hollow circles (fill: transparent, stroke only)
- [ ] wire editor into `OpenPoseEditor.vue`: mount composable when canvas becomes active; call `onUpdate → renderSkeletonOnCanvas` to live-update preview
- [ ] toolbar buttons:
  - **Add person** — if `skeletons.length < 2`, append `emptySkeleton(canvas.width/2, canvas.height/2, 80)` and re-render
  - **Remove person** — if `skeletons.length > 0`, pop last skeleton and re-render
  - **Re-detect** — re-run `detectPoses` on current `imageBitmap`, replace `skeletons`, re-render
- [ ] write `OpenPose/editor.test.mjs` (pure logic only — no DOM):
  - test that dragging a keypoint updates its x/y and sets `confidence = 1.0`
  - test `addPerson` respects max 2 limit
  - test `removePerson` does not go below 0
- [ ] run `node --test .vitepress/theme/components/OpenPose/editor.test.mjs` — must pass before task 7

### Task 7: Export (`OpenPose/exporter.js` + buttons)

- [ ] implement `toOpenPoseJSON(skeletons, imageWidth, imageHeight)` — returns standard OpenPose v1.3 object:
  ```json
  {
    "version": 1.3,
    "people": [
      {
        "person_id": [-1],
        "pose_keypoints_2d": [x0/W, y0/H, c0, x1/W, y1/H, c1, ...],
        "face_keypoints_2d": [],
        "hand_left_keypoints_2d": [],
        "hand_right_keypoints_2d": []
      }
    ]
  }
  ```
  coordinates normalized 0–1 (`x/imageWidth`, `y/imageHeight`); one entry per skeleton
- [ ] implement `downloadJSON(basename, json)` — `JSON.stringify` + `Blob('application/json')` + `URL.createObjectURL` + programmatic click + `revokeObjectURL`; filename: `{basename}_keypoints.json`
- [ ] implement `downloadPNG(canvas, basename)` — `canvas.toBlob → URL.createObjectURL → click → revoke`; filename: `{basename}_openpose.png`
- [ ] wire toolbar "Export PNG" button: calls `renderSkeletonOnBlack(w, h, skeletons)` then `downloadPNG`
- [ ] wire toolbar "Export JSON" button: calls `toOpenPoseJSON` then `downloadJSON`
- [ ] write `OpenPose/exporter.test.mjs`:
  - test `toOpenPoseJSON` has `version: 1.3`
  - test `toOpenPoseJSON` `people` array has same length as input skeletons
  - test each person's `pose_keypoints_2d` has exactly 54 values (18 × 3)
  - test coordinates are normalized: all x/y values in range [0, 1] when skeleton coords are within image bounds
  - test empty skeletons input returns `people: []`
- [ ] run `node --test .vitepress/theme/components/OpenPose/exporter.test.mjs` — must pass before task 8

### Task 8: Verify acceptance criteria

- [ ] run full test suite: `node --test .vitepress/theme/components/OpenPose/*.test.mjs`
- [ ] run `npm run build` — must complete without errors
- [ ] verify `/openpose` page renders in browser dev server

## Technical Details

**WASM serving:**
`scripts/copy-mediapipe-wasm.js` copies `node_modules/@mediapipe/tasks-vision/wasm/` → `public/mediapipe/wasm/`.
Run via `npm run mediapipe:copy`. Hooked into `predev` and `prebuild`.

**MediaPipe dynamic import (no-CDN, no SSR):**
`model.js` uses `const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')`
inside `initModel()` so it only runs in the browser. Pass `wasmFilePath: '/mediapipe/wasm'` to
`FilesetResolver.forVisionTasks()`. Model path: `'/mediapipe/pose_landmarker_full.task'`.

**Two-person detection:**
`PoseLandmarker.createFromOptions` with `numPoses: 2`. `result.landmarks` is an array of 0–2
sets of 33 NormalizedLandmarks. Each set maps independently via `blazeposeToOpenpose`.

**Export PNG for ControlNet:**
Black background + colored skeleton only (`renderSkeletonOnBlack`). NOT the original photo.
This matches what ControlNet's OpenPose preprocessor outputs.

**Package structure:**
```
openpose.md
.vitepress/theme/components/
  OpenPoseEditor.vue           ← root component
  OpenPose/
    skeleton.js                ← keypoint defs, BlazePose→OpenPose mapping
    model.js                   ← usePoseDetection() composable
    renderer.js                ← canvas rendering
    editor.js                  ← useSkeletonEditor() SVG drag composable
    exporter.js                ← JSON + PNG download
    skeleton.test.mjs
    renderer.test.mjs
    editor.test.mjs
    exporter.test.mjs
scripts/
  copy-mediapipe-wasm.js
public/mediapipe/
  .gitkeep
  wasm/                        ← copied by npm script, not committed
  pose_landmarker_full.task    ← download manually, gitignored (~10.8 MB)
```

## Post-Completion

**One-time setup before first use:**

1. Copy WASM files (already in `predev`/`prebuild`, but run manually first):
   ```bash
   npm run mediapipe:copy
   ```

2. Download MediaPipe pose landmarker model (~10.8 MB):
   ```bash
   curl -L "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task" \
     -o public/mediapipe/pose_landmarker_full.task
   ```
   Same pattern as Salamander piano samples — one-time download, gitignored.

**Manual browser testing:**
- Upload 3+ photos (mix of 1-person and 2-person images)
- Verify auto-detection runs without clicking (queue auto-processes)
- Drag keypoints: confirm live canvas update during drag
- Add second person: verify empty T-pose skeleton appears, draggable
- Remove person: verify skeleton removed from canvas
- Export PNG: open file — black background with colored skeleton only (no photo)
- Export JSON: open file — valid OpenPose v1.3 structure, coordinates 0–1
- Verify model-missing error banner shows correct curl download command
