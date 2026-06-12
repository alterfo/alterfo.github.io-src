<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { loadProject, saveProject } from './IDEF0Editor/db.js'
import { pushSnapshot, undo, redo, resetHistory } from './IDEF0Editor/history.js'
import HelpModal from './HelpModal.vue'
import { shouldShowOnboarding } from './onboarding.js'

// ----- Help / onboarding (shown once on first visit) -----
const showHelp = ref(false)
onMounted(() => {
  if (shouldShowOnboarding('idef0:seen-help')) showHelp.value = true
})

// ----- unique instance ID for SVG pattern -----
let _seq = 0
const _iid = ++_seq

// ----- Arrow type metadata -----
const ARROW_META = {
  input:     { label: 'Input Arrows (Left)',      color: '#3b82f6' },
  control:   { label: 'Control Arrows (Top)',      color: '#f59e0b' },
  output:    { label: 'Output Arrows (Right)',     color: '#10b981' },
  mechanism: { label: 'Mechanism Arrows (Bottom)', color: '#8b5cf6' },
}

const BOUNDARY_GAP = 100  // MIN world units from box side to boundary endpoint
const SNAP_DIST = 35      // world units for endpoint snap-to-box-side
const LABEL_PAD = 24      // arrow length beyond the label text

// Label width in world units (labels render at font-size 11 sans-serif, scale 1 = px)
let _measureCtx = null
function labelWidth(text) {
  if (!text) return 0
  if (typeof document !== 'undefined') {
    _measureCtx ??= document.createElement('canvas').getContext('2d')
    _measureCtx.font = '11px sans-serif'
    return _measureCtx.measureText(text).width
  }
  return String(text).length * 6.5
}

// Boundary arrows stretch with their centered label — a long name on a
// 100-unit arrow used to overlap the box and stick past the endpoint
function boundaryGap(arrow) {
  return Math.max(BOUNDARY_GAP, labelWidth(arrow.label) + LABEL_PAD)
}

// ----- Project -----
function defaultProject() {
  return {
    id: 'default',
    rootId: 'A0',
    childMap: {},
    diagrams: {
      A0: { id: 'A0', title: 'Main Process', boxes: [], arrows: [], boundaryArrows: [] }
    }
  }
}

const project = reactive(defaultProject())
const currentDiagramId = ref('A0')
const selectedBoxId = ref(null)

const currentDiagram = computed(() => project.diagrams[currentDiagramId.value] ?? project.diagrams[project.rootId])
const selectedBox = computed(() => currentDiagram.value.boxes.find(b => b.id === selectedBoxId.value) ?? null)
const allDiagramIds = computed(() => Object.keys(project.diagrams).sort())

// ----- ID generator -----
let _n = 0
function uid() { return `e${++_n}-${Math.random().toString(36).slice(2, 5)}` }

// ----- Box CRUD -----
function addBox() {
  pushSnapshot(currentDiagram.value)
  const boxes = currentDiagram.value.boxes
  const col = boxes.length % 3
  const row = Math.floor(boxes.length / 3)
  const box = {
    id: uid(),
    label: `Function ${boxes.length + 1}`,
    nodeNumber: `${currentDiagramId.value}${boxes.length + 1}`,
    description: '',
    x: 100 + col * 310,
    y: 120 + row * 220,
    width: 220,
    height: 110,
    childDiagramId: null,
  }
  boxes.push(box)
  selectedBoxId.value = box.id
  schedSave()
}

function deleteSelectedBox() {
  if (!selectedBox.value) return
  pushSnapshot(currentDiagram.value)
  const id = selectedBox.value.id
  const box = selectedBox.value
  if (box.childDiagramId) {
    if (_isDescendantDiagram(currentDiagramId.value, box.childDiagramId)) {
      navigateTo(getParentId(box.childDiagramId) ?? project.rootId ?? 'A0')
    }
    _removeSubtree(box.childDiagramId)
    box.childDiagramId = null
  }
  currentDiagram.value.arrows = currentDiagram.value.arrows.filter(
    a => a.sourceBoxId !== id && a.targetBoxId !== id
  )
  const idx = currentDiagram.value.boxes.findIndex(b => b.id === id)
  if (idx !== -1) currentDiagram.value.boxes.splice(idx, 1)
  selectedBoxId.value = null
  _normalizeHierarchy()
  schedSave()
}

// ----- Arrow CRUD -----
// arrowsForBox: arrows where this box is the "owner" side
// For output: sourceBoxId === boxId
// For input/control/mechanism: targetBoxId === boxId AND targetSide is null (boundary arrow into this box)
function arrowsForBox(boxId, type) {
  const isSource = type === 'output'
  return currentDiagram.value.arrows.filter(a => {
    if (a.type !== type) return false
    if (isSource) return a.sourceBoxId === boxId
    // For boundary arrows entering this box: targetBoxId is this box AND no inter-box connection
    return a.targetBoxId === boxId
  })
}

function addArrow(type) {
  if (!selectedBox.value) return
  pushSnapshot(currentDiagram.value)
  const boxId = selectedBox.value.id
  const n = arrowsForBox(boxId, type).length
  const isSource = type === 'output'
  currentDiagram.value.arrows.push({
    id: uid(),
    label: `${type[0].toUpperCase()}${n + 1}`,
    type,
    sourceBoxId: isSource ? boxId : null,
    targetBoxId: isSource ? null : boxId,
    targetSide: null,  // null = boundary; 'left'|'top'|'bottom' = inter-box connection
  })
  schedSave()
}

function removeArrow(arrowId) {
  pushSnapshot(currentDiagram.value)
  const idx = currentDiagram.value.arrows.findIndex(a => a.id === arrowId)
  if (idx !== -1) currentDiagram.value.arrows.splice(idx, 1)
  schedSave()
}

// ----- Diagram navigation -----
function navigateTo(id) {
  if (!project.diagrams[id]) return
  // Snapshots are not tagged with a diagram id — a stale stack would splice
  // another diagram's boxes into this one on Ctrl+Z
  if (id !== currentDiagramId.value) resetHistory()
  currentDiagramId.value = id
  selectedBoxId.value = null
}

function navigateUp() {
  for (const [pid, children] of Object.entries(project.childMap)) {
    if (children.includes(currentDiagramId.value)) { navigateTo(pid); return }
  }
}

function decompose() {
  if (!selectedBox.value) return
  const box = selectedBox.value
  // Already decomposed → just enter the existing child diagram
  if (box.childDiagramId && project.diagrams[box.childDiagramId]) {
    navigateTo(box.childDiagramId)
    return
  }
  const parentId = currentDiagramId.value
  const prefix = parentId === 'A0' ? 'A' : parentId
  // First free suffix: an id derived from the box index collides after a
  // sibling is deleted (indices shift) and two boxes end up sharing one child
  let n = currentDiagram.value.boxes.indexOf(box) + 1
  while (project.diagrams[`${prefix}${n}`]) n++
  const childId = `${prefix}${n}`
  project.diagrams[childId] = { id: childId, title: box.label, boxes: [], arrows: [], boundaryArrows: [] }
  if (!project.childMap[parentId]) project.childMap[parentId] = []
  project.childMap[parentId].push(childId)
  box.childDiagramId = childId
  navigateTo(childId)
  schedSave()
}

function _removeSubtree(diagramId) {
  // Children come from the diagram's own boxes too — childMap can be stale
  // (older persisted projects, imported JSON without childMap)
  const d = project.diagrams[diagramId]
  const childIds = new Set(project.childMap[diagramId] ?? [])
  if (d) for (const b of d.boxes) { if (b.childDiagramId) childIds.add(b.childDiagramId) }
  delete project.childMap[diagramId]
  delete project.diagrams[diagramId]
  for (const childId of childIds) {
    if (project.diagrams[childId]) _removeSubtree(childId)
  }
  for (const [pid, children] of Object.entries(project.childMap)) {
    const i = children.indexOf(diagramId)
    if (i !== -1) children.splice(i, 1)
  }
}

