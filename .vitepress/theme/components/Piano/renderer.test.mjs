import { test } from 'node:test'
import assert from 'node:assert/strict'
import { phraseToMusicXML, midiPitchXML, FIFTHS_MAP, lyricXML, computeBeamSpecs, beamGroupDiv } from './musicxml.js'

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

// ── lyricXML ──────────────────────────────────────────────────────────────────
test('lyricXML: empty/undefined → empty string', () => {
  assert.equal(lyricXML(''), '')
  assert.equal(lyricXML(undefined), '')
})

test('lyricXML: plain word → single syllabic', () => {
  assert.equal(lyricXML('Freude'),
    '<lyric number="1"><syllabic>single</syllabic><text>Freude</text></lyric>')
})

test('lyricXML: trailing hyphen → begin syllabic, hyphen stripped from text', () => {
  assert.equal(lyricXML('Freu-'),
    '<lyric number="1"><syllabic>begin</syllabic><text>Freu</text></lyric>')
})

test('lyricXML: escapes XML special characters', () => {
  assert.ok(lyricXML('A & B').includes('<text>A &amp; B</text>'))
  assert.ok(lyricXML('<x>').includes('<text>&lt;x&gt;</text>'))
})

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

test('phraseToMusicXML: note lyric rendered under the note', () => {
  const phrase = {
    id: 'p1',
    measures: [{
      id: 'm1',
      notes: [{ midi: 64, duration: 'w', hand: 'right', lyric: 'Freu-' }],
    }],
  }
  const xml = phraseToMusicXML(phrase, simpleScore, 0)
  assert.ok(xml.includes('<lyric number="1"><syllabic>begin</syllabic><text>Freu</text></lyric>'))
})

