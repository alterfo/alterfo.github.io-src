import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildScoreFromMidi } from './midifile.js'

// Synthetic Midi-like object (the shape @tonejs/midi exposes). We test the pure
// converter directly so no binary .mid has to be assembled.
function mockMidi({ timeSignatures = [], ppq = 480, tracks, keySignatures = [], tempos = [{ bpm: 120 }], name = 'Mock' } = {}) {
  return {
    header: { ppq, tempos, timeSignatures, keySignatures, name },
    tracks,
  }
}

// Four quarter notes filling one 4/4 bar at ppq=480, plus a second hand.
const FOUR_NOTES = [
  { midi: 60, ticks: 0, durationTicks: 480 },
  { midi: 62, ticks: 480, durationTicks: 480 },
  { midi: 64, ticks: 960, durationTicks: 480 },
  { midi: 65, ticks: 1440, durationTicks: 480 },
]

describe('Piano/importer/midifile.js', () => {
  it('with options.timeSignature → needsTimeSig false, uses the override', () => {
    const midi = mockMidi({ ppq: 480, tracks: [{ name: 'RH', notes: FOUR_NOTES }] })
    const { score, needsTimeSig, detectedTs } = buildScoreFromMidi(midi, { timeSignature: [4, 4] })
    assert.equal(needsTimeSig, false)
    assert.equal(detectedTs, null)
    assert.deepEqual(score.timeSignature, [4, 4])
  })

  it('no timeSignatures in file → needsTimeSig true, detectedTs null', () => {
    const midi = mockMidi({ tracks: [{ name: 'RH', notes: FOUR_NOTES }] })
    const { needsTimeSig, detectedTs, score } = buildScoreFromMidi(midi)
    assert.equal(needsTimeSig, true)
    assert.equal(detectedTs, null)
    assert.deepEqual(score.timeSignature, [4, 4]) // 4/4 fallback for bar splitting
  })

  it('file carries 3/4 → detectedTs [3,4], needsTimeSig false', () => {
    const midi = mockMidi({
      timeSignatures: [{ timeSignature: [3, 4] }],
      tracks: [{ name: 'RH', notes: FOUR_NOTES }],
    })
    const { needsTimeSig, detectedTs, score } = buildScoreFromMidi(midi)
    assert.equal(needsTimeSig, false)
    assert.deepEqual(detectedTs, [3, 4])
    assert.deepEqual(score.timeSignature, [3, 4])
  })

  it('ticks 0/480/960/1440 at ppq=480, 4/4 → 4 notes in measure 0', () => {
    const midi = mockMidi({ tracks: [{ name: 'RH', notes: FOUR_NOTES }] })
    const { score } = buildScoreFromMidi(midi, { timeSignature: [4, 4] })
    const m0 = score.phrases[0].measures[0]
    assert.equal(m0.notes.length, 4)
    assert.deepEqual(m0.notes.map(n => n.midi), [60, 62, 64, 65])
  })

  it('durationTicks=480 at ppq=480 → quarter "q"', () => {
    const midi = mockMidi({ tracks: [{ name: 'RH', notes: FOUR_NOTES }] })
    const { score } = buildScoreFromMidi(midi, { timeSignature: [4, 4] })
    assert.equal(score.phrases[0].measures[0].notes[0].duration, 'q')
  })

  it('two notes on the same ticks → chord midi array', () => {
    const midi = mockMidi({
      tracks: [{ name: 'RH', notes: [
        { midi: 67, ticks: 0, durationTicks: 480 },
        { midi: 60, ticks: 0, durationTicks: 480 },
      ] }],
    })
    const { score } = buildScoreFromMidi(midi, { timeSignature: [4, 4] })
    assert.deepEqual(score.phrases[0].measures[0].notes[0].midi, [60, 67]) // sorted ascending
  })

  it('single track → every note is right hand (no grand staff)', () => {
    const midi = mockMidi({ tracks: [{ name: 'Piano', notes: FOUR_NOTES }] })
    const { score } = buildScoreFromMidi(midi, { timeSignature: [4, 4] })
    const hands = new Set(score.phrases[0].measures[0].notes.map(n => n.hand))
    assert.deepEqual([...hands], ['right'])
  })

  it('two tracks → hands split by track name', () => {
    const midi = mockMidi({
      tracks: [
        { name: 'Left Hand', notes: [{ midi: 36, ticks: 0, durationTicks: 1920 }] },
        { name: 'Right Hand', notes: [{ midi: 72, ticks: 0, durationTicks: 480 }] },
      ],
    })
    const { score } = buildScoreFromMidi(midi, { timeSignature: [4, 4] })
    const notes = score.phrases[0].measures[0].notes
    const right = notes.find(n => n.midi === 72)
    const left = notes.find(n => n.midi === 36)
    assert.equal(right.hand, 'right')
    assert.equal(left.hand, 'left')
  })

  it('two unnamed tracks → track 0 = right, track 1 = left', () => {
    const midi = mockMidi({
      tracks: [
        { name: '', notes: [{ midi: 72, ticks: 0, durationTicks: 480 }] },
        { name: '', notes: [{ midi: 36, ticks: 0, durationTicks: 480 }] },
      ],
    })
    const { score } = buildScoreFromMidi(midi, { timeSignature: [4, 4] })
    const notes = score.phrases[0].measures[0].notes
    assert.equal(notes.find(n => n.midi === 72).hand, 'right')
    assert.equal(notes.find(n => n.midi === 36).hand, 'left')
  })

  it('reads tempo, key, title from header', () => {
    const midi = mockMidi({
      tempos: [{ bpm: 144.4 }],
      keySignatures: [{ key: 'D', scale: 'major' }],
      name: 'My MIDI',
      tracks: [{ name: 'RH', notes: FOUR_NOTES }],
    })
    const { score } = buildScoreFromMidi(midi, { timeSignature: [4, 4] })
    assert.equal(score.tempo, 144)
    assert.deepEqual(score.key, { root: 'D', mode: 'major' })
    assert.equal(score.title, 'My MIDI')
    assert.equal(score.userImported, true)
    assert.ok(score.id.startsWith('user-'))
  })

  it('groups every 4 measures into one phrase', () => {
    // Five bars at 4/4, ppq=480 → ticksPerMeasure 1920. One note per bar.
    const notes = [0, 1, 2, 3, 4].map(b => ({ midi: 60 + b, ticks: b * 1920, durationTicks: 480 }))
    const midi = mockMidi({ tracks: [{ name: 'RH', notes }] })
    const { score } = buildScoreFromMidi(midi, { timeSignature: [4, 4] })
    assert.equal(score.phrases.length, 2)
    assert.equal(score.phrases[0].measures.length, 4)
    assert.equal(score.phrases[1].measures.length, 1)
  })

  it('throws when there are no notes', () => {
    const midi = mockMidi({ tracks: [{ name: 'RH', notes: [] }] })
    assert.throws(() => buildScoreFromMidi(midi, { timeSignature: [4, 4] }))
  })
})