// Heal the hierarchy. Boxes' childDiagramId is the source of truth:
// drop diagrams unreachable from the root (orphans left behind by undo or by
// the old colliding child-id scheme), null out pointers to missing diagrams,
// rebuild childMap. Runs after destructive ops and on every load/import.
function _normalizeHierarchy() {
  const reachable = new Set()
  const queue = [project.rootId ?? 'A0']
  while (queue.length) {
    const id = queue.pop()
    if (!id || reachable.has(id) || !project.diagrams[id]) continue
    reachable.add(id)
    for (const b of project.diagrams[id].boxes) { if (b.childDiagramId) queue.push(b.childDiagramId) }
  }
  for (const id of Object.keys(project.diagrams)) {
    if (!reachable.has(id)) delete project.diagrams[id]
  }
  const map = {}
  for (const d of Object.values(project.diagrams)) {
    for (const b of d.boxes) {
      if (!b.childDiagramId) continue
      if (b.childDiagramId === d.id || !project.diagrams[b.childDiagramId]) { b.childDiagramId = null; continue }
      if (!map[d.id]) map[d.id] = []
      if (!map[d.id].includes(b.childDiagramId)) map[d.id].push(b.childDiagramId)
    }
  }
  project.childMap = map
  if (!project.diagrams[currentDiagramId.value]) {
    currentDiagramId.value = project.rootId ?? 'A0'
    selectedBoxId.value = null
  }
}

function _isDescendantDiagram(candidateId, rootId) {
  const visited = new Set()
  let id = candidateId
  while (id) {
    if (visited.has(id)) return false
    visited.add(id)
    if (id === rootId) return true
    id = getParentId(id) ?? null
  }
  return false
}

function onRemoveDecomposition() {
  if (!selectedBox.value?.childDiagramId) return
  const box = selectedBox.value
  const childId = box.childDiagramId
  if (_isDescendantDiagram(currentDiagramId.value, childId)) {
    navigateTo(getParentId(childId) ?? project.rootId ?? 'A0')
  }
  _removeSubtree(childId)
  box.childDiagramId = null
  _normalizeHierarchy()
  schedSave()
}

const canGoUp = computed(() => {
  for (const children of Object.values(project.childMap)) {
    if (children.includes(currentDiagramId.value)) return true
  }
  return false
})

// ----- Arrow geometry -----
//
// Arrow data model:
//   Boundary (current default):
//     output:    sourceBoxId=box, targetBoxId=null,  targetSide=null
//     input:     sourceBoxId=null, targetBoxId=box,  targetSide=null
//     control:   sourceBoxId=null, targetBoxId=box,  targetSide=null
//     mechanism: sourceBoxId=null, targetBoxId=box,  targetSide=null
//
//   Inter-box connection (after drag-to-connect):
//     output:    sourceBoxId=boxA, targetBoxId=boxB, targetSide='left'|'top'|'bottom'
//
// arrowPoints returns:
//   { boxPt, farPt, start, end, mid, segments?, arrowAtBox }
//   - start/end: from → to (arrowhead at 'end')
//   - segments: array of {x,y} for multi-segment path (Manhattan routing)
//   - arrowAtBox: true if arrowhead is at the box connection point (input/control/mechanism)

function arrowPoints(arrow) {
  const isSource = arrow.type === 'output'
  const boxId = isSource ? arrow.sourceBoxId : arrow.targetBoxId
  const box = currentDiagram.value.boxes.find(b => b.id === boxId)
  if (!box) return null

  const siblings = arrowsForBox(boxId, arrow.type)
  const i = siblings.findIndex(a => a.id === arrow.id)
  const n = siblings.length
  const frac = (i + 1) / (n + 1)

  let boxPt, arrowAtBox

  switch (arrow.type) {
    case 'input':    boxPt = { x: box.x,              y: box.y + frac * box.height }; arrowAtBox = true;  break
    case 'control':  boxPt = { x: box.x + frac * box.width, y: box.y }; arrowAtBox = true;  break
    case 'output':   boxPt = { x: box.x + box.width,  y: box.y + frac * box.height }; arrowAtBox = false; break
    case 'mechanism':boxPt = { x: box.x + frac * box.width, y: box.y + box.height }; arrowAtBox = true;  break
    default: return null
  }

  // ── Inter-box connection (output → target box) ──
  if (arrow.type === 'output' && arrow.targetBoxId) {
    const tBox = currentDiagram.value.boxes.find(b => b.id === arrow.targetBoxId)
    if (tBox) {
      const side = arrow.targetSide ?? 'left'
      const sideArrows = currentDiagram.value.arrows.filter(
        a => a.targetBoxId === tBox.id && a.targetSide === side && a.type === 'output'
      )
      const ti = sideArrows.findIndex(a => a.id === arrow.id)
      const tn = sideArrows.length
      const tf = (ti + 1) / (tn + 1)

      let targetPt
      if (side === 'left')   targetPt = { x: tBox.x,              y: tBox.y + tf * tBox.height }
      else if (side === 'top')    targetPt = { x: tBox.x + tf * tBox.width, y: tBox.y }
      else                        targetPt = { x: tBox.x + tf * tBox.width, y: tBox.y + tBox.height }

      // Manhattan routing
      // - left:   Z-shape (right → vertical → left); arrowhead enters left side →
      // - top:    route ABOVE the box, approach DOWN ↓ into top
      // - bottom: route BELOW the box, approach UP ↑ into bottom
      let segs
      const halfGap = BOUNDARY_GAP / 2
      if (side === 'left') {
        const midX = (boxPt.x + targetPt.x) / 2
        segs = [boxPt, { x: midX, y: boxPt.y }, { x: midX, y: targetPt.y }, targetPt]
      } else if (side === 'top') {
        // Go right from source, detour ABOVE tBox, then come DOWN into top
        const aboveY = tBox.y - halfGap
        const pivotX = boxPt.x + halfGap
        segs = [boxPt, { x: pivotX, y: boxPt.y }, { x: pivotX, y: aboveY }, { x: targetPt.x, y: aboveY }, targetPt]
      } else {
        // bottom — Go right from source, detour BELOW tBox, then come UP into bottom
        const belowY = tBox.y + tBox.height + halfGap
        const pivotX = boxPt.x + halfGap
        segs = [boxPt, { x: pivotX, y: boxPt.y }, { x: pivotX, y: belowY }, { x: targetPt.x, y: belowY }, targetPt]
      }

      const mid = { x: (boxPt.x + targetPt.x) / 2, y: (boxPt.y + targetPt.y) / 2 }
      return { boxPt, farPt: targetPt, start: boxPt, end: targetPt, mid, segments: segs, arrowAtBox: false }
    }
  }

  // ── Boundary arrow ──
  // In the interactive editor, arrows use a fixed length so the layout stays compact.
  // Labels may visually extend past the arrow endpoint — that is intentional.
  // The export path (arrowPtsForDiag) stretches arrows to fit labels exactly.
  const gap = BOUNDARY_GAP
  let farPt
  switch (arrow.type) {
    case 'input':    farPt = { x: boxPt.x - gap, y: boxPt.y }; break
    case 'control':  farPt = { x: boxPt.x, y: boxPt.y - gap }; break
    case 'output':   farPt = { x: boxPt.x + gap, y: boxPt.y }; break
    case 'mechanism':farPt = { x: boxPt.x, y: boxPt.y + gap }; break
  }

  const start = arrowAtBox ? farPt : boxPt
  const end   = arrowAtBox ? boxPt  : farPt
  const mid   = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  return { boxPt, farPt, start, end, mid, segments: null, arrowAtBox }
}

// The moveable far-end of an output arrow (the end user can drag to connect)
function arrowFarPt(arrow) {
  const pts = arrowPoints(arrow)
  if (!pts) return null
  if (pts.segments) return pts.segments[pts.segments.length - 1]
  return pts.farPt
}

