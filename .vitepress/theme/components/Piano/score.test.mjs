import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getScaleKeys, getNonScaleKeys, getActiveKey, loadScore, listScores, DURATION_BEATS, midiToNoteName, beatsToDurationCode, makeUserScoreId } from './score.js'

describe('midiToNoteName', () => {
  it('MIDI 60 = C4 (middle C)', () => {
    assert.equal(midiToNoteName(60), 'C4')
  })

  it('MIDI 69 = A4 (concert A, 440 Hz)', () => {
    assert.equal(midiToNoteName(69), 'A4')
  })

  it('MIDI 21 = A0 (lowest piano key)', () => {
    assert.equal(midiToNoteName(21), 'A0')
  })

  it('MIDI 108 = C8 (highest piano key)', () => {
    assert.equal(midiToNoteName(108), 'C8')
  })

  it('MIDI 61 = C#4 (black key accidental)', () => {
    assert.equal(midiToNoteName(61), 'C#4')
  })

  it('MIDI 70 = A#4 (black key accidental)', () => {
    assert.equal(midiToNoteName(70), 'A#4')
  })
})

describe('getScaleKeys', () => {
  it('C major has 7 keys: C D E F G A B', () => {
    const keys = getScaleKeys({ root: 'C', mode: 'major' })
    assert.deepEqual(keys, new Set([0, 2, 4, 5, 7, 9, 11]))
  })

  it('G major has correct pitch classes', () => {
    const keys = getScaleKeys({ root: 'G', mode: 'major' })
    // G=7, A=9, B=11, C=0, D=2, E=4, F#=6
    assert.deepEqual(keys, new Set([7, 9, 11, 0, 2, 4, 6]))
  })

  it('D major has correct pitch classes', () => {
    const keys = getScaleKeys({ root: 'D', mode: 'major' })
    // D=2, E=4, F#=6, G=7, A=9, B=11, C#=1
    assert.deepEqual(keys, new Set([2, 4, 6, 7, 9, 11, 1]))
  })

  it('A minor (natural) has correct pitch classes', () => {
    const keys = getScaleKeys({ root: 'A', mode: 'minor' })
    // A=9, B=11, C=0, D=2, E=4, F=5, G=7
    assert.deepEqual(keys, new Set([9, 11, 0, 2, 4, 5, 7]))
  })

  it('E minor has correct pitch classes', () => {
    const keys = getScaleKeys({ root: 'E', mode: 'minor' })
    // E=4, F#=6, G=7, A=9, B=11, C=0, D=2
    assert.deepEqual(keys, new Set([4, 6, 7, 9, 11, 0, 2]))
  })

  it('handles flat roots (Bb major)', () => {
    const keys = getScaleKeys({ root: 'Bb', mode: 'major' })
    // Bb=10, C=0, D=2, Eb=3, F=5, G=7, A=9
    assert.deepEqual(keys, new Set([10, 0, 2, 3, 5, 7, 9]))
  })

  it('handles sharp roots (F# major)', () => {
    const keys = getScaleKeys({ root: 'F#', mode: 'major' })
    // F#=6, G#=8, A#=10, B=11, C#=1, D#=3, E#=5
    assert.deepEqual(keys, new Set([6, 8, 10, 11, 1, 3, 5]))
  })

  it('always returns exactly 7 pitch classes', () => {
    const roots = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C#', 'Eb', 'F#', 'Ab', 'Bb']
    for (const root of roots) {
      for (const mode of ['major', 'minor']) {
        const keys = getScaleKeys({ root, mode })
        assert.equal(keys.size, 7, `${root} ${mode} should have 7 keys`)
      }
    }
  })
})

