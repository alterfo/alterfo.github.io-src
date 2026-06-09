// OpenPose/exporter.js — OpenPose v1.3 JSON + PNG export.
//
// Two layers:
//   - toOpenPoseJSON  — pure: Skeleton[] → OpenPose v1.3 object (unit-tested)
//   - downloadJSON / downloadPNG — browser-only file download helpers
//
// The PNG is produced upstream by renderSkeletonOnBlack (black background +
// skeleton only) so the file matches ControlNet's OpenPose preprocessor output.

import { OPENPOSE_KEYPOINTS } from './skeleton.js'

// Build a standard OpenPose v1.3 object from skeletons (pixel coords). Each
// keypoint becomes three flat values [x/W, y/H, confidence], so coordinates are
// normalized 0–1. One `people` entry per skeleton; empty input → people: [].
export function toOpenPoseJSON(skeletons, imageWidth, imageHeight) {
  const w = imageWidth || 1
  const h = imageHeight || 1
  const people = (skeletons || []).map((skel) => {
    const keypoints = []
    for (let i = 0; i < OPENPOSE_KEYPOINTS.length; i++) {
      const p = skel[i] || { x: 0, y: 0, confidence: 0 }
      keypoints.push(p.x / w, p.y / h, p.confidence ?? 0)
    }
    return {
      person_id: [-1],
      pose_keypoints_2d: keypoints,
      face_keypoints_2d: [],
      hand_left_keypoints_2d: [],
      hand_right_keypoints_2d: [],
    }
  })
  return { version: 1.3, people }
}

// Trigger a programmatic download of an OpenPose JSON object as
// `{basename}_keypoints.json`. Browser-only (uses Blob + object URL).
export function downloadJSON(basename, json) {
  const text = JSON.stringify(json)
  const blob = new Blob([text], { type: 'application/json' })
  triggerDownload(blob, `${basename}_keypoints.json`)
}

// Trigger a programmatic download of a canvas as `{basename}_openpose.png`.
// Browser-only; handles both <canvas>.toBlob (callback) and
// OffscreenCanvas.convertToBlob (promise), since renderSkeletonOnBlack may
// return either.
export async function downloadPNG(canvas, basename) {
  const blob = await canvasToBlob(canvas)
  triggerDownload(blob, `${basename}_openpose.png`)
}

function canvasToBlob(canvas) {
  if (canvas && typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/png' })
  }
  if (canvas && typeof canvas.toBlob === 'function') {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        blob ? resolve(blob) : reject(new Error('toBlob produced no blob'))
      }, 'image/png')
    })
  }
  return Promise.reject(new Error('canvas has no toBlob/convertToBlob'))
}

// Shared: download a Blob under `filename` via a transient <a>, then revoke.
// The revoke is deferred: revoking the object URL synchronously after click()
// can abort the download in Firefox/Safari before the blob has been fetched.
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
