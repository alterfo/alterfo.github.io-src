// SVG rendering helpers for IDEF0 boxes and arrows
import { SIDE_FOR_TYPE } from './icom.js'

const FONT_SIZE = 12
const LINE_HEIGHT = 16
const NUM_FONT_SIZE = 10
const DECOMP_FONT_SIZE = 10
const ARROW_SIZE = 6

function wrapText(text, boxW) {
  const maxChars = Math.max(8, Math.floor(boxW / (FONT_SIZE * 0.6)))
  const words = text.split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    if (!current) {
      current = word
    } else if ((current + ' ' + word).length <= maxChars) {
      current += ' ' + word
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

/**
 * Returns all data needed to render a single box in SVG.
 * @param {object} box - Box from the data model
 * @param {boolean} isSelected - Whether the box is currently selected
 * @param {number|null} index - 1-based position number shown in bottom-right corner
 */
export function renderBox(box, isSelected = false, index = null) {
  const { x, y, w, h } = box

  const rect = {
    x,
    y,
    width: w,
    height: h,
    fill: 'white',
    stroke: isSelected ? '#2563eb' : 'black',
    'stroke-width': isSelected ? 2 : 1,
  }

  const lines = wrapText(box.label, w)
  const totalTextH = lines.length * LINE_HEIGHT
  const labelX = x + w / 2
  const labelBaseY = y + h / 2 - totalTextH / 2 + LINE_HEIGHT / 2

  const numText = index !== null ? String(index) : ''
  const numX = x + w - 4
  const numY = y + h - 4

  const hasDecomposition = !!box.childDiagramId
  const decompX = x + 5
  const decompY = y + h - 4

  return {
    box,
    rect,
    labelLines: lines,
    labelX,
    labelBaseY,
    lineHeight: LINE_HEIGHT,
    numText,
    numX,
    numY,
    hasDecomposition,
    decompX,
    decompY,
  }
}

// --- Arrow routing and rendering ---

function sidePoint(box, side) {
  switch (side) {
    case 'left':   return { x: box.x,             y: box.y + box.h / 2 }
    case 'right':  return { x: box.x + box.w,     y: box.y + box.h / 2 }
    case 'top':    return { x: box.x + box.w / 2, y: box.y }
    case 'bottom': return { x: box.x + box.w / 2, y: box.y + box.h }
    default:       return { x: box.x + box.w / 2, y: box.y + box.h / 2 }
  }
}

// 'h' for left/right, 'v' for top/bottom
function sideDir(side) {
  return side === 'left' || side === 'right' ? 'h' : 'v'
}

function manhattanPath(sp, tp, srcSide, tgtSide) {
  const sd = sideDir(srcSide)
  const td = sideDir(tgtSide)
  if (sd === 'h' && td === 'h') {
    const midX = (sp.x + tp.x) / 2
    return [sp, { x: midX, y: sp.y }, { x: midX, y: tp.y }, tp]
  }
  if (sd === 'v' && td === 'v') {
    const midY = (sp.y + tp.y) / 2
    return [sp, { x: sp.x, y: midY }, { x: tp.x, y: midY }, tp]
  }
  if (sd === 'h' && td === 'v') {
    return [sp, { x: tp.x, y: sp.y }, tp]
  }
  // sd === 'v', td === 'h'
  return [sp, { x: sp.x, y: tp.y }, tp]
}

/**
 * Computes a Manhattan (orthogonal) path for an internal arrow between two boxes.
 * Returns an array of {x,y} waypoints with ≥2 segments, all at 90°.
 */
export function routeArrow(arrow, boxes) {
  const boxMap = {}
  for (const b of boxes) boxMap[b.id] = b
  const src = boxMap[arrow.sourceBoxId]
  const tgt = boxMap[arrow.targetBoxId]
  if (!src || !tgt) return []

  // call exits bottom; all other types exit from right of source
  const srcSide = arrow.type === 'call' ? 'bottom' : 'right'
  const tgtSide = SIDE_FOR_TYPE[arrow.type] ?? 'left'
  const sp = sidePoint(src, srcSide)
  const tp = sidePoint(tgt, tgtSide)
  return manhattanPath(sp, tp, srcSide, tgtSide)
}

/**
 * Returns data needed to render an arrow path and filled arrowhead polygon in SVG.
 * @param {object} arrow - Arrow from the data model
 * @param {Array} route - Waypoints from routeArrow
 * @param {boolean} isBoundary - If true, uses dashed stroke
 */
export function renderArrow(arrow, route, isBoundary = false) {
  if (!route || route.length < 2) return null

  const n = route.length
  const last = route[n - 1]
  const prev = route[n - 2]
  const dx = last.x - prev.x
  const dy = last.y - prev.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  // Perpendicular unit vector
  const px = -uy
  const py = ux

  const tip = { x: last.x, y: last.y }
  const b1 = {
    x: last.x - ARROW_SIZE * ux + ARROW_SIZE * 0.5 * px,
    y: last.y - ARROW_SIZE * uy + ARROW_SIZE * 0.5 * py,
  }
  const b2 = {
    x: last.x - ARROW_SIZE * ux - ARROW_SIZE * 0.5 * px,
    y: last.y - ARROW_SIZE * uy - ARROW_SIZE * 0.5 * py,
  }
  const arrowheadPoints = `${tip.x},${tip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`

  // Path ends just before tip so it doesn't visually overlap the arrowhead fill
  const pathEnd = { x: last.x - ARROW_SIZE * ux, y: last.y - ARROW_SIZE * uy }
  const pts = [...route.slice(0, -1), pathEnd]
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ')

  return {
    arrow,
    d,
    strokeDasharray: isBoundary ? '5,5' : null,
    arrowheadPoints,
  }
}

/**
 * Returns position and text for an arrow label, placed near the mid of the first segment.
 */
export function renderArrowLabel(arrow, route) {
  if (!route || route.length < 2 || !arrow.label) return null

  const p0 = route[0]
  const p1 = route[1]
  const mx = (p0.x + p1.x) / 2
  const my = (p0.y + p1.y) / 2

  // Offset 10px perpendicular to the segment so label clears the line
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const len = Math.hypot(dx, dy) || 1
  const ox = (-dy / len) * 10
  const oy = (dx / len) * 10

  return {
    arrow,
    x: mx + ox,
    y: my + oy,
    text: arrow.label,
  }
}

export { FONT_SIZE, LINE_HEIGHT, NUM_FONT_SIZE, DECOMP_FONT_SIZE }
