import { test } from 'node:test'
import assert from 'node:assert/strict'
import { phraseToMusicXML, midiPitchXML, FIFTHS_MAP } from './musicxml.js'

// ── midiPitchXML ──────────────────────────────────────────────────────────────
test('midiPitchXML: C4 (60) in C major', () =>
  assert.equal(midiPitchXML(60, 0), '<pitch><step>C</step><octave>4</octave></pitch>'))

test('midiPitchXML: D5 (74) in D major (fifths=2) — no alter', () =>
  assert.equal(midiPitchXML(74, 2), '<pitch><step>D</step><octave>5</octave></pitch>'))

test('midiPitchXML: F#4 (66) in D major (fifths=2) — sharp alter', () =>
  assert.equal(midiPitchXML(66, 2), '<pitch><step>F</step><alter>1</alter><octave>4</octave></pitch>'))

test('midiPitchXML: Bb3 (58) in F major (fifths=-1) — flat alter', () =>
  assert.equal(midiPitchXML(58, -1), '<pitch><step>B</step><alter>-1</alter><octave>3</octave></pitch>'))

test('midiPitchXML: G#4 (68) in sharp key — uses G# spelling', () =>
  assert.ok(midiPitchXML(68, 2).includes('<step>G</step><alter>1</alter>')))

test('midiPitchXML: Ab4 (68) in flat key — uses Ab spelling', () =>
  assert.ok(midiPitchXML(68, -1).includes('<step>A</step><alter>-1</alter>')))

// ── FIFTHS_MAP ────────────────────────────────────────────────────────────────
test('FIFTHS_MAP: D major = 2 sharps', () => assert.equal(FIFTHS_MAP['D'], 2))
test('FIFTHS_MAP: G major = 1 sharp', () => assert.equal(FIFTHS_MAP['G'], 1))
test('FIFTHS_MAP: C major = 0', () => assert.equal(FIFTHS_MAP['C'], 0))
test('FIFTHS_MAP: F major = -1', () => assert.equal(FIFTHS_MAP['F'], -1))
test('FIFTHS_MAP: Bb = -2', () => assert.equal(FIFTHS_MAP['Bb'], -2))

// ── phraseToMusicXML ──────────────────────────────────────────────────────────

const simpleSinglePhrase = {
  id: 'p1',
  measures: [
    {
      id: 'm1',
      notes: [
        { midi: 60, duration: 'q', hand: 'right' },
        { midi: 62, duration: 'q', hand: 'right' },
        { midi: 64, duration: 'q', hand: 'right' },
        { midi: 65, duration: 'q', hand: 'right' },
      ],
    },
  ],
}
const simpleScore = {
  id: 'test',
  title: 'Test',
  key: { root: 'C', mode: 'major' },
  timeSignature: [4, 4],
  tempo: 100,
  phrases: [simpleSinglePhrase],
  modulations: [],
}

test('phraseToMusicXML: produces valid XML declaration', () => {
  const xml = phraseToMusicXML(simpleSinglePhrase, simpleScore, 0)
  assert.ok(xml.startsWith('<?xml version="1.0"'))
})

test('phraseToMusicXML: contains score-partwise', () => {
  const xml = phraseToMusicXML(simpleSinglePhrase, simpleScore, 0)
  assert.ok(xml.includes('<score-partwise'))
})

test('phraseToMusicXML: contains part P1', () => {
  const xml = phraseToMusicXML(simpleSinglePhrase, simpleScore, 0)
  assert.ok(xml.includes('<part id="P1">'))
})

test('phraseToMusicXML: C major → fifths 0', () => {
  const xml = phraseToMusicXML(simpleSinglePhrase, simpleScore, 0)
  assert.ok(xml.includes('<fifths>0</fifths>'))
})

test('phraseToMusicXML: D major → fifths 2', () => {
  const score = { ...simpleScore, key: { root: 'D', mode: 'major' } }
  const xml = phraseToMusicXML(simpleSinglePhrase, score, 0)
  assert.ok(xml.includes('<fifths>2</fifths>'))
})

test('phraseToMusicXML: single staff — no staves element', () => {
  const xml = phraseToMusicXML(simpleSinglePhrase, simpleScore, 0)
  assert.ok(!xml.includes('<staves>'))
})