describe('getNonScaleKeys', () => {
  it('C major non-scale has 5 pitch classes', () => {
    const keys = getNonScaleKeys({ root: 'C', mode: 'major' })
    // C# D# F# G# A# = 1 3 6 8 10
    assert.deepEqual(keys, new Set([1, 3, 6, 8, 10]))
  })

  it('scale + non-scale = all 12 pitch classes', () => {
    const roots = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb']
    for (const root of roots) {
      for (const mode of ['major', 'minor']) {
        const scale = getScaleKeys({ root, mode })
        const nonScale = getNonScaleKeys({ root, mode })
        assert.equal(scale.size + nonScale.size, 12, `${root} ${mode}: scale + non-scale != 12`)
        for (const pc of scale) {
          assert.ok(!nonScale.has(pc), `${root} ${mode}: pitch class ${pc} in both sets`)
        }
      }
    }
  })

  it('G major non-scale excludes F# but includes F', () => {
    const keys = getNonScaleKeys({ root: 'G', mode: 'major' })
    assert.ok(keys.has(5), 'F (5) should be non-scale in G major')
    assert.ok(!keys.has(6), 'F# (6) should be in scale in G major')
  })
})

describe('getActiveKey / modulations', () => {
  const score = loadScore('minuet-g')

  it('returns base key before any modulation', () => {
    const key = getActiveKey(score, 0, 0)
    assert.equal(key.root, 'G')
    assert.equal(key.mode, 'major')
  })

  it('returns modulated key at phrase 1 measure 0', () => {
    const key = getActiveKey(score, 1, 0)
    assert.equal(key.root, 'D')
    assert.equal(key.mode, 'major')
  })

  it('returns back to G at phrase 2', () => {
    const key = getActiveKey(score, 2, 0)
    assert.equal(key.root, 'G')
    assert.equal(key.mode, 'major')
  })

  it('returns score key when no modulations', () => {
    const s = loadScore('twinkle')
    assert.equal(getActiveKey(s, 0, 0).root, 'C')
    assert.equal(getActiveKey(s, 3, 1).root, 'C')
  })
})

