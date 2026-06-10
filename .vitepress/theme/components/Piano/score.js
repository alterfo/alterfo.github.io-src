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

export function midiToNoteName(midi) {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1)
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
// '8t' = triplet eighth = 1/3 of a quarter beat (three of them fill one quarter beat)
export const DURATION_BEATS = { w: 4, 'w.': 6, h: 2, 'h.': 3, q: 1, 'q.': 1.5, '8': 0.5, '8.': 0.75, '16': 0.25, '8t': 1 / 3 }

// Snap a beat count (in quarter notes) to the nearest VexFlow duration code.
// Shared by the MusicXML / ABC / MIDI importers.
export function beatsToDurationCode(beats) {
  let best = 'q'
  let bestDiff = Infinity
  for (const [code, b] of Object.entries(DURATION_BEATS)) {
    const d = Math.abs(beats - b)
    if (d < bestDiff) { bestDiff = d; best = code }
  }
  return best
}

// Collision-resistant id for a user-imported score. A module-level counter (shared
// across all three importers, which import this same module instance) guarantees
// uniqueness even for several imports within the same millisecond.
let _userScoreSeq = 0
export function makeUserScoreId() {
  return `user-${Date.now()}-${++_userScoreSeq}`
}

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

const ODE_TO_JOY = {
  id: 'ode-to-joy',
  title: 'Ода к Радости',
  composer: 'L. van Beethoven, op. 125',
  tempo: 80,
  key: { root: 'D', mode: 'major' },
  timeSignature: [4, 4],
  modulations: [],
  phrases: [
    {
      id: 'p1',
      measures: [
        { id: 'm1', notes: [
          { midi: 64, duration: 'q', hand: 'right' },
          { midi: 64, duration: 'q', hand: 'right' },
          { midi: 66, duration: 'q', hand: 'right' },
          { midi: 67, duration: 'q', hand: 'right' },
          { midi: 50, duration: 'q', hand: 'left'  }, // D3
          { midi: 57, duration: 'q', hand: 'left'  }, // A3
          { midi: 50, duration: 'q', hand: 'left'  }, // D3
          { midi: 57, duration: 'q', hand: 'left'  }, // A3
        ]},
        { id: 'm2', notes: [
          { midi: 67, duration: 'q', hand: 'right' },
          { midi: 66, duration: 'q', hand: 'right' },
          { midi: 64, duration: 'q', hand: 'right' },
          { midi: 62, duration: 'q', hand: 'right' },
          { midi: 50, duration: 'q', hand: 'left'  }, // D3
          { midi: 57, duration: 'q', hand: 'left'  }, // A3
          { midi: 50, duration: 'q', hand: 'left'  }, // D3
          { midi: 57, duration: 'q', hand: 'left'  }, // A3
        ]},
        { id: 'm3', notes: [
          { midi: 61, duration: 'q', hand: 'right' },
          { midi: 61, duration: 'q', hand: 'right' },
          { midi: 62, duration: 'q', hand: 'right' },
          { midi: 64, duration: 'q', hand: 'right' },
          { midi: 45, duration: 'q', hand: 'left'  }, // A2
          { midi: 52, duration: 'q', hand: 'left'  }, // E3
          { midi: 45, duration: 'q', hand: 'left'  }, // A2
          { midi: 52, duration: 'q', hand: 'left'  }, // E3
        ]},
        { id: 'm4', notes: [
          { midi: 64, duration: 'q.', hand: 'right' },
          { midi: 62, duration: '8',  hand: 'right' },
          { midi: 62, duration: 'h',  hand: 'right' },
          { midi: 45, duration: 'q',  hand: 'left'  }, // A2
          { midi: 52, duration: 'q',  hand: 'left'  }, // E3
          { midi: 50, duration: 'h',  hand: 'left'  }, // D3
        ]},
      ],
    },
    {
      id: 'p2',
      measures: [
        { id: 'm5', notes: [
          { midi: 64, duration: 'q', hand: 'right' },
          { midi: 64, duration: 'q', hand: 'right' },
          { midi: 66, duration: 'q', hand: 'right' },
          { midi: 67, duration: 'q', hand: 'right' },
          { midi: 50, duration: 'q', hand: 'left'  }, // D3
          { midi: 57, duration: 'q', hand: 'left'  }, // A3
          { midi: 50, duration: 'q', hand: 'left'  }, // D3
          { midi: 57, duration: 'q', hand: 'left'  }, // A3
        ]},
        { id: 'm6', notes: [
          { midi: 67, duration: 'q', hand: 'right' },
          { midi: 66, duration: 'q', hand: 'right' },
          { midi: 64, duration: 'q', hand: 'right' },
          { midi: 62, duration: 'q', hand: 'right' },
          { midi: 50, duration: 'q', hand: 'left'  }, // D3
          { midi: 57, duration: 'q', hand: 'left'  }, // A3
          { midi: 50, duration: 'q', hand: 'left'  }, // D3
          { midi: 57, duration: 'q', hand: 'left'  }, // A3
        ]},
        { id: 'm7', notes: [
          { midi: 61, duration: 'q', hand: 'right' },
          { midi: 61, duration: 'q', hand: 'right' },
          { midi: 62, duration: 'q', hand: 'right' },
          { midi: 64, duration: 'q', hand: 'right' },
          { midi: 45, duration: 'q', hand: 'left'  }, // A2
          { midi: 52, duration: 'q', hand: 'left'  }, // E3
          { midi: 45, duration: 'q', hand: 'left'  }, // A2
          { midi: 52, duration: 'q', hand: 'left'  }, // E3
        ]},
        { id: 'm8', notes: [
          { midi: 62, duration: 'q.', hand: 'right' },
          { midi: 61, duration: '8',  hand: 'right' },
          { midi: 61, duration: 'h',  hand: 'right' },
          { midi: 45, duration: 'q',  hand: 'left'  }, // A2
          { midi: 52, duration: 'q',  hand: 'left'  }, // E3
          { midi: 45, duration: 'h',  hand: 'left'  }, // A2
        ]},
      ],
    },
    {
      id: 'p3',
      measures: [
        { id: 'm9', notes: [
          { midi: 62, duration: 'q', hand: 'right' },
          { midi: 62, duration: 'q', hand: 'right' },
          { midi: 64, duration: 'q', hand: 'right' },
          { midi: 61, duration: 'q', hand: 'right' },
          { midi: 50, duration: 'q', hand: 'left'  }, // D3
          { midi: 57, duration: 'q', hand: 'left'  }, // A3
          { midi: 50, duration: 'q', hand: 'left'  }, // D3
          { midi: 45, duration: 'q', hand: 'left'  }, // A2
        ]},
        { id: 'm10', notes: [
          { midi: 62, duration: 'q',  hand: 'right' },
          { midi: 64, duration: '8',  hand: 'right' },
          { midi: 66, duration: '8',  hand: 'right' },
          { midi: 64, duration: 'q',  hand: 'right' },
          { midi: 62, duration: 'q',  hand: 'right' },
          { midi: 50, duration: 'q',  hand: 'left'  }, // D3
          { midi: 50, duration: '8',  hand: 'left'  }, // D3
          { midi: 57, duration: '8',  hand: 'left'  }, // A3
          { midi: 57, duration: 'q',  hand: 'left'  }, // A3
          { midi: 50, duration: 'q',  hand: 'left'  }, // D3
        ]},
        { id: 'm11', notes: [
          { midi: 61, duration: 'q',  hand: 'right' },
          { midi: 62, duration: 'q',  hand: 'right' },
          { midi: 64, duration: '8',  hand: 'right' },
          { midi: 66, duration: '8',  hand: 'right' },
          { midi: 64, duration: 'q',  hand: 'right' },
          { midi: 45, duration: 'q',  hand: 'left'  }, // A2
          { midi: 45, duration: 'q',  hand: 'left'  }, // A2
          { midi: 45, duration: '8',  hand: 'left'  }, // A2
          { midi: 52, duration: '8',  hand: 'left'  }, // E3
          { midi: 45, duration: 'q',  hand: 'left'  }, // A2
        ]},
        { id: 'm12', notes: [
          { midi: 62, duration: 'h.',  hand: 'right' },
          { midi: 61, duration: 'q',   hand: 'right' },
          { midi: 50, duration: 'h.',  hand: 'left'  }, // D3
          { midi: 45, duration: 'q',   hand: 'left'  }, // A2
        ]},
      ],
    },
    {
      id: 'p4',
      measures: [
        { id: 'm13', notes: [
          { midi: 64, duration: 'q', hand: 'right' },
          { midi: 64, duration: 'q', hand: 'right' },
          { midi: 66, duration: 'q', hand: 'right' },
          { midi: 67, duration: 'q', hand: 'right' },
          { midi: 50, duration: 'q', hand: 'left'  }, // D3
          { midi: 57, duration: 'q', hand: 'left'  }, // A3
          { midi: 50, duration: 'q', hand: 'left'  }, // D3
          { midi: 57, duration: 'q', hand: 'left'  }, // A3
        ]},
        { id: 'm14', notes: [
          { midi: 67, duration: 'q', hand: 'right' },
          { midi: 66, duration: 'q', hand: 'right' },
          { midi: 64, duration: 'q', hand: 'right' },
          { midi: 62, duration: 'q', hand: 'right' },
          { midi: 50, duration: 'q', hand: 'left'  }, // D3
          { midi: 57, duration: 'q', hand: 'left'  }, // A3
          { midi: 50, duration: 'q', hand: 'left'  }, // D3
          { midi: 57, duration: 'q', hand: 'left'  }, // A3
        ]},
        { id: 'm15', notes: [
          { midi: 61, duration: 'q', hand: 'right' },
          { midi: 61, duration: 'q', hand: 'right' },
          { midi: 62, duration: 'q', hand: 'right' },
          { midi: 64, duration: 'q', hand: 'right' },
          { midi: 45, duration: 'q', hand: 'left'  }, // A2
          { midi: 52, duration: 'q', hand: 'left'  }, // E3
          { midi: 45, duration: 'q', hand: 'left'  }, // A2
          { midi: 52, duration: 'q', hand: 'left'  }, // E3
        ]},
        { id: 'm16', notes: [
          { midi: 62, duration: 'w', hand: 'right' },
          { midi: 50, duration: 'w', hand: 'left'  }, // D3
        ]},
      ],
    },
  ],
}

