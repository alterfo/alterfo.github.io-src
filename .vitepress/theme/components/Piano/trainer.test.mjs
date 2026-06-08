import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  noteThresholdMs,
  createLevel1State,
  checkNoteL1,
  repeatSectionL1,
  createLevel2State,
  checkNoteL2,
  repeatSectionL2,
  getCurrentNote,
  getCursor,
  checkNote,
  repeatSection,
} from './trainer.js'
import { loadScore } from './score.js'

// Helper: heldMs that satisfies any note's threshold (very long hold)
const LONG_HOLD = 9999

// ── noteThresholdMs ───────────────────────────────────────────────────────────

describe('noteThresholdMs', () => {
  it('quarter note at tempo 100 with factor 1.0', () => {
    // (60/100) * 1 * 1000 * 1.0 * 0.6 = 360 ms
    assert.equal(noteThresholdMs('q', 100, 1.0), 360)
  })

  it('half note is double the quarter', () => {
    const q = noteThresholdMs('q', 120)
    const h = noteThresholdMs('h', 120)
    assert.equal(h, q * 2)
  })

  it('tempoFactor 0.5 halves the threshold', () => {
    const full = noteThresholdMs('q', 100, 1.0)
    const half = noteThresholdMs('q', 100, 0.5)
    assert.equal(half, full * 0.5)
  })

  it('tempoFactor 0.75 gives 3/4 of full threshold', () => {
    const full = noteThresholdMs('q', 100, 1.0)
    const t75 = noteThresholdMs('q', 100, 0.75)
    assert.equal(t75, full * 0.75)
  })

  it('eighth note threshold is half a quarter', () => {
    const q = noteThresholdMs('q', 80)
    const e = noteThresholdMs('8', 80)
    assert.equal(e, q * 0.5)
  })

  it('unknown duration defaults to 1 beat', () => {
    const unknown = noteThresholdMs('?', 100, 1.0)
    const quarter = noteThresholdMs('q', 100, 1.0)
    assert.equal(unknown, quarter)
  })

  it('dotted half note is 3x the quarter', () => {
    const q = noteThresholdMs('q', 100, 1.0)
    const dh = noteThresholdMs('h.', 100, 1.0)
    assert.ok(Math.abs(dh - q * 3) < 0.001, `h. threshold ${dh} should be ~${q * 3}`)
  })

  it('dotted quarter note is 1.5x the quarter', () => {
    const q = noteThresholdMs('q', 100, 1.0)
    const dq = noteThresholdMs('q.', 100, 1.0)
    assert.ok(Math.abs(dq - q * 1.5) < 0.001, `q. threshold ${dq} should be ~${q * 1.5}`)
  })

  it('dotted eighth note is 0.75x the quarter', () => {
    const q = noteThresholdMs('q', 100, 1.0)
    const de = noteThresholdMs('8.', 100, 1.0)
    assert.ok(Math.abs(de - q * 0.75) < 0.001, `8. threshold ${de} should be ~${q * 0.75}`)
  })
})

// ── Level 1 ───────────────────────────────────────────────────────────────────