describe('loadScore / listScores', () => {
  it('listScores returns 5 entries', () => {
    const list = listScores()
    assert.equal(list.length, 5)
  })

  it('listScores entries have id, title, composer, key, tempo', () => {
    for (const entry of listScores()) {
      assert.ok(entry.id)
      assert.ok(entry.title)
      assert.ok('composer' in entry, 'composer field must be present')
      assert.ok(entry.key)
      assert.ok(entry.tempo > 0)
    }
  })

  it('loadScore("twinkle") returns correct score', () => {
    const s = loadScore('twinkle')
    assert.equal(s.id, 'twinkle')
    assert.equal(s.key.root, 'C')
    assert.equal(s.timeSignature[0], 4)
    assert.ok(s.phrases.length > 0)
  })

  it('loadScore("c-major-scale") has 2 phrases of 2 measures', () => {
    const s = loadScore('c-major-scale')
    assert.equal(s.phrases.length, 2)
    assert.equal(s.phrases[0].measures.length, 2)
    assert.equal(s.phrases[1].measures.length, 2)
  })

  it('loadScore("minuet-g") has modulations', () => {
    const s = loadScore('minuet-g')
    assert.ok(s.modulations.length > 0)
    assert.equal(s.key.root, 'G')
  })

  it('loadScore with unknown id falls back to first score', () => {
    const s = loadScore('does-not-exist')
    assert.equal(s.id, 'c-major-scale')
  })

  it('loadScore("ode-to-joy") has correct key, tempo, and structure', () => {
    const s = loadScore('ode-to-joy')
    assert.equal(s.id, 'ode-to-joy')
    assert.equal(s.key.root, 'D')
    assert.equal(s.key.mode, 'major')
    assert.equal(s.tempo, 80)
    assert.equal(s.timeSignature[0], 4)
    assert.ok(s.phrases.length > 0)
  })

  it('loadScore("rachmaninoff-prelude-d") has correct key, tempo, and structure', () => {
    const s = loadScore('rachmaninoff-prelude-d')
    assert.equal(s.id, 'rachmaninoff-prelude-d')
    assert.equal(s.key.root, 'D')
    assert.equal(s.key.mode, 'major')
    assert.equal(s.tempo, 50)
    assert.equal(s.timeSignature[0], 3)
    assert.ok(s.phrases.length > 0)
  })

  it('all built-in notes have valid duration codes', () => {
    const validDurations = new Set(['w', 'w.', 'h', 'h.', 'q', 'q.', '8', '8.', '16', '8t'])
    for (const score of ['c-major-scale', 'twinkle', 'minuet-g', 'ode-to-joy', 'rachmaninoff-prelude-d'].map(loadScore)) {
      for (const phrase of score.phrases) {
        for (const measure of phrase.measures) {
          for (const note of measure.notes) {
            assert.ok(validDurations.has(note.duration), `invalid duration '${note.duration}' in score ${score.id}`)
          }
        }
      }
    }
  })

  it('all built-in notes beats sum to timeSignature[0] per hand', () => {
    for (const id of ['c-major-scale', 'twinkle', 'minuet-g', 'ode-to-joy', 'rachmaninoff-prelude-d']) {
      const score = loadScore(id)
      for (const phrase of score.phrases) {
        for (const measure of phrase.measures) {
          const byHand = {}
          for (const note of measure.notes) {
            const h = note.hand ?? 'right'
            byHand[h] = (byHand[h] ?? 0) + (DURATION_BEATS[note.duration] ?? 0)
          }
          for (const [hand, sum] of Object.entries(byHand)) {
            // Float tolerance: triplet eighths ('8t' = 1/3) don't sum to an integer exactly
            // (9 × 1/3 = 2.9999999999999996), so compare within epsilon rather than ===.
            assert.ok(Math.abs(sum - score.timeSignature[0]) < 1e-9,
              `${id} measure ${measure.id} hand ${hand}: expected ${score.timeSignature[0]} beats, got ${sum}`)
          }
        }
      }
    }
  })

  it('ODE_TO_JOY all 16 measures have left-hand notes', () => {
    const score = loadScore('ode-to-joy')
    for (const phrase of score.phrases) {
      for (const measure of phrase.measures) {
        const hasLeft = measure.notes.some(n => n.hand === 'left')
        assert.ok(hasLeft, `ode-to-joy measure ${measure.id} missing left-hand notes`)
      }
    }
  })

  it('ODE_TO_JOY lyrics are attached only to right-hand notes', () => {
    const score = loadScore('ode-to-joy')
    for (const phrase of score.phrases) {
      for (const measure of phrase.measures) {
        for (const note of measure.notes) {
          if (note.hand === 'left') {
            assert.equal(note.lyric, undefined,
              `${measure.id}: left-hand note must not carry a lyric`)
          }
        }
      }
    }
  })

  it('ODE_TO_JOY syllable count per measure never exceeds RH note count', () => {
    // A lyric may only sit on a RH note; a RH note may be left lyric-less
    // (melisma) or a lyric may combine several syllables on one note — but
    // there can never be more lyric'd notes than there are RH notes.
    const score = loadScore('ode-to-joy')
    for (const phrase of score.phrases) {
      for (const measure of phrase.measures) {
        const rh = measure.notes.filter(n => n.hand === 'right')
        const lyricked = rh.filter(n => n.lyric)
        assert.ok(lyricked.length <= rh.length,
          `${measure.id}: more lyrics than RH notes`)
      }
    }
  })

  it('ODE_TO_JOY lyrics reconstruct the Schiller "An die Freude" text', () => {
    const score = loadScore('ode-to-joy')
    const fragments = []
    for (const phrase of score.phrases) {
      for (const measure of phrase.measures) {
        for (const note of measure.notes) {
          if (note.hand === 'right' && note.lyric) fragments.push(note.lyric)
        }
      }
    }
    // Join word-fragments: a trailing '-' glues to the next syllable,
    // otherwise the syllable ends a word (insert a space).
    let text = ''
    for (const frag of fragments) {
      if (frag.endsWith('-')) text += frag.slice(0, -1)
      else text += frag + ' '
    }
    text = text.trim()
    assert.equal(
      text,
      'Freude schöner Götterfunken Tochter aus Elysium ' +
      'Wir betreten feuertrunken Himmlische dein Heiligtum ' +
      'Deine Zauber binden wieder was die Mode streng geteilt ' +
      'Alle Menschen werden Brüder wo dein sanfter Flügel weilt',
    )
  })

  it('RACHMANINOFF_PRELUDE_D all measures have both right- and left-hand notes', () => {
    const score = loadScore('rachmaninoff-prelude-d')
    for (const phrase of score.phrases) {
      for (const measure of phrase.measures) {
        const hasRight = measure.notes.some(n => n.hand === 'right')
        const hasLeft  = measure.notes.some(n => n.hand === 'left')
        assert.ok(hasRight, `rachmaninoff-prelude-d measure ${measure.id} missing right-hand notes`)
        assert.ok(hasLeft,  `rachmaninoff-prelude-d measure ${measure.id} missing left-hand notes`)
      }
    }
  })

  it('RACHMANINOFF_PRELUDE_D is in 3/4 at ♩=50', () => {
    const score = loadScore('rachmaninoff-prelude-d')
    assert.deepEqual(score.timeSignature, [3, 4])
    assert.equal(score.tempo, 50)
  })

  it('RACHMANINOFF_PRELUDE_D opens with two bars of RH rest', () => {
    const score = loadScore('rachmaninoff-prelude-d')
    const [m1, m2] = score.phrases[0].measures
    for (const m of [m1, m2]) {
      const rh = m.notes.filter(n => n.hand === 'right')
      assert.equal(rh.length, 1, `${m.id} RH should be a single full-bar rest`)
      assert.equal(rh[0].rest, true, `${m.id} RH note should be a rest`)
      assert.equal(rh[0].midi, undefined, `${m.id} RH rest must have no pitch`)
      assert.equal(rh[0].duration, 'h.', `${m.id} RH rest should fill 3 beats`)
    }
  })

  it('RACHMANINOFF_PRELUDE_D left hand is all triplet eighths (9 per bar)', () => {
    const score = loadScore('rachmaninoff-prelude-d')
    for (const phrase of score.phrases) {
      for (const measure of phrase.measures) {
        const lh = measure.notes.filter(n => n.hand === 'left')
        assert.equal(lh.length, 9, `${measure.id} LH should have 9 triplet eighths`)
        assert.ok(lh.every(n => n.duration === '8t'), `${measure.id} LH must all be '8t'`)
      }
    }
  })
})

