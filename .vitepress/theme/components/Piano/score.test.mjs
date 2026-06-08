import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getScaleKeys, getNonScaleKeys, getActiveKey, loadScore, listScores } from './score.js'

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
  it('listScores returns 3 entries', () => {
    const list = listScores()
    assert.equal(list.length, 3)
  })

  it('listScores entries have id, title, composer, key, tempo', () => {
    for (const entry of listScores()) {
      assert.ok(entry.id)
      assert.ok(entry.title)
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

  it('all built-in notes have valid duration codes', () => {
    const validDurations = new Set(['w', 'h', 'h.', 'q', '8', '16'])
    for (const score of ['c-major-scale', 'twinkle', 'minuet-g'].map(loadScore)) {
      for (const phrase of score.phrases) {
        for (const measure of phrase.measures) {
          for (const note of measure.notes) {
            assert.ok(validDurations.has(note.duration), `invalid duration '${note.duration}' in score ${score.id}`)
          }
        }
      }
    }
  })
})