// Rachmaninoff Prelude in D major, Op. 23 No. 4, Andante cantabile
// RH: cantabile melody; LH: flowing 8th-note arpeggios (8 per measure = 4 beats)
// Rachmaninoff Prelude Op. 23 No. 4 — LEFT-HAND figuration.
// In 3/4 the LH plays a continuous arpeggio in triplet eighths: 9 notes per bar
// (3 triplet groups × 3), arpeggiating the bar's triad up two octaves and back.
// 9 × DURATION_BEATS['8t'] (=1/3) ≈ 3 beats. Pitch arrays follow the shape of the
// score's opening bar: root, third, fifth, root+8ve, third+8ve, fifth+8ve, fifth, third, root.
const _arpLH = (pitches) => pitches.map((midi) => ({ midi, duration: '8t', hand: 'left' }))
const ARP_D  = [38, 42, 45, 50, 54, 57, 45, 42, 38] // D  major   (D2 F#2 A2 D3 F#3 A3 A2 F#2 D2)
const ARP_A  = [45, 49, 52, 57, 61, 64, 52, 49, 45] // A  major   (A2 C#3 E3 A3 C#4 E4 E3 C#3 A2)
const ARP_G  = [43, 47, 50, 55, 59, 62, 50, 47, 43] // G  major   (G2 B2 D3 G3 B3 D4 D3 B2 G2)
const ARP_BM = [47, 50, 54, 59, 62, 66, 54, 50, 47] // B  minor   (B2 D3 F#3 B3 D4 F#4 F#3 D3 B2)
const ARP_E  = [40, 44, 47, 52, 56, 59, 47, 44, 40] // E  major   (E2 G#2 B2 E3 G#3 B3 B2 G#2 E2)

