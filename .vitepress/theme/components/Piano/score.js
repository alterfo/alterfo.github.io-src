// ── Score model ──────────────────────────────────────────────────────────────
// Note duration codes match VexFlow: w h q 8 16
// note.midi: number or number[] (chord)
// note.hand: 'right' | 'left' | 'both'

// Pitch class sets for scales (0=C, 1=C#, ...)
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11]
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10]
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function rootToPitchClass(root) {
  const map = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 }
  return map[root] ?? 0
}

export function getScaleKeys(key) {
  const root = rootToPitchClass(key.root)
  const intervals = key.mode === 'minor' ? MINOR_INTERVALS : MAJOR_INTERVALS
  return new Set(intervals.map(i => (root + i) % 12))
}

export function getNonScaleKeys(key) {
  const inScale = getScaleKeys(key)
  const out = new Set()
  for (let i = 0; i < 12; i++) if (!inScale.has(i)) out.add(i)
  return out
}

// Get the active key at a given phrase/measure index (accounts for modulations)
export function getActiveKey(score, phraseIdx, measureIdx) {
  if (!score.modulations?.length) return score.key
  let active = score.key
  for (const mod of score.modulations) {
    if (mod.phraseIdx < phraseIdx || (mod.phraseIdx === phraseIdx && mod.measureIdx <= measureIdx)) {
      active = mod.key
    }
  }
  return active
}

// Duration in quarter-note fractions: w=4 h=2 q=1 8=0.5 16=0.25; dotted variants add 50%
export const DURATION_BEATS = { w: 4, 'w.': 6, h: 2, 'h.': 3, q: 1, 'q.': 1.5, '8': 0.5, '8.': 0.75, '16': 0.25 }

// ── Built-in scores ──────────────────────────────────────────────────────────

const C_MAJOR_SCALE = {
  id: 'c-major-scale',
  title: 'Гамма До мажор',
  composer: '',
  tempo: 80,
  key: { root: 'C', mode: 'major' },
  timeSignature: [4, 4],
  modulations: [],
  phrases: [
    {
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
        {
          id: 'm2',
          notes: [
            { midi: 67, duration: 'q', hand: 'right' },
            { midi: 69, duration: 'q', hand: 'right' },
            { midi: 71, duration: 'q', hand: 'right' },
            { midi: 72, duration: 'q', hand: 'right' },
          ],
        },
      ],
    },
    {
      id: 'p2',
      measures: [
        {
          id: 'm3',
          notes: [
            { midi: 72, duration: 'q', hand: 'right' },
            { midi: 71, duration: 'q', hand: 'right' },
            { midi: 69, duration: 'q', hand: 'right' },
            { midi: 67, duration: 'q', hand: 'right' },
          ],
        },
        {
          id: 'm4',
          notes: [
            { midi: 65, duration: 'q', hand: 'right' },
            { midi: 64, duration: 'q', hand: 'right' },
            { midi: 62, duration: 'q', hand: 'right' },
            { midi: 60, duration: 'q', hand: 'right' },
          ],
        },
      ],
    },
  ],
}

const TWINKLE = {
  id: 'twinkle',
  title: 'Twinkle Twinkle',
  composer: 'Traditional',
  tempo: 100,
  key: { root: 'C', mode: 'major' },
  timeSignature: [4, 4],
  modulations: [],
  phrases: [
    {
      id: 'p1',
      measures: [
        { id: 'm1', notes: [{ midi: 60, duration: 'q', hand: 'right' }, { midi: 60, duration: 'q', hand: 'right' }, { midi: 67, duration: 'q', hand: 'right' }, { midi: 67, duration: 'q', hand: 'right' }] },
        { id: 'm2', notes: [{ midi: 69, duration: 'q', hand: 'right' }, { midi: 69, duration: 'q', hand: 'right' }, { midi: 67, duration: 'h', hand: 'right' }] },
      ],
    },
    {
      id: 'p2',
      measures: [
        { id: 'm3', notes: [{ midi: 65, duration: 'q', hand: 'right' }, { midi: 65, duration: 'q', hand: 'right' }, { midi: 64, duration: 'q', hand: 'right' }, { midi: 64, duration: 'q', hand: 'right' }] },
        { id: 'm4', notes: [{ midi: 62, duration: 'q', hand: 'right' }, { midi: 62, duration: 'q', hand: 'right' }, { midi: 60, duration: 'h', hand: 'right' }] },
      ],
    },
    {
      id: 'p3',
      measures: [
        { id: 'm5', notes: [{ midi: 67, duration: 'q', hand: 'right' }, { midi: 67, duration: 'q', hand: 'right' }, { midi: 65, duration: 'q', hand: 'right' }, { midi: 65, duration: 'q', hand: 'right' }] },
        { id: 'm6', notes: [{ midi: 64, duration: 'q', hand: 'right' }, { midi: 64, duration: 'q', hand: 'right' }, { midi: 62, duration: 'h', hand: 'right' }] },
      ],
    },
    {
      id: 'p4',
      measures: [
        { id: 'm7', notes: [{ midi: 67, duration: 'q', hand: 'right' }, { midi: 67, duration: 'q', hand: 'right' }, { midi: 65, duration: 'q', hand: 'right' }, { midi: 65, duration: 'q', hand: 'right' }] },
        { id: 'm8', notes: [{ midi: 64, duration: 'q', hand: 'right' }, { midi: 64, duration: 'q', hand: 'right' }, { midi: 62, duration: 'h', hand: 'right' }] },
      ],
    },
    {
      id: 'p5',
      measures: [
        { id: 'm9', notes: [{ midi: 60, duration: 'q', hand: 'right' }, { midi: 60, duration: 'q', hand: 'right' }, { midi: 67, duration: 'q', hand: 'right' }, { midi: 67, duration: 'q', hand: 'right' }] },
        { id: 'm10', notes: [{ midi: 69, duration: 'q', hand: 'right' }, { midi: 69, duration: 'q', hand: 'right' }, { midi: 67, duration: 'h', hand: 'right' }] },
      ],
    },
    {
      id: 'p6',
      measures: [
        { id: 'm11', notes: [{ midi: 65, duration: 'q', hand: 'right' }, { midi: 65, duration: 'q', hand: 'right' }, { midi: 64, duration: 'q', hand: 'right' }, { midi: 64, duration: 'q', hand: 'right' }] },
        { id: 'm12', notes: [{ midi: 62, duration: 'q', hand: 'right' }, { midi: 62, duration: 'q', hand: 'right' }, { midi: 60, duration: 'h', hand: 'right' }] },
      ],
    },
  ],
}

