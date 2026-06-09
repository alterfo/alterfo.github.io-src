// OpenPose/renderer.js — canvas skeleton rendering.
//
// Three responsibilities:
//   renderSkeleton          — low-level: draw one skeleton onto a 2D context
//   renderSkeletonOnCanvas  — preview: original image + skeleton overlay
//   renderSkeletonOnBlack   — export: black background + skeleton only (ControlNet)

import { OPENPOSE_CONNECTIONS, LIMB_COLORS } from './skeleton.js'

// Keypoints below this confidence are treated as undetected: their connections
// are skipped and no joint dot is drawn.
export const CONFIDENCE_THRESHOLD = 0.3

function rgbString([r, g, b]) {
  return `rgb(${r}, ${g}, ${b})`
}

// Per-keypoint dot color. Reuses the limb palette (18 keypoints, 17 colors → wrap).
function jointColor(i) {
  return LIMB_COLORS[i % LIMB_COLORS.length]
}

// Create a fresh canvas: OffscreenCanvas where available (workers, modern
// browsers), else a detached <canvas>. Used by renderSkeletonOnBlack.
function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return c
}

// Draw one skeleton onto a 2D rendering context.
// - 17 limb lines colored by LIMB_COLORS (or colorOverride [R,G,B] for all limbs)
// - a connection is skipped if either endpoint has confidence < CONFIDENCE_THRESHOLD
// - a joint dot is drawn at each keypoint with confidence >= CONFIDENCE_THRESHOLD
export function renderSkeleton(ctx, skeleton, colorOverride = null, lineWidth = 4, dotRadius = 6) {
  if (!ctx || !skeleton) return

  ctx.lineWidth = lineWidth
  for (let i = 0; i < OPENPOSE_CONNECTIONS.length; i++) {
    const [from, to] = OPENPOSE_CONNECTIONS[i]
    const a = skeleton[from]
    const b = skeleton[to]
    if (!a || !b) continue
    if (a.confidence < CONFIDENCE_THRESHOLD || b.confidence < CONFIDENCE_THRESHOLD) continue
    ctx.strokeStyle = rgbString(colorOverride || LIMB_COLORS[i])
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }

  for (let i = 0; i < skeleton.length; i++) {
    const p = skeleton[i]
    if (!p || p.confidence < CONFIDENCE_THRESHOLD) continue
    ctx.fillStyle = rgbString(colorOverride || jointColor(i))
    ctx.beginPath()
    ctx.arc(p.x, p.y, dotRadius, 0, Math.PI * 2)
    ctx.fill()
  }
}

// Preview render: clear canvas, draw imageBitmap scaled to fit, then overlay
// skeletons[0] at full opacity and skeletons[1] (if present) at 70% alpha.
// Returns the canvas for chaining.
export function renderSkeletonOnCanvas(canvas, imageBitmap, skeletons) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (imageBitmap) {
    ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height)
  }
  const list = skeletons || []
  if (list[0]) renderSkeleton(ctx, list[0])
  if (list[1]) {
    const prevAlpha = ctx.globalAlpha
    ctx.globalAlpha = 0.7
    renderSkeleton(ctx, list[1])
    ctx.globalAlpha = prevAlpha
  }
  return canvas
}

// Export render: black background + all skeletons at full opacity, no photo.
// Matches ControlNet's OpenPose preprocessor output. Returns the canvas element.
export function renderSkeletonOnBlack(width, height, skeletons) {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, width, height)
  for (const skel of skeletons || []) {
    renderSkeleton(ctx, skel)
  }
  return canvas
}
