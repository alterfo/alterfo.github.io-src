// Piano/musicxml.js — converts Score phrase to MusicXML for OSMD rendering.
// Pure functions; no DOM, no Vue. Tested in renderer.test.mjs.
import { getActiveKey } from './score.js'

// 12 units per quarter note (not 4) so a triplet eighth has an integer duration
// (quarter=12 → triplet eighth = 12/3 = 4). All other durations stay integers too.
const DIVISIONS = 12

// tuplet: [actualNotes, normalNotes] → emits a <time-modification> (e.g. triplet = 3 in 2).
const DURATION_MAP = {
  w:    { div: 48, type: 'whole',   dot: false },
  h:    { div: 24, type: 'half',    dot: false },
  'h.': { div: 36, type: 'half',    dot: true  },
  q:    { div: 12, type: 'quarter', dot: false },
  'q.': { div: 18, type: 'quarter', dot: true  },
  '8':  { div: 6,  type: 'eighth',  dot: false },
  '8.': { div: 9,  type: 'eighth',  dot: true  },
  '16': { div: 3,  type: '16th',    dot: false },
  '8t': { div: 4,  type: 'eighth',  dot: false, tuplet: [3, 2] },
}

const FALLBACK_DUR = { div: 12, type: 'quarter', dot: false }

export const FIFTHS_MAP = {
  Cb: -7, Gb: -6, Db: -5, Ab: -4, Eb: -3, Bb: -2, F: -1,
  C: 0,
  G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7,
}

// Enharmonic spellings. Sharp keys (fifths >= 0) prefer sharps; flat keys prefer flats.
const SHARP_SPELL = [
  ['C',0],['C',1],['D',0],['D',1],['E',0],['F',0],
  ['F',1],['G',0],['G',1],['A',0],['A',1],['B',0],
]
const FLAT_SPELL = [
  ['C',0],['D',-1],['D',0],['E',-1],['E',0],['F',0],
  ['G',-1],['G',0],['A',-1],['A',0],['B',-1],['B',0],
]

