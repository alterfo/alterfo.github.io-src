// ── MusicXML importer ─────────────────────────────────────────────────────────
// parseMusicXML(xmlString) → Score (see Piano/score.js for the shape).
//
// Targets score-partwise piano exports from MuseScore / Finale / Sibelius /
// Dorico: a single part with a grand staff (<staff>1</staff> = RH, 2 = LH),
// chords flagged by <chord/>, key as <fifths>+<mode>, time as <time>.
//
// We deliberately ship a tiny self-contained XML→tree parser rather than depend
// on the browser DOMParser: the same code then runs unchanged under `node --test`
// (no DOMParser there) and keeps the module dependency-free. The parser handles
// the well-formed XML notation editors emit — it is not a general XML validator.

import { beatsToDurationCode, makeUserScoreId } from '../score.js'

// ── Minimal XML parser ────────────────────────────────────────────────────────

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&') // last, so "&amp;lt;" survives as "&lt;"
}

function parseAttrs(str) {
  const attrs = {}
  const re = /([\w.\-:]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let m
  while ((m = re.exec(str)) !== null) {
    attrs[m[1]] = decodeEntities(m[2] ?? m[3] ?? '')
  }
  return attrs
}

// Build a tree of { tag, attrs, children } / { text } nodes from an XML string.
function parseXml(xml) {
  const root = { tag: '#root', attrs: {}, children: [] }
  const stack = [root]
  const tagRe = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([A-Za-z_][\w.\-:]*)\s*>|<([A-Za-z_][\w.\-:]*)((?:\s+[\w.\-:]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g

  let lastIndex = 0
  let m
  while ((m = tagRe.exec(xml)) !== null) {
    const between = xml.slice(lastIndex, m.index)
    if (between.trim()) stack[stack.length - 1].children.push({ text: decodeEntities(between) })
    lastIndex = tagRe.lastIndex

    const full = m[0]
    if (full.startsWith('<!--') || full.startsWith('<?') || full.startsWith('<!DOCTYPE')) continue
    if (full.startsWith('<![CDATA[')) {
      stack[stack.length - 1].children.push({ text: m[1] })
      continue
    }
    if (m[2]) {
      // closing tag: pop back to the matching open element
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === m[2]) { stack.length = i; break }
      }
      continue
    }
    const node = { tag: m[3], attrs: parseAttrs(m[4] || ''), children: [] }
    stack[stack.length - 1].children.push(node)
    if (m[5] !== '/') stack.push(node)
  }
  return root
}

const child = (node, tag) => node?.children.find(c => c.tag === tag)
const childrenOf = (node, tag) => (node ? node.children.filter(c => c.tag === tag) : [])
const text = node => (node ? node.children.filter(c => 'text' in c).map(c => c.text).join('').trim() : '')

function findAll(node, tag) {
  const out = []
  const walk = n => {
    for (const c of n.children || []) {
      if (c.tag === tag) out.push(c)
      if (c.children) walk(c)
    }
  }
  walk(node)
  return out
}

// ── MusicXML semantics ────────────────────────────────────────────────────────

const STEP_OFFSET = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

function xmlNoteToMidi(step, octave, alter = 0) {
  return (octave + 1) * 12 + STEP_OFFSET[step] + alter
}

const XML_TYPE_TO_DUR = {
  whole: 'w', half: 'h', quarter: 'q', eighth: '8', '16th': '16', '32nd': '16',
}

// <fifths> → tonic name; separate tables for major and (relative) minor keys.
const FIFTHS_TO_MAJOR = {
  '0': 'C', '1': 'G', '2': 'D', '3': 'A', '4': 'E', '5': 'B', '6': 'F#', '7': 'C#',
  '-1': 'F', '-2': 'Bb', '-3': 'Eb', '-4': 'Ab', '-5': 'Db', '-6': 'Gb', '-7': 'Cb',
}
const FIFTHS_TO_MINOR = {
  '0': 'A', '1': 'E', '2': 'B', '3': 'F#', '4': 'C#', '5': 'G#', '6': 'D#', '7': 'A#',
  '-1': 'D', '-2': 'G', '-3': 'C', '-4': 'F', '-5': 'Bb', '-6': 'Eb', '-7': 'Ab',
}

function xmlDuration(note, divisions) {
  const type = text(child(note, 'type'))
  const dotted = !!child(note, 'dot')
  if (type && XML_TYPE_TO_DUR[type]) return XML_TYPE_TO_DUR[type] + (dotted ? '.' : '')
  // fallback: <duration> is in divisions-per-quarter ticks
  const dur = parseInt(text(child(note, 'duration')) || '0', 10)
  const beats = divisions ? dur / divisions : 1
  return beatsToDurationCode(beats)
}

function parseKey(root) {
  const keyEl = findAll(root, 'key')[0]
  if (!keyEl) return { root: 'C', mode: 'major' }
  const fifths = String(parseInt(text(child(keyEl, 'fifths')) || '0', 10))
  const isMinor = (text(child(keyEl, 'mode')) || 'major').toLowerCase() === 'minor'
  const table = isMinor ? FIFTHS_TO_MINOR : FIFTHS_TO_MAJOR
  return { root: table[fifths] ?? 'C', mode: isMinor ? 'minor' : 'major' }
}

function parseTimeSig(root) {
  const t = findAll(root, 'time')[0]
  if (!t) return [4, 4]
  return [
    parseInt(text(child(t, 'beats')) || '4', 10),
    parseInt(text(child(t, 'beat-type')) || '4', 10),
  ]
}

function parseTempo(root) {
  for (const s of findAll(root, 'sound')) {
    if (s.attrs.tempo) return Math.round(parseFloat(s.attrs.tempo))
  }
  const pm = findAll(root, 'per-minute')[0]
  if (pm) {
    const v = parseFloat(text(pm))
    if (v) return Math.round(v)
  }
  return 100
}

function parseTitle(root) {
  for (const tag of ['work-title', 'movement-title']) {
    const el = findAll(root, tag)[0]
    if (el && text(el)) return text(el)
  }
  return 'Импортированная пьеса'
}

function parseComposer(root) {
  for (const c of findAll(root, 'creator')) {
    if (c.attrs.type === 'composer') return text(c)
  }
  return ''
}

export function parseMusicXML(xmlString) {
  const root = parseXml(xmlString)
  if (!findAll(root, 'note').length) throw new Error('MusicXML: ноты не найдены')

  // Accumulate notes by measure number (document order preserved by the Map).
  // Only the first <part> is read — a piano grand staff is a single part with two
  // staves; merging extra parts (other instruments) would overlay unrelated notes.
  const measureMap = new Map()
  let divisions = 1
  const firstPart = findAll(root, 'part')[0]
  if (firstPart) {
    for (const measure of childrenOf(firstPart, 'measure')) {
      const num = parseInt(measure.attrs.number ?? String(measureMap.size + 1), 10)
      const attrs = child(measure, 'attributes')
      if (attrs) {
        const div = text(child(attrs, 'divisions'))
        if (div) divisions = parseInt(div, 10)
      }
      if (!measureMap.has(num)) measureMap.set(num, [])
      const notes = measureMap.get(num)
      let lastNote = null
      for (const note of childrenOf(measure, 'note')) {
        if (child(note, 'rest')) { lastNote = null; continue }
        const pitch = child(note, 'pitch')
        if (!pitch) { lastNote = null; continue }
        const step = text(child(pitch, 'step'))
        const octave = parseInt(text(child(pitch, 'octave')), 10)
        const alterTxt = text(child(pitch, 'alter'))
        const midi = xmlNoteToMidi(step, octave, alterTxt ? parseInt(alterTxt, 10) : 0)
        if (!Number.isFinite(midi)) { lastNote = null; continue } // missing/unknown step or octave

        if (child(note, 'chord') && lastNote) {
          lastNote.midi = Array.isArray(lastNote.midi) ? [...lastNote.midi, midi] : [lastNote.midi, midi]
          continue
        }
        const hand = text(child(note, 'staff')) === '2' ? 'left' : 'right'
        lastNote = { midi, duration: xmlDuration(note, divisions), hand }
        notes.push(lastNote)
      }
    }
  }

  // Group measures into phrases of 4.
  const measureNotes = [...measureMap.values()]
  const phrases = []
  const PER_PHRASE = 4
  for (let i = 0; i < measureNotes.length; i += PER_PHRASE) {
    phrases.push({
      id: `p${phrases.length + 1}`,
      measures: measureNotes.slice(i, i + PER_PHRASE).map((notes, j) => ({ id: `m${i + j + 1}`, notes })),
    })
  }

  return {
    id: makeUserScoreId(),
    title: parseTitle(root),
    composer: parseComposer(root),
    tempo: parseTempo(root),
    key: parseKey(root),
    timeSignature: parseTimeSig(root),
    modulations: [],
    phrases,
    userImported: true,
  }
}