describe('Level1: basic advance', () => {
  it('returns waiting when midiSet is empty', () => {
    const state = createLevel1State(loadScore('c-major-scale'))
    assert.equal(checkNoteL1(state, new Set(), LONG_HOLD), 'waiting')
  })

  it('returns wrong when wrong note pressed', () => {
    const state = createLevel1State(loadScore('c-major-scale'))
    // First note is midi 60 (C4); press 61 (C#4)
    assert.equal(checkNoteL1(state, new Set([61]), LONG_HOLD), 'wrong')
  })

  it('returns waiting when correct note pressed but not held long enough', () => {
    const state = createLevel1State(loadScore('c-major-scale'))
    assert.equal(checkNoteL1(state, new Set([60]), 0), 'waiting')
  })

  it('returns note-correct and advances cursor on correct note held', () => {
    const state = createLevel1State(loadScore('c-major-scale'))
    const result = checkNoteL1(state, new Set([60]), LONG_HOLD)
    assert.equal(result, 'note-correct')
    assert.deepEqual(getCursor(state), { phraseIdx: 0, measureIdx: 0, noteIdx: 1 })
  })

  it('advances through all notes in a measure', () => {
    const state = createLevel1State(loadScore('c-major-scale'))
    // measure 1: 60, 62, 64, 65
    const notes = [60, 62, 64, 65]
    for (let i = 0; i < notes.length - 1; i++) {
      const r = checkNoteL1(state, new Set([notes[i]]), LONG_HOLD)
      assert.equal(r, 'note-correct', `note ${i}`)
    }
    // Last note of measure 0 advances to measure 1
    const r = checkNoteL1(state, new Set([65]), LONG_HOLD)
    assert.equal(r, 'note-correct')
    assert.deepEqual(getCursor(state), { phraseIdx: 0, measureIdx: 1, noteIdx: 0 })
  })

  it('advances to next phrase', () => {
    const score = loadScore('c-major-scale')
    const state = createLevel1State(score)
    // Play through all notes of phrase 0 (2 measures × 4 notes = 8 notes)
    const allNotes = [60, 62, 64, 65, 67, 69, 71, 72]
    for (const m of allNotes) {
      checkNoteL1(state, new Set([m]), LONG_HOLD)
    }
    assert.equal(state.phraseIdx, 1)
    assert.equal(state.measureIdx, 0)
    assert.equal(state.noteIdx, 0)
  })

  it('returns complete when score ends', () => {
    const score = loadScore('c-major-scale')
    const state = createLevel1State(score)
    // All notes: phrase0 [60,62,64,65,67,69,71,72], phrase1 [72,71,69,67,65,64,62,60]
    const allNotes = [60, 62, 64, 65, 67, 69, 71, 72, 72, 71, 69, 67, 65, 64, 62, 60]
    let result
    for (const m of allNotes) {
      result = checkNoteL1(state, new Set([m]), LONG_HOLD)
    }
    assert.equal(result, 'complete')
    assert.equal(state.complete, true)
  })

  it('returns complete immediately on further calls after completion', () => {
    const score = loadScore('c-major-scale')
    const state = createLevel1State(score)
    const allNotes = [60, 62, 64, 65, 67, 69, 71, 72, 72, 71, 69, 67, 65, 64, 62, 60]
    for (const m of allNotes) checkNoteL1(state, new Set([m]), LONG_HOLD)
    assert.equal(checkNoteL1(state, new Set([60]), LONG_HOLD), 'complete')
  })
})

describe('Level1: stats tracking', () => {
  it('increments correct and streak on correct note', () => {
    const state = createLevel1State(loadScore('c-major-scale'))
    checkNoteL1(state, new Set([60]), LONG_HOLD)
    assert.equal(state.stats.correct, 1)
    assert.equal(state.stats.streak, 1)
  })

  it('increments wrong and resets streak on wrong note', () => {
    const state = createLevel1State(loadScore('c-major-scale'))
    checkNoteL1(state, new Set([60]), LONG_HOLD)  // correct
    checkNoteL1(state, new Set([63]), LONG_HOLD)  // wrong
    assert.equal(state.stats.wrong, 1)
    assert.equal(state.stats.streak, 0)
    assert.equal(state.stats.longestStreak, 1)
  })

  it('tracks longestStreak correctly', () => {
    const score = loadScore('c-major-scale')
    const state = createLevel1State(score)
    // Play 3 correct, then wrong, then correct
    checkNoteL1(state, new Set([60]), LONG_HOLD)
    checkNoteL1(state, new Set([62]), LONG_HOLD)
    checkNoteL1(state, new Set([64]), LONG_HOLD)
    checkNoteL1(state, new Set([63]), LONG_HOLD)  // wrong on 65
    assert.equal(state.stats.longestStreak, 3)
    assert.equal(state.stats.streak, 0)
  })
})