test('phraseToMusicXML: chord lyric appears once, not on chord tones', () => {
  const chordPhrase = {
    id: 'p1',
    measures: [{
      id: 'm1',
      notes: [{ midi: [74, 66], duration: 'h', hand: 'right', lyric: 'sing' }],
    }],
  }
  const score = { ...simpleScore, timeSignature: [2, 4], phrases: [chordPhrase] }
  const xml = phraseToMusicXML(chordPhrase, score, 0)
  assert.equal((xml.match(/<lyric /g) || []).length, 1)
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

// ── triplet eighths ('8t') ──────────────────────────────────────────────────────
// A triplet eighth renders as a normal eighth <type> grouped by a <time-modification>
// 3-in-2; with DIVISIONS=12 each triplet eighth has integer <duration>4 (3 → 12 = quarter).
test('phraseToMusicXML: triplet eighth → eighth type + 3:2 time-modification', () => {
  const phrase = {
    id: 'p1',
    measures: [{
      id: 'm1',
      notes: [
        { midi: 60, duration: '8t', hand: 'right' },
        { midi: 62, duration: '8t', hand: 'right' },
        { midi: 64, duration: '8t', hand: 'right' },
      ],
    }],
  }
  const score = { ...simpleScore, timeSignature: [1, 4], phrases: [phrase] }
  const xml = phraseToMusicXML(phrase, score, 0)
  assert.ok(xml.includes('<type>eighth</type>'), 'triplet eighth uses the eighth note type')
  assert.ok(xml.includes('<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>'))
  assert.equal((xml.match(/<time-modification>/g) || []).length, 3, 'one time-modification per triplet note')
})

test('phraseToMusicXML: triplet eighth has integer duration 4 (DIVISIONS=12)', () => {
  const phrase = {
    id: 'p1',
    measures: [{ id: 'm1', notes: [{ midi: 60, duration: '8t', hand: 'right' }] }],
  }
  const score = { ...simpleScore, timeSignature: [1, 4], phrases: [phrase] }
  const xml = phraseToMusicXML(phrase, score, 0)
  assert.ok(xml.includes('<duration>4</duration>'))
})

test('phraseToMusicXML: non-triplet notes carry no time-modification (no regression)', () => {
  const xml = phraseToMusicXML(simpleSinglePhrase, simpleScore, 0)
  assert.ok(!xml.includes('<time-modification>'))
})

test('phraseToMusicXML: divisions reflect DIVISIONS=12 (quarter=12)', () => {
  const xml = phraseToMusicXML(simpleSinglePhrase, simpleScore, 0)
  assert.ok(xml.includes('<divisions>12</divisions>'))
  // each plain quarter note → <duration>12</duration>
  assert.ok(xml.includes('<duration>12</duration>'))
})

// ── beams (computeBeamSpecs + XML emission) ─────────────────────────────────────

test('beamGroupDiv: quarter beat for simple meters, dotted quarter for compound', () => {
  assert.equal(beamGroupDiv(4, 4), 12)
  assert.equal(beamGroupDiv(3, 4), 12)
  assert.equal(beamGroupDiv(2, 2), 24)
  assert.equal(beamGroupDiv(6, 8), 18)
})

test('computeBeamSpecs: triplet eighths beam in threes with tuplet start/stop', () => {
  const notes = Array.from({ length: 9 }, (_, i) => ({ midi: 50 + i, duration: '8t', hand: 'left' }))
  const specs = computeBeamSpecs(notes, 12)
  assert.deepEqual(specs.map(s => s.beam),
    ['begin', 'continue', 'end', 'begin', 'continue', 'end', 'begin', 'continue', 'end'])
  assert.deepEqual(specs.map(s => s.tuplet ?? null),
    ['start', null, 'stop', 'start', null, 'stop', 'start', null, 'stop'])
})

test('computeBeamSpecs: plain eighths group by beat boundary', () => {
  // four eighths in 2/4 → two beat groups of two
  const notes = Array.from({ length: 4 }, (_, i) => ({ midi: 60 + i, duration: '8', hand: 'right' }))
  const specs = computeBeamSpecs(notes, 12)
  assert.deepEqual(specs.map(s => s.beam), ['begin', 'end', 'begin', 'end'])
})

test('computeBeamSpecs: quarters get no beams; a rest breaks a group', () => {
  assert.deepEqual(
    computeBeamSpecs([{ midi: 60, duration: 'q' }, { midi: 62, duration: 'q' }], 12),
    [null, null])
  // eighth | eighth-rest | eighth eighth → lone first eighth keeps its flag,
  // the pair after the rest beams together
  const specs = computeBeamSpecs([
    { midi: 60, duration: '8' },
    { duration: '8', rest: true },
    { midi: 64, duration: '8' },
    { midi: 65, duration: '8' },
  ], 12)
  assert.deepEqual(specs.map(s => s?.beam ?? null), [null, null, 'begin', 'end'])
})

test('computeBeamSpecs: dotted eighth + 16th beam together, 16th gets a level-2 hook', () => {
  const specs = computeBeamSpecs([
    { midi: 60, duration: '8.' },
    { midi: 62, duration: '16' },
  ], 12)
  assert.deepEqual(specs.map(s => s.beam), ['begin', 'end'])
  assert.equal(specs[0].beam2, undefined)
  assert.equal(specs[1].beam2, 'backward hook')
})

test('computeBeamSpecs: run of 16ths carries both beam levels', () => {
  const specs = computeBeamSpecs(
    Array.from({ length: 4 }, (_, i) => ({ midi: 60 + i, duration: '16' })), 12)
  assert.deepEqual(specs.map(s => s.beam), ['begin', 'continue', 'continue', 'end'])
  assert.deepEqual(specs.map(s => s.beam2), ['begin', 'continue', 'continue', 'end'])
})

test('phraseToMusicXML: triplet measure emits beam + tuplet elements', () => {
  const phrase = {
    id: 'p1',
    measures: [{
      id: 'm1',
      notes: Array.from({ length: 9 }, (_, i) => ({ midi: 50 + i, duration: '8t', hand: 'left' })),
    }],
  }
  const score = { ...simpleScore, timeSignature: [3, 4], phrases: [phrase] }
  const xml = phraseToMusicXML(phrase, score, 0)
  assert.equal((xml.match(/<beam number="1">begin<\/beam>/g) || []).length, 3)
  assert.equal((xml.match(/<beam number="1">end<\/beam>/g) || []).length, 3)
  assert.equal((xml.match(/<tuplet number="1" type="start"\/>/g) || []).length, 3)
  assert.equal((xml.match(/<tuplet number="1" type="stop"\/>/g) || []).length, 3)
})

test('phraseToMusicXML: beams attach to the principal chord note only', () => {
  const phrase = {
    id: 'p1',
    measures: [{
      id: 'm1',
      notes: [
        { midi: [60, 64], duration: '8', hand: 'right' },
        { midi: [62, 65], duration: '8', hand: 'right' },
      ],
    }],
  }
  const score = { ...simpleScore, timeSignature: [1, 4], phrases: [phrase] }
  const xml = phraseToMusicXML(phrase, score, 0)
  assert.equal((xml.match(/<beam /g) || []).length, 2, 'one beam per chord event, not per chord tone')
})

test('phraseToMusicXML: quarter notes emit no beam elements (no regression)', () => {
  const xml = phraseToMusicXML(simpleSinglePhrase, simpleScore, 0)
  assert.ok(!xml.includes('<beam'))
})

// ── rests (rest: true) ──────────────────────────────────────────────────────────
test('phraseToMusicXML: rest note emits <rest/> instead of a pitch', () => {
  const phrase = {
    id: 'p1',
    measures: [{
      id: 'm1',
      notes: [
        { duration: 'h.', hand: 'right', rest: true },
      ],
    }],
  }
  const score = { ...simpleScore, timeSignature: [3, 4], phrases: [phrase] }
  const xml = phraseToMusicXML(phrase, score, 0)
  assert.ok(xml.includes('<rest/>'))
  assert.ok(!xml.includes('<pitch>'), 'a rest has no pitch')
  // dotted half rest → half type + dot, integer duration 36 at DIVISIONS=12
  assert.ok(xml.includes('<type>half</type>'))
  assert.ok(xml.includes('<dot/>'))
  assert.ok(xml.includes('<duration>36</duration>'))
})

test('phraseToMusicXML: rest counts toward grand-staff backup duration', () => {
  const phrase = {
    id: 'p1',
    measures: [{
      id: 'm1',
      notes: [
        { duration: 'h.', hand: 'right', rest: true },
        { midi: 38, duration: 'h.', hand: 'left' },
      ],
    }],
  }
  const score = { ...simpleScore, timeSignature: [3, 4], phrases: [phrase] }
  const xml = phraseToMusicXML(phrase, score, 0)
  // backup must rewind the full RH rest (dotted half = 36 divisions) before the LH voice
  assert.ok(xml.includes('<backup><duration>36</duration></backup>'))
})
