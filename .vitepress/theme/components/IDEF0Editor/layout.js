// Auto-layout for FIPS 183 diagonal block placement

const VIEW_W = 1200
const VIEW_H = 800
const DEFAULT_BOX_W = 160
const DEFAULT_BOX_H = 80
// Space reserved on each edge for boundary arrows
const BOUNDARY_MARGIN = 80
// Extra top margin for the diagram title text
const TITLE_MARGIN = 40

/**
 * Updates x, y of all boxes in the diagram using FIPS 183 diagonal layout.
 * Block 1 is top-left; each subsequent block shifts diagonally toward bottom-right.
 * Positions stay within the usable area inside boundary arrow margins.
 */
function autoLayout(diagram) {
  const boxes = diagram.boxes
  if (!boxes || boxes.length === 0) return

  const n = boxes.length
  const x0 = BOUNDARY_MARGIN
  const y0 = BOUNDARY_MARGIN + TITLE_MARGIN
  const x1 = VIEW_W - BOUNDARY_MARGIN - DEFAULT_BOX_W
  const y1 = VIEW_H - BOUNDARY_MARGIN - DEFAULT_BOX_H

  if (n === 1) {
    boxes[0].x = x0
    boxes[0].y = y0
    return
  }

  const dx = (x1 - x0) / (n - 1)
  const dy = (y1 - y0) / (n - 1)

  for (let i = 0; i < n; i++) {
    boxes[i].x = Math.round(x0 + i * dx)
    boxes[i].y = Math.round(y0 + i * dy)
  }
}

/**
 * Calculates scale + translate to fit all boxes within the given viewport dimensions.
 * Returns { scale, translateX, translateY } for use in an SVG/CSS transform.
 * Scale is clamped to ≤1 — only zooms out, never in.
 */
function fitToView(boxes, viewportW, viewportH) {
  if (!boxes || boxes.length === 0) {
    return { scale: 1, translateX: 0, translateY: 0 }
  }

  const padding = 60
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (const b of boxes) {
    const w = b.w ?? DEFAULT_BOX_W
    const h = b.h ?? DEFAULT_BOX_H
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + w)
    maxY = Math.max(maxY, b.y + h)
  }

  const contentW = maxX - minX + padding * 2
  const contentH = maxY - minY + padding * 2
  const scale = Math.min(viewportW / contentW, viewportH / contentH, 1)

  const scaledW = contentW * scale
  const scaledH = contentH * scale
  const translateX = (viewportW - scaledW) / 2 - (minX - padding) * scale
  const translateY = (viewportH - scaledH) / 2 - (minY - padding) * scale

  return { scale, translateX, translateY }
}

export { autoLayout }
