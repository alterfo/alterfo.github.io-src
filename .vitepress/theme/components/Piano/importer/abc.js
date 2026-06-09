// ── ABC notation importer ─────────────────────────────────────────────────────
// parseABC(abcString) → Score (see Piano/score.js for the shape).
//
// A small, self-contained subset parser for the ABC tunes a user types directly
// into the browser. It is dependency-free so the same code runs unchanged under
// `node --test`. Supported:
//   header fields  X T C M L Q K     (others are ignored)
//   single notes   ^_= accidentals, A-G/a-g, ,' octave marks, n//n durations
//   chords         [CEG]  — bracketed simultaneous notes, duration after ]
//   barlines       |  ||  |]  [|  :|  |:  (split into measures, phrases of 4)
//   rests          z Z x  (dropped, like <rest> in MusicXML)
//   lyrics         w:  (syllables split on '-' / space → note.lyric)
//
// Out of scope (silently skipped): voices, grace notes, tuplets, ties, slurs,
// broken rhythm, chord symbols in quotes, key-signature accidentals (only
// explicit ^_= alter a pitch — F in K:D stays F natural unless written ^F).

import { DURATION_BEATS } from '../score.js'

// Uppercase letters sit in octave 4 (middle C = C4 = MIDI 60); lowercase add +12.
const ABC_BASE = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 }

function beatsToDurationCode(beats) {
  let best = 'q'
  let bestDiff = Infinity
  for (const [code, b] of Object.entries(DURATION_BEATS)) {
    const d = Math.abs(beats - b)
    if (d < bestDiff) { bestDiff = d; best = code }
  }
  return best
}

// ── Pitch + duration scanning ─────────────────────────────────────────────────

// Read a single note starting at index i (accidentals → letter → octave marks).
// Returns { midi, nextIndex } or null when there is no note letter here.
function parseNote(str, i) {
  let alter = 0
  while (i < str.length && (str[i] === '^' || str[i] === '_' || str[i] === '=')) {
    if (str[i] === '^') alter += 1
    else if (str[i] === '_') alter -= 1
    else alter = 0 // '=' natural overrides
    i++
  }
  const ch = str[i]
  if (!ch || !/[A-Ga-g]/.test(ch)) return null
  let midi = ABC_BASE[ch.toUpperCase()]
  if (ch >= 'a' && ch <= 'g') midi += 12
  midi += alter
  i++
  while (i < str.length && (str[i] === ',' || str[i] === "'")) {
    midi += str[i] === ',' ? -12 : 12
    i++
  }
  return { midi, nextIndex: i }
}

// Read a duration suffix: <num>?(/<den>?)* → length multiplier of the unit note.
//   2 → ×2 · / → ÷2 · /2 → ÷2 · // → ÷4 · 3/2 → ×1.5
function parseDuration(str, i) {
  let numStr = ''
  while (i < str.length && /[0-9]/.test(str[i])) { numStr += str[i]; i++ }
  let slashes = 0
  while (i < str.length && str[i] === '/') { slashes++; i++ }
  let denStr = ''
  while (i < str.length && /[0-9]/.test(str[i])) { denStr += str[i]; i++ }
  const num = numStr ? parseInt(numStr, 10) : 1
  let den = 1
  if (slashes > 0) den = denStr ? parseInt(denStr, 10) : 2 ** slashes
  return { mult: num / den, nextIndex: i }
}

// Read a chord [..] starting at '['. Each inner note uses the single-note parser;
// the duration after ']' applies to the whole chord.
function parseChord(str, i, unitBeats) {
  let j = i + 1
  const midis = []
  while (j < str.length && str[j] !== ']') {
    if (str[j] === ' ') { j++; continue }
    const n = parseNote(str, j)
    if (n) {
      midis.push(n.midi)
      j = parseDuration(str, n.nextIndex).nextIndex // ignore per-note length inside chord
    } else {
      j++
    }
  }
  if (j >= str.length || !midis.length) return null
  j++ // skip ']'
  const dur = parseDuration(str, j)
  return {
    note: { midi: midis, duration: beatsToDurationCode(dur.mult * unitBeats), hand: 'right' },
    nextIndex: dur.nextIndex,
  }
}