function pathD(arrow) {
  const pts = arrowPoints(arrow)
  if (!pts) return ''
  if (pts.segments) {
    return 'M ' + pts.segments.map(p => `${p.x} ${p.y}`).join(' L ')
  }
  return `M ${pts.start.x} ${pts.start.y} L ${pts.end.x} ${pts.end.y}`
}

function headPoly(arrow) {
  const pts = arrowPoints(arrow)
  if (!pts) return ''
  let start, end
  if (pts.segments && pts.segments.length >= 2) {
    start = pts.segments[pts.segments.length - 2]
    end   = pts.segments[pts.segments.length - 1]
  } else {
    start = pts.start; end = pts.end
  }
  const dx = end.x - start.x; const dy = end.y - start.y
  const len = Math.hypot(dx, dy); if (len === 0) return ''
  const nx = dx / len; const ny = dy / len
  const px = -ny;    const py = nx
  const S = 7
  return [
    `${end.x},${end.y}`,
    `${end.x - nx * S + px * (S / 2)},${end.y - ny * S + py * (S / 2)}`,
    `${end.x - nx * S - px * (S / 2)},${end.y - ny * S - py * (S / 2)}`,
  ].join(' ')
}

function labelTransform(arrow) {
  const pts = arrowPoints(arrow)
  if (!pts) return ''
  const { mid } = pts
  const isVert = arrow.type === 'control' || arrow.type === 'mechanism'
  return isVert
    ? `translate(${mid.x + 9},${mid.y}) rotate(-90)`
    : `translate(${mid.x},${mid.y - 5})`
}

// ----- Corner resize handles -----
function boxCorners(box) {
  return [
    { id: 'nw', cx: box.x,             cy: box.y },
    { id: 'ne', cx: box.x + box.width, cy: box.y },
    { id: 'se', cx: box.x + box.width, cy: box.y + box.height },
    { id: 'sw', cx: box.x,             cy: box.y + box.height },
  ]
}

// ----- Viewport -----
const canvasWrap = ref(null)
const panX = ref(50)
const panY = ref(50)
const scale = ref(1)

const dotSpc = computed(() => 24 * scale.value)
const dotOX  = computed(() => ((panX.value % dotSpc.value) + dotSpc.value) % dotSpc.value)
const dotOY  = computed(() => ((panY.value % dotSpc.value) + dotSpc.value) % dotSpc.value)

function screenToWorld(sx, sy) {
  const rect = canvasWrap.value.getBoundingClientRect()
  return {
    x: (sx - rect.left - panX.value) / scale.value,
    y: (sy - rect.top  - panY.value) / scale.value,
  }
}

function onWheel(e) {
  e.preventDefault()
  const rect = canvasWrap.value.getBoundingClientRect()
  const mx = e.clientX - rect.left; const my = e.clientY - rect.top
  const f = e.deltaY < 0 ? 1.12 : 0.88
  const ns = Math.min(4, Math.max(0.08, scale.value * f))
  panX.value = mx - (mx - panX.value) * (ns / scale.value)
  panY.value = my - (my - panY.value) * (ns / scale.value)
  scale.value = ns
}

function zoomBy(f) {
  const w = canvasWrap.value?.clientWidth ?? 800; const h = canvasWrap.value?.clientHeight ?? 500
  const mx = w / 2; const my = h / 2
  const ns = Math.min(4, Math.max(0.08, scale.value * f))
  panX.value = mx - (mx - panX.value) * (ns / scale.value)
  panY.value = my - (my - panY.value) * (ns / scale.value)
  scale.value = ns
}

function fitToView() {
  const boxes = currentDiagram.value.boxes
  if (!boxes.length) { panX.value = 50; panY.value = 50; scale.value = 1; return }
  const w = canvasWrap.value?.clientWidth ?? 800; const h = canvasWrap.value?.clientHeight ?? 500
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const b of boxes) {
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height)
  }
  const pad = BOUNDARY_GAP + 40
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad
  const ns = Math.min(w / (x1 - x0), h / (y1 - y0), 2) * 0.9
  scale.value = ns
  panX.value = (w - (x1 - x0) * ns) / 2 - x0 * ns
  panY.value = (h - (y1 - y0) * ns) / 2 - y0 * ns
}

// ----- Box drag / resize -----
const drag = ref(null)

const cursorStyle = computed(() => {
  if (drag.value?.type === 'pan' || drag.value?.type === 'box') return 'grabbing'
  if (arrowDrag.value) return 'crosshair'
  return 'default'
})

function onCanvasDown(e) {
  if (e.button !== 0) return
  selectedBoxId.value = null
  drag.value = { type: 'pan', startX: e.clientX, startY: e.clientY, ox: panX.value, oy: panY.value }
}

function onBoxDown(box, e) {
  if (e.button !== 0) return
  e.stopPropagation()
  selectedBoxId.value = box.id
  drag.value = { type: 'box', boxId: box.id, startX: e.clientX, startY: e.clientY, ox: box.x, oy: box.y }
}

function onCornerDown(box, corner, e) {
  if (e.button !== 0) return
  e.stopPropagation()
  drag.value = {
    type: 'resize', boxId: box.id, corner: corner.id,
    startX: e.clientX, startY: e.clientY,
    ox: box.x, oy: box.y, ow: box.width, oh: box.height,
  }
}

// ----- Arrow endpoint drag-to-connect -----
const arrowDrag = ref(null)
// { arrowId: string, mouseX: number, mouseY: number }  in world coords

// Only output arrows can be drag-connected to target boxes
const outputArrows = computed(() =>
  currentDiagram.value.arrows.filter(a => a.type === 'output')
)

// Snap target while dragging: nearest box side within SNAP_DIST
const snapTarget = computed(() => {
  if (!arrowDrag.value) return null
  const { arrowId, mouseX, mouseY } = arrowDrag.value
  const arrow = currentDiagram.value.arrows.find(a => a.id === arrowId)
  if (!arrow) return null

  let best = null, bestDist = SNAP_DIST

  for (const box of currentDiagram.value.boxes) {
    if (box.id === arrow.sourceBoxId) continue  // skip own box

    // Left side
    const dL = Math.abs(mouseX - box.x)
    if (dL < bestDist && mouseY >= box.y - SNAP_DIST && mouseY <= box.y + box.height + SNAP_DIST) {
      const snapY = Math.max(box.y + 8, Math.min(box.y + box.height - 8, mouseY))
      best = { boxId: box.id, side: 'left', pt: { x: box.x, y: snapY } }
      bestDist = dL
    }
    // Top side
    const dT = Math.abs(mouseY - box.y)
    if (dT < bestDist && mouseX >= box.x - SNAP_DIST && mouseX <= box.x + box.width + SNAP_DIST) {
      const snapX = Math.max(box.x + 8, Math.min(box.x + box.width - 8, mouseX))
      best = { boxId: box.id, side: 'top', pt: { x: snapX, y: box.y } }
      bestDist = dT
    }
    // Bottom side
    const dB = Math.abs(mouseY - (box.y + box.height))
    if (dB < bestDist && mouseX >= box.x - SNAP_DIST && mouseX <= box.x + box.width + SNAP_DIST) {
      const snapX = Math.max(box.x + 8, Math.min(box.x + box.width - 8, mouseX))
      best = { boxId: box.id, side: 'bottom', pt: { x: snapX, y: box.y + box.height } }
      bestDist = dB
    }
  }
  return best
})

// The world-coord endpoint shown during arrow drag (snapped or free)
const arrowDragEndPt = computed(() => {
  if (!arrowDrag.value) return null
  return snapTarget.value?.pt ?? { x: arrowDrag.value.mouseX, y: arrowDrag.value.mouseY }
})

