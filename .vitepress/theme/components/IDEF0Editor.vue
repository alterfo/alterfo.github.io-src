<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { loadProject, saveProject } from './IDEF0Editor/db.js'

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

const BOUNDARY_GAP = 100  // world units from box side to boundary endpoint
const SNAP_DIST = 35      // world units for endpoint snap-to-box-side

// ----- Project -----
function defaultProject() {
  return {
    id: 'default',
    rootId: 'A0',
    childMap: {},
    diagrams: {
      A0: { id: 'A0', title: 'Main Process', boxes: [], arrows: [] }
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
  }
  boxes.push(box)
  selectedBoxId.value = box.id
  schedSave()
}

function deleteSelectedBox() {
  if (!selectedBox.value) return
  const id = selectedBox.value.id
  currentDiagram.value.arrows = currentDiagram.value.arrows.filter(
    a => a.sourceBoxId !== id && a.targetBoxId !== id
  )
  const idx = currentDiagram.value.boxes.findIndex(b => b.id === id)
  if (idx !== -1) currentDiagram.value.boxes.splice(idx, 1)
  selectedBoxId.value = null
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
  const idx = currentDiagram.value.arrows.findIndex(a => a.id === arrowId)
  if (idx !== -1) currentDiagram.value.arrows.splice(idx, 1)
  schedSave()
}

// ----- Diagram navigation -----
function navigateTo(id) {
  if (!project.diagrams[id]) return
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
  const parentId = currentDiagramId.value
  const idx = currentDiagram.value.boxes.indexOf(box)
  const childId = parentId === 'A0' ? `A${idx + 1}` : `${parentId}${idx + 1}`
  if (!project.diagrams[childId]) {
    project.diagrams[childId] = { id: childId, title: box.label, boxes: [], arrows: [] }
    if (!project.childMap[parentId]) project.childMap[parentId] = []
    if (!project.childMap[parentId].includes(childId)) project.childMap[parentId].push(childId)
  }
  navigateTo(childId)
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

      // Manhattan routing: Z-shape or L-shape
      let segs
      if (side === 'left') {
        const midX = (boxPt.x + targetPt.x) / 2
        segs = [boxPt, { x: midX, y: boxPt.y }, { x: midX, y: targetPt.y }, targetPt]
      } else if (side === 'top') {
        segs = [boxPt, { x: targetPt.x, y: boxPt.y }, targetPt]
      } else {
        segs = [boxPt, { x: targetPt.x, y: boxPt.y }, targetPt]
      }

      const mid = { x: (boxPt.x + targetPt.x) / 2, y: (boxPt.y + targetPt.y) / 2 }
      return { boxPt, farPt: targetPt, start: boxPt, end: targetPt, mid, segments: segs, arrowAtBox: false }
    }
  }

  // ── Boundary arrow ──
  let farPt
  switch (arrow.type) {
    case 'input':    farPt = { x: boxPt.x - BOUNDARY_GAP, y: boxPt.y }; break
    case 'control':  farPt = { x: boxPt.x, y: boxPt.y - BOUNDARY_GAP }; break
    case 'output':   farPt = { x: boxPt.x + BOUNDARY_GAP, y: boxPt.y }; break
    case 'mechanism':farPt = { x: boxPt.x, y: boxPt.y + BOUNDARY_GAP }; break
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
  const pad = BOUNDARY_GAP + 30
  const x0 = Math.min(...boxes.map(b => b.x)) - pad
  const y0 = Math.min(...boxes.map(b => b.y)) - pad
  const x1 = Math.max(...boxes.map(b => b.x + b.width))  + pad
  const y1 = Math.max(...boxes.map(b => b.y + b.height)) + pad
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
  // Route the preview similarly to actual routing
  const side = snapTarget.value?.side
  if (side === 'left') {
    const midX = (src.x + ep.x) / 2
    return `M ${src.x} ${src.y} H ${midX} V ${ep.y} H ${ep.x}`
  } else if (side === 'top' || side === 'bottom') {
    return `M ${src.x} ${src.y} H ${ep.x} V ${ep.y}`
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
      if (!project.diagrams[currentDiagramId.value]) {
        currentDiagramId.value = project.rootId ?? 'A0'
      }
    }
  } catch (e) { console.warn('[idef0] load failed', e) }
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
          schedSave()
        }
      } catch { alert('Неверный формат JSON') }
    }
    r.readAsText(file)
  }
  input.click()
}

