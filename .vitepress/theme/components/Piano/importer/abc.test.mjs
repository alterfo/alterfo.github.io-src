import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseABC } from './abc.js'

// A small tune exercising octaves, accidentals, durations, chords and lyrics.
const SAMPLE = `X:1
T:Test Tune
C:J.S.Bach
M:4/4
L:1/4
Q:1/4=120
K:D
|D, D d|^F G A B|[DF] [CEG]2|D2 D3/2 D/2 D|
w:do re mi-fa sol`

describe('Piano/importer/abc.js', () => {
  const score = parseABC(SAMPLE)
  const firstNotes = score.phrases[0].measures[0].notes

  it('parses header title, composer and tempo', () => {
    assert.equal(score.title, 'Test Tune')
    assert.equal(score.composer, 'J.S.Bach')
    assert.equal(score.tempo, 120)
  })

  it('parses time signature', () => {
    assert.deepEqual(score.timeSignature, [4, 4])
  })

  it('stamps userImported and a user- id', () => {
    assert.equal(score.userImported, true)
    assert.ok(score.id.startsWith('user-'))
  })

  it('converts K:D → D major', () => {
    assert.deepEqual(parseABC('X:1\nK:D\n|C|').key, { root: 'D', mode: 'major' })
  })

  it('converts K:Dm → D minor', () => {
    assert.deepEqual(parseABC('X:1\nK:Dm\n|C|').key, { root: 'D', mode: 'minor' })
  })

  it('converts K:Bb → Bb major', () => {
    assert.deepEqual(parseABC('X:1\nK:Bb\n|C|').key, { root: 'Bb', mode: 'major' })
  })

  it('maps octaves: D→62 (D4), d→74 (D5), D,→50 (D3)', () => {
    assert.equal(firstNotes[0].midi, 50) // D,
    assert.equal(firstNotes[1].midi, 62) // D
    assert.equal(firstNotes[2].midi, 74) // d
  })

  it('applies accidentals: ^F→66 (F#4)', () => {
    const m2 = score.phrases[0].measures[1].notes
    assert.equal(m2[0].midi, 66) // ^F
    assert.equal(m2[1].midi, 67) // G
  })

  it('parses durations relative to L: D2→half, D3/2→dotted-quarter, D/2→eighth', () => {
    const m4 = score.phrases[0].measures[3].notes
    assert.equal(m4[0].duration, 'h')  // D2
    assert.equal(m4[1].duration, 'q.') // D3/2
    assert.equal(m4[2].duration, '8')  // D/2
    assert.equal(m4[3].duration, 'q')  // D
  })

  it('parses a 2-note chord [DF] → midi [62, 65] quarter', () => {
    const chord = score.phrases[0].measures[2].notes[0]
    assert.deepEqual(chord.midi, [62, 65])
    assert.equal(chord.duration, 'q')
  })

  it('parses a 3-note chord with duration suffix [CEG]2 → [60,64,67] half', () => {
    const chord = score.phrases[0].measures[2].notes[1]
    assert.deepEqual(chord.midi, [60, 64, 67])
    assert.equal(chord.duration, 'h')
  })

  it('parses a chord with per-note accidentals/octaves [^FA,c] → [66,57,72]', () => {
    const s = parseABC('X:1\nK:C\nL:1/4\n|[^FA,c]|')
    assert.deepEqual(s.phrases[0].measures[0].notes[0].midi, [66, 57, 72])
  })

  it('groups 4 measures into a single phrase', () => {
    assert.equal(score.phrases.length, 1)
    assert.equal(score.phrases[0].measures.length, 4)
  })

  it('groups 5 measures into two phrases (4 + 1)', () => {
    const s = parseABC('X:1\nK:C\nL:1/4\n|C|D|E|F|G|')
    assert.equal(s.phrases.length, 2)
    assert.equal(s.phrases[0].measures.length, 4)
    assert.equal(s.phrases[1].measures.length, 1)
  })

  it('attaches w: syllables to notes (split on space and dash)', () => {
    assert.equal(firstNotes[0].lyric, 'do')
    assert.equal(firstNotes[1].lyric, 're')
    assert.equal(firstNotes[2].lyric, 'mi')
    assert.equal(score.phrases[0].measures[1].notes[0].lyric, 'fa')
    assert.equal(score.phrases[0].measures[1].notes[1].lyric, 'sol')
  })

  it('drops rests (z) but keeps surrounding notes', () => {
    const s = parseABC('X:1\nK:C\nL:1/4\n|C z E|')
    assert.equal(s.phrases[0].measures[0].notes.length, 2)
    assert.equal(s.phrases[0].measures[0].notes[0].midi, 60)
    assert.equal(s.phrases[0].measures[0].notes[1].midi, 64)
  })

  it('throws when no notes are present', () => {
    assert.throws(() => parseABC('X:1\nT:Empty\nK:C\n'))
  })
})
