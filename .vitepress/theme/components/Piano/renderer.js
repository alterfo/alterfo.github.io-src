// ── VexFlow renderer for Piano teacher ────────────────────────────────────────
// renderMeasure / renderPhrase are browser-only (VexFlow needs a DOM).
// Pure helpers (midiToVexKey, midiToStaveLine, scoreDurationToVex) are tested.
import { Renderer, Stave, StaveNote, StaveConnector, GhostNote, Voice, Formatter, Accidental } from 'vexflow'

const BASS_STAVE_GAP = 65  // px from treble stave Y to bass stave Y in grand staff

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

// Convert score key to VexFlow key spec string, e.g. { root:'D', mode:'major' } → 'D',
// { root:'B', mode:'minor' } → 'Bm'.  Fallback: 'C'.
function scoreKeyToVexSpec(key) {
  if (!key?.root) return 'C'
  return key.mode === 'minor' ? `${key.root}m` : key.root
}

function buildStaveNote(note, style, clef = 'treble') {
  const midiNums = Array.isArray(note.midi) ? note.midi : [note.midi]
  const keys = midiNums.map(midiToVexKey)
  const sn = new StaveNote({ keys, duration: scoreDurationToVex(note.duration), clef })
  // Accidentals are NOT added here — Accidental.applyAccidentals() handles them
  // automatically per key signature after voices are built.
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
    return { fillStyle: 'rgba(200,200,200,0.25)', strokeStyle: 'rgba(200,200,200,0.25)' }
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

// MIDI → bass clef staff line number for VexFlow's getYForLine()
// Line 0 = top line (A3), line 4 = bottom line (G2); fractional = space.
// Bass clef lines from top: A3(57), F3(53), D3(50), B2(47), G2(43)
export function midiToBassStaveLine(midi) {
  const pc = midi % 12
  const octave = Math.floor(midi / 12) - 1
  const diatonic = PITCH_TO_DIATONIC[pc]
  const absPos = octave * 7 + diatonic
  // G2 (midi 43): octave=2, diatonic=4, absPos=18 → bottom line = 4
  const G2_ABS = 18
  return 4 - (absPos - G2_ABS) * 0.5
}

// Render one measure for grand staff — called by renderPhrase when grandStaff=true.
// Returns { trebleStave, bassStave, trebleStaveNotes, bassStaveNotes }
function renderGrandMeasure(ctx, svgEl, measure, x, yTreble, options) {
  const {
    width,
    showClef = false,
    showTime = false,
    timeSignature = [4, 4],
    key = null,
    cursor = {},
    isCurrent = false,
  } = options
  const { noteIdx = -1, lookahead = 2, wrongNoteIdx = -1, pressedNotes = new Set() } = cursor
  const keySpec = scoreKeyToVexSpec(key)

  const yBass = yTreble + BASS_STAVE_GAP

  const trebleStave = new Stave(x, yTreble, width)
  const bassStave   = new Stave(x, yBass,   width)
  if (showClef) {
    trebleStave.addClef('treble').addKeySignature(keySpec)
    bassStave.addClef('bass').addKeySignature(keySpec)
  }
  if (showTime && timeSignature) {
    const tsSig = `${timeSignature[0]}/${timeSignature[1]}`
    trebleStave.addTimeSignature(tsSig)
    bassStave.addTimeSignature(tsSig)
  }
  trebleStave.setContext(ctx).draw()
  bassStave.setContext(ctx).draw()

  if (showClef) {
    new StaveConnector(trebleStave, bassStave)
      .setType(StaveConnector.type.BRACE)
      .setContext(ctx).draw()
    new StaveConnector(trebleStave, bassStave)
      .setType(StaveConnector.type.SINGLE_LEFT)
      .setContext(ctx).draw()
  }

  const rightNotes = measure.notes.filter(n => n.hand !== 'left')
  const leftNotes  = measure.notes.filter(n => n.hand === 'left')

  // Map the flat measure noteIdx to per-voice indices so each stave highlights correctly.
  const trebleNoteIdx  = isCurrent ? voiceNoteIdx(measure.notes, noteIdx, false) : -1
  const bassNoteIdx    = isCurrent ? voiceNoteIdx(measure.notes, noteIdx, true) : -1
  const trebleWrongIdx = isCurrent ? voiceNoteIdx(measure.notes, wrongNoteIdx, false) : -1
  const bassWrongIdx   = isCurrent ? voiceNoteIdx(measure.notes, wrongNoteIdx, true) : -1

  // If no right-hand notes (e.g. an imported bar where the treble rests), pad the
  // treble voice with a whole-measure ghost note so VexFlow doesn't throw on an empty voice
  const trebleStaveNotes = rightNotes.length > 0
    ? rightNotes.map((note, i) =>
        buildStaveNote(note, isCurrent ? noteStyle(i, trebleNoteIdx, lookahead, trebleWrongIdx) : null, 'treble')
      )
    : [new GhostNote({ duration: timeSignature[1] === 8 ? '8' : 'w' })]

  // If no left-hand notes, pad bass voice with a whole-measure ghost note so VexFlow doesn't throw
  const bassStaveNotes = leftNotes.length > 0
    ? leftNotes.map((note, i) =>
        buildStaveNote(note, isCurrent ? noteStyle(i, bassNoteIdx, lookahead, bassWrongIdx) : null, 'bass')
      )
    : [new GhostNote({ duration: timeSignature[1] === 8 ? '8' : 'w' })]

  const trebleVoice = new Voice({ numBeats: timeSignature[0], beatValue: timeSignature[1] })
  trebleVoice.setMode(Voice.Mode.SOFT)
  trebleVoice.addTickables(trebleStaveNotes)

  const bassVoice = new Voice({ numBeats: timeSignature[0], beatValue: timeSignature[1] })
  bassVoice.setMode(Voice.Mode.SOFT)
  bassVoice.addTickables(bassStaveNotes)

  // Let VexFlow decide which accidentals to show given the key signature.
  // This suppresses redundant sharps (e.g. F# / C# already in D major key sig)
  // and adds naturals for chromatically altered notes.
  Accidental.applyAccidentals([trebleVoice, bassVoice], keySpec)

  new Formatter()
    .joinVoices([trebleVoice])
    .joinVoices([bassVoice])
    .format([trebleVoice, bassVoice], width - 30)

  trebleVoice.draw(ctx, trebleStave)
  bassVoice.draw(ctx, bassStave)

  // Ghost notes: treble for midi >= 60, bass for midi < 60
  // Use either stave's current note x as fallback so ghost notes always appear
  // even when the cursor is on the opposite voice.
  if (isCurrent && pressedNotes.size > 0) {
    const treblePressed = new Set([...pressedNotes].filter(m => m >= 60))
    const bassPressed   = new Set([...pressedNotes].filter(m => m < 60))
    const currentTrebleNote = trebleNoteIdx >= 0 ? trebleStaveNotes[trebleNoteIdx] : null
    const currentBassNote   = bassNoteIdx >= 0 ? bassStaveNotes[bassNoteIdx] : null
    const noteX = (currentTrebleNote ?? currentBassNote)?.getAbsoluteX()
    if (noteX !== undefined) {
      if (treblePressed.size > 0) drawGhostNotes(svgEl, trebleStave, noteX, treblePressed)
      if (bassPressed.size > 0) drawGhostNotesBass(svgEl, bassStave, noteX, bassPressed)
    }
  }

  return { trebleStave, bassStave, trebleStaveNotes, bassStaveNotes }
}

// Draw ghost note heads for pressed MIDI notes on bass stave.
function drawGhostNotesBass(svgEl, stave, currentNoteX, pressedNotes) {
  if (!svgEl || !pressedNotes || pressedNotes.size === 0) return
  const ns = 'http://www.w3.org/2000/svg'
  pressedNotes.forEach(midi => {
    const line = midiToBassStaveLine(midi)
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

// Map a flat measure noteIdx (over all notes) to an index within a single voice.
// Returns -1 if the note at flatIdx belongs to the other voice or flatIdx is out of range.
export function voiceNoteIdx(notes, flatIdx, isLeft) {
  if (flatIdx < 0 || flatIdx >= notes.length) return -1
  const targetIsLeft = notes[flatIdx].hand === 'left'
  if (isLeft !== targetIsLeft) return -1
  return notes.slice(0, flatIdx).filter(n => (n.hand === 'left') === isLeft).length
}

// ── Grand staff helper ────────────────────────────────────────────────────────

export function hasLeftHand(phrase) {
  return phrase.measures.some(m => m.notes.some(n => n.hand === 'left'))
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
  const grandStaff = hasLeftHand(phrase)
  const measuresPerRow = 4
  const measureWidth = 220
  const firstMeasureExtra = 50   // room for clef
  const singleRowHeight = 160
  const rowHeight = grandStaff ? singleRowHeight + BASS_STAVE_GAP + 20 : singleRowHeight
  const totalMeasures = phrase.measures.length
  const totalRows = Math.ceil(totalMeasures / measuresPerRow)
  const totalWidth = firstMeasureExtra + measureWidth * Math.min(totalMeasures, measuresPerRow) + 20
  const totalHeight = rowHeight * totalRows + 20

  container.innerHTML = ''
  const renderer = new Renderer(container, Renderer.Backends.SVG)
  renderer.resize(totalWidth, totalHeight)
  const ctx = renderer.getContext()
  const svgEl = container.querySelector('svg')

  phrase.measures.forEach((measure, mIdx) => {
    const row = Math.floor(mIdx / measuresPerRow)
    const col = mIdx % measuresPerRow
    const isFirstInRow = col === 0
    const x = isFirstInRow
      ? 10
      : 10 + firstMeasureExtra + col * measureWidth
    const y = row * rowHeight + 10
    const staveWidth = isFirstInRow ? measureWidth + firstMeasureExtra : measureWidth
    const isCurrent = mIdx === measureIdx

    const keySpec = scoreKeyToVexSpec(score?.key)

    if (grandStaff) {
      renderGrandMeasure(ctx, svgEl, measure, x, y, {
        width: staveWidth,
        showClef: isFirstInRow,
        showTime: false,
        timeSignature: ts,
        key: score?.key ?? null,
        cursor: { noteIdx: isCurrent ? noteIdx : -1, lookahead, wrongNoteIdx: isCurrent ? wrongNoteIdx : -1, pressedNotes: isCurrent ? pressedNotes : new Set() },
        isCurrent,
      })
      return
    }

    const stave = new Stave(x, y, staveWidth)
    if (isFirstInRow) {
      stave.addClef('treble')
      if (keySpec !== 'C') stave.addKeySignature(keySpec)
    }
    stave.setContext(ctx).draw()

    const staveNotes = measure.notes.map((note, i) =>
      buildStaveNote(
        note,
        isCurrent ? noteStyle(i, noteIdx, lookahead, wrongNoteIdx) : null
      )
    )

    const voice = new Voice({ numBeats: ts[0], beatValue: ts[1] })
    voice.setMode(Voice.Mode.SOFT)
    voice.addTickables(staveNotes)
    Accidental.applyAccidentals([voice], keySpec)
    new Formatter().joinVoices([voice]).format([voice], staveWidth - 20)
    voice.draw(ctx, stave)

    // Ghost overlay for current measure's current note
    if (isCurrent && pressedNotes.size > 0 && noteIdx >= 0 && noteIdx < staveNotes.length) {
      const nx = staveNotes[noteIdx].getAbsoluteX()
      drawGhostNotes(svgEl, stave, nx, pressedNotes)
    }
  })
}
