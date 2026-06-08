import { test } from 'node:test'
import assert from 'node:assert/strict'
import { midiToVexKey, hasAccidental, midiToStaveLine, scoreDurationToVex } from './renderer.js'

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

// ── scoreDurationToVex ────────────────────────────────────────────────────────
test('scoreDurationToVex: plain durations unchanged', () => {
  for (const d of ['w', 'h', 'q', '8', '16']) assert.equal(scoreDurationToVex(d), d)
})
test('scoreDurationToVex: dotted h. → hd', () => assert.equal(scoreDurationToVex('h.'), 'hd'))
test('scoreDurationToVex: dotted q. → qd', () => assert.equal(scoreDurationToVex('q.'), 'qd'))
test('scoreDurationToVex: dotted 8. → 8d', () => assert.equal(scoreDurationToVex('8.'), '8d'))