describe('beatsToDurationCode', () => {
  it('snaps exact beat counts to their codes', () => {
    assert.equal(beatsToDurationCode(4), 'w')
    assert.equal(beatsToDurationCode(2), 'h')
    assert.equal(beatsToDurationCode(1), 'q')
    assert.equal(beatsToDurationCode(0.5), '8')
    assert.equal(beatsToDurationCode(0.25), '16')
  })

  it('snaps an in-between value to the nearest code', () => {
    assert.equal(beatsToDurationCode(1.4), 'q.') // 1.5 is closer than 1
  })
})

describe('DURATION_BEATS triplet eighth', () => {
  it("'8t' is one third of a quarter beat", () => {
    assert.ok(Math.abs(DURATION_BEATS['8t'] - 1 / 3) < 1e-9)
  })

  it('three triplet eighths fill (within float tolerance) one quarter beat', () => {
    const sum = DURATION_BEATS['8t'] * 3
    assert.ok(Math.abs(sum - 1) < 1e-9, `expected ~1 quarter beat, got ${sum}`)
  })
})

describe('makeUserScoreId', () => {
  it('produces distinct ids on consecutive calls (no same-tick collisions)', () => {
    const ids = new Set([makeUserScoreId(), makeUserScoreId(), makeUserScoreId()])
    assert.equal(ids.size, 3)
  })

  it('prefixes ids with "user-"', () => {
    assert.ok(makeUserScoreId().startsWith('user-'))
  })
})