export function midiPitchXML(midi, fifths = 0) {
  const pc = midi % 12
  const octave = Math.floor(midi / 12) - 1
  const [step, alter] = (fifths >= 0 ? SHARP_SPELL : FLAT_SPELL)[pc]
  const alterXML = alter !== 0 ? `<alter>${alter}</alter>` : ''
  return `<pitch><step>${step}</step>${alterXML}<octave>${octave}</octave></pitch>`
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Build a MusicXML <lyric> for a note's syllable.
// Convention: a trailing '-' marks a syllable that hyphenates to the next one
// (syllabic=begin → OSMD draws a hyphen); a plain word is a standalone (single).
export function lyricXML(lyric) {
  if (!lyric) return ''
  const hyphenated = /-\s*$/.test(lyric)
  const text = lyric.replace(/-\s*$/, '')
  const syllabic = hyphenated ? 'begin' : 'single'
  return `<lyric number="1"><syllabic>${syllabic}</syllabic><text>${xmlEscape(text)}</text></lyric>`
}

// cursor.noteIdx / cursor.measureIdx are 0-based within the phrase / within the measure.
function noteColor(mIdx, nIdx, cursor) {
  const { measureIdx = -1, noteIdx = -1, lookahead = 0, wrongNoteIdx = -1 } = cursor
  if (mIdx !== measureIdx) return ''
  if (nIdx === wrongNoteIdx) return '#e53935'
  if (nIdx === noteIdx) return '#1976d2'
  if (noteIdx >= 0 && nIdx > noteIdx && nIdx <= noteIdx + lookahead) return '#888888'
  return ''
}

function noteXML(note, voice, staff, color, prependChord, fifths) {
  const { div, type, dot, tuplet } = DURATION_MAP[note.duration] ?? FALLBACK_DUR
  const colorAttr = color ? ` color="${color}"` : ''
  const dotXML = dot ? '<dot/>' : ''
  // <time-modification> must precede <notehead>/<staff> in the MusicXML note order.
  const timeModXML = tuplet
    ? `<time-modification><actual-notes>${tuplet[0]}</actual-notes><normal-notes>${tuplet[1]}</normal-notes></time-modification>`
    : ''
  // OSMD reads notehead color from <notehead color="..."> not from the <note color="..."> attribute
  const noteheadXML = color ? `<notehead color="${color}">normal</notehead>` : ''

  // Rest: a single <note> with <rest/> in place of a pitch (no chord tones, no notehead).
  if (note.rest) {
    return `<note${colorAttr}><rest/><duration>${div}</duration><voice>${voice}</voice><type>${type}</type>${dotXML}${timeModXML}<staff>${staff}</staff>${lyricXML(note.lyric)}</note>`
  }

  // Lyric attaches to the principal note only — never duplicated on chord tones.
  const lyric = lyricXML(note.lyric)
  const midis = Array.isArray(note.midi) ? note.midi : [note.midi]
  return midis.map((m, idx) => {
    const chordXML = prependChord || idx > 0 ? '<chord/>' : ''
    const lyricForNote = idx === 0 ? lyric : ''
    return `<note${colorAttr}>${chordXML}${midiPitchXML(m, fifths)}<duration>${div}</duration><voice>${voice}</voice><type>${type}</type>${dotXML}${timeModXML}${noteheadXML}<staff>${staff}</staff>${lyricForNote}</note>`
  }).join('')
}

// Convert a single phrase to a complete MusicXML document.
// phraseIdx is the phrase's index in score.phrases (used for active-key lookup).
// cursor = { measureIdx, noteIdx, lookahead, wrongNoteIdx } — controls note coloring.
export function phraseToMusicXML(phrase, score, phraseIdx = 0, cursor = {}) {
  const ts = score?.timeSignature ?? [4, 4]
  const [beats, beatType] = ts
  const title = score?.title ?? ''
  const isGrand = phrase.measures.some(m => m.notes.some(n => n.hand === 'left'))

  let prevFifths = null
  let prevMode = null

  const measuresXML = phrase.measures.map((measure, mIdx) => {
    const activeKey = getActiveKey(score, phraseIdx, mIdx)
    const fifths = FIFTHS_MAP[activeKey?.root] ?? 0
    const mode = activeKey?.mode === 'minor' ? 'minor' : 'major'

    const isFirst = mIdx === 0
    const keyChanged = !isFirst && (fifths !== prevFifths || mode !== prevMode)
    prevFifths = fifths
    prevMode = mode

    let attrXML = ''
    if (isFirst) {
      const stavesXML = isGrand ? '<staves>2</staves>' : ''
      const clef2XML = isGrand ? '<clef number="2"><sign>F</sign><line>4</line></clef>' : ''
      attrXML = `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${fifths}</fifths><mode>${mode}</mode></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><clef number="1"><sign>G</sign><line>2</line></clef>${stavesXML}${clef2XML}</attributes>`
    } else if (keyChanged) {
      attrXML = `<attributes><key><fifths>${fifths}</fifths><mode>${mode}</mode></key></attributes>`
    }

    let rhXML = ''
    let lhXML = ''
    let rhTotalDiv = 0

    measure.notes.forEach((note, nIdx) => {
      const color = noteColor(mIdx, nIdx, cursor)
      const { div } = DURATION_MAP[note.duration] ?? FALLBACK_DUR
      if (note.hand === 'left') {
        lhXML += noteXML(note, 2, 2, color, false, fifths)
      } else {
        rhXML += noteXML(note, 1, 1, color, false, fifths)
        rhTotalDiv += div
      }
    })

    if (!isGrand) {
      return `<measure number="${mIdx + 1}">${attrXML}${rhXML}</measure>`
    }
    const backupXML = `<backup><duration>${rhTotalDiv}</duration></backup>`
    return `<measure number="${mIdx + 1}">${attrXML}${rhXML}${backupXML}${lhXML}</measure>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd"><score-partwise version="3.1"><work><work-title>${title}</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measuresXML}</part></score-partwise>`
}
