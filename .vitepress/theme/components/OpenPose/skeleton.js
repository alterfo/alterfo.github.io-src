// OpenPose/skeleton.js — keypoint definitions + BlazePose→OpenPose mapping.
//
// OpenPose COCO 18-keypoint body model. A "Skeleton" is a flat array of 18
// points: { x, y, confidence }, where x/y are pixel coordinates and confidence
// is 0–1. Keypoint order matches OPENPOSE_KEYPOINTS below.

// 18 keypoint names in standard OpenPose (COCO) order.
export const OPENPOSE_KEYPOINTS = [
  'Nose', 'Neck', 'RShoulder', 'RElbow', 'RWrist', 'LShoulder', 'LElbow',
  'LWrist', 'RHip', 'RKnee', 'RAnkle', 'LHip', 'LKnee', 'LAnkle', 'REye',
  'LEye', 'REar', 'LEar',
]

// Index of the Neck keypoint (computed as shoulder midpoint, not a BlazePose joint).
export const NECK_INDEX = 1

// 17 limb connections [fromIdx, toIdx] — standard CMU OpenPose body pairs.
export const OPENPOSE_CONNECTIONS = [
  [1, 2],   // Neck → RShoulder
  [1, 5],   // Neck → LShoulder
  [2, 3],   // RShoulder → RElbow
  [3, 4],   // RElbow → RWrist
  [5, 6],   // LShoulder → LElbow
  [6, 7],   // LElbow → LWrist
  [1, 8],   // Neck → RHip
  [8, 9],   // RHip → RKnee
  [9, 10],  // RKnee → RAnkle
  [1, 11],  // Neck → LHip
  [11, 12], // LHip → LKnee
  [12, 13], // LKnee → LAnkle
  [1, 0],   // Neck → Nose
  [0, 14],  // Nose → REye
  [14, 16], // REye → REar
  [0, 15],  // Nose → LEye
  [15, 17], // LEye → LEar
]

// Parallel to OPENPOSE_CONNECTIONS — standard OpenPose rainbow palette [R, G, B].
export const LIMB_COLORS = [
  [255, 0, 0],
  [255, 85, 0],
  [255, 170, 0],
  [255, 255, 0],
  [170, 255, 0],
  [85, 255, 0],
  [0, 255, 0],
  [0, 255, 85],
  [0, 255, 170],
  [0, 255, 255],
  [0, 170, 255],
  [0, 85, 255],
  [0, 0, 255],
  [85, 0, 255],
  [170, 0, 255],
  [255, 0, 255],
  [255, 0, 170],
]

// BlazePose (33kp) index for each of the 18 OpenPose keypoints.
// null = Neck, computed as the midpoint of BlazePose shoulders 11 + 12.
export const BLAZEPOSE_TO_OPENPOSE = [
  0,    // 0  Nose       ← BlazePose 0
  null, // 1  Neck       ← midpoint(11, 12)
  12,   // 2  RShoulder
  14,   // 3  RElbow
  16,   // 4  RWrist
  11,   // 5  LShoulder
  13,   // 6  LElbow
  15,   // 7  LWrist
  24,   // 8  RHip
  26,   // 9  RKnee
  28,   // 10 RAnkle
  23,   // 11 LHip
  25,   // 12 LKnee
  27,   // 13 LAnkle
  5,    // 14 REye
  2,    // 15 LEye
  8,    // 16 REar
  7,    // 17 LEar
]

function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

// Convert a MediaPipe NormalizedLandmark[] (33 items: { x, y, z, visibility })
// to an 18-point OpenPose skeleton in pixel coordinates.
// Neck (index 1) = midpoint of shoulders 11 + 12; confidence = visibility ?? 0.
export function blazeposeToOpenpose(landmarks, imageWidth, imageHeight) {
  const src = landmarks || []
  const skeleton = []
  for (let i = 0; i < OPENPOSE_KEYPOINTS.length; i++) {
    if (i === NECK_INDEX) {
      const a = src[11]
      const b = src[12]
      // A missing shoulder → undetected Neck (confidence 0), never a crash.
      if (!a || !b) {
        skeleton.push({ x: 0, y: 0, confidence: 0 })
        continue
      }
      skeleton.push({
        x: ((a.x + b.x) / 2) * imageWidth,
        y: ((a.y + b.y) / 2) * imageHeight,
        confidence: clamp01(((a.visibility ?? 0) + (b.visibility ?? 0)) / 2),
      })
      continue
    }
    const lm = src[BLAZEPOSE_TO_OPENPOSE[i]]
    if (!lm) {
      skeleton.push({ x: 0, y: 0, confidence: 0 })
      continue
    }
    skeleton.push({
      x: lm.x * imageWidth,
      y: lm.y * imageHeight,
      confidence: clamp01(lm.visibility ?? 0),
    })
  }
  return skeleton
}