// Preview path from source boxPt to drag endpoint
const arrowDragPreviewPath = computed(() => {
  if (!arrowDrag.value) return ''
  const arrow = currentDiagram.value.arrows.find(a => a.id === arrowDrag.value.arrowId)
  if (!arrow) return ''
  const pts = arrowPoints(arrow)
  if (!pts) return ''
  const ep = arrowDragEndPt.value
  if (!ep) return ''
  const src = pts.boxPt  // always the box connection point
  const side = snapTarget.value?.side
  const halfGap = BOUNDARY_GAP / 2
  if (side === 'left') {
    const midX = (src.x + ep.x) / 2
    return `M ${src.x} ${src.y} H ${midX} V ${ep.y} H ${ep.x}`
  } else if (side === 'top') {
    const aboveY = ep.y - halfGap
    const pivotX = src.x + halfGap
    return `M ${src.x} ${src.y} H ${pivotX} V ${aboveY} H ${ep.x} V ${ep.y}`
  } else if (side === 'bottom') {
    const belowY = ep.y + halfGap
    const pivotX = src.x + halfGap
    return `M ${src.x} ${src.y} H ${pivotX} V ${belowY} H ${ep.x} V ${ep.y}`
  }
  return `M ${src.x} ${src.y} L ${ep.x} ${ep.y}`
})

// The snap-target box sides highlight geometry (for visual feedback)
const snapHighlight = computed(() => {
  if (!snapTarget.value) return null
  const box = currentDiagram.value.boxes.find(b => b.id === snapTarget.value.boxId)
  if (!box) return null
  const { side } = snapTarget.value
  if (side === 'left')   return { x1: box.x, y1: box.y, x2: box.x, y2: box.y + box.height }
  if (side === 'top')    return { x1: box.x, y1: box.y, x2: box.x + box.width, y2: box.y }
  if (side === 'bottom') return { x1: box.x, y1: box.y + box.height, x2: box.x + box.width, y2: box.y + box.height }
  return null
})

function onArrowEndDown(arrow, e) {
  if (e.button !== 0) return
  e.stopPropagation()
  drag.value = null  // cancel any box drag
  const w = screenToWorld(e.clientX, e.clientY)
  arrowDrag.value = { arrowId: arrow.id, mouseX: w.x, mouseY: w.y }
}

// ----- Global mouse move / up -----
function onMouseMove(e) {
  // Arrow endpoint drag
  if (arrowDrag.value) {
    const w = screenToWorld(e.clientX, e.clientY)
    arrowDrag.value = { ...arrowDrag.value, mouseX: w.x, mouseY: w.y }
    return
  }

  if (!drag.value) return
  const dx = e.clientX - drag.value.startX; const dy = e.clientY - drag.value.startY

  if (drag.value.type === 'pan') {
    panX.value = drag.value.ox + dx
    panY.value = drag.value.oy + dy
    return
  }

  const box = currentDiagram.value.boxes.find(b => b.id === drag.value.boxId)
  if (!box) return
  const wdx = dx / scale.value; const wdy = dy / scale.value
  const MIN = 80

  if (drag.value.type === 'box') {
    box.x = drag.value.ox + wdx
    box.y = drag.value.oy + wdy
  } else {
    const { corner: c, ox, oy, ow, oh } = drag.value
    if (c === 'se') {
      box.width  = Math.max(MIN, ow + wdx)
      box.height = Math.max(MIN, oh + wdy)
    } else if (c === 'sw') {
      const nw = Math.max(MIN, ow - wdx)
      box.x = ox + (ow - nw); box.width = nw
      box.height = Math.max(MIN, oh + wdy)
    } else if (c === 'ne') {
      box.width = Math.max(MIN, ow + wdx)
      const nh = Math.max(MIN, oh - wdy)
      box.y = oy + (oh - nh); box.height = nh
    } else if (c === 'nw') {
      const nw = Math.max(MIN, ow - wdx); const nh = Math.max(MIN, oh - wdy)
      box.x = ox + (ow - nw); box.width = nw
      box.y = oy + (oh - nh); box.height = nh
    }
  }
}

function onMouseUp() {
  // Finalize arrow endpoint drag
  if (arrowDrag.value) {
    const arrow = currentDiagram.value.arrows.find(a => a.id === arrowDrag.value.arrowId)
    if (arrow) {
      if (snapTarget.value) {
        arrow.targetBoxId = snapTarget.value.boxId
        arrow.targetSide  = snapTarget.value.side
      } else {
        // Drop on empty space → revert to boundary
        arrow.targetBoxId = null
        arrow.targetSide  = null
      }
      schedSave()
    }
    arrowDrag.value = null
    return
  }

  if (drag.value && drag.value.type !== 'pan') schedSave()
  drag.value = null
}

// Disconnect inter-box arrow back to boundary (double-click on endpoint handle)
function disconnectArrow(arrow) {
  arrow.targetBoxId = null
  arrow.targetSide  = null
  schedSave()
}

// ----- Persistence -----
let _saveTimer = null
function schedSave() {
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => saveProject(JSON.parse(JSON.stringify(project))), 400)
}

async function loadFromDb() {
  try {
    const saved = await loadProject()
    if (saved?.diagrams) {
      Object.assign(project, saved)
      _normalizeHierarchy()
    }
  } catch (e) { console.warn('[idef0] load failed', e) }
}

// ----- FIPS 183 Document Export -----

function escXml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function getDiagramOrder() {
  const queue = [project.rootId ?? 'A0']
  const visited = new Set()
  const result = []
  while (queue.length) {
    const id = queue.shift()
    if (visited.has(id) || !project.diagrams[id]) continue
    visited.add(id)
    result.push(id)
    for (const childId of (project.childMap[id] ?? [])) queue.push(childId)
  }
  return result
}

function getParentId(diagId) {
  for (const [pid, children] of Object.entries(project.childMap)) {
    if (children.includes(diagId)) return pid
  }
  return null
}

function arrowPtsForDiag(arrow, diag) {
  const isSource = arrow.type === 'output'
  const boxId = isSource ? arrow.sourceBoxId : arrow.targetBoxId
  const box = diag.boxes.find(b => b.id === boxId)
  if (!box) return null

  const siblings = diag.arrows.filter(a => {
    if (a.type !== arrow.type) return false
    return isSource ? a.sourceBoxId === boxId : a.targetBoxId === boxId
  })
  const i = siblings.findIndex(a => a.id === arrow.id)
  const n = siblings.length
  const frac = (i + 1) / (n + 1)

  let boxPt, arrowAtBox
  switch (arrow.type) {
    case 'input':    boxPt = { x: box.x,             y: box.y + frac * box.height }; arrowAtBox = true;  break
    case 'control':  boxPt = { x: box.x + frac * box.width, y: box.y };             arrowAtBox = true;  break
    case 'output':   boxPt = { x: box.x + box.width, y: box.y + frac * box.height }; arrowAtBox = false; break
    case 'mechanism':boxPt = { x: box.x + frac * box.width, y: box.y + box.height }; arrowAtBox = true;  break
    default: return null
  }

  if (arrow.type === 'output' && arrow.targetBoxId) {
    const tBox = diag.boxes.find(b => b.id === arrow.targetBoxId)
    if (tBox) {
      const side = arrow.targetSide ?? 'left'
      const sideArrows = diag.arrows.filter(a => a.targetBoxId === tBox.id && a.targetSide === side && a.type === 'output')
      const ti = sideArrows.findIndex(a => a.id === arrow.id)
      const tf = (ti + 1) / (sideArrows.length + 1)
      let targetPt
      if (side === 'left')        targetPt = { x: tBox.x,                    y: tBox.y + tf * tBox.height }
      else if (side === 'top')    targetPt = { x: tBox.x + tf * tBox.width,  y: tBox.y }
      else                        targetPt = { x: tBox.x + tf * tBox.width,  y: tBox.y + tBox.height }

      const halfGap = BOUNDARY_GAP / 2
      let segs
      if (side === 'left') {
        const midX = (boxPt.x + targetPt.x) / 2
        segs = [boxPt, { x: midX, y: boxPt.y }, { x: midX, y: targetPt.y }, targetPt]
      } else if (side === 'top') {
        const aboveY = tBox.y - halfGap
        const pivotX = boxPt.x + halfGap
        segs = [boxPt, { x: pivotX, y: boxPt.y }, { x: pivotX, y: aboveY }, { x: targetPt.x, y: aboveY }, targetPt]
      } else {
        const belowY = tBox.y + tBox.height + halfGap
        const pivotX = boxPt.x + halfGap
        segs = [boxPt, { x: pivotX, y: boxPt.y }, { x: pivotX, y: belowY }, { x: targetPt.x, y: belowY }, targetPt]
      }
      const mid = { x: (boxPt.x + targetPt.x) / 2, y: (boxPt.y + targetPt.y) / 2 }
      return { start: boxPt, end: targetPt, mid, segments: segs }
    }
  }

  const gap = boundaryGap(arrow)
  let farPt
  switch (arrow.type) {
    case 'input':    farPt = { x: boxPt.x - gap, y: boxPt.y }; break
    case 'control':  farPt = { x: boxPt.x, y: boxPt.y - gap }; break
    case 'output':   farPt = { x: boxPt.x + gap, y: boxPt.y }; break
    case 'mechanism':farPt = { x: boxPt.x, y: boxPt.y + gap }; break
  }
  const start = arrowAtBox ? farPt : boxPt
  const end   = arrowAtBox ? boxPt  : farPt
  const mid   = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  return { start, end, mid, segments: null }
}