// ----- Lifecycle -----
onMounted(async () => {
  await loadFromDb()
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
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
      <button class="tb-btn" @click="navigateUp" :disabled="!canGoUp">↑ Parent</button>
      <div class="tb-sep"/>
      <span class="tb-diag">{{ currentDiagramId }}</span>
      <span class="tb-title">{{ currentDiagram.title }}</span>
      <div class="tb-spacer"/>
      <button class="tb-btn" @click="schedSave">Save</button>
      <button class="tb-btn" @click="importJSON">Load</button>
      <button class="tb-btn" @click="exportJSON">Export JSON</button>
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
  background: #fff; border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
}
.tb-btn {
  padding: 4px 12px; background: #fff; border: 1px solid #d1d5db;
  border-radius: 6px; cursor: pointer; font-size: 13px; color: #374151; white-space: nowrap;
}
.tb-btn:hover:not(:disabled) { background: #f9fafb; border-color: #9ca3af; }
.tb-btn:disabled { opacity: 0.38; cursor: not-allowed; }
.tb-sep { width: 1px; height: 22px; background: #e5e7eb; margin: 0 2px; }
.tb-diag { font-weight: 700; color: #1d4ed8; }
.tb-title { color: #6b7280; font-size: 12px; }
.tb-spacer { flex: 1; }

/* Panels */
.idef0-main { display: grid; grid-template-columns: 210px 1fr 280px; flex: 1; min-height: 0; }

/* Left nav */
.idef0-nav { background: #fff; border-right: 1px solid #e5e7eb; overflow-y: auto; padding-bottom: 12px; }
.panel-title {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: #9ca3af; padding: 14px 14px 6px;
}
.nav-item {
  padding: 7px 14px; cursor: pointer; border-radius: 5px;
  margin: 1px 8px; display: flex; flex-direction: column; gap: 1px;
}
.nav-item:hover { background: #f3f4f6; }
.nav-item.active { background: #eff6ff; }
.nav-id { font-weight: 600; color: #1d4ed8; font-size: 13px; }
.nav-sub { font-size: 11px; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

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
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;
  padding: 3px; box-shadow: 0 1px 4px #0001;
}
.zoom-btn {
  width: 28px; height: 28px; border: none; background: none;
  cursor: pointer; font-size: 16px; color: #374151; border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
}
.zoom-btn:hover { background: #f3f4f6; }
.zoom-pct { font-size: 11px; color: #9ca3af; padding: 0 5px; min-width: 36px; text-align: center; }

/* Drag hint */
.drag-hint {
  position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
  background: #1e293bdd; color: #fff; font-size: 12px;
  padding: 5px 14px; border-radius: 20px; pointer-events: none;
  white-space: nowrap;
}

/* Properties */
.idef0-props { background: #fff; border-left: 1px solid #e5e7eb; overflow-y: auto; padding: 0 14px 20px; }
.idef0-props .panel-title { padding-left: 0; }

.prop-field { margin-bottom: 11px; }
.prop-label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; margin-bottom: 4px; }
.prop-input, .prop-textarea {
  width: 100%; padding: 6px 9px; border: 1px solid #d1d5db; border-radius: 6px;
  font-size: 13px; color: #111; background: #fff; box-sizing: border-box; font-family: inherit;
}
.prop-input:focus, .prop-textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px #bfdbfe55; }
.prop-textarea { resize: vertical; line-height: 1.5; }

/* Arrow sections */
.arrow-sec { margin-bottom: 10px; border: 1px solid #e5e7eb; border-radius: 7px; overflow: hidden; }
.arrow-sec-hdr {
  display: flex; justify-content: space-between; align-items: center;
  padding: 7px 10px; background: #f9fafb; font-size: 12px; font-weight: 500; color: #374151;
}
.arrow-add {
  width: 22px; height: 22px; border: 1px solid #d1d5db; border-radius: 4px;
  background: #fff; cursor: pointer; font-size: 14px; color: #374151;
  display: flex; align-items: center; justify-content: center; line-height: 1;
}
.arrow-add:hover { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }
.arrow-row { display: flex; align-items: center; gap: 7px; padding: 5px 10px; border-top: 1px solid #f3f4f6; }
.arrow-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.arrow-name { flex: 1; border: none; background: transparent; font-size: 13px; color: #111; padding: 1px 0; outline: none; font-family: inherit; }
.arrow-name:focus { border-bottom: 1px solid #3b82f6; }
.arrow-connected { font-size: 10px; color: #10b981; font-weight: 600; white-space: nowrap; }
.arrow-del { background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 17px; line-height: 1; padding: 0 2px; }
.arrow-del:hover { color: #ef4444; }

.delete-btn {
  width: 100%; padding: 8px; margin-top: 16px;
  background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5;
  border-radius: 6px; cursor: pointer; font-size: 13px; font-family: inherit;
}
.delete-btn:hover { background: #fee2e2; }

.no-sel { color: #9ca3af; text-align: center; margin-top: 40px; line-height: 1.6; font-size: 13px; }
</style>