describe('Level1: repeatSection', () => {
  it('resets noteIdx to 0 within current measure', () => {
    const state = createLevel1State(loadScore('c-major-scale'))
    checkNoteL1(state, new Set([60]), LONG_HOLD)
    checkNoteL1(state, new Set([62]), LONG_HOLD)
    assert.equal(state.noteIdx, 2)
    repeatSectionL1(state)
    assert.equal(state.noteIdx, 0)
    assert.equal(state.measureIdx, 0)
  })

  it('does not change measureIdx', () => {
    const score = loadScore('c-major-scale')
    const state = createLevel1State(score)
    // Advance to measure 1
    for (const m of [60, 62, 64, 65]) checkNoteL1(state, new Set([m]), LONG_HOLD)
    assert.equal(state.measureIdx, 1)
    repeatSectionL1(state)
    assert.equal(state.measureIdx, 1)
    assert.equal(state.noteIdx, 0)
  })
})

// ── Level 2 ───────────────────────────────────────────────────────────────────

describe('Level2: note-by-note within measure', () => {
  it('note-correct within a measure', () => {
    const state = createLevel2State(loadScore('c-major-scale'))
    const r = checkNoteL2(state, new Set([60]), LONG_HOLD)
    assert.equal(r, 'note-correct')
    assert.equal(state.noteIdx, 1)
  })

  it('measure-complete after last note in measure', () => {
    const state = createLevel2State(loadScore('c-major-scale'))
    const results = []
    for (const m of [60, 62, 64, 65]) {
      results.push(checkNoteL2(state, new Set([m]), LONG_HOLD))
    }
    assert.equal(results[3], 'measure-complete')
    assert.equal(state.measureIdx, 1)
    assert.equal(state.noteIdx, 0)
  })

  it('phrase-complete after last measure of phrase', () => {
    const state = createLevel2State(loadScore('c-major-scale'))
    // phrase 0: measure 0 (60,62,64,65), measure 1 (67,69,71,72)
    const allNotes = [60, 62, 64, 65, 67, 69, 71, 72]
    let last
    for (const m of allNotes) last = checkNoteL2(state, new Set([m]), LONG_HOLD)
    assert.equal(last, 'phrase-complete')
    assert.equal(state.phraseIdx, 1)
    assert.equal(state.measureIdx, 0)
  })

  it('complete when score ends', () => {
    const score = loadScore('c-major-scale')
    const state = createLevel2State(score)
    const allNotes = [60, 62, 64, 65, 67, 69, 71, 72, 72, 71, 69, 67, 65, 64, 62, 60]
    let last
    for (const m of allNotes) last = checkNoteL2(state, new Set([m]), LONG_HOLD)
    assert.equal(last, 'complete')
  })
})

describe('Level2: repeatSection resets to phrase start', () => {
  it('resets measureIdx and noteIdx', () => {
    const state = createLevel2State(loadScore('c-major-scale'))
    for (const m of [60, 62, 64, 65]) checkNoteL2(state, new Set([m]), LONG_HOLD)
    assert.equal(state.measureIdx, 1)
    repeatSectionL2(state)
    assert.equal(state.measureIdx, 0)
    assert.equal(state.noteIdx, 0)
    assert.equal(state.phraseIdx, 0)
  })
})

// ── Tempo factor ──────────────────────────────────────────────────────────────

describe('tempo factor affects threshold', () => {
  it('at tempoFactor 0.5, a shorter hold suffices', () => {
    const state = createLevel1State(loadScore('c-major-scale'))
    // threshold at factor 1.0 for q@80: (60/80)*1*1000*1.0*0.6 = 450 ms
    // threshold at factor 0.5: 225 ms
    const threshold50 = noteThresholdMs('q', 80, 0.5)
    const r = checkNoteL1(state, new Set([60]), threshold50, 0.5)
    assert.equal(r, 'note-correct')
  })

  it('at tempoFactor 1.0, same hold is insufficient', () => {
    const state = createLevel1State(loadScore('c-major-scale'))
    const threshold50 = noteThresholdMs('q', 80, 0.5)
    // threshold50 is less than threshold at 1.0, so should still be waiting
    const r = checkNoteL1(state, new Set([60]), threshold50 - 1, 1.0)
    assert.equal(r, 'waiting')
  })

  it('tempoFactor 0.75 is between 0.5 and 1.0', () => {
    const t50 = noteThresholdMs('q', 100, 0.5)
    const t75 = noteThresholdMs('q', 100, 0.75)
    const t100 = noteThresholdMs('q', 100, 1.0)
    assert.ok(t50 < t75, '0.5 threshold < 0.75 threshold')
    assert.ok(t75 < t100, '0.75 threshold < 1.0 threshold')
  })
})