function exportHeadPoly(start, end) {
  const dx = end.x - start.x; const dy = end.y - start.y
  const len = Math.hypot(dx, dy); if (!len) return ''
  const nx = dx / len; const ny = dy / len; const S = 7
  return `${end.x},${end.y} ${end.x - nx*S - ny*(S/2)},${end.y - ny*S + nx*(S/2)} ${end.x - nx*S + ny*(S/2)},${end.y - ny*S - nx*(S/2)}`
}

function exportSvgArrow(arrow, diag) {
  const pts = arrowPtsForDiag(arrow, diag)
  if (!pts) return ''
  const color = ARROW_META[arrow.type]?.color ?? '#666'
  const segs = pts.segments ?? [pts.start, pts.end]
  const d = 'M ' + segs.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')
  const n = segs.length
  const poly = exportHeadPoly(segs[n - 2], segs[n - 1])
  const { mid } = pts
  const isVert = arrow.type === 'control' || arrow.type === 'mechanism'
  const rot = isVert ? ` transform="rotate(-90,${mid.x.toFixed(1)},${mid.y.toFixed(1)})"` : ''
  const lx = (mid.x + (isVert ? 9 : 0)).toFixed(1), ly = (mid.y + (isVert ? 0 : -5)).toFixed(1)
  return [
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5"/>`,
    poly ? `<polygon points="${poly}" fill="${color}"/>` : '',
    `<text x="${lx}" y="${ly}" font-size="11" font-family="Arial,sans-serif" fill="#333" text-anchor="middle"${rot}>${escXml(arrow.label ?? '')}</text>`,
  ].join('')
}

function exportSvgBox(box) {
  const lw = box.width - 16, lh = box.height - 22, fs = 13
  const words = (box.label ?? '').split(/\s+/)
  // Use measureText for accurate wrapping — the char-count heuristic was wrong for Cyrillic.
  if (typeof document !== 'undefined') {
    _measureCtx ??= document.createElement('canvas').getContext('2d')
    _measureCtx.font = `${fs}px Arial,sans-serif`
  }
  const measureW = (t) => _measureCtx ? _measureCtx.measureText(t).width : t.length * 7.5
  let line = '', lines = []
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (measureW(test) <= lw) { line = test } else { if (line) lines.push(line); line = w }
  }
  if (line) lines.push(line)
  const totalH = lines.length * (fs * 1.35)
  const textY = (box.y + 8) + (lh - totalH) / 2 + fs
  let textEl = `<text x="${(box.x + 8 + lw / 2).toFixed(1)}" y="${textY.toFixed(1)}" font-size="${fs}" font-family="Arial,sans-serif" fill="#111" text-anchor="middle">`
  for (let i = 0; i < lines.length; i++) {
    textEl += `<tspan x="${(box.x + 8 + lw / 2).toFixed(1)}" dy="${i === 0 ? 0 : fs * 1.35}">${escXml(lines[i])}</tspan>`
  }
  textEl += '</text>'
  return [
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="3" fill="white" stroke="#4b5563" stroke-width="1.5"/>`,
    `<text x="${(box.x + box.width - 5).toFixed(1)}" y="${(box.y + box.height - 5).toFixed(1)}" font-size="9" font-family="Arial,sans-serif" fill="#9ca3af" text-anchor="end">${escXml(box.nodeNumber ?? '')}</text>`,
    textEl,
  ].join('')
}

function exportTitleBlock(diagId, diag, pageNum, totalPages) {
  const W = 1100, Y = 720, H = 130, USED_W = 200
  const now = new Date().toLocaleDateString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const parentId = getParentId(diagId) ?? '–'
  const rootDiag = project.diagrams[project.rootId ?? 'A0']
  const projectName = rootDiag?.title ?? 'Untitled'
  const rx = USED_W + 2

  let s = ''
  s += `<rect x="2" y="${Y}" width="${W - 4}" height="${H - 2}" fill="white" stroke="#333" stroke-width="1.5"/>`

  // USED AT (left column)
  s += `<rect x="2" y="${Y}" width="${USED_W}" height="${H - 2}" fill="none" stroke="#333" stroke-width="0.8"/>`
  s += `<text x="6" y="${Y + 11}" font-size="8" font-family="Arial,sans-serif" fill="#555" font-weight="600">USED AT:</text>`
  s += `<text x="6" y="${Y + 30}" font-size="13" font-family="Arial,sans-serif" fill="#111" font-weight="700">${escXml(parentId)}</text>`
  s += `<line x1="2" y1="${Y + 65}" x2="${USED_W + 2}" y2="${Y + 65}" stroke="#888" stroke-width="0.5"/>`
  s += `<text x="6" y="${Y + 76}" font-size="8" font-family="Arial,sans-serif" fill="#555" font-weight="600">CONTEXT:</text>`

  // Right section rows
  // Row 1: Author / Date / Rev / status checkboxes
  s += `<line x1="${rx}" y1="${Y + 24}" x2="${W - 2}" y2="${Y + 24}" stroke="#888" stroke-width="0.5"/>`
  s += `<text x="${rx + 4}" y="${Y + 13}" font-size="7.5" font-family="Arial,sans-serif" fill="#555" font-weight="600">AUTHOR:</text>`
  s += `<text x="${rx + 200}" y="${Y + 13}" font-size="7.5" font-family="Arial,sans-serif" fill="#555" font-weight="600">DATE:</text>`
  s += `<text x="${rx + 234}" y="${Y + 13}" font-size="9" font-family="Arial,sans-serif" fill="#111">${now}</text>`
  s += `<text x="${rx + 370}" y="${Y + 13}" font-size="7.5" font-family="Arial,sans-serif" fill="#555" font-weight="600">REV:</text>`
  s += `<text x="${rx + 395}" y="${Y + 13}" font-size="9" font-family="Arial,sans-serif" fill="#111">0</text>`

  // Status checkboxes
  for (const [j, lbl] of ['Working', 'Draft', 'Recommended', 'Publication'].entries()) {
    const cx = W - 295 + j * 74
    s += `<rect x="${cx}" y="${Y + 3}" width="10" height="10" fill="none" stroke="#555" stroke-width="0.8"/>`
    s += `<text x="${cx + 13}" y="${Y + 12}" font-size="8" font-family="Arial,sans-serif" fill="#333">${lbl}</text>`
  }

  // Row 2: Project
  s += `<line x1="${rx}" y1="${Y + 42}" x2="${W - 2}" y2="${Y + 42}" stroke="#888" stroke-width="0.5"/>`
  s += `<text x="${rx + 4}" y="${Y + 35}" font-size="7.5" font-family="Arial,sans-serif" fill="#555" font-weight="600">PROJECT:</text>`
  s += `<text x="${rx + 54}" y="${Y + 35}" font-size="9" font-family="Arial,sans-serif" fill="#111">${escXml(projectName)}</text>`

  // Row 3: Notes
  s += `<line x1="${rx}" y1="${Y + 65}" x2="${W - 2}" y2="${Y + 65}" stroke="#888" stroke-width="0.5"/>`
  s += `<text x="${rx + 4}" y="${Y + 55}" font-size="7.5" font-family="Arial,sans-serif" fill="#555" font-weight="600">NOTES:</text>`
  const noteNums = Array.from({ length: 10 }, (_, i) => i + 1).join('  ')
  s += `<text x="${rx + 44}" y="${Y + 55}" font-size="8" font-family="Arial,sans-serif" fill="#aaa">${noteNums}</text>`

  // Row 4: Title (big)
  s += `<line x1="${rx}" y1="${Y + 92}" x2="${W - 2}" y2="${Y + 92}" stroke="#888" stroke-width="0.5"/>`
  s += `<text x="${rx + 4}" y="${Y + 80}" font-size="7.5" font-family="Arial,sans-serif" fill="#555" font-weight="600">TITLE:</text>`
  s += `<text x="${rx + 48}" y="${Y + 82}" font-size="14" font-family="Arial,sans-serif" fill="#111" font-weight="700">${escXml(diag.title ?? diagId)}</text>`

  // Row 5: Node / Number / Page
  s += `<text x="${rx + 4}" y="${Y + 108}" font-size="7.5" font-family="Arial,sans-serif" fill="#555" font-weight="600">NODE:</text>`
  s += `<text x="${rx + 42}" y="${Y + 108}" font-size="13" font-family="Arial,sans-serif" fill="#111" font-weight="700">${escXml(diagId)}</text>`
  s += `<text x="${rx + 140}" y="${Y + 108}" font-size="7.5" font-family="Arial,sans-serif" fill="#555" font-weight="600">NUMBER:</text>`
  s += `<text x="${W - 130}" y="${Y + 108}" font-size="7.5" font-family="Arial,sans-serif" fill="#555" font-weight="600">PAGE:</text>`
  s += `<text x="${W - 95}" y="${Y + 108}" font-size="10" font-family="Arial,sans-serif" fill="#111">${pageNum} of ${totalPages}</text>`

  return s
}

function buildDiagramSVGString(diagId, pageNum, totalPages) {
  const diag = project.diagrams[diagId]
  const boxes = diag.boxes ?? []
  const arrows = diag.arrows ?? []

  const PAGE_W = 1100, PAGE_H = 850, AREA_H = 720, MARGIN = 30

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const b of boxes) {
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height)
  }
  // Extend bounds to actual arrow endpoints (boundary arrows stretch with their labels).
  for (const a of arrows) {
    const pts = arrowPtsForDiag(a, diag)
    if (!pts) continue
    for (const p of (pts.segments ?? [pts.start, pts.end])) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y)
    }
  }
  if (!boxes.length || !isFinite(x0)) { x0 = 0; y0 = 0; x1 = 800; y1 = 600 }
  const PAD = 20
  x0 -= PAD; y0 -= PAD; x1 += PAD; y1 += PAD

  const cW = x1 - x0, cH = y1 - y0
  const availW = PAGE_W - 2 * MARGIN, availH = AREA_H - 2 * MARGIN
  const sc = Math.min(availW / cW, availH / cH, 1.5)
  const tx = (MARGIN + (availW - cW * sc) / 2 - x0 * sc).toFixed(2)
  const ty = (MARGIN + (availH - cH * sc) / 2 - y0 * sc).toFixed(2)

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">`
  s += `<rect width="${PAGE_W}" height="${PAGE_H}" fill="white"/>`
  s += `<rect x="2" y="2" width="${PAGE_W - 4}" height="${AREA_H - 2}" fill="#fafafa" stroke="#bbb" stroke-width="0.8"/>`

  // Arrowhead marker defs
  s += `<defs><marker id="ah" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><polygon points="0,0 7,3.5 0,7" fill="#888"/></marker></defs>`

  s += `<g transform="translate(${tx},${ty}) scale(${sc.toFixed(4)})">`
  for (const a of arrows) s += exportSvgArrow(a, diag)
  for (const b of boxes)  s += exportSvgBox(b)
  s += `</g>`

  s += exportTitleBlock(diagId, diag, pageNum, totalPages)
  s += `</svg>`
  return s
}