// Relative T-pose offsets [dx, dy] in `scale` units, indexed by keypoint.
const TPOSE_OFFSETS = [
  [0, -2],       // 0  Nose
  [0, -1.5],     // 1  Neck
  [-1, -1.5],    // 2  RShoulder
  [-2, -1.5],    // 3  RElbow
  [-3, -1.5],    // 4  RWrist
  [1, -1.5],     // 5  LShoulder
  [2, -1.5],     // 6  LElbow
  [3, -1.5],     // 7  LWrist
  [-0.5, 0.5],   // 8  RHip
  [-0.5, 2],     // 9  RKnee
  [-0.5, 3.5],   // 10 RAnkle
  [0.5, 0.5],    // 11 LHip
  [0.5, 2],      // 12 LKnee
  [0.5, 3.5],    // 13 LAnkle
  [-0.25, -2.2], // 14 REye
  [0.25, -2.2],  // 15 LEye
  [-0.5, -2.1],  // 16 REar
  [0.5, -2.1],   // 17 LEar
]

// Build a default T-pose skeleton centered at (cx, cy). `scale` controls spread.
// Used when a person is added manually; all keypoints have confidence 1.
export function emptySkeleton(cx, cy, scale = 80) {
  return TPOSE_OFFSETS.map(([dx, dy]) => ({
    x: cx + dx * scale,
    y: cy + dy * scale,
    confidence: 1,
  }))
}

// Place keypoints that the model missed (confidence < 0.1) at anatomically
// reasonable estimated positions based on what was detected.
// Modifies skeleton in place and marks snapped points with confidence = 0.1
// so they stay below CONFIDENCE_THRESHOLD and won't draw skeleton lines, but
// are visible and draggable in the editor overlay.
//
// fallbackCx/fallbackCy: canvas-centre fallback when no detected anchor exists.
// fallbackScale: px-per-unit when no shoulder width can be computed.
export function snapMissingKeypoints(skeleton, fallbackCx = 0, fallbackCy = 0, fallbackScale = 80) {
  if (!skeleton?.length) return skeleton

  // Anchor: Neck preferred; otherwise centroid of all high-confidence points.
  const neck = skeleton[NECK_INDEX]
  let anchorX = fallbackCx
  let anchorY = fallbackCy
  if (neck?.confidence >= 0.2) {
    anchorX = neck.x
    anchorY = neck.y
  } else {
    const hi = skeleton.filter(p => p?.confidence >= 0.2)
    if (hi.length > 0) {
      anchorX = hi.reduce((s, p) => s + p.x, 0) / hi.length
      anchorY = hi.reduce((s, p) => s + p.y, 0) / hi.length
    }
  }

  // Scale: shoulder half-width is 1 unit in TPOSE_OFFSETS.
  let scale = fallbackScale
  const rs = skeleton[2], ls = skeleton[5]
  if (rs?.confidence >= 0.2 && ls?.confidence >= 0.2) {
    const d = Math.hypot(ls.x - rs.x, ls.y - rs.y)
    if (d > 10) scale = d / 2
  }

  // Neck sits at TPOSE_OFFSETS[NECK_INDEX] = [0, -1.5].
  // Each keypoint's T-pose offset from neck:
  //   dx = TPOSE_OFFSETS[i][0] - 0   (neck.x component is 0)
  //   dy = TPOSE_OFFSETS[i][1] + 1.5 (neck.y component is -1.5)
  const [, neckTY] = TPOSE_OFFSETS[NECK_INDEX] // [0, -1.5]
  for (let i = 0; i < skeleton.length; i++) {
    if (skeleton[i].confidence >= 0.1) continue
    const [tx, ty] = TPOSE_OFFSETS[i]
    skeleton[i] = {
      x: anchorX + tx * scale,
      y: anchorY + (ty - neckTY) * scale,
      confidence: 0.1, // estimated — below CONFIDENCE_THRESHOLD, so no skeleton lines drawn
    }
  }
  return skeleton
}
