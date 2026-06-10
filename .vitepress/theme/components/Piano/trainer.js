import { DURATION_BEATS } from './score.js'

// Duration threshold in ms: 60% of note duration at given tempo and tempo factor
export function noteThresholdMs(duration, tempo, tempoFactor = 1.0) {
  const beats = DURATION_BEATS[duration] ?? 1
  // Divide by tempoFactor: at 50% speed each beat takes twice as long → hold twice as long
  return (60 / tempo) * beats * 1000 / tempoFactor * 0.6
}

// Check whether all expected MIDI notes are present in the midiSet
function notesMatch(expectedMidi, midiSet) {
  const expected = Array.isArray(expectedMidi) ? expectedMidi : [expectedMidi]
  return expected.every(m => midiSet.has(m))
}

// Returns true if midiSet contains any note not in expectedMidi
function hasWrongNote(expectedMidi, midiSet) {
  const expected = new Set(Array.isArray(expectedMidi) ? expectedMidi : [expectedMidi])
  for (const m of midiSet) {
    if (!expected.has(m)) return true
  }
  return false
}

function _getNote(score, phraseIdx, measureIdx, noteIdx) {
  return score.phrases[phraseIdx]?.measures[measureIdx]?.notes[noteIdx] ?? null
}

// Rest notes (`{ rest: true }`, no midi) can't be "played". Advance the cursor to the
// next playable (non-rest) note, rolling across measure/phrase boundaries and skipping
// any all-rest measures, so the trainer never stalls on a rest (e.g. the 2-bar RH rest
// that opens the Rachmaninoff prelude) and never ends a piece early on a trailing/empty
// rest run. `complete` is set only when no playable note remains in the score.
function _skipRests(state) {
  while (true) {
    const phrase = state.score.phrases[state.phraseIdx]
    const measure = phrase?.measures[state.measureIdx]
    if (!measure) { state.complete = true; return }
    if (state.noteIdx < measure.notes.length) {
      if (!measure.notes[state.noteIdx]?.rest) return // playable note — stop here
      state.noteIdx++
      continue
    }
    // Past the end of this measure (a trailing rest run) — roll forward.
    if (state.measureIdx < phrase.measures.length - 1) {
      state.measureIdx++
      state.noteIdx = 0
    } else if (state.phraseIdx < state.score.phrases.length - 1) {
      state.phraseIdx++
      state.measureIdx = 0
      state.noteIdx = 0
    } else {
      state.complete = true
      return
    }
  }
}

function _updateStats(stats, correct) {
  if (correct) {
    stats.correct++
    stats.streak++
    if (stats.streak > stats.longestStreak) stats.longestStreak = stats.streak
  } else {
    stats.wrong++
    stats.streak = 0
  }
}

// ── Level 1: note-by-note through the whole score ────────────────────────────

export function createLevel1State(score) {
  const state = {
    level: 1,
    score,
    phraseIdx: 0,
    measureIdx: 0,
    noteIdx: 0,
    stats: { correct: 0, wrong: 0, streak: 0, longestStreak: 0 },
    complete: false,
  }
  _skipRests(state)
  return state
}

// Returns: 'waiting' | 'wrong' | 'note-correct' | 'complete'
export function checkNoteL1(state, midiSet, heldMs, tempoFactor = 1.0) {
  if (state.complete) return 'complete'
  const note = _getNote(state.score, state.phraseIdx, state.measureIdx, state.noteIdx)
  if (!note) { state.complete = true; return 'complete' }

  if (!notesMatch(note.midi, midiSet)) {
    // Expected note(s) not held — wrong only if a different note is pressed without the expected one
    if (midiSet.size > 0 && hasWrongNote(note.midi, midiSet)) {
      _updateStats(state.stats, false)
      return 'wrong'
    }
    return 'waiting'
  }
  // All expected notes are held. Extra notes (e.g. legato overlap) are intentionally ignored —
  // penalising them would break normal piano playing where the next note is pressed before
  // the current one is fully released.

  const threshold = noteThresholdMs(note.duration, state.score.tempo, tempoFactor)
  if (heldMs < threshold) return 'waiting'

  _updateStats(state.stats, true)

  const phrase = state.score.phrases[state.phraseIdx]
  const measure = phrase.measures[state.measureIdx]

  if (state.noteIdx < measure.notes.length - 1) {
    state.noteIdx++
    _skipRests(state)
    return state.complete ? 'complete' : 'note-correct'
  }
  if (state.measureIdx < phrase.measures.length - 1) {
    state.measureIdx++
    state.noteIdx = 0
    _skipRests(state)
    return state.complete ? 'complete' : 'note-correct'
  }
  if (state.phraseIdx < state.score.phrases.length - 1) {
    state.phraseIdx++
    state.measureIdx = 0
    state.noteIdx = 0
    _skipRests(state)
    return state.complete ? 'complete' : 'note-correct'
  }
  state.complete = true
  return 'complete'
}

