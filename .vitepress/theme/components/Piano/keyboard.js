// ── SVG Piano Keyboard ────────────────────────────────────────────────────────
// 88-key piano: A0 (MIDI 21) to C8 (MIDI 108)
// Returns SVG data (key rects) for rendering; no direct DOM manipulation.

// MIDI numbers for each key
export const FIRST_KEY = 21  // A0
export const LAST_KEY = 108  // C8

// Pitch class 0-11: which are black keys
const BLACK_PCS = new Set([1, 3, 6, 8, 10])  // C#, D#, F#, G#, A#

export function isBlackKey(midiNum) {
  return BLACK_PCS.has(midiNum % 12)
}

// Count white keys from A0 up to (but not including) a given MIDI note
function whiteKeysBefore(midiNum) {
  let count = 0
  for (let n = FIRST_KEY; n < midiNum; n++) {
    if (!isBlackKey(n)) count++
  }
  return count
}

// Total white keys in 88-key range
const TOTAL_WHITE_KEYS = (() => {
  let c = 0
  for (let n = FIRST_KEY; n <= LAST_KEY; n++) if (!isBlackKey(n)) c++
  return c
})()

// Build layout: array of { midi, x, y, width, height, isBlack }
// Total SVG width is provided so caller can scale; white key width = totalWidth / TOTAL_WHITE_KEYS
export function buildKeyLayout(totalWidth) {
  const ww = totalWidth / TOTAL_WHITE_KEYS   // white key width
  const wh = 120                              // white key height
  const bw = ww * 0.6                        // black key width
  const bh = 75                               // black key height

  const keys = []
  for (let n = FIRST_KEY; n <= LAST_KEY; n++) {
    const black = isBlackKey(n)
    if (!black) {
      const idx = whiteKeysBefore(n)
      keys.push({ midi: n, x: idx * ww, y: 0, width: ww, height: wh, isBlack: false })
    } else {
      // Position black key between the white keys flanking it
      // The white key immediately before this black key
      let prevWhiteIdx = 0
      for (let m = FIRST_KEY; m < n; m++) if (!isBlackKey(m)) prevWhiteIdx = whiteKeysBefore(m)
      const x = (prevWhiteIdx + 1) * ww - bw / 2
      keys.push({ midi: n, x, y: 0, width: bw, height: bh, isBlack: true })
    }
  }
  // Sort: white keys first so black keys render on top
  return [...keys.filter(k => !k.isBlack), ...keys.filter(k => k.isBlack)]
}

// ── Color resolution ──────────────────────────────────────────────────────────

// Returns fill and stroke for a key given current state sets
// scaleKeys: Set<0..11> of pitch classes in scale (null = show all normal)
// pressedNotes: Set<midiNum> of currently held notes
// expectedNote: midiNum | null
export function keyColor(midi, { scaleKeys = null, pressedNotes = new Set(), expectedNote = null } = {}) {
  const black = isBlackKey(midi)
  const pc = midi % 12

  const isPressed = pressedNotes.has(midi)
  const isExpected = expectedNote === midi
  const outOfScale = scaleKeys !== null && !scaleKeys.has(pc)

  if (isPressed) {
    return { fill: '#4a9eff', stroke: '#1a6fcc', strokeWidth: black ? 0 : 1 }
  }
  if (isExpected) {
    return {
      fill: black ? '#1a6e1a' : '#e8ffe8',
      stroke: '#22cc22',
      strokeWidth: 2,
    }
  }
  if (outOfScale) {
    return { fill: black ? '#333' : '#c8c8c8', stroke: '#888', strokeWidth: black ? 0 : 1 }
  }
  // Default
  if (black) return { fill: '#222', stroke: '#000', strokeWidth: 0 }
  return { fill: '#fff', stroke: '#888', strokeWidth: 1 }
}

// ── SVG generation ────────────────────────────────────────────────────────────

// Returns an array of SVG rect descriptor objects for all 88 keys.
// Each object: { midi, x, y, width, height, isBlack, fill, stroke, strokeWidth }
export function generateKeyRects(totalWidth, { scaleKeys = null, pressedNotes = new Set(), expectedNote = null } = {}) {
  const layout = buildKeyLayout(totalWidth)
  return layout.map(key => ({
    ...key,
    ...keyColor(key.midi, { scaleKeys, pressedNotes, expectedNote }),
  }))
}

// SVG viewBox height (white key height + 4px padding)
export const KEYBOARD_SVG_HEIGHT = 124

// Convenience: total white key count (useful for scaling)
export { TOTAL_WHITE_KEYS }
