// SVG rendering helpers for IDEF0 boxes and arrows

const FONT_SIZE = 12
const LINE_HEIGHT = 16
const NUM_FONT_SIZE = 10
const DECOMP_FONT_SIZE = 10

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

export { FONT_SIZE, LINE_HEIGHT, NUM_FONT_SIZE, DECOMP_FONT_SIZE }
