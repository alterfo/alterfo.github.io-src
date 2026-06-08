import { test } from 'node:test'
import assert from 'node:assert/strict'
import { midiToVexKey, hasAccidental, midiToStaveLine, scoreDurationToVex, hasLeftHand, midiToBassStaveLine, voiceNoteIdx } from './renderer.js'

// ── midiToVexKey ──────────────────────────────────────────────────────────────
test('midiToVexKey: C4=60 → c/4', () => assert.equal(midiToVexKey(60), 'c/4'))
test('midiToVexKey: D4=62 → d/4', () => assert.equal(midiToVexKey(62), 'd/4'))
test('midiToVexKey: C#4=61 → c#/4', () => assert.equal(midiToVexKey(61), 'c#/4'))
test('midiToVexKey: A4=69 → a/4', () => assert.equal(midiToVexKey(69), 'a/4'))
test('midiToVexKey: C5=72 → c/5', () => assert.equal(midiToVexKey(72), 'c/5'))
test('midiToVexKey: A0=21 → a/0', () => assert.equal(midiToVexKey(21), 'a/0'))
test('midiToVexKey: C8=108 → c/8', () => assert.equal(midiToVexKey(108), 'c/8'))

// ── hasAccidental ─────────────────────────────────────────────────────────────
test('hasAccidental: natural notes return false', () => {
  // C D E F G A B (midi 60 61 62 63 64 65 66 67 68 69 70 71)
  for (const midi of [60, 62, 64, 65, 67, 69, 71]) {
    assert.equal(hasAccidental(midi), false, `midi ${midi}`)
  }
})
test('hasAccidental: sharps return true', () => {
  for (const midi of [61, 63, 66, 68, 70]) {
    assert.equal(hasAccidental(midi), true, `midi ${midi}`)
  }
})

// ── midiToStaveLine ───────────────────────────────────────────────────────────
test('midiToStaveLine: E4=64 → bottom line 4', () => assert.equal(midiToStaveLine(64), 4))
test('midiToStaveLine: F4=65 → bottom space 3.5', () => assert.equal(midiToStaveLine(65), 3.5))
test('midiToStaveLine: G4=67 → line 3', () => assert.equal(midiToStaveLine(67), 3))
test('midiToStaveLine: A4=69 → space 2.5', () => assert.equal(midiToStaveLine(69), 2.5))
test('midiToStaveLine: B4=71 → middle line 2', () => assert.equal(midiToStaveLine(71), 2))
test('midiToStaveLine: C5=72 → space 1.5', () => assert.equal(midiToStaveLine(72), 1.5))
test('midiToStaveLine: D5=74 → line 1', () => assert.equal(midiToStaveLine(74), 1))
test('midiToStaveLine: E5=76 → space 0.5', () => assert.equal(midiToStaveLine(76), 0.5))
test('midiToStaveLine: F5=77 → top line 0', () => assert.equal(midiToStaveLine(77), 0))
test('midiToStaveLine: C4=60 → ledger below 5', () => assert.equal(midiToStaveLine(60), 5))
test('midiToStaveLine: D4=62 → space below 4.5', () => assert.equal(midiToStaveLine(62), 4.5))
test('midiToStaveLine: sharps share same line as natural (C#4=61 → 5)', () =>
  assert.equal(midiToStaveLine(61), midiToStaveLine(60)))

// ── hasLeftHand ───────────────────────────────────────────────────────────────
test('hasLeftHand: returns false when no left-hand notes', () => {
  const phrase = { measures: [{ notes: [{ midi: 60, hand: 'right' }, { midi: 62 }] }] }
  assert.equal(hasLeftHand(phrase), false)
})
test('hasLeftHand: returns true when any note has hand: left', () => {
  const phrase = {
    measures: [
      { notes: [{ midi: 60, hand: 'right' }] },
      { notes: [{ midi: 38, hand: 'left' }] },
    ],
  }
  assert.equal(hasLeftHand(phrase), true)
})
test('hasLeftHand: returns false for empty measures', () => {
  assert.equal(hasLeftHand({ measures: [{ notes: [] }] }), false)
})

// ── midiToBassStaveLine ───────────────────────────────────────────────────────
test('midiToBassStaveLine: G2=43 → bottom line 4', () => assert.equal(midiToBassStaveLine(43), 4))
test('midiToBassStaveLine: A2=45 → space 3.5', () => assert.equal(midiToBassStaveLine(45), 3.5))
test('midiToBassStaveLine: B2=47 → line 3', () => assert.equal(midiToBassStaveLine(47), 3))
test('midiToBassStaveLine: D3=50 → line 2', () => assert.equal(midiToBassStaveLine(50), 2))
test('midiToBassStaveLine: F3=53 → line 1', () => assert.equal(midiToBassStaveLine(53), 1))
test('midiToBassStaveLine: A3=57 → top line 0', () => assert.equal(midiToBassStaveLine(57), 0))
test('midiToBassStaveLine: sharps share same line (G#2=44 → same as G2)', () =>
  assert.equal(midiToBassStaveLine(44), midiToBassStaveLine(43)))

// ── voiceNoteIdx ─────────────────────────────────────────────────────────────
// notes: 2 right (0,1), 2 left (2,3) in a mixed measure
const mixedNotes = [
  { midi: 64, hand: 'right' },
  { midi: 67, hand: 'right' },
  { midi: 48, hand: 'left' },
  { midi: 52, hand: 'left' },
]
test('voiceNoteIdx: first right note → treble index 0', () =>
  assert.equal(voiceNoteIdx(mixedNotes, 0, false), 0))
test('voiceNoteIdx: second right note → treble index 1', () =>
  assert.equal(voiceNoteIdx(mixedNotes, 1, false), 1))
test('voiceNoteIdx: first left note → bass index 0', () =>
  assert.equal(voiceNoteIdx(mixedNotes, 2, true), 0))
test('voiceNoteIdx: second left note → bass index 1', () =>
  assert.equal(voiceNoteIdx(mixedNotes, 3, true), 1))
test('voiceNoteIdx: right note queried as left → -1', () =>
  assert.equal(voiceNoteIdx(mixedNotes, 0, true), -1))
test('voiceNoteIdx: left note queried as right → -1', () =>
  assert.equal(voiceNoteIdx(mixedNotes, 2, false), -1))
test('voiceNoteIdx: flatIdx -1 → -1', () =>
  assert.equal(voiceNoteIdx(mixedNotes, -1, false), -1))
test('voiceNoteIdx: flatIdx out of range → -1', () =>
  assert.equal(voiceNoteIdx(mixedNotes, 99, false), -1))

// ── scoreDurationToVex ────────────────────────────────────────────────────────
test('scoreDurationToVex: plain durations unchanged', () => {
  for (const d of ['w', 'h', 'q', '8', '16']) assert.equal(scoreDurationToVex(d), d)
})
test('scoreDurationToVex: dotted h. → hd', () => assert.equal(scoreDurationToVex('h.'), 'hd'))
test('scoreDurationToVex: dotted q. → qd', () => assert.equal(scoreDurationToVex('q.'), 'qd'))
test('scoreDurationToVex: dotted 8. → 8d', () => assert.equal(scoreDurationToVex('8.'), '8d'))
