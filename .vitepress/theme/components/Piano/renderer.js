// ── VexFlow renderer for Piano teacher ────────────────────────────────────────
// renderMeasure / renderPhrase are browser-only (VexFlow needs a DOM).
// Pure helpers (midiToVexKey, midiToStaveLine, scoreDurationToVex) are tested.
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from 'vexflow'

// ── Pure helpers (testable) ───────────────────────────────────────────────────

const VEX_NOTE_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']

// MIDI number → VexFlow key string e.g. "c#/4"
export function midiToVexKey(midi) {
  const pc = midi % 12
  const octave = Math.floor(midi / 12) - 1
  return `${VEX_NOTE_NAMES[pc]}/${octave}`
}

// Whether a MIDI pitch class has a sharp accidental
export function hasAccidental(midi) {
  return [1, 3, 6, 8, 10].includes(midi % 12)
}

// MIDI → treble clef staff line number for VexFlow's getYForLine()
// Line 0 = top line (F5), line 4 = bottom line (E4); fractional = space.
// Sharps/flats don't shift the line (they share the diatonic position).
const PITCH_TO_DIATONIC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
export function midiToStaveLine(midi) {
  const pc = midi % 12
  const octave = Math.floor(midi / 12) - 1
  const diatonic = PITCH_TO_DIATONIC[pc]
  const absPos = octave * 7 + diatonic
  // E4 (midi 64): octave=4, diatonic=2, absPos=30 → bottom line = 4
  const E4_ABS = 30
  return 4 - (absPos - E4_ABS) * 0.5
}

// Convert score duration format to VexFlow format: 'h.' → 'hd'
export function scoreDurationToVex(dur) {
  if (dur && dur.endsWith('.')) return dur.slice(0, -1) + 'd'
  return dur
}

// ── Private render helpers ────────────────────────────────────────────────────

function buildStaveNote(note, style) {
  const midiNums = Array.isArray(note.midi) ? note.midi : [note.midi]
  const keys = midiNums.map(midiToVexKey)
  const sn = new StaveNote({ keys, duration: scoreDurationToVex(note.duration), clef: 'treble' })

  midiNums.forEach((m, i) => {
    if (hasAccidental(m)) sn.addModifier(new Accidental('#'), i)
  })

  if (style && (style.fillStyle || style.strokeStyle)) {
    sn.setStyle(style)
    sn.setStemStyle(style)
  }
  return sn
}

function noteStyle(i, noteIdx, lookahead, wrongNoteIdx) {
  if (i === wrongNoteIdx) return { fillStyle: '#e53935', strokeStyle: '#e53935' }
  if (i === noteIdx) return { fillStyle: '#1976d2', strokeStyle: '#1976d2' }
  if (noteIdx >= 0 && i > noteIdx && i <= noteIdx + lookahead) {
    return { fillStyle: 'rgba(0,0,0,0.3)', strokeStyle: 'rgba(0,0,0,0.3)' }
  }
  return null
}