function exportDocument() {
  const order = getDiagramOrder()
  const total = order.length
  const projectTitle = project.diagrams[project.rootId ?? 'A0']?.title ?? 'IDEF0'
  const pages = order.map((diagId, i) => buildDiagramSVGString(diagId, i + 1, total))

  // Each page SVG has fixed width/height attrs — CSS overrides them to fill the print page.
  // US Letter landscape (11×8.5 in) matches the 1100:850 SVG aspect ratio exactly.
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escXml(projectTitle)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: white; }
  .page {
    width: 11in; height: 8.5in;
    display: flex; overflow: hidden;
    page-break-after: always; break-after: page;
  }
  .page:last-child { page-break-after: avoid; break-after: avoid; }
  .page > svg { width: 100%; height: 100%; display: block; }
  @media print {
    @page { size: 11in 8.5in; margin: 0; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
${pages.map(s => `<div class="page">${s}</div>`).join('\n')}
</body>
</html>`

  const w = window.open('', '_blank')
  if (!w) { alert('Разрешите всплывающие окна для экспорта PDF'); return }
  w.document.open(); w.document.write(html); w.document.close()
  // Small delay so the browser finishes layout before the print dialog opens.
  w.setTimeout(() => w.print(), 250)
}

// ----- Import / Export -----
function exportJSON() {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: 'idef0-project.json' }).click()
  URL.revokeObjectURL(url)
}

function importJSON() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' })
  input.onchange = e => {
    const file = e.target.files[0]; if (!file) return
    const r = new FileReader()
    r.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result)
        if (data?.diagrams) {
          Object.assign(project, data)
          currentDiagramId.value = data.rootId ?? 'A0'
          selectedBoxId.value = null
          _normalizeHierarchy()
          schedSave()
        }
      } catch { alert('Неверный формат JSON') }
    }
    r.readAsText(file)
  }
  input.click()
}

// ----- Keyboard shortcuts -----
function onKeydown(e) {
  if (!e.ctrlKey && !e.metaKey) return
  if (e.key === 'z' || e.key === 'Z') {
    e.preventDefault()
    undo(currentDiagram.value)
    schedSave()
  } else if (e.key === 'y' || e.key === 'Y') {
    e.preventDefault()
    redo(currentDiagram.value)
    schedSave()
  }
}

// ----- Lifecycle -----
onMounted(async () => {
  await loadFromDb()
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('keydown', onKeydown)
  clearTimeout(_saveTimer)
})
</script>

<template>
  <div class="idef0-root" :style="{ cursor: cursorStyle }">

    <!-- ═══ TOOLBAR ═══ -->
    <div class="idef0-toolbar">
      <button class="tb-btn" @click="addBox">＋ Function</button>
      <div class="tb-sep"/>
      <button class="tb-btn" @click="decompose" :disabled="!selectedBox">⊕ Decompose</button>
      <button class="tb-btn tb-btn-danger" @click="onRemoveDecomposition" :disabled="!selectedBox?.childDiagramId" title="Удалить декомпозицию">✕ Декомп.</button>
      <button class="tb-btn" @click="navigateUp" :disabled="!canGoUp">↑ Parent</button>
      <div class="tb-sep"/>
      <span class="tb-diag">{{ currentDiagramId }}</span>
      <span class="tb-title">{{ currentDiagram.title }}</span>
      <div class="tb-spacer"/>
      <button class="tb-btn" @click="schedSave">Save</button>
      <button class="tb-btn" @click="importJSON">Load</button>
      <button class="tb-btn" @click="exportJSON">Export JSON</button>
      <button class="tb-btn tb-btn-doc" @click="exportDocument">Export Document</button>
      <button class="tb-btn" @click="showHelp = true" title="Справка">?</button>
    </div>

    <!-- ═══ THREE PANELS ═══ -->
    <div class="idef0-main">

      <!-- ── LEFT: Diagram Navigator ── -->
      <div class="idef0-nav">
        <div class="panel-title">Diagram Navigator</div>
        <div
          v-for="id in allDiagramIds" :key="id"
          class="nav-item" :class="{ active: id === currentDiagramId }"
          @click="navigateTo(id)"
        >
          <span class="nav-id">{{ id }}</span>
          <span class="nav-sub">{{ project.diagrams[id]?.title ?? '' }}</span>
        </div>
      </div>

      <!-- ── CENTER: Canvas ── -->
      <div class="idef0-canvas-wrap" ref="canvasWrap" @wheel.prevent="onWheel">
        <svg class="idef0-svg" @mousedown="onCanvasDown">

          <!-- Dot grid -->
          <defs>
            <pattern :id="`dg-${_iid}`" :x="dotOX" :y="dotOY" :width="dotSpc" :height="dotSpc" patternUnits="userSpaceOnUse">
              <circle cx="0" cy="0" r="1.3" fill="#d1d5db"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" :fill="`url(#dg-${_iid})`"/>

          <!-- World group (pan + zoom) -->
          <g :transform="`translate(${panX}, ${panY}) scale(${scale})`">

            <!-- Arrows (behind boxes) -->
            <g v-for="arrow in currentDiagram.arrows" :key="arrow.id">
              <path
                :d="pathD(arrow)"
                fill="none"
                :stroke="ARROW_META[arrow.type]?.color ?? '#888'"
                stroke-width="1.5"
              />
              <polygon
                :points="headPoly(arrow)"
                :fill="ARROW_META[arrow.type]?.color ?? '#888'"
              />
              <text
                :transform="labelTransform(arrow)"
                font-size="11" font-family="sans-serif"
                fill="#374151" text-anchor="middle" dominant-baseline="auto"
                style="pointer-events:none"
              >{{ arrow.label }}</text>
            </g>

            <!-- Arrow endpoint drag handles (output arrows only) -->
            <!-- Small circle at far end; drag to connect to another box -->
            <g v-for="arrow in outputArrows" :key="`ep-${arrow.id}`">
              <circle
                v-if="arrowFarPt(arrow)"
                :cx="arrowFarPt(arrow).x"
                :cy="arrowFarPt(arrow).y"
                r="5"
                class="arrow-ep"
                :fill="arrow.targetBoxId ? '#10b981' : 'white'"
                :stroke="ARROW_META.output.color"
                stroke-width="1.5"
                style="cursor:crosshair"
                @mousedown.stop="onArrowEndDown(arrow, $event)"
                @dblclick.stop="disconnectArrow(arrow)"
              />
            </g>

            <!-- Arrow drag preview (while dragging endpoint) -->
            <g v-if="arrowDrag && arrowDragEndPt">
              <path
                :d="arrowDragPreviewPath"
                fill="none"
                stroke="#10b981"
                stroke-width="1.5"
                stroke-dasharray="6,4"
                opacity="0.7"
              />
              <circle
                :cx="arrowDragEndPt.x" :cy="arrowDragEndPt.y"
                r="5" fill="#10b981" opacity="0.6"
              />
              <!-- Snap highlight -->
              <line
                v-if="snapHighlight"
                :x1="snapHighlight.x1" :y1="snapHighlight.y1"
                :x2="snapHighlight.x2" :y2="snapHighlight.y2"
                stroke="#3b82f6" stroke-width="3" stroke-linecap="round" opacity="0.7"
              />
            </g>

            <!-- Boxes -->
            <g
              v-for="box in currentDiagram.boxes" :key="box.id"
              style="cursor:grab"
              @mousedown.stop="onBoxDown(box, $event)"
            >
              <!-- Shadow -->
              <rect :x="box.x + 2" :y="box.y + 3" :width="box.width" :height="box.height" rx="3" fill="#00000012"/>
              <!-- Body -->
              <rect
                :x="box.x" :y="box.y" :width="box.width" :height="box.height" rx="3"
                fill="white"
                :stroke="selectedBoxId === box.id ? '#3b82f6' : '#4b5563'"
                :stroke-width="selectedBoxId === box.id ? 2.5 : 1.5"
              />
              <!-- Label -->
              <foreignObject :x="box.x + 8" :y="box.y + 8" :width="box.width - 16" :height="box.height - 22">
                <div xmlns="http://www.w3.org/1999/xhtml"
                     style="font-size:13px;font-family:sans-serif;word-wrap:break-word;pointer-events:none;color:#111;line-height:1.4">
                  {{ box.label }}
                </div>
              </foreignObject>
              <!-- Node number -->
              <text :x="box.x + box.width - 5" :y="box.y + box.height - 5"
                    font-size="9" font-family="sans-serif" fill="#9ca3af" text-anchor="end">
                {{ box.nodeNumber }}
              </text>
              <!-- Resize handles (selected only) -->
              <template v-if="selectedBoxId === box.id">
                <circle
                  v-for="c in boxCorners(box)" :key="c.id"
                  :cx="c.cx" :cy="c.cy" r="5"
                  fill="white" stroke="#3b82f6" stroke-width="1.5"
                  style="cursor:se-resize"
                  @mousedown.stop="onCornerDown(box, c, $event)"
                />
              </template>
            </g>

          </g><!-- /world -->
        </svg>

        <!-- Zoom controls -->
        <div class="zoom-bar">
          <button class="zoom-btn" @click="zoomBy(1.2)" title="Zoom in">+</button>
          <button class="zoom-btn" @click="zoomBy(0.83)" title="Zoom out">−</button>
          <button class="zoom-btn" @click="fitToView" title="Fit to view">⊡</button>
          <span class="zoom-pct">{{ Math.round(scale * 100) }}%</span>
        </div>

        <!-- Hint when dragging arrow endpoint -->
        <div v-if="arrowDrag" class="drag-hint">
          {{ snapTarget ? `Connect to ${snapTarget.side} of box` : 'Drag to a box side to connect · Drop on empty to disconnect' }}
        </div>
      </div>

      <!-- ── RIGHT: Properties ── -->
      <div class="idef0-props">
        <div class="panel-title">Properties</div>

        <template v-if="selectedBox">
          <div class="prop-field">
            <label class="prop-label">Function Name (Verb/Action)</label>
            <input v-model="selectedBox.label" class="prop-input" @input="schedSave"/>
          </div>
          <div class="prop-field">
            <label class="prop-label">Node Number</label>
            <input v-model="selectedBox.nodeNumber" class="prop-input" @input="schedSave"/>
          </div>
          <div class="prop-field">
            <label class="prop-label">Description</label>
            <textarea v-model="selectedBox.description" class="prop-textarea" rows="3" @input="schedSave"/>
          </div>

          <div v-for="(meta, type) in ARROW_META" :key="type" class="arrow-sec">
            <div class="arrow-sec-hdr">
              <span>{{ meta.label }}</span>
              <button class="arrow-add" @click="addArrow(type)">＋</button>
            </div>
            <div
              v-for="arrow in arrowsForBox(selectedBox.id, type)"
              :key="arrow.id"
              class="arrow-row"
            >
              <span class="arrow-dot" :style="{ background: meta.color }"/>
              <input v-model="arrow.label" class="arrow-name" @input="schedSave"/>
              <!-- Show target box if connected -->
              <span v-if="arrow.targetBoxId && type === 'output'" class="arrow-connected" :title="`Connected to ${arrow.targetBoxId} (${arrow.targetSide})`">
                →{{ arrow.targetBoxId }}
              </span>
              <button class="arrow-del" @click="removeArrow(arrow.id)">×</button>
            </div>
          </div>

          <button class="delete-btn" @click="deleteSelectedBox">Delete Function</button>
        </template>

        <p v-else class="no-sel">Select a function block to edit its properties.</p>
      </div>

    </div>

    <!-- ═══ HELP MODAL ═══ -->
    <HelpModal v-model="showHelp">
      <h2>IDEF0 Редактор</h2>
      <p>Функциональные диаграммы по стандарту FIPS 183</p>

      <h3>Основы</h3>
      <ul>
        <li><strong>Блоки</strong> — функции/процессы. Двойной клик → редактировать название</li>
        <li><strong>Стрелки</strong> — зависимости (ICOM): наведи на блок → потяни за маркер</li>
        <li><strong>Ctrl+Z / Ctrl+Y</strong> — отмена/повтор</li>
      </ul>

      <h3>ICOM-типы стрелок</h3>
      <table>
        <thead>
          <tr><th>Маркер</th><th>Сторона</th><th>Тип</th></tr>
        </thead>
        <tbody>
          <tr><td>I</td><td>Левая</td><td>Вход (Input)</td></tr>
          <tr><td>C</td><td>Верхняя</td><td>Управление (Control)</td></tr>
          <tr><td>O</td><td>Правая</td><td>Выход (Output)</td></tr>
          <tr><td>M</td><td>Нижняя</td><td>Механизм (Mechanism)</td></tr>
        </tbody>
      </table>

      <h3>Иерархия</h3>
      <ul>
        <li>Выбери блок → <strong>⊕ Decompose</strong> — создать дочернюю диаграмму</li>
        <li>Навигатор слева и <strong>↑ Parent</strong> — навигация по диаграммам</li>
        <li><strong>✕ Декомп.</strong> — удалить декомпозицию блока</li>
      </ul>

      <h3>Экспорт</h3>
      <p>JSON · Document — кнопки в тулбаре. Load — импорт JSON-проекта</p>
    </HelpModal>
  </div>
</template>

<style scoped>
.idef0-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  overflow: hidden;
}

/* Toolbar */
.idef0-toolbar {
  display: flex; align-items: center; gap: 6px;
  padding: 0 14px; height: 46px;
  background: #1e293b; border-bottom: 1px solid #334155; flex-shrink: 0;
}
.tb-btn {
  padding: 4px 12px; background: #334155; border: 1px solid #475569;
  border-radius: 6px; cursor: pointer; font-size: 13px; color: #cbd5e1; white-space: nowrap;
}
.tb-btn:hover:not(:disabled) { background: #475569; border-color: #64748b; }
.tb-btn:disabled { opacity: 0.38; cursor: not-allowed; }
.tb-btn-doc { background: #14321f; border-color: #1f6e3d; color: #34d399; }
.tb-btn-doc:hover:not(:disabled) { background: #1a4029; border-color: #34d399; }
.tb-btn-danger { background: #3f1d1d; border-color: #7f2d2d; color: #f87171; }
.tb-btn-danger:hover:not(:disabled) { background: #4a2323; border-color: #ef4444; }
.tb-sep { width: 1px; height: 22px; background: #334155; margin: 0 2px; }
.tb-diag { font-weight: 700; color: #60a5fa; }
.tb-title { color: #94a3b8; font-size: 12px; }
.tb-spacer { flex: 1; }

/* Panels */
.idef0-main { display: grid; grid-template-columns: 210px 1fr 280px; flex: 1; min-height: 0; }

/* Left nav */
.idef0-nav { background: #1e293b; border-right: 1px solid #334155; overflow-y: auto; padding-bottom: 12px; }
.panel-title {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: #94a3b8; padding: 14px 14px 6px;
}
.nav-item {
  padding: 7px 14px; cursor: pointer; border-radius: 5px;
  margin: 1px 8px; display: flex; flex-direction: column; gap: 1px;
}
.nav-item:hover { background: #273449; }
.nav-item.active { background: #334155; }
.nav-id { font-weight: 600; color: #60a5fa; font-size: 13px; }
.nav-sub { font-size: 11px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Canvas */
.idef0-canvas-wrap { position: relative; overflow: hidden; background: #f8fafc; }
.idef0-svg { width: 100%; height: 100%; display: block; }

/* Arrow endpoint handle */
.arrow-ep { transition: r 0.1s; }
.arrow-ep:hover { r: 7; }

/* Zoom */
.zoom-bar {
  position: absolute; bottom: 16px; left: 16px;
  display: flex; align-items: center; gap: 2px;
  background: #1e293b; border: 1px solid #334155; border-radius: 8px;
  padding: 3px; box-shadow: 0 1px 4px #0003;
}
.zoom-btn {
  width: 28px; height: 28px; border: none; background: none;
  cursor: pointer; font-size: 16px; color: #cbd5e1; border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
}
.zoom-btn:hover { background: #334155; }
.zoom-pct { font-size: 11px; color: #94a3b8; padding: 0 5px; min-width: 36px; text-align: center; }

/* Drag hint */
.drag-hint {
  position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
  background: #1e293bdd; color: #fff; font-size: 12px;
  padding: 5px 14px; border-radius: 20px; pointer-events: none;
  white-space: nowrap;
}

/* Properties */
.idef0-props { background: #1e293b; border-left: 1px solid #334155; overflow-y: auto; padding: 0 14px 20px; }
.idef0-props .panel-title { padding-left: 0; }

.prop-field { margin-bottom: 11px; }
.prop-label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin-bottom: 4px; }
.prop-input, .prop-textarea {
  width: 100%; padding: 6px 9px; border: 1px solid #475569; border-radius: 6px;
  font-size: 13px; color: #e2e8f0; background: #0f172a; box-sizing: border-box; font-family: inherit;
}
.prop-input:focus, .prop-textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px #3b82f655; }
.prop-textarea { resize: vertical; line-height: 1.5; }

/* Arrow sections */
.arrow-sec { margin-bottom: 10px; border: 1px solid #334155; border-radius: 7px; overflow: hidden; }
.arrow-sec-hdr {
  display: flex; justify-content: space-between; align-items: center;
  padding: 7px 10px; background: #273449; font-size: 12px; font-weight: 500; color: #cbd5e1;
}
.arrow-add {
  width: 22px; height: 22px; border: 1px solid #475569; border-radius: 4px;
  background: #334155; cursor: pointer; font-size: 14px; color: #cbd5e1;
  display: flex; align-items: center; justify-content: center; line-height: 1;
}
.arrow-add:hover { background: #1e3a5f; border-color: #60a5fa; color: #93c5fd; }
.arrow-row { display: flex; align-items: center; gap: 7px; padding: 5px 10px; border-top: 1px solid #334155; }
.arrow-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.arrow-name { flex: 1; border: none; background: transparent; font-size: 13px; color: #e2e8f0; padding: 1px 0; outline: none; font-family: inherit; }
.arrow-name:focus { border-bottom: 1px solid #60a5fa; }
.arrow-connected { font-size: 10px; color: #34d399; font-weight: 600; white-space: nowrap; }
.arrow-del { background: none; border: none; cursor: pointer; color: #64748b; font-size: 17px; line-height: 1; padding: 0 2px; }
.arrow-del:hover { color: #f87171; }

.delete-btn {
  width: 100%; padding: 8px; margin-top: 16px;
  background: #3f1d1d; color: #f87171; border: 1px solid #7f2d2d;
  border-radius: 6px; cursor: pointer; font-size: 13px; font-family: inherit;
}
.delete-btn:hover { background: #4a2323; }

.no-sel { color: #64748b; text-align: center; margin-top: 40px; line-height: 1.6; font-size: 13px; }
</style>
