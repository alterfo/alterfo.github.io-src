# OpenPose Editor app

Client-side pose editor at `/openpose`: batch-upload images, auto-detect skeletons with MediaPipe BlazePose (in-browser WASM, up to 2 persons), drag-edit keypoints, export black-background skeleton PNG + OpenPose v1.3 JSON for ControlNet / Stable Diffusion.

Root component: `.vitepress/theme/components/OpenPoseEditor.vue` (static registration in `index.mts`).
Page: `openpose.md` (`layout: false`).

A "Skeleton" is a flat 18-point array of `{ x, y, confidence }` in pixel coords matching `OPENPOSE_KEYPOINTS`.

## Modules

| File | Purpose |
|------|---------|
| `skeleton.js` | OpenPose COCO 18-keypoint defs (`OPENPOSE_KEYPOINTS`, 17-pair `OPENPOSE_CONNECTIONS`, `LIMB_COLORS`), `BLAZEPOSE_TO_OPENPOSE` map, `blazeposeToOpenpose()` (33→18, Neck = shoulder midpoint; missing landmarks → `{0,0,0}`), `emptySkeleton()` (T-pose, all confidence 1) |
| `model.js` | `usePoseDetection()` composable: `status`/`modelError` refs, `initModel()`, `detectPoses(img)`, `dispose()`. Lazy `await import('@mediapipe/tasks-vision')` PoseLandmarker (full model, `numPoses:2`, `runningMode:'IMAGE'`) |
| `renderer.js` | `renderSkeleton(ctx, skel, colorOverride?, lineWidth?, dotRadius?)`, `renderSkeletonOnCanvas()` (photo + overlay, person 1 at 0.7 alpha), `renderSkeletonOnBlack()` (black bg, ControlNet PNG — returns `OffscreenCanvas` when available). `CONFIDENCE_THRESHOLD=0.3` skips limbs/dots |
| `editor.js` | Pure `moveKeypoint`/`addPerson`/`removePerson` (`MAX_PERSONS=2`) + `useSkeletonEditor()` — transparent SVG drag overlay aligned to canvas via `viewBox` = canvas pixel size |
| `exporter.js` | `toOpenPoseJSON()` (v1.3, coords normalized 0–1, one `people` entry per skeleton) + `downloadJSON`/`downloadPNG` (handles both `<canvas>.toBlob` and `OffscreenCanvas.convertToBlob`) |

## MediaPipe model + WASM setup (required — non-obvious)

- WASM runtime is copied from `node_modules/@mediapipe/tasks-vision/wasm/` → `public/mediapipe/wasm/` by `scripts/copy-mediapipe-wasm.js`, triggered via `npm run mediapipe:copy` (auto-hooked into `predev`/`prebuild`).
- Model file `public/mediapipe/pose_landmarker_full.task` (~10.8 MB) is **gitignored** — download once:
  ```bash
  curl -L "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task" -o public/mediapipe/pose_landmarker_full.task
  ```
  If missing, the app shows an error banner with this exact command.
- **CI/prod**: `deploy.yml` downloads the model (curl + `actions/cache`) and runs `npm run build` — NOT `npx vitepress build` — because only the npm script triggers the `prebuild` → `mediapipe:copy` hook.
- `@mediapipe/tasks-vision` is loaded via dynamic `import()` inside `initModel()` → lazy `vision_bundle.[hash].js` chunk. Namespace export resolved defensively as `vision.X ?? vision.default?.X`.

## Tests

`node --test .vitepress/theme/components/OpenPose/*.test.mjs`