// Reset cursor to start of current measure
export function repeatSectionL1(state) {
  state.noteIdx = 0
  _skipRests(state)
}

// ── Level 2: measure-by-measure ───────────────────────────────────────────────

export function createLevel2State(score) {
  const state = {
    level: 2,
    score,
    phraseIdx: 0,
    measureIdx: 0,
    noteIdx: 0,
    stats: { correct: 0, wrong: 0, streak: 0, longestStreak: 0 },
    complete: false,
  }
  _skipRests(state)
  return state
}

// Returns: 'waiting' | 'wrong' | 'note-correct' | 'measure-complete' | 'phrase-complete' | 'complete'
export function checkNoteL2(state, midiSet, heldMs, tempoFactor = 1.0) {
  if (state.complete) return 'complete'
  const note = _getNote(state.score, state.phraseIdx, state.measureIdx, state.noteIdx)
  if (!note) { state.complete = true; return 'complete' }

  if (!notesMatch(note.midi, midiSet)) {
    if (midiSet.size > 0 && hasWrongNote(note.midi, midiSet)) {
      _updateStats(state.stats, false)
      return 'wrong'
    }
    return 'waiting'
  }
  // Extra notes beyond expected are ignored (legato overlap).

  const threshold = noteThresholdMs(note.duration, state.score.tempo, tempoFactor)
  if (heldMs < threshold) return 'waiting'

  _updateStats(state.stats, true)

  const phrase = state.score.phrases[state.phraseIdx]
  const measure = phrase.measures[state.measureIdx]

  if (state.noteIdx < measure.notes.length - 1) {
    state.noteIdx++
    _skipRests(state)
    return state.complete ? 'complete' : 'note-correct'
  }

  // Measure complete
  state.noteIdx = 0
  if (state.measureIdx < phrase.measures.length - 1) {
    state.measureIdx++
    _skipRests(state)
    return state.complete ? 'complete' : 'measure-complete'
  }

  // Phrase complete
  state.measureIdx = 0
  if (state.phraseIdx < state.score.phrases.length - 1) {
    state.phraseIdx++
    _skipRests(state)
    return state.complete ? 'complete' : 'phrase-complete'
  }

  state.complete = true
  return 'complete'
}

// Reset cursor to start of current phrase
export function repeatSectionL2(state) {
  state.measureIdx = 0
  state.noteIdx = 0
  _skipRests(state)
}

// ── Shared helpers ────────────────────────────────────────────────────────────

export function getCurrentNote(state) {
  return _getNote(state.score, state.phraseIdx, state.measureIdx, state.noteIdx)
}

export function getCursor(state) {
  return { phraseIdx: state.phraseIdx, measureIdx: state.measureIdx, noteIdx: state.noteIdx }
}

// Generic dispatcher
export function checkNote(state, midiSet, heldMs, tempoFactor = 1.0) {
  return state.level === 1
    ? checkNoteL1(state, midiSet, heldMs, tempoFactor)
    : checkNoteL2(state, midiSet, heldMs, tempoFactor)
}

export function repeatSection(state) {
  return state.level === 1 ? repeatSectionL1(state) : repeatSectionL2(state)
}
