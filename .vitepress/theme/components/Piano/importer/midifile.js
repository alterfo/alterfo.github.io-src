// ── MIDI file importer ────────────────────────────────────────────────────────
// parseMIDIFile(arrayBuffer, options) → { score, needsTimeSig, detectedTs }
//
// Wraps @tonejs/midi (npm, no CDN) to turn a Standard MIDI File into the same
// Score shape the MusicXML / ABC importers produce. The conversion itself lives
// in the pure, dependency-free buildScoreFromMidi(midi, options) so it can be
// unit-tested with a synthetic mock Midi object under `node --test` — no need to
// hand-assemble a binary .mid.
//
// MIDI files frequently omit a time signature (or carry a meaningless default).
// We therefore never silently assume 4/4: detectedTs reports what the file had
// (or null), and needsTimeSig tells Piano.vue to prompt the user for a meter.
// When the file has no meter we still split bars on a 4/4 fallback so a preview
// is possible; the caller re-parses with options.timeSignature once chosen.
//
// Scope (YAGNI): two hands at most — a track named right/treble/soprano → RH,
// left/bass/alto → LH, otherwise track 0 = RH and track 1 = LH; extra tracks,
// rests, articulations, and pedal events are ignored.

import { DURATION_BEATS } from '../score.js'

// @tonejs/midi ships a CommonJS-ish build: under Vite the namespace exposes
// `Midi` directly, under node `--test` it lands on `default.Midi`. Resolve both.
import * as TonejsMidi from '@tonejs/midi'
const Midi = TonejsMidi.Midi ?? TonejsMidi.default?.Midi ?? TonejsMidi.default

function beatsToDurationCode(beats) {
  let best = 'q'
  let bestDiff = Infinity
  for (const [code, b] of Object.entries(DURATION_BEATS)) {
    const d = Math.abs(beats - b)
    if (d < bestDiff) { bestDiff = d; best = code }
  }
  return best
}

// durationTicks → nearest VexFlow duration code (beats counted in quarter notes).
function ticksToDuration(ticks, ppq) {
  return beatsToDurationCode(ppq ? ticks / ppq : 1)
}

// Pick the two hands. tracks are already filtered to non-empty ones.
function assignHands(tracks) {
  const named = re => tracks.find(t => re.test((t.name || '').toLowerCase()))
  let right = named(/right|treble|soprano/)
  let left = named(/left|bass|alto/)
  if (!right && !left) {
    right = tracks[0]
    left = tracks[1] // undefined for a single-track file → everything stays RH
  } else {
    if (!right) right = tracks.find(t => t !== left)
    if (!left) left = tracks.find(t => t !== right)
  }
  return { right, left }
}

function keyFromMidi(midi) {
  const ks = midi.header?.keySignatures?.[0]
  if (!ks || !ks.key) return { root: 'C', mode: 'major' }
  return { root: ks.key, mode: ks.scale === 'minor' ? 'minor' : 'major' }
}

// Pure converter: Midi-like object → { score, needsTimeSig, detectedTs }.
export function buildScoreFromMidi(midi, options = {}) {
  const header = midi.header || {}
  const ppq = header.ppq || 480

  const detectedTs = header.timeSignatures?.[0]?.timeSignature ?? null
  const overridden = Array.isArray(options.timeSignature)
  const needsTimeSig = overridden ? false : !(header.timeSignatures?.length)
  const ts = overridden ? options.timeSignature : (detectedTs ?? [4, 4])

  const [num, den] = ts
  const ticksPerBeat = ppq * (4 / den)
  const ticksPerMeasure = ticksPerBeat * num

  const tracks = (midi.tracks || []).filter(t => t.notes && t.notes.length > 0)
  const { right, left } = assignHands(tracks)

  // Flatten to hand-tagged note events.
  const events = []
  if (right) for (const n of right.notes) events.push({ midi: n.midi, ticks: n.ticks, durationTicks: n.durationTicks, hand: 'right' })
  if (left && left !== right) for (const n of left.notes) events.push({ midi: n.midi, ticks: n.ticks, durationTicks: n.durationTicks, hand: 'left' })

  // Group simultaneous same-hand notes (identical ticks) into chords.
  const groups = new Map() // key → { measureIdx, ticks, hand, midis, durationTicks }
  for (const ev of events) {
    const measureIdx = Math.floor(ev.ticks / ticksPerMeasure)
    const key = `${measureIdx}:${ev.hand}:${ev.ticks}`
    let g = groups.get(key)
    if (!g) { g = { measureIdx, ticks: ev.ticks, hand: ev.hand, midis: [], durationTicks: ev.durationTicks }; groups.set(key, g) }
    g.midis.push(ev.midi)
    g.durationTicks = Math.max(g.durationTicks, ev.durationTicks)
  }

  // Bucket groups by measure, ordered by measure index then onset.
  const byMeasure = new Map()
  for (const g of groups.values()) {
    if (!byMeasure.has(g.measureIdx)) byMeasure.set(g.measureIdx, [])
    byMeasure.get(g.measureIdx).push(g)
  }
  const measures = [...byMeasure.keys()].sort((a, b) => a - b).map(idx => {
    const gs = byMeasure.get(idx).sort((a, b) => a.ticks - b.ticks || a.hand.localeCompare(b.hand))
    return gs.map(g => {
      const midis = g.midis.slice().sort((a, b) => a - b)
      return {
        midi: midis.length === 1 ? midis[0] : midis,
        duration: ticksToDuration(g.durationTicks, ppq),
        hand: g.hand,
      }
    })
  })

  if (!measures.length) throw new Error('MIDI: ноты не найдены')

  // Group measures into phrases of 4.
  const phrases = []
  const PER_PHRASE = 4
  for (let i = 0; i < measures.length; i += PER_PHRASE) {
    phrases.push({
      id: `p${phrases.length + 1}`,
      measures: measures.slice(i, i + PER_PHRASE).map((notes, j) => ({ id: `m${i + j + 1}`, notes })),
    })
  }

  const score = {
    id: `user-${Date.now()}`,
    title: header.name || 'Импортированная пьеса',
    composer: '',
    tempo: Math.round(header.tempos?.[0]?.bpm ?? 120),
    key: keyFromMidi(midi),
    timeSignature: ts,
    modulations: [],
    phrases,
    userImported: true,
  }

  return { score, needsTimeSig, detectedTs }
}

// Public entry point: parse a raw .mid ArrayBuffer.
export function parseMIDIFile(arrayBuffer, options = {}) {
  const midi = new Midi(arrayBuffer)
  return buildScoreFromMidi(midi, options)
}