const RACHMANINOFF_PRELUDE_D = {
  id: 'rachmaninoff-prelude-d',
  title: 'Прелюдия ре мажор Op. 23 №4',
  composer: 'С. Рахманинов',
  tempo: 50, // Andante cantabile ♩=50 (per the score)
  key: { root: 'D', mode: 'major' },
  timeSignature: [3, 4], // 3/4 per the score (was incorrectly 4/4)
  modulations: [
    // brief colour toward B minor in phrase 3
    { phraseIdx: 2, measureIdx: 0, key: { root: 'B', mode: 'minor' } },
    // return to D major for reprise
    { phraseIdx: 3, measureIdx: 0, key: { root: 'D', mode: 'major' } },
  ],
  phrases: [
    // ─── Phrase 1 — LH intro (2 bars), then the cantabile theme enters ────────
    {
      id: 'p1',
      measures: [
        // m1-m2: RH silent (full-bar rest) while the LH arpeggio sets the scene — "pp"
        { id: 'm1', notes: [
          { duration: 'h.', hand: 'right', rest: true }, // RH rest (3 beats in 3/4)
          ..._arpLH(ARP_D), // D major
        ]},
        { id: 'm2', notes: [
          { duration: 'h.', hand: 'right', rest: true }, // RH rest
          ..._arpLH(ARP_A), // A major (dominant)
        ]},
        // m3: RH cantilena enters — "mf sempre cantabile"
        { id: 'm3', notes: [
          { midi: [66,57], duration: '8', hand: 'right' }, // F#4+A3
          { midi: [67,59], duration: '8', hand: 'right' }, // G4+B3
          { midi: [69,61], duration: 'q', hand: 'right' }, // A4+C#4
          { midi: [71,62], duration: 'q', hand: 'right' }, // B4+D4   → RH 3
          ..._arpLH(ARP_D), // D major
        ]},
        { id: 'm4', notes: [
          { midi: [73,64], duration: 'h', hand: 'right' }, // C#5+E4  (2)
          { midi: [74,66], duration: 'q', hand: 'right' }, // D5+F#4  (1) → RH 3
          ..._arpLH(ARP_A), // A major
        ]},
      ],
    },
    // ─── Phrase 2 — variation, rises to E5 ───────────────────────────────────
    {
      id: 'p2',
      measures: [
        { id: 'm5', notes: [
          { midi: [76,67], duration: 'q', hand: 'right' }, // E5+G4
          { midi: [74,66], duration: 'q', hand: 'right' }, // D5+F#4
          { midi: [73,64], duration: 'q', hand: 'right' }, // C#5+E4  → RH 3
          ..._arpLH(ARP_D), // D major
        ]},
        { id: 'm6', notes: [
          { midi: [71,62], duration: 'h', hand: 'right' }, // B4+D4   (2)
          { midi: [69,61], duration: 'q', hand: 'right' }, // A4+C#4  (1) → RH 3
          ..._arpLH(ARP_G), // G major
        ]},
        { id: 'm7', notes: [
          { midi: [67,59], duration: '8', hand: 'right' }, // G4+B3
          { midi: [69,61], duration: '8', hand: 'right' }, // A4+C#4
          { midi: [71,62], duration: 'q', hand: 'right' }, // B4+D4
          { midi: [73,64], duration: 'q', hand: 'right' }, // C#5+E4  → RH 3
          ..._arpLH(ARP_A), // A major
        ]},
        { id: 'm8', notes: [
          { midi: [74,66], duration: 'h.', hand: 'right' }, // D5+F#4  (3, held)
          ..._arpLH(ARP_D), // D major
        ]},
      ],
    },
    // ─── Phrase 3 — development toward B minor (climax on F#5) ─────────────────
    {
      id: 'p3',
      measures: [
        { id: 'm9', notes: [
          { midi: [78,69], duration: 'q', hand: 'right' }, // F#5+A4  (climax)
          { midi: [76,67], duration: 'q', hand: 'right' }, // E5+G4
          { midi: [74,66], duration: 'q', hand: 'right' }, // D5+F#4  → RH 3
          ..._arpLH(ARP_BM), // B minor
        ]},
        { id: 'm10', notes: [
          { midi: [73,64], duration: 'h', hand: 'right' }, // C#5+E4  (2)
          { midi: [71,62], duration: 'q', hand: 'right' }, // B4+D4   (1) → RH 3
          ..._arpLH(ARP_E), // E major
        ]},
        { id: 'm11', notes: [
          { midi: [69,61], duration: '8', hand: 'right' }, // A4+C#4
          { midi: [71,62], duration: '8', hand: 'right' }, // B4+D4
          { midi: [73,64], duration: 'q', hand: 'right' }, // C#5+E4
          { midi: [74,66], duration: 'q', hand: 'right' }, // D5+F#4  → RH 3
          ..._arpLH(ARP_D), // D major
        ]},
        { id: 'm12', notes: [
          { midi: [76,67], duration: 'h', hand: 'right' }, // E5+G4   (2)
          { midi: [74,66], duration: 'q', hand: 'right' }, // D5+F#4  (1) → RH 3
          ..._arpLH(ARP_A), // A major
        ]},
      ],
    },
    // ─── Phrase 4 — reprise and D major cadence ───────────────────────────────
    {
      id: 'p4',
      measures: [
        { id: 'm13', notes: [
          { midi: [74,66], duration: 'q', hand: 'right' }, // D5+F#4
          { midi: [73,64], duration: 'q', hand: 'right' }, // C#5+E4
          { midi: [71,62], duration: 'q', hand: 'right' }, // B4+D4   → RH 3
          ..._arpLH(ARP_D), // D major
        ]},
        { id: 'm14', notes: [
          { midi: [69,61], duration: 'h', hand: 'right' }, // A4+C#4  (2)
          { midi: [67,59], duration: 'q', hand: 'right' }, // G4+B3   (1) → RH 3
          ..._arpLH(ARP_A), // A major
        ]},
        { id: 'm15', notes: [
          { midi: [66,57], duration: '8', hand: 'right' }, // F#4+A3
          { midi: [67,59], duration: '8', hand: 'right' }, // G4+B3
          { midi: [69,61], duration: 'q', hand: 'right' }, // A4+C#4
          { midi: [74,66], duration: 'q', hand: 'right' }, // D5+F#4  → RH 3
          ..._arpLH(ARP_D), // D major
        ]},
        { id: 'm16', notes: [
          { midi: [74,66], duration: 'h.', hand: 'right' }, // D5+F#4  (3, final cadence)
          ..._arpLH(ARP_D), // D major
        ]},
      ],
    },
  ],
}

const SCORES = [C_MAJOR_SCALE, TWINKLE, MINUET_G, ODE_TO_JOY, RACHMANINOFF_PRELUDE_D]

export function listScores() {
  return SCORES.map(s => ({ id: s.id, title: s.title, composer: s.composer, key: s.key, tempo: s.tempo }))
}

export function loadScore(id) {
  return SCORES.find(s => s.id === id) ?? SCORES[0]
}