// Minuet in G by Christian Petzold (attr. Bach), simplified right hand
const MINUET_G = {
  id: 'minuet-g',
  title: 'Менуэт соль мажор',
  composer: 'C. Petzold',
  tempo: 126,
  key: { root: 'G', mode: 'major' },
  timeSignature: [3, 4],
  modulations: [
    // brief tonicisation to D major starting at phrase 2 measure 1
    { phraseIdx: 1, measureIdx: 0, key: { root: 'D', mode: 'major' } },
    // return to G
    { phraseIdx: 2, measureIdx: 0, key: { root: 'G', mode: 'major' } },
  ],
  phrases: [
    {
      id: 'p1',
      measures: [
        { id: 'm1', notes: [{ midi: 67, duration: 'q', hand: 'right' }, { midi: 72, duration: 'q', hand: 'right' }, { midi: 71, duration: 'q', hand: 'right' }] },
        { id: 'm2', notes: [{ midi: 69, duration: 'q', hand: 'right' }, { midi: 67, duration: 'q', hand: 'right' }, { midi: 64, duration: 'q', hand: 'right' }] },
        { id: 'm3', notes: [{ midi: 65, duration: 'q', hand: 'right' }, { midi: 69, duration: 'q', hand: 'right' }, { midi: 67, duration: 'q', hand: 'right' }] },
        { id: 'm4', notes: [{ midi: 65, duration: 'q', hand: 'right' }, { midi: 64, duration: 'h', hand: 'right' }] },
      ],
    },
    {
      id: 'p2',
      measures: [
        { id: 'm5', notes: [{ midi: 62, duration: 'q', hand: 'right' }, { midi: 66, duration: 'q', hand: 'right' }, { midi: 69, duration: 'q', hand: 'right' }] },
        { id: 'm6', notes: [{ midi: 71, duration: 'q', hand: 'right' }, { midi: 69, duration: 'q', hand: 'right' }, { midi: 67, duration: 'q', hand: 'right' }] },
        { id: 'm7', notes: [{ midi: 66, duration: 'q', hand: 'right' }, { midi: 69, duration: 'q', hand: 'right' }, { midi: 71, duration: 'q', hand: 'right' }] },
        { id: 'm8', notes: [{ midi: 74, duration: 'h.', hand: 'right' }] },
      ],
    },
    {
      id: 'p3',
      measures: [
        { id: 'm9', notes: [{ midi: 72, duration: 'q', hand: 'right' }, { midi: 71, duration: 'q', hand: 'right' }, { midi: 69, duration: 'q', hand: 'right' }] },
        { id: 'm10', notes: [{ midi: 67, duration: 'q', hand: 'right' }, { midi: 64, duration: 'q', hand: 'right' }, { midi: 67, duration: 'q', hand: 'right' }] },
        { id: 'm11', notes: [{ midi: 65, duration: 'q', hand: 'right' }, { midi: 69, duration: 'q', hand: 'right' }, { midi: 67, duration: 'q', hand: 'right' }] },
        { id: 'm12', notes: [{ midi: 65, duration: 'q', hand: 'right' }, { midi: 64, duration: 'h', hand: 'right' }] },
      ],
    },
  ],
}

const SCORES = [C_MAJOR_SCALE, TWINKLE, MINUET_G]

export function listScores() {
  return SCORES.map(s => ({ id: s.id, title: s.title, composer: s.composer, key: s.key, tempo: s.tempo }))
}

export function loadScore(id) {
  return SCORES.find(s => s.id === id) ?? SCORES[0]
}
