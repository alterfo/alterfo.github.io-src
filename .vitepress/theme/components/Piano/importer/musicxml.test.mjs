import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseMusicXML } from './musicxml.js'

// Minimal score-partwise MusicXML: D major, 4/4, piano grand staff.
// m1: F#4 + chord A4 (RH) over D3 (LH); m2: standalone F#4; m3: dotted-half G4; m4: A4.
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Test Piece</work-title></work>
  <identification>
    <creator type="composer">J.S. Bach</creator>
    <creator type="lyricist">Nobody</creator>
  </identification>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>2</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <sound tempo="96"/>
      <note>
        <pitch><step>F</step><alter>1</alter><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type><staff>1</staff>
      </note>
      <note>
        <chord/>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type><staff>1</staff>
      </note>
      <note>
        <pitch><step>D</step><octave>3</octave></pitch>
        <duration>16</duration><type>whole</type><staff>2</staff>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>F</step><alter>1</alter><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type><staff>1</staff>
      </note>
      <note>
        <rest/>
        <duration>12</duration><type>half</type><staff>1</staff>
      </note>
    </measure>
    <measure number="3">
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>24</duration><type>half</type><dot/><staff>1</staff>
      </note>
    </measure>
    <measure number="4">
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>16</duration><type>whole</type><staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`

describe('Piano/importer/musicxml.js', () => {
  const score = parseMusicXML(SAMPLE)

  it('parses key from <fifths>+<mode>: 2 major → D major', () => {
    assert.deepEqual(score.key, { root: 'D', mode: 'major' })
  })

  it('parses time signature', () => {
    assert.deepEqual(score.timeSignature, [4, 4])
  })

  it('parses tempo from <sound tempo>', () => {
    assert.equal(score.tempo, 96)
  })

  it('parses title and composer', () => {
    assert.equal(score.title, 'Test Piece')
    assert.equal(score.composer, 'J.S. Bach')
  })

  it('stamps userImported and a user- id', () => {
    assert.equal(score.userImported, true)
    assert.ok(score.id.startsWith('user-'))
  })

  it('groups 4 measures into a single phrase', () => {
    assert.equal(score.phrases.length, 1)
    assert.equal(score.phrases[0].measures.length, 4)
  })

  it('merges <chord/> into a midi array on the previous note', () => {
    const m1 = score.phrases[0].measures[0]
    assert.deepEqual(m1.notes[0].midi, [66, 69]) // F#4 + A4
  })

  it('maps staff 1 → right hand, staff 2 → left hand', () => {
    const m1 = score.phrases[0].measures[0]
    assert.equal(m1.notes[0].hand, 'right')
    assert.equal(m1.notes[1].midi, 50) // D3 left hand
    assert.equal(m1.notes[1].hand, 'left')
  })

  it('converts step+octave+alter → MIDI (F#4 → 66)', () => {
    const m2 = score.phrases[0].measures[1]
    assert.equal(m2.notes[0].midi, 66)
  })

  it('skips <rest> notes', () => {
    const m2 = score.phrases[0].measures[1]
    assert.equal(m2.notes.length, 1) // only the F#4, the rest is dropped
  })

  it('maps <type>half<dot/> → dotted-half duration code', () => {
    const m3 = score.phrases[0].measures[2]
    assert.equal(m3.notes[0].duration, 'h.')
    assert.equal(m3.notes[0].midi, 67) // G4
  })

  it('maps <type>whole → "w"', () => {
    const m4 = score.phrases[0].measures[3]
    assert.equal(m4.notes[0].duration, 'w')
  })

  it('throws when no notes are present', () => {
    assert.throws(() => parseMusicXML('<score-partwise><part id="P1"></part></score-partwise>'))
  })

  it('handles minor keys via relative-minor table (0 fifths minor → A minor)', () => {
    const xml = SAMPLE.replace('<fifths>2</fifths><mode>major</mode>', '<fifths>0</fifths><mode>minor</mode>')
    const s = parseMusicXML(xml)
    assert.deepEqual(s.key, { root: 'A', mode: 'minor' })
  })
})
