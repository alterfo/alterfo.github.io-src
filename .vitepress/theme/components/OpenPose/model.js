// OpenPose/model.js — usePoseDetection() MediaPipe composable.
//
// Wraps MediaPipe Tasks Vision PoseLandmarker (BlazePose, up to 2 persons).
// The heavy @mediapipe/tasks-vision dep + WASM are loaded lazily inside
// initModel() via dynamic import() so nothing runs during SSR and the dep
// stays out of the shared app chunk. Each detection result is mapped through
// blazeposeToOpenpose() into the 18-point OpenPose skeleton shape.

import { ref } from 'vue'
import { blazeposeToOpenpose } from './skeleton.js'

// Where the copied WASM fileset and the downloaded model file live (public/).
const WASM_PATH = '/mediapipe/wasm'
const MODEL_PATH = '/mediapipe/pose_landmarker_full.task'

// Shown when the model can't load — almost always the one-time download is missing.
const DOWNLOAD_INSTRUCTIONS =
  'Не удалось загрузить модель MediaPipe. Скачайте её один раз (~10.8 МБ):\n\n' +
  'curl -L "https://storage.googleapis.com/mediapipe-models/pose_landmarker/' +
  'pose_landmarker_full/float16/latest/pose_landmarker_full.task" ' +
  '-o public/mediapipe/pose_landmarker_full.task\n\n' +
  'И скопируйте WASM: npm run mediapipe:copy'

export function usePoseDetection() {
  const status = ref('idle')   // 'idle' | 'loading' | 'ready' | 'error'
  const modelError = ref('')

  let _landmarker = null

  async function initModel() {
    if (status.value === 'loading' || status.value === 'ready') return
    status.value = 'loading'
    modelError.value = ''
    try {
      const vision = await import('@mediapipe/tasks-vision')
      const FilesetResolver = vision.FilesetResolver ?? vision.default?.FilesetResolver
      const PoseLandmarker = vision.PoseLandmarker ?? vision.default?.PoseLandmarker

      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
      _landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATH },
        numPoses: 2,
        runningMode: 'IMAGE',
      })
      status.value = 'ready'
    } catch (err) {
      _landmarker = null
      status.value = 'error'
      modelError.value = DOWNLOAD_INSTRUCTIONS + '\n\n(' + (err?.message || err) + ')'
    }
  }

  // Run pose detection on an HTMLImageElement (already loaded). Returns 0–2
  // skeletons in OpenPose 18-point pixel coordinates. Uses the element's
  // natural size for denormalization so coords match the source image.
  async function detectPoses(htmlImageElement) {
    if (!_landmarker || status.value !== 'ready') return []
    const w = htmlImageElement.naturalWidth || htmlImageElement.width
    const h = htmlImageElement.naturalHeight || htmlImageElement.height
    const result = _landmarker.detect(htmlImageElement)
    const sets = result?.landmarks || []
    return sets.map((landmarks) => blazeposeToOpenpose(landmarks, w, h))
  }

  function dispose() {
    if (_landmarker && typeof _landmarker.close === 'function') {
      try { _landmarker.close() } catch { /* ignore */ }
    }
    _landmarker = null
    status.value = 'idle'
    modelError.value = ''
  }

  return { status, modelError, initModel, detectPoses, dispose }
}