test('phraseToMusicXML: grand staff — contains staves element', () => {
  const grandPhrase = {
    id: 'p1',
    measures: [{
      id: 'm1',
      notes: [
        { midi: 64, duration: 'q', hand: 'right' },
        { midi: 48, duration: 'q', hand: 'left' },
      ],
    }],
  }
  const grandScore = { ...simpleScore, phrases: [grandPhrase] }
  const xml = phraseToMusicXML(grandPhrase, grandScore, 0)
  assert.ok(xml.includes('<staves>2</staves>'))
})

test('phraseToMusicXML: grand staff — contains backup element', () => {
  const grandPhrase = {
    id: 'p1',
    measures: [{
      id: 'm1',
      notes: [
        { midi: 64, duration: 'q', hand: 'right' },
        { midi: 48, duration: 'q', hand: 'left' },
      ],
    }],
  }
  const grandScore = { ...simpleScore, phrases: [grandPhrase] }
  const xml = phraseToMusicXML(grandPhrase, grandScore, 0)
  assert.ok(xml.includes('<backup>'))
})

test('phraseToMusicXML: cursor colors current note blue', () => {
  const cursor = { measureIdx: 0, noteIdx: 1, lookahead: 0, wrongNoteIdx: -1 }
  const xml = phraseToMusicXML(simpleSinglePhrase, simpleScore, 0, cursor)
  assert.ok(xml.includes('color="#1976d2"'))
})

test('phraseToMusicXML: cursor colors wrong note red', () => {
  const cursor = { measureIdx: 0, noteIdx: 1, lookahead: 0, wrongNoteIdx: 1 }
  const xml = phraseToMusicXML(simpleSinglePhrase, simpleScore, 0, cursor)
  assert.ok(xml.includes('color="#e53935"'))
})

test('phraseToMusicXML: cursor colors lookahead note gray', () => {
  const cursor = { measureIdx: 0, noteIdx: 0, lookahead: 2, wrongNoteIdx: -1 }
  const xml = phraseToMusicXML(simpleSinglePhrase, simpleScore, 0, cursor)
  assert.ok(xml.includes('color="#888888"'))
})

test('phraseToMusicXML: noteIdx -1 means no cursor color applied', () => {
  const cursor = { measureIdx: 0, noteIdx: -1, lookahead: 0, wrongNoteIdx: -1 }
  const xml = phraseToMusicXML(simpleSinglePhrase, simpleScore, 0, cursor)
  assert.ok(!xml.includes('color='))
})

test('phraseToMusicXML: chord note — second midi as chord element', () => {
  const chordPhrase = {
    id: 'p1',
    measures: [{
      id: 'm1',
      notes: [{ midi: [74, 66], duration: 'h', hand: 'right' }],
    }],
  }
  const score = { ...simpleScore, timeSignature: [2, 4], phrases: [chordPhrase] }
  const xml = phraseToMusicXML(chordPhrase, score, 0)
  assert.ok(xml.includes('<chord/>'))
})

test('phraseToMusicXML: dotted half — contains dot element', () => {
  const phrase = {
    id: 'p1',
    measures: [{
      id: 'm1',
      notes: [{ midi: 69, duration: 'h.', hand: 'right' }, { midi: 68, duration: 'q', hand: 'right' }],
    }],
  }
  const score = { ...simpleScore, timeSignature: [3, 4], phrases: [phrase] }
  const xml = phraseToMusicXML(phrase, score, 0)
  assert.ok(xml.includes('<dot/>'))
})

test('phraseToMusicXML: 4/4 time signature in XML', () => {
  const xml = phraseToMusicXML(simpleSinglePhrase, simpleScore, 0)
  assert.ok(xml.includes('<beats>4</beats><beat-type>4</beat-type>'))
})

test('phraseToMusicXML: 3/4 time signature in XML', () => {
  const phrase = {
    id: 'p1',
    measures: [{
      id: 'm1',
      notes: [
        { midi: 60, duration: 'q', hand: 'right' },
        { midi: 62, duration: 'q', hand: 'right' },
        { midi: 64, duration: 'q', hand: 'right' },
      ],
    }],
  }
  const score = { ...simpleScore, timeSignature: [3, 4], phrases: [phrase] }
  const xml = phraseToMusicXML(phrase, score, 0)
  assert.ok(xml.includes('<beats>3</beats><beat-type>4</beat-type>'))
})