// ── Generic dispatcher ────────────────────────────────────────────────────────

describe('generic checkNote / repeatSection dispatchers', () => {
  it('dispatches to L1 when state.level is 1', () => {
    const state = createLevel1State(loadScore('c-major-scale'))
    assert.equal(checkNote(state, new Set([60]), LONG_HOLD), 'note-correct')
  })

  it('dispatches to L2 when state.level is 2', () => {
    const state = createLevel2State(loadScore('c-major-scale'))
    assert.equal(checkNote(state, new Set([60]), LONG_HOLD), 'note-correct')
  })

  it('repeatSection dispatches correctly for L1', () => {
    const state = createLevel1State(loadScore('c-major-scale'))
    checkNote(state, new Set([60]), LONG_HOLD)
    repeatSection(state)
    assert.equal(state.noteIdx, 0)
  })

  it('repeatSection dispatches correctly for L2', () => {
    const state = createLevel2State(loadScore('c-major-scale'))
    for (const m of [60, 62, 64, 65]) checkNote(state, new Set([m]), LONG_HOLD)
    repeatSection(state)
    assert.equal(state.measureIdx, 0)
    assert.equal(state.noteIdx, 0)
  })
})

// ── getCurrentNote ────────────────────────────────────────────────────────────

describe('getCurrentNote', () => {
  it('returns first note of score', () => {
    const state = createLevel1State(loadScore('c-major-scale'))
    const note = getCurrentNote(state)
    assert.ok(note)
    assert.equal(note.midi, 60)
    assert.equal(note.duration, 'q')
  })

  it('returns correct note after advance', () => {
    const state = createLevel1State(loadScore('c-major-scale'))
    checkNoteL1(state, new Set([60]), LONG_HOLD)
    const note = getCurrentNote(state)
    assert.equal(note.midi, 62)
  })
})

// ── Chord support ─────────────────────────────────────────────────────────────

describe('chord notes (midi as array)', () => {
  const chordScore = {
    id: 'chord-test',
    title: 'Chord test',
    tempo: 60,
    key: { root: 'C', mode: 'major' },
    timeSignature: [4, 4],
    modulations: [],
    phrases: [{
      id: 'p1',
      measures: [{
        id: 'm1',
        notes: [
          { midi: [60, 64, 67], duration: 'q', hand: 'right' },
          { midi: 62, duration: 'q', hand: 'right' },
        ],
      }],
    }],
  }

  it('waiting when only partial chord pressed', () => {
    const state = createLevel1State(chordScore)
    assert.equal(checkNoteL1(state, new Set([60, 64]), LONG_HOLD), 'waiting')
  })

  it('wrong when extra wrong note added to partial chord', () => {
    const state = createLevel1State(chordScore)
    assert.equal(checkNoteL1(state, new Set([60, 63]), LONG_HOLD), 'wrong')
  })

  it('note-correct when full chord pressed', () => {
    const state = createLevel1State(chordScore)
    assert.equal(checkNoteL1(state, new Set([60, 64, 67]), LONG_HOLD), 'note-correct')
  })

  it('wrong when full chord pressed plus extra wrong key', () => {
    const state = createLevel1State(chordScore)
    // all expected notes [60,64,67] + wrong 61
    assert.equal(checkNoteL1(state, new Set([60, 64, 67, 61]), LONG_HOLD), 'wrong')
  })

  it('wrong when single expected note pressed with extra wrong key', () => {
    const score = loadScore('c-major-scale')
    const state = createLevel1State(score)
    // expected 60, also pressing 61
    assert.equal(checkNoteL1(state, new Set([60, 61]), LONG_HOLD), 'wrong')
  })
})