// Draw ghost note heads for pressed MIDI notes at the x-position of the
// current note on the given stave.
function drawGhostNotes(svgEl, stave, currentNoteX, pressedNotes) {
  if (!svgEl || !pressedNotes || pressedNotes.size === 0) return
  const ns = 'http://www.w3.org/2000/svg'
  pressedNotes.forEach(midi => {
    const line = midiToStaveLine(midi)
    const y = stave.getYForLine(line)
    const circle = document.createElementNS(ns, 'circle')
    circle.setAttribute('cx', currentNoteX)
    circle.setAttribute('cy', y)
    circle.setAttribute('r', 5.5)
    circle.setAttribute('fill', 'rgba(25,118,210,0.35)')
    circle.setAttribute('stroke', 'rgba(25,118,210,0.7)')
    circle.setAttribute('stroke-width', '1.5')
    svgEl.appendChild(circle)
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Render a single measure into `container` using VexFlow SVG backend.
 *
 * options:
 *   width          — container width in px (default 300)
 *   height         — container height in px (default 150)
 *   clef           — 'treble' | 'bass' (default 'treble')
 *   timeSignature  — [beats, beatValue] (default [4,4])
 *   showClef       — draw clef symbol (default true)
 *   showTime       — draw time signature (default false)
 *   cursor         — { noteIdx, lookahead=2, wrongNoteIdx=-1, pressedNotes=Set }
 */
export function renderMeasure(container, measure, options = {}) {
  const {
    width = 300,
    height = 150,
    clef = 'treble',
    timeSignature = [4, 4],
    showClef = true,
    showTime = false,
    cursor = {},
  } = options

  container.innerHTML = ''
  const renderer = new Renderer(container, Renderer.Backends.SVG)
  renderer.resize(width, height)
  const ctx = renderer.getContext()

  const staveX = showClef ? 55 : 10
  const staveWidth = width - staveX - 10
  const stave = new Stave(staveX, 30, staveWidth)
  if (showClef) stave.addClef(clef)
  if (showTime && timeSignature) stave.addTimeSignature(`${timeSignature[0]}/${timeSignature[1]}`)
  stave.setContext(ctx).draw()

  const { noteIdx = -1, lookahead = 2, wrongNoteIdx = -1, pressedNotes = new Set() } = cursor

  const staveNotes = measure.notes.map((note, i) =>
    buildStaveNote(note, noteStyle(i, noteIdx, lookahead, wrongNoteIdx))
  )

  const voice = new Voice({ numBeats: timeSignature[0], beatValue: timeSignature[1] })
  voice.setMode(Voice.Mode.SOFT)
  voice.addTickables(staveNotes)
  new Formatter().joinVoices([voice]).format([voice], staveWidth - 20)
  voice.draw(ctx, stave)

  // Ghost overlay: pressed notes shown at current note's x position
  if (pressedNotes.size > 0 && noteIdx >= 0 && noteIdx < staveNotes.length) {
    const x = staveNotes[noteIdx].getAbsoluteX()
    drawGhostNotes(container.querySelector('svg'), stave, x, pressedNotes)
  }
}

/**
 * Render a full phrase (multiple measures in a row) into `container`.
 *
 * cursor: { measureIdx=0, noteIdx=-1, lookahead=2, wrongNoteIdx=-1, pressedNotes=Set }
 * score: used for timeSignature; falls back to [4,4] if omitted.
 */
export function renderPhrase(container, phrase, cursor = {}, score = null) {
  const {
    measureIdx = 0,
    noteIdx = -1,
    lookahead = 2,
    wrongNoteIdx = -1,
    pressedNotes = new Set(),
  } = cursor

  const ts = score?.timeSignature ?? [4, 4]
  const measuresPerRow = 4
  const measureWidth = 220
  const firstMeasureExtra = 50   // room for clef
  const rowHeight = 160
  const totalMeasures = phrase.measures.length
  const totalRows = Math.ceil(totalMeasures / measuresPerRow)
  const totalWidth = firstMeasureExtra + measureWidth * Math.min(totalMeasures, measuresPerRow) + 20
  const totalHeight = rowHeight * totalRows + 20

  container.innerHTML = ''
  const renderer = new Renderer(container, Renderer.Backends.SVG)
  renderer.resize(totalWidth, totalHeight)
  const ctx = renderer.getContext()

  phrase.measures.forEach((measure, mIdx) => {
    const row = Math.floor(mIdx / measuresPerRow)
    const col = mIdx % measuresPerRow
    const isFirstInRow = col === 0
    const x = isFirstInRow
      ? 10
      : 10 + firstMeasureExtra + col * measureWidth
    const y = row * rowHeight + 10
    const staveWidth = isFirstInRow ? measureWidth + firstMeasureExtra : measureWidth

    const stave = new Stave(x, y, staveWidth)
    if (isFirstInRow) stave.addClef('treble')
    stave.setContext(ctx).draw()

    const isCurrent = mIdx === measureIdx
    const staveNotes = measure.notes.map((note, i) =>
      buildStaveNote(
        note,
        isCurrent ? noteStyle(i, noteIdx, lookahead, wrongNoteIdx) : null
      )
    )

    const voice = new Voice({ numBeats: ts[0], beatValue: ts[1] })
    voice.setMode(Voice.Mode.SOFT)
    voice.addTickables(staveNotes)
    new Formatter().joinVoices([voice]).format([voice], staveWidth - 20)
    voice.draw(ctx, stave)

    // Ghost overlay for current measure's current note
    if (isCurrent && pressedNotes.size > 0 && noteIdx >= 0 && noteIdx < staveNotes.length) {
      const nx = staveNotes[noteIdx].getAbsoluteX()
      drawGhostNotes(container.querySelector('svg'), stave, nx, pressedNotes)
    }
  })
}
