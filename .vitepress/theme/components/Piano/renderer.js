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
    autoResize: false,
    backend: 'svg',
    drawTitle: false,
    drawSubtitle: false,
    drawComposer: false,
    drawCredits: false,
    drawPartNames: false,
    drawPartAbbreviations: false,
    drawMeasureNumbers: false,
    drawMetronomeMarks: false,
    drawFingerings: false,
    pageFormat: 'Endless',
    darkMode: true,
    pageBackgroundColor: '#1a1a2e',
  })
  _osmd.zoom = 0.75

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