// Parse one music line into the measure sink; return the notes it produced
// (in order) so a following w: lyric line can be aligned to them.
function parseMusicLine(line, unitBeats, sink) {
  const notes = []
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    if (ch === '%') break // comment to end of line
    if (ch === ' ' || ch === '\t') { i++; continue }
    if (ch === '|') {
      i++
      while (i < line.length && (line[i] === '|' || line[i] === ']' || line[i] === ':')) i++
      sink.bar()
      continue
    }
    if (ch === ':') {
      i++
      while (i < line.length && (line[i] === '|' || line[i] === ':')) i++
      sink.bar()
      continue
    }
    if (ch === '"') { // chord-symbol / annotation in quotes
      i++
      while (i < line.length && line[i] !== '"') i++
      i++
      continue
    }
    if (ch === '[') {
      if (/^\[[A-Za-z]:/.test(line.slice(i))) { // inline field [K:D]
        const end = line.indexOf(']', i)
        i = end === -1 ? line.length : end + 1
        continue
      }
      if (line[i + 1] === '|') { i += 2; sink.bar(); continue } // [| barline
      const res = parseChord(line, i, unitBeats)
      if (res) { sink.pushNote(res.note); notes.push(res.note); i = res.nextIndex; continue }
      i++
      continue
    }
    if (ch === 'z' || ch === 'Z' || ch === 'x') { // rest — dropped
      i = parseDuration(line, i + 1).nextIndex
      continue
    }
    if (/[\^_=A-Ga-g]/.test(ch)) {
      const n = parseNote(line, i)
      if (n) {
        const dur = parseDuration(line, n.nextIndex)
        const note = { midi: n.midi, duration: beatsToDurationCode(dur.mult * unitBeats), hand: 'right' }
        sink.pushNote(note)
        notes.push(note)
        i = dur.nextIndex
        continue
      }
    }
    i++ // ties, slurs, broken rhythm, tuplet markers, etc.
  }
  return notes
}

// ── Header semantics ──────────────────────────────────────────────────────────

function parseMeter(m) {
  if (!m) return [4, 4]
  if (m === 'C') return [4, 4]
  if (m === 'C|') return [2, 2]
  const parts = m.split('/')
  if (parts.length === 2) return [parseInt(parts[0], 10) || 4, parseInt(parts[1], 10) || 4]
  return [4, 4]
}

function unitBeatsFrom(headers, meter) {
  if (headers.L) {
    const [n, d] = headers.L.split('/').map(s => parseInt(s, 10))
    if (n && d) return (n / d) * 4
  }
  // ABC default: meter < 0.75 → 1/16, else 1/8
  const ratio = meter[0] / meter[1]
  return (ratio < 0.75 ? 1 / 16 : 1 / 8) * 4
}

function parseTempo(q) {
  if (!q) return 120
  const part = q.includes('=') ? q.split('=').pop() : q
  return parseInt(part.replace(/[^0-9]/g, ''), 10) || 120
}

function parseKey(k) {
  if (!k) return { root: 'C', mode: 'major' }
  const m = /^([A-Ga-g])([#b]?)\s*(\w*)/.exec(k.trim())
  if (!m) return { root: 'C', mode: 'major' }
  const root = m[1].toUpperCase() + (m[2] || '')
  const modeStr = (m[3] || '').toLowerCase()
  const isMinor = (modeStr.startsWith('m') && !modeStr.startsWith('maj')) || modeStr.startsWith('aeo')
  return { root, mode: isMinor ? 'minor' : 'major' }
}

function assignLyrics(text, notes) {
  const sylls = text.split(/[-\s|]+/).filter(s => s && s !== '*')
  for (let k = 0; k < sylls.length && k < notes.length; k++) {
    notes[k].lyric = sylls[k].replace(/_$/, '')
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

export function parseABC(abcString) {
  const lines = String(abcString).split(/\r?\n/)

  // Pass 1: collect header fields (first occurrence wins) regardless of position.
  const headers = {}
  for (const raw of lines) {
    const m = /^([A-Za-z]):(.*)$/.exec(raw.trim())
    if (m && 'XTCMLQK'.includes(m[1]) && !(m[1] in headers)) headers[m[1]] = m[2].trim()
  }
  const meter = parseMeter(headers.M)
  const unitBeats = unitBeatsFrom(headers, meter)

  // Pass 2: walk body lines, building measures and attaching lyrics.
  const measures = []
  let current = []
  const sink = {
    pushNote(n) { current.push(n) },
    bar() { if (current.length) { measures.push(current); current = [] } },
  }
  let lastLineNotes = []
  for (const raw of lines) {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('%')) continue
    const info = /^([A-Za-z]):(.*)$/.exec(trimmed)
    if (info) {
      if (info[1] === 'w') assignLyrics(info[2], lastLineNotes)
      continue // header / info / words lines are not music
    }
    lastLineNotes = parseMusicLine(trimmed, unitBeats, sink)
  }
  if (current.length) measures.push(current)

  if (!measures.length) throw new Error('ABC: ноты не найдены')

  // Group measures into phrases of 4.
  const phrases = []
  const PER_PHRASE = 4
  for (let i = 0; i < measures.length; i += PER_PHRASE) {
    phrases.push({
      id: `p${phrases.length + 1}`,
      measures: measures.slice(i, i + PER_PHRASE).map((notes, j) => ({ id: `m${i + j + 1}`, notes })),
    })
  }

  return {
    id: `user-${Date.now()}`,
    title: headers.T || 'Импортированная пьеса',
    composer: headers.C || '',
    tempo: parseTempo(headers.Q),
    key: parseKey(headers.K),
    timeSignature: meter,
    modulations: [],
    phrases,
    userImported: true,
  }
}
