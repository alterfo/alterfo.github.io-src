// OpenPose/editor.js — interactive keypoint editing.
//
// Two layers:
//   - pure helpers (moveKeypoint / addPerson / removePerson) — no DOM, unit-tested
//   - useSkeletonEditor() — a transparent SVG overlay of draggable circles laid
//     exactly over the preview canvas; drag a circle → update the keypoint and
//     re-render the canvas live.

import { emptySkeleton, OPENPOSE_KEYPOINTS } from './skeleton.js'
import { CONFIDENCE_THRESHOLD } from './renderer.js'

// At most two people per image (BlazePose numPoses = 2).
export const MAX_PERSONS = 2

// Per-person handle colors. Person 0 blue, person 1 orange.
export const PERSON_COLORS = ['#4fc3f7', '#ffb74d']

const SVG_NS = 'http://www.w3.org/2000/svg'

// ─────────────────────────────────────────────────────────────
// Pure helpers (testable without a DOM)
// ─────────────────────────────────────────────────────────────

// Move keypoint `index` of `skeleton` to (x, y). A dragged point is, by
// definition, deliberately placed → mark it fully confident (1.0) so it always
// renders. Mutates in place; returns the skeleton. No-op for a bad index.
export function moveKeypoint(skeleton, index, x, y) {
  const p = skeleton && skeleton[index]
  if (!p) return skeleton
  p.x = x
  p.y = y
  p.confidence = 1.0
  return skeleton
}

// Append a manual T-pose person centered at (cx, cy) if under the limit.
// Returns a NEW array (reassign to drive Vue reactivity); same ref when at max.
export function addPerson(skeletons, cx, cy, scale = 80) {
  if (skeletons.length >= MAX_PERSONS) return skeletons
  return [...skeletons, emptySkeleton(cx, cy, scale)]
}

// Drop the last person. Returns a NEW array; same ref (and never below 0) when
// already empty.
export function removePerson(skeletons) {
  if (skeletons.length === 0) return skeletons
  return skeletons.slice(0, -1)
}

// ─────────────────────────────────────────────────────────────
// SVG overlay composable (browser only)
// ─────────────────────────────────────────────────────────────

