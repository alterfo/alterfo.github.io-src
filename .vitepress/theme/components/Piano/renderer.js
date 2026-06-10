// Piano/renderer.js — OSMD-based score renderer (replaces VexFlow).
// renderPhrase is browser-only (OSMD needs a DOM).
// Static import: renderer.js is already inside a dynamic chunk (lazy-loaded by Piano.vue),
// so OSMD only loads on /piano — not in the shared app bundle.
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import { phraseToMusicXML } from './musicxml.js'

let _osmd = null
let _osmdContainer = null

async function getOSMD(container) {
  if (_osmd && _osmdContainer === container) return _osmd

  if (_osmd) {
    try { if (typeof _osmd.dispose === 'function') _osmd.dispose() } catch {}
    _osmd = null
  }

  _osmdContainer = container

  _osmd = new OpenSheetMusicDisplay(container, {
    autoResize: true,
    backend: 'svg',
    drawTitle: false,
    drawSubtitle: false,
    drawComposer: false,
    drawCredits: false,
    drawPartNames: false,
    drawPartAbbreviations: false,
    drawMeasureNumbers: true,
    drawMetronomeMarks: false,
    drawFingerings: false,
    pageFormat: 'Endless',
    darkMode: true,
    pageBackgroundColor: 'transparent',
    newSystemFromXML: false,
    newPageFromXML: false,
  })
  _osmd.zoom = 1.0

  // Beaming comes from explicit <beam> elements in the generated MusicXML
  // (computeBeamSpecs in musicxml.js) — triplets group in threes, plain eighths by
  // beat. OSMD's AutoBeamNotes is deliberately NOT enabled: it ignores tuplet
  // boundaries and produces crooked two-note beams across the prelude's arpeggios.

  // Spread crowded passages evenly. Dense LH runs under sustained RH chords (e.g. the
  // Rachmaninoff prelude's triplet-eighth arpeggios) otherwise bunch up where VexFlow
  // aligns them to the wide RH note heads. Larger min-distance + voice multiplier gives
  // each note breathing room; the stave scrolls horizontally so extra width is fine.
  _osmd.rules.MinNoteDistance = 4
  _osmd.rules.VoiceSpacingMultiplierVexflow = 1.1

  return _osmd
}

export function hasLeftHand(phrase) {
  return phrase.measures.some(m => m.notes.some(n => n.hand === 'left'))
}

/**
 * Render a full phrase into `container` using OSMD.
 * Same external API as the former VexFlow renderPhrase.
 * cursor: { measureIdx, noteIdx, lookahead, wrongNoteIdx }
 */
export async function renderPhrase(container, phrase, cursor = {}, score = null) {
  const phraseIdx = score?.phrases?.findIndex(p => p.id === phrase.id) ?? 0
  const osmd = await getOSMD(container)
  const xml = phraseToMusicXML(phrase, score, phraseIdx, cursor)
  await osmd.load(xml)
  osmd.render()
}
