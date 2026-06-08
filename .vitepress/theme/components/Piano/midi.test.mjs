import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { midiToNote, noteNameToMidi } from './midi.js'

describe('midiToNote', () => {
  it('returns C4 for MIDI 60', () => {
    const n = midiToNote(60)
    assert.equal(n.name, 'C')
    assert.equal(n.octave, 4)
    assert.equal(n.pitchClass, 0)
    assert.equal(n.accidental, false)
  })

  it('returns A4 for MIDI 69', () => {
    const n = midiToNote(69)
    assert.equal(n.name, 'A')
    assert.equal(n.octave, 4)
    assert.equal(n.pitchClass, 9)
    assert.equal(n.accidental, false)
  })

  it('returns C#4 for MIDI 61', () => {
    const n = midiToNote(61)
    assert.equal(n.name, 'C#')
    assert.equal(n.octave, 4)
    assert.equal(n.accidental, true)
  })

  it('returns B3 for MIDI 59', () => {
    const n = midiToNote(59)
    assert.equal(n.name, 'B')
    assert.equal(n.octave, 3)
    assert.equal(n.accidental, false)
  })

  it('returns C0 for MIDI 12', () => {
    const n = midiToNote(12)
    assert.equal(n.name, 'C')
    assert.equal(n.octave, 0)
  })

  it('preserves original num', () => {
    assert.equal(midiToNote(72).num, 72)
  })
})

describe('noteNameToMidi', () => {
  it('parses C4 → 60', () => assert.equal(noteNameToMidi('C4'), 60))
  it('parses A4 → 69', () => assert.equal(noteNameToMidi('A4'), 69))
  it('parses C#4 → 61', () => assert.equal(noteNameToMidi('C#4'), 61))
  it('parses Db4 → 61', () => assert.equal(noteNameToMidi('Db4'), 61))
  it('parses B3 → 59', () => assert.equal(noteNameToMidi('B3'), 59))
  it('returns null for invalid input', () => assert.equal(noteNameToMidi('X9'), null))
  it('round-trips midiToNote → noteNameToMidi for natural notes', () => {
    for (const midi of [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72]) {
      const { name, octave } = midiToNote(midi)
      assert.equal(noteNameToMidi(`${name}${octave}`), midi, `round-trip failed for MIDI ${midi}`)
    }
  })
})