// canvasEl    — ref to the preview <canvas>
// getSkeletons — () => Skeleton[] currently shown on the canvas
// onUpdate    — called after a drag mutates a keypoint (re-render the canvas)
//
// Returns { render, hide, syncPosition, destroy }. The overlay's coordinate
// system (viewBox) matches the canvas's internal pixel size, so circle (cx, cy)
// equals keypoint (x, y) regardless of how the canvas is scaled to fit on screen.
export function useSkeletonEditor(canvasEl, getSkeletons, onUpdate) {
  let svg = null
  let resizeObs = null
  let dragState = null // { person, index }

  function ensureSvg() {
    const canvas = canvasEl.value
    if (!canvas || !canvas.parentNode) return null
    if (!svg) {
      svg = document.createElementNS(SVG_NS, 'svg')
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
      svg.style.position = 'absolute'
      svg.style.touchAction = 'none'
      svg.style.pointerEvents = 'none' // empty regions pass through; circles re-enable
      svg.addEventListener('pointerdown', onPointerDown)
      canvas.parentNode.appendChild(svg)
      if (typeof ResizeObserver !== 'undefined') {
        resizeObs = new ResizeObserver(syncPosition)
        resizeObs.observe(canvas)
      }
      window.addEventListener('resize', syncPosition)
    }
    return svg
  }

  // Overlap the SVG exactly with the canvas's rendered box and match its
  // internal pixel grid via viewBox.
  function syncPosition() {
    const canvas = canvasEl.value
    if (!canvas || !svg) return
    svg.style.left = canvas.offsetLeft + 'px'
    svg.style.top = canvas.offsetTop + 'px'
    svg.style.width = canvas.offsetWidth + 'px'
    svg.style.height = canvas.offsetHeight + 'px'
    svg.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`)
  }

  // Convert a pointer event's client coords into canvas-pixel (viewBox) coords.
  function clientToUser(e) {
    if (!svg || typeof svg.getScreenCTM !== 'function') return null
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const loc = pt.matrixTransform(ctm.inverse())
    return { x: loc.x, y: loc.y }
  }

  // Rebuild the circle overlay from the current skeletons.
  function render() {
    const canvas = canvasEl.value
    if (!ensureSvg() || !canvas) return
    syncPosition()
    svg.style.display = 'block'
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    // Keep handles ~8px on screen even when a large image is scaled down.
    const ratio = canvas.offsetWidth > 0 ? canvas.width / canvas.offsetWidth : 1
    const r = 8 * Math.max(1, ratio)
    const sw = 2 * Math.max(1, ratio)

    const skeletons = getSkeletons() || []
    for (let p = 0; p < skeletons.length; p++) {
      const color = PERSON_COLORS[p] || PERSON_COLORS[PERSON_COLORS.length - 1]
      const skel = skeletons[p]
      for (let i = 0; i < skel.length; i++) {
        const kp = skel[i]
        // Three confidence states:
        //   detected  (>= 0.3): filled circle — model is confident
        //   estimated (0.05–0.3): hollow orange — snapped to anatomical estimate
        //   unknown   (< 0.05):  hollow red    — model found nothing, drag from scratch
        const detected = kp.confidence >= CONFIDENCE_THRESHOLD
        const estimated = !detected && kp.confidence >= 0.05
        const strokeColor = detected ? color : (estimated ? '#ffa726' : '#ff5252')
        const c = document.createElementNS(SVG_NS, 'circle')
        c.setAttribute('cx', kp.x)
        c.setAttribute('cy', kp.y)
        c.setAttribute('r', r)
        c.setAttribute('stroke', strokeColor)
        c.setAttribute('stroke-width', sw)
        c.setAttribute('fill', detected ? color : 'none')
        c.setAttribute('fill-opacity', detected ? '0.85' : '0')
        c.style.pointerEvents = 'all'
        c.style.cursor = 'grab'
        c.dataset.person = String(p)
        c.dataset.index = String(i)
        // Tooltip with keypoint name — visible on hover in all browsers
        const title = document.createElementNS(SVG_NS, 'title')
        title.textContent = OPENPOSE_KEYPOINTS[i] || String(i)
        c.appendChild(title)
        svg.appendChild(c)
      }
    }
  }

  function hide() {
    if (svg) svg.style.display = 'none'
  }

  function onPointerDown(e) {
    const t = e.target
    if (!t || t.tagName !== 'circle') return
    dragState = { person: Number(t.dataset.person), index: Number(t.dataset.index) }
    try { svg.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    svg.addEventListener('pointermove', onPointerMove)
    svg.addEventListener('pointerup', onPointerUp)
    svg.addEventListener('pointercancel', onPointerUp)
    e.preventDefault()
  }

  function onPointerMove(e) {
    if (!dragState) return
    const skel = (getSkeletons() || [])[dragState.person]
    if (!skel) return
    const loc = clientToUser(e)
    if (!loc) return
    moveKeypoint(skel, dragState.index, loc.x, loc.y)
    render()
    if (onUpdate) onUpdate()
  }

  function onPointerUp(e) {
    dragState = null
    try { svg.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    svg.removeEventListener('pointermove', onPointerMove)
    svg.removeEventListener('pointerup', onPointerUp)
    svg.removeEventListener('pointercancel', onPointerUp)
  }

  function destroy() {
    if (resizeObs) { resizeObs.disconnect(); resizeObs = null }
    window.removeEventListener('resize', syncPosition)
    if (svg) {
      svg.removeEventListener('pointerdown', onPointerDown)
      svg.removeEventListener('pointermove', onPointerMove)
      svg.removeEventListener('pointerup', onPointerUp)
      svg.removeEventListener('pointercancel', onPointerUp)
      if (svg.parentNode) svg.parentNode.removeChild(svg)
    }
    svg = null
    dragState = null
  }

  return { render, hide, syncPosition, destroy }
}
