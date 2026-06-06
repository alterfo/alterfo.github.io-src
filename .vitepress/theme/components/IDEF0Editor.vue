<template>
  <div class="idef0-editor">
    <canvas
      ref="canvasEl"
      class="idef0-canvas"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @wheel.prevent="onWheel"
      @dblclick="onDoubleClick"
    />

    <div v-if="editing" class="idef0-inline-editor" :style="editorStyle">
      <input
        ref="editorInput"
        v-model="editing.text"
        @blur="finishEdit"
        @keydown.enter="finishEdit"
        @keydown.esc="cancelEdit"
      />
    </div>

    <div class="idef0-toolbar">
      <button @click="addBlock" title="Добавить блок">+ Блок</button>
      <span class="idef0-separator" />
      <button v-if="canGoBack" @click="goBack">← Назад</button>
      <button v-if="selectedBlock && selectedBlock.diagramId" @click="enterBlock">↳ Войти</button>
      <button v-if="selectedBlock && !selectedBlock.diagramId" @click="createNestedDiagram">+ Вложить</button>
      <span class="idef0-separator" />
      <button @click="exportPNG">PNG</button>
      <button @click="exportSVG">SVG</button>
      <button @click="exportJSON">JSON</button>
      <span class="idef0-separator" />
      <span class="idef0-breadcrumb">
        <span
          v-for="(crumb, idx) in breadcrumb"
          :key="crumb.id"
          class="idef0-crumb"
          :class="{ 'idef0-crumb-active': crumb.id === currentDiagramId }"
          @click="navigateToDiagram(crumb.id)"
        >
          {{ crumb.name }}
          <span v-if="idx < breadcrumb.length - 1">›</span>
        </span>
      </span>
      <span class="idef0-zoom">{{ Math.round(scale * 100) }}%</span>
    </div>

    <div v-if="errors.length" class="idef0-status-bar idef0-status-error">
      Ошибки: {{ errors.map(e => e.message).join('; ') }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { COLORS, SIZES, DEFAULT_DIAGRAM } from './IDEF0Editor/constants.js'
import { loadProject, saveProject, onExternalChange } from './IDEF0Editor/db.js'
import { validateDiagram } from './IDEF0Editor/validation.js'
import { exportToPNG, exportToSVG as exportToSVGFn, exportToJSON as exportToJSONFn } from './IDEF0Editor/exporter.js'
import { getDiagramIdFromQuery } from './IDEF0Editor/router.js'
import { generateChildDiagramId, getParentDiagramId } from './IDEF0Editor/hierarchy.js'

const props = defineProps({
  projectId: { type: String, default: 'project-1' }
})

// Template refs
const canvasEl = ref(null)
const editorInput = ref(null)

// Reactive state
const diagrams = ref({})
const currentDiagramId = ref('A0')
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const blocks = ref([])
const arrows = ref([])
const selectedBlockId = ref(null)
const selectedArrowId = ref(null)
const errors = ref([])
const editing = ref(null)

// Non-reactive state (methods only)
let ctx = null
let isPanning = false
let lastX = 0
let lastY = 0
let dragBlock = null
let dragOffsetX = 0
let dragOffsetY = 0
let dragArrowEnd = null
let cleanupExternalChange = null

function onWindowResize() { handleResize() }
function onKeydown(e) {
  if ((e.key === 'Delete' || e.key === 'Backspace') && !editing.value) {
    if (selectedBlockId.value) deleteSelectedBlock()
    if (selectedArrowId.value) deleteSelectedArrow()
  }
  if (e.key === ' ' && !editing.value) {
    e.preventDefault()
    isPanning = true
  }
}
function onKeyup(e) {
  if (e.key === ' ') isPanning = false
}

// Computed
const currentDiagram = computed(() => diagrams.value[currentDiagramId.value] || null)
const canGoBack = computed(() => {
  const parentId = getParentDiagramId(currentDiagramId.value)
  return !!(parentId && diagrams.value[parentId])
})
const selectedBlock = computed(() => blocks.value.find(b => b.id === selectedBlockId.value) || null)
const breadcrumb = computed(() => {
  const path = []
  let current = currentDiagramId.value
  while (current) {
    const d = diagrams.value[current]
    if (!d) break
    path.unshift({ id: current, name: d.name || current })
    current = d.parentDiagramId
  }
  return path
})
const editorStyle = computed(() => {
  if (!editing.value) return {}
  return {
    left: worldToScreen(editing.value.x).x + 'px',
    top: worldToScreen(editing.value.y).y + 'px',
    width: (editing.value.w * scale.value) + 'px',
    height: (editing.value.h * scale.value) + 'px',
  }
})

// Lifecycle
onMounted(async () => {
  ctx = canvasEl.value.getContext('2d')
  handleResize()

  const saved = await loadProject(props.projectId)
  if (saved && saved.diagrams) {
    diagrams.value = saved.diagrams
  } else {
    initDefaultDiagram()
  }

  const qId = getDiagramIdFromQuery()
  if (qId && diagrams.value[qId]) {
    currentDiagramId.value = qId
  }

  loadDiagram()
  render()

  cleanupExternalChange = onExternalChange(props.projectId, () => loadDiagram())

  window.addEventListener('resize', onWindowResize)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('keyup', onKeyup)
})

onBeforeUnmount(() => {
  if (cleanupExternalChange) cleanupExternalChange()
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('keyup', onKeyup)
})

function handleResize() {
  const rect = canvasEl.value.getBoundingClientRect()
  const w = Math.max(rect.width, 800)
  const h = Math.max(rect.height, 600)
  canvasEl.value.width = w * window.devicePixelRatio
  canvasEl.value.height = h * window.devicePixelRatio
  canvasEl.value.style.width = w + 'px'
  canvasEl.value.style.height = h + 'px'
  if (ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
  }
  render()
}

function initDefaultDiagram() {
  const block = {
    id: 'block-1',
    name: 'Контекстная функция',
    x: 350, y: 250, w: 180, h: 100,
    diagramId: null,
  }

  const ts = Date.now()
  const arrowsList = [
    {
      id: `arrow-${ts}-0`, name: '', type: 'input',
      from: { blockId: null, edge: 'left', offset: block.y + block.h / 2 },
      to: { blockId: block.id, edge: 'left', offset: 0 },
      segments: [],
    },
    {
      id: `arrow-${ts}-1`, name: '', type: 'control',
      from: { blockId: null, edge: 'top', offset: block.x + block.w / 2 },
      to: { blockId: block.id, edge: 'top', offset: 0 },
      segments: [],
    },
    {
      id: `arrow-${ts}-2`, name: '', type: 'output',
      from: { blockId: block.id, edge: 'right', offset: 0 },
      to: { blockId: null, edge: 'right', offset: block.y + block.h / 2 },
      segments: [],
    },
    {
      id: `arrow-${ts}-3`, name: '', type: 'mechanism',
      from: { blockId: null, edge: 'bottom', offset: block.x + block.w / 2 },
      to: { blockId: block.id, edge: 'bottom', offset: 0 },
      segments: [],
    },
  ]

  diagrams.value['A0'] = {
    ...DEFAULT_DIAGRAM,
    id: 'A0',
    name: 'Контекстная диаграмма',
    blocks: [block],
    arrows: arrowsList,
    view: { x: 50, y: 50, scale: 1 },
  }
}

function loadDiagram() {
  const d = currentDiagram.value
  if (!d) return
  blocks.value = d.blocks || []
  arrows.value = d.arrows || []
  if (d.view) {
    offsetX.value = d.view.x
    offsetY.value = d.view.y
    scale.value = d.view.scale
  }
  errors.value = validateDiagram(d)
  render()
}

function saveDiagram() {
  const d = currentDiagram.value
  if (d) {
    d.view = { x: offsetX.value, y: offsetY.value, scale: scale.value }
  }
  saveProject(props.projectId, { diagrams: diagrams.value })
}

// --- Rendering ---

function render() {
  if (!ctx || !canvasEl.value) return
  const w = canvasEl.value.clientWidth, h = canvasEl.value.clientHeight
  ctx.clearRect(0, 0, w, h)
  ctx.save()
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)

  drawGrid(w, h)
  drawArrows()
  drawBlocks()
  drawSelection()

  ctx.restore()
}

function drawGrid(w, h) {
  const gs = SIZES.gridSize || 20
  const startX = Math.floor(-offsetX.value / scale.value / gs) * gs
  const startY = Math.floor(-offsetY.value / scale.value / gs) * gs
  ctx.strokeStyle = COLORS.grid || '#ddd'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = startX; x < startX + w / scale.value + gs; x += gs) {
    ctx.moveTo(x, startY)
    ctx.lineTo(x, startY + h / scale.value + gs)
  }
  for (let y = startY; y < startY + h / scale.value + gs; y += gs) {
    ctx.moveTo(startX, y)
    ctx.lineTo(startX + w / scale.value + gs, y)
  }
  ctx.stroke()
}

function drawBlocks() {
  blockLoop: for (const b of blocks.value) {
    ctx.fillStyle = COLORS.blockFill
    ctx.strokeStyle = COLORS.blockStroke
    ctx.lineWidth = 2
    ctx.fillRect(b.x, b.y, b.w, b.h)
    ctx.strokeRect(b.x, b.y, b.w, b.h)

    ctx.fillStyle = COLORS.text
    ctx.font = `${SIZES.fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const maxW = b.w - 16, maxH = b.h - 16
    const text = b.name || ''
    let fs = SIZES.fontSize
    while (fs >= SIZES.fontSizeMin) {
      ctx.font = `${fs}px sans-serif`
      const lines = wrapText(ctx, text, maxW)
      const lh = fs * 1.2, th = lines.length * lh
      if (th <= maxH) {
        const sy = b.y + b.h / 2 - th / 2 + lh / 2
        lines.forEach((l, i) => ctx.fillText(l, b.x + b.w / 2, sy + i * lh))
        continue blockLoop
      }
      fs--
    }
    ctx.font = `${SIZES.fontSizeMin}px sans-serif`
    ctx.fillText(truncateText(ctx, text, maxW), b.x + b.w / 2, b.y + b.h / 2)
  }
}

function wrapText(ctxArg, text, maxW) {
  const words = text.split(/\s+/), lines = []
  let cur = ''
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w
    if (ctxArg.measureText(t).width <= maxW) cur = t
    else { if (cur) lines.push(cur); cur = w }
  }
  return cur ? [...lines, cur] : [text]
}

function truncateText(ctxArg, text, maxW) {
  if (ctxArg.measureText(text).width <= maxW) return text
  let result = text
  while (result.length > 0) {
    result = result.slice(0, -1)
    if (ctxArg.measureText(result + '..').width <= maxW) return result + '..'
  }
  return ''
}

function drawArrows() {
  for (const a of arrows.value) {
    const pts = getArrowPoints(a)
    if (pts.length < 2) continue
    const col = COLORS.arrow[a.type] || COLORS.arrow.input
    ctx.strokeStyle = col
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.stroke()
    const n = pts.length - 1
    const dx = pts[n].x - pts[n - 1].x, dy = pts[n].y - pts[n - 1].y
    const ang = Math.atan2(dy, dx)
    const hl = 10
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.moveTo(pts[n].x, pts[n].y)
    ctx.lineTo(pts[n].x - hl * Math.cos(ang - Math.PI / 6), pts[n].y - hl * Math.sin(ang - Math.PI / 6))
    ctx.lineTo(pts[n].x - hl * Math.cos(ang + Math.PI / 6), pts[n].y - hl * Math.sin(ang + Math.PI / 6))
    ctx.closePath()
    ctx.fill()

    if (a.name) drawArrowLabel(a, pts, col)
    drawBoundaryMarker(a, pts[0], col, false)
    drawBoundaryMarker(a, pts[pts.length - 1], col, true)
  }
}

function getArrowPoints(arrow) {
  const pts = []
  const fromB = blocks.value.find(b => b.id === arrow.from?.blockId)
  const toB = blocks.value.find(b => b.id === arrow.to?.blockId)

  const getPoint = (blk, edge, offset, isFloating, coord) => {
    if (isFloating) return { x: coord?.x ?? 0, y: coord?.y ?? 0 }
    if (!blk && edge) {
      const dist = 150
      if (edge === 'top') return { x: offset, y: -dist }
      if (edge === 'bottom') return { x: offset, y: 800 + dist }
      if (edge === 'left') return { x: -dist, y: offset }
      if (edge === 'right') return { x: 1000 + dist, y: offset }
    }
    if (!blk && coord) return coord
    const o = offset || 0
    if (!blk) return { x: 0, y: 0 }
    if (edge === 'top') return { x: blk.x + blk.w / 2 + o, y: blk.y }
    if (edge === 'right') return { x: blk.x + blk.w, y: blk.y + blk.h / 2 + o }
    if (edge === 'bottom') return { x: blk.x + blk.w / 2 + o, y: blk.y + blk.h }
    if (edge === 'left') return { x: blk.x, y: blk.y + blk.h / 2 + o }
    return { x: blk.x + blk.w / 2, y: blk.y + blk.h / 2 }
  }

  const fromFloat = arrow.from?.blockId === null && arrow.from?.edge === null
  const toFloat = arrow.to?.blockId === null && arrow.to?.edge === null

  const fromCoord = fromFloat ? { x: arrow.from?.x, y: arrow.from?.y } : null
  const toCoord = toFloat ? { x: arrow.to?.x, y: arrow.to?.y } : null

  pts.push(getPoint(fromB, arrow.from?.edge, arrow.from?.offset, fromFloat, fromCoord))
  if (arrow.segments && arrow.segments.length) pts.push(...arrow.segments)
  pts.push(getPoint(toB, arrow.to?.edge, arrow.to?.offset, toFloat, toCoord))
  return pts
}

function getDiagramBounds() {
  if (!blocks.value.length) return { minX: -200, minY: -200, maxX: 1200, maxY: 1000 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const b of blocks.value) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w)
    maxY = Math.max(maxY, b.y + b.h)
  }
  const pad = 150
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
}

function drawArrowLabel(arrow, pts, col) {
  const fs = SIZES.arrowLabelFontSize || 12
  ctx.font = `${fs}px sans-serif`
  const tw = ctx.measureText(arrow.name).width, th = fs
  let mx, my, ang
  if (arrow.labelX != null && arrow.labelY != null) {
    mx = arrow.labelX; my = arrow.labelY
    ang = (arrow.labelAngle || 0) * Math.PI / 180
  } else {
    const midIdx = Math.floor(pts.length / 2)
    const mid = pts[midIdx]
    const prevPt = pts[Math.max(0, midIdx - 1)]
    const nextPt = pts[Math.min(pts.length - 1, midIdx + 1)]
    const dx = nextPt.x - prevPt.x
    const dy = nextPt.y - prevPt.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len > 0) {
      ang = Math.abs(dx) > Math.abs(dy) ? 0 : -Math.PI / 2
    } else {
      ang = 0
    }
    mx = mid.x
    my = mid.y - 5
  }
  ctx.save()
  ctx.translate(mx, my)
  ctx.rotate(ang)
  ctx.fillStyle = COLORS.textBg || '#fff'
  ctx.fillRect(-tw / 2 - 3, -th / 2 - 3, tw + 6, th + 6)
  ctx.fillStyle = col
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(arrow.name, 0, 0)
  ctx.restore()
  if (selectedArrowId.value === arrow.id) {
    ctx.fillStyle = COLORS.handler || '#0ff'
    const hs = (SIZES.labelHandleSize || 8) / scale.value
    ctx.fillRect(mx - hs / 2, my - hs / 2, hs, hs)
  }
}

function drawBoundaryMarker(arrow, pt, col, isTarget) {
  const bounds = getDiagramBounds()
  const onBd = Math.abs(pt.x - bounds.minX) < 2 || Math.abs(pt.x - bounds.maxX) < 2 ||
               Math.abs(pt.y - bounds.minY) < 2 || Math.abs(pt.y - bounds.maxY) < 2
  if (!onBd) return
  if ((isTarget && arrow.to.blockId) || (!isTarget && arrow.from.blockId)) return
  const m = isTarget ? getICOMMarker(arrow.type) : ''
  if (!m) return
  const fs = 10, pad = 4
  ctx.font = `bold ${fs}px sans-serif`
  const tw = ctx.measureText(m).width, bw = tw + pad * 2, bh = fs + pad * 2
  let bx = pt.x, by = pt.y
  if (pt.x <= bounds.minX + 1) bx = pt.x + 2
  else if (pt.x >= bounds.maxX - 1) bx = pt.x - bw - 2
  else if (pt.y <= bounds.minY + 1) by = pt.y + 2
  else by = pt.y - bh - 2
  ctx.fillStyle = col
  ctx.fillRect(bx, by, bw, bh)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(m, bx + bw / 2, by + bh / 2)
}

function getICOMMarker(type) {
  switch (type) {
    case 'input': return 'I'
    case 'output': return 'O'
    case 'control': return 'C'
    case 'mechanism': return 'M'
    case 'call': return 'C'
    default: return ''
  }
}

function drawSelection() {
  if (selectedBlockId.value) {
    const b = blocks.value.find(x => x.id === selectedBlockId.value)
    if (b) {
      ctx.strokeStyle = COLORS.selection
      ctx.lineWidth = 2
      ctx.setLineDash([5, 3])
      ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4)
    }
  }
  if (selectedArrowId.value) {
    const a = arrows.value.find(x => x.id === selectedArrowId.value)
    if (a) {
      const pts = getArrowPoints(a)
      ctx.strokeStyle = COLORS.selection
      ctx.lineWidth = 3
      ctx.setLineDash([5, 3])
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.stroke()
      ctx.fillStyle = COLORS.handler
      const hs = SIZES.arrowEndHandleSize / scale.value
      ctx.fillRect(pts[0].x - hs / 2, pts[0].y - hs / 2, hs, hs)
      const n = pts.length - 1
      ctx.fillRect(pts[n].x - hs / 2, pts[n].y - hs / 2, hs, hs)
    }
  }
}

// --- Block operations ---

function addBlock() {
  const rect = canvasEl.value.getBoundingClientRect()
  const cw = screenToWorld(rect.width / 2, rect.height / 2)
  const id = `block-${Date.now()}`
  const b = {
    id, name: `Блок ${blocks.value.length + 1}`,
    x: cw.x - SIZES.blockDefaultW / 2, y: cw.y - SIZES.blockDefaultH / 2,
    w: SIZES.blockDefaultW, h: SIZES.blockDefaultH,
    diagramId: null,
  }
  blocks.value.push(b)
  createAutoArrows(b)
  selectedBlockId.value = id
  selectedArrowId.value = null
  render()
  saveDiagram()
}

function createAutoArrows(block) {
  const ts = Date.now()
  arrows.value.push({
    id: `arrow-${ts}-0`, name: '', type: 'input',
    from: { blockId: null, edge: 'left', offset: block.y + block.h / 2 },
    to: { blockId: block.id, edge: 'left', offset: 0 },
    segments: [],
  })
  arrows.value.push({
    id: `arrow-${ts}-1`, name: '', type: 'control',
    from: { blockId: null, edge: 'top', offset: block.x + block.w / 2 },
    to: { blockId: block.id, edge: 'top', offset: 0 },
    segments: [],
  })
  arrows.value.push({
    id: `arrow-${ts}-2`, name: '', type: 'output',
    from: { blockId: block.id, edge: 'right', offset: 0 },
    to: { blockId: null, edge: 'right', offset: block.y + block.h / 2 },
    segments: [],
  })
  arrows.value.push({
    id: `arrow-${ts}-3`, name: '', type: 'mechanism',
    from: { blockId: null, edge: 'bottom', offset: block.x + block.w / 2 },
    to: { blockId: block.id, edge: 'bottom', offset: 0 },
    segments: [],
  })
}

function deleteSelectedBlock() {
  if (!selectedBlockId.value) return
  const idx = blocks.value.findIndex(b => b.id === selectedBlockId.value)
  if (idx === -1) return
  const b = blocks.value[idx]
  arrows.value = arrows.value.filter(a => a.from.blockId !== b.id && a.to.blockId !== b.id)
  blocks.value.splice(idx, 1)
  if (b.diagramId) delete diagrams.value[b.diagramId]
  selectedBlockId.value = null
  render()
  saveDiagram()
}

function deleteSelectedArrow() {
  if (!selectedArrowId.value) return
  arrows.value = arrows.value.filter(a => a.id !== selectedArrowId.value)
  selectedArrowId.value = null
  render()
  saveDiagram()
}

// --- Arrow drag & connect ---

function reconnectArrowToBlock(arrow, end, block) {
  const ep = end === 'from' ? arrow.from : arrow.to
  const ex = ep.x ?? 0, ey = ep.y ?? 0
  const distL = Math.abs(ex - block.x), distR = Math.abs(ex - (block.x + block.w))
  const distT = Math.abs(ey - block.y), distB = Math.abs(ey - (block.y + block.h))
  const min = Math.min(distL, distR, distT, distB)
  if (min > 30) return false

  let edge, off
  if (min === distL) { edge = 'left'; off = ey - (block.y + block.h / 2) }
  else if (min === distR) { edge = 'right'; off = ey - (block.y + block.h / 2) }
  else if (min === distT) { edge = 'top'; off = ex - (block.x + block.w / 2) }
  else { edge = 'bottom'; off = ex - (block.x + block.w / 2) }

  const maxOff = edge === 'top' || edge === 'bottom' ? block.w / 2 - 8 : block.h / 2 - 8
  off = Math.max(-maxOff, Math.min(maxOff, off))

  ep.blockId = block.id
  ep.edge = edge
  ep.offset = off
  delete ep.x
  delete ep.y

  const pts = getArrowPoints(arrow)
  arrow.segments = pts.length > 2 ? pts.slice(1, -1) : []
  render()
  return true
}

// --- Decomposition ---

function createNestedDiagram() {
  if (!selectedBlock.value) return
  enterBlock()
}

function enterBlock() {
  const b = selectedBlock.value
  if (!b.diagramId) {
    const idx = blocks.value.findIndex(x => x.id === b.id)
    const childId = generateChildDiagramId(currentDiagramId.value, idx)
    b.diagramId = childId
    const child = {
      id: childId, name: `Декомпозиция ${b.name}`,
      parentDiagramId: currentDiagramId.value, parentBlockId: b.id,
      blocks: [], arrows: [],
      view: { x: 0, y: 0, scale: 1 },
    }
    diagrams.value[childId] = child
  }
  currentDiagramId.value = b.diagramId
  selectedBlockId.value = null
  selectedArrowId.value = null
  loadDiagram()
  saveDiagram()
}

function goBack() {
  const parentId = getParentDiagramId(currentDiagramId.value)
  if (!parentId || !diagrams.value[parentId]) return
  currentDiagramId.value = parentId
  selectedBlockId.value = null
  selectedArrowId.value = null
  loadDiagram()
}

function navigateToDiagram(id) {
  if (diagrams.value[id]) {
    currentDiagramId.value = id
    loadDiagram()
  }
}

// --- Editing ---

function onDoubleClick(e) {
  const b = hitTestBlock(e.offsetX, e.offsetY)
  if (b) {
    if (b.diagramId) {
      selectedBlockId.value = b.id
      enterBlock()
    } else {
      startEditBlock(b)
    }
    return
  }
  const a = hitTestArrow(e.offsetX, e.offsetY)
  if (a) {
    startEditArrow(a)
  }
}

function startEditBlock(b) {
  editing.value = { type: 'block', id: b.id, text: b.name, x: b.x, y: b.y, w: b.w, h: b.h }
  nextTick(() => editorInput.value?.focus())
}

function startEditArrow(a) {
  const pts = getArrowPoints(a)
  if (!pts.length) return
  const midIdx = Math.floor(pts.length / 2)
  const mid = pts[midIdx]
  const prevPt = pts[Math.max(0, midIdx - 1)]
  const nextPtVal = pts[Math.min(pts.length - 1, midIdx + 1)]
  const dx = nextPtVal.x - prevPt.x
  const dy = nextPtVal.y - prevPt.y
  const len = Math.sqrt(dx * dx + dy * dy)
  const w = 120, h = 24
  const x = mid.x - w / 2
  const y = mid.y - h / 2 - 5
  editing.value = { type: 'arrow', id: a.id, text: a.name, x, y, w, h }
  nextTick(() => editorInput.value?.focus())
}

function finishEdit() {
  if (!editing.value) return
  const txt = editing.value.text.trim()
  if (editing.value.type === 'block') {
    const b = blocks.value.find(x => x.id === editing.value.id)
    if (b) b.name = txt
  } else {
    const a = arrows.value.find(x => x.id === editing.value.id)
    if (a) a.name = txt
  }
  editing.value = null
  render()
  saveDiagram()
}

function cancelEdit() { editing.value = null }

// --- Mouse events ---

function screenToWorld(sx, sy) {
  return { x: (sx - offsetX.value) / scale.value, y: (sy - offsetY.value) / scale.value }
}

function worldToScreen(wx, wy) {
  return { x: wx * scale.value + offsetX.value, y: wy * scale.value + offsetY.value }
}

function hitTestBlock(sx, sy) {
  const p = screenToWorld(sx, sy)
  for (let i = blocks.value.length - 1; i >= 0; i--) {
    const b = blocks.value[i]
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b
  }
  return null
}

function hitTestArrowEnd(sx, sy) {
  const p = screenToWorld(sx, sy)
  const th = 12 / scale.value
  for (let i = arrows.value.length - 1; i >= 0; i--) {
    const a = arrows.value[i]
    const pts = getArrowPoints(a)
    if (pts.length < 1) continue
    for (const e of [{ end: 'from', pt: pts[0] }, { end: 'to', pt: pts[pts.length - 1] }]) {
      if (Math.abs(p.x - e.pt.x) <= th && Math.abs(p.y - e.pt.y) <= th) return { arrow: a, end: e.end }
    }
  }
  return null
}

function hitTestArrow(sx, sy) {
  const p = screenToWorld(sx, sy)
  const th = 6 / scale.value
  for (let i = arrows.value.length - 1; i >= 0; i--) {
    const a = arrows.value[i]
    const pts = getArrowPoints(a)
    for (let j = 0; j < pts.length - 1; j++) {
      const d = pointSegDist(p, pts[j], pts[j + 1])
      if (d <= th) return a
    }
  }
  return null
}

function pointSegDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function onMouseDown(e) {
  if (editing.value) { finishEdit(); return }
  if (e.button === 1 || (e.button === 0 && (e.altKey || isPanning))) {
    isPanning = true; lastX = e.clientX; lastY = e.clientY; return
  }
  if (e.button !== 0) return

  const endHit = hitTestArrowEnd(e.offsetX, e.offsetY)
  if (endHit) {
    const ep = endHit.end === 'from' ? endHit.arrow.from : endHit.arrow.to
    if (e.shiftKey && ep.blockId) {
      ep.blockId = null; ep.edge = null
      const pts = getArrowPoints(endHit.arrow)
      endHit.arrow.segments = pts.length > 2 ? pts.slice(1, -1) : []
      render()
      saveDiagram()
      return
    }
    dragArrowEnd = { arrowId: endHit.arrow.id, end: endHit.end }
    selectedArrowId.value = endHit.arrow.id
    selectedBlockId.value = null
    return
  }

  const b = hitTestBlock(e.offsetX, e.offsetY)
  if (b) {
    selectedBlockId.value = b.id
    selectedArrowId.value = null
    dragBlock = b
    const p = screenToWorld(e.offsetX, e.offsetY)
    dragOffsetX = p.x - b.x
    dragOffsetY = p.y - b.y
    render()
    return
  }

  const a = hitTestArrow(e.offsetX, e.offsetY)
  if (a) {
    selectedArrowId.value = a.id
    selectedBlockId.value = null
    render()
    return
  }

  selectedBlockId.value = null
  selectedArrowId.value = null
  render()
}

function onMouseMove(e) {
  if (isPanning) {
    offsetX.value += e.clientX - lastX
    offsetY.value += e.clientY - lastY
    lastX = e.clientX; lastY = e.clientY
    render()
    return
  }

  if (dragArrowEnd) {
    const a = arrows.value.find(x => x.id === dragArrowEnd.arrowId)
    if (a) {
      const ep = dragArrowEnd.end === 'from' ? a.from : a.to
      const p = screenToWorld(e.offsetX, e.offsetY)
      let connected = false
      for (const blk of blocks.value) {
        if (reconnectArrowToBlock(a, dragArrowEnd.end, blk)) {
          connected = true
          break
        }
      }
      if (!connected) {
        ep.blockId = null
        ep.edge = null
        ep.x = p.x
        ep.y = p.y
        const pts = getArrowPoints(a)
        a.segments = pts.length > 2 ? pts.slice(1, -1) : []
      }
      render()
    }
    return
  }

  if (dragBlock) {
    const p = screenToWorld(e.offsetX, e.offsetY)
    dragBlock.x = p.x - dragOffsetX
    dragBlock.y = p.y - dragOffsetY
    render()
  }

  const endHit = hitTestArrowEnd(e.offsetX, e.offsetY)
  canvasEl.value.style.cursor = endHit ? 'move' : (hitTestBlock(e.offsetX, e.offsetY) ? 'move' : 'default')
}

function onMouseUp() {
  if (dragArrowEnd || dragBlock) {
    saveDiagram()
  }
  dragArrowEnd = null
  dragBlock = null
  isPanning = false
}

function onWheel(e) {
  const zoom = e.deltaY < 0 ? 1.1 : 0.9
  const newScale = Math.max(0.2, Math.min(5, scale.value * zoom))
  if (newScale === scale.value) return
  const mx = e.offsetX, my = e.offsetY
  const wx = (mx - offsetX.value) / scale.value, wy = (my - offsetY.value) / scale.value
  offsetX.value = mx - wx * newScale
  offsetY.value = my - wy * newScale
  scale.value = newScale
  render()
}

// --- Export ---

function exportPNG() { exportToPNG(canvasEl.value, currentDiagram.value?.name || 'idef0') }
function exportSVG() { exportToSVGFn(canvasEl.value, currentDiagram.value?.name || 'idef0') }
function exportJSON() { exportToJSONFn(props.projectId, diagrams.value) }
</script>

<style scoped>
.idef0-editor {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 600px;
  overflow: auto;
}
.idef0-canvas {
  width: 100%;
  height: 100%;
  min-height: 600px;
  display: block;
  background: #fafafa;
  cursor: default;
}
.idef0-toolbar {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  display: flex;
  gap: 4px;
  background: rgba(255,255,255,0.95);
  padding: 6px 10px;
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
  white-space: nowrap;
  flex-wrap: wrap;
}
.idef0-toolbar button {
  padding: 4px 10px;
  border: 1px solid #ccc;
  background: #fff;
  border-radius: 3px;
  cursor: pointer;
  font-size: 13px;
}
.idef0-toolbar button:hover {
  background: #eef;
}
.idef0-toolbar button:active {
  background: #ddf;
}
.idef0-separator {
  width: 1px;
  background: #ccc;
  margin: 0 4px;
  min-width: 1px;
}
.idef0-breadcrumb {
  display: flex;
  align-items: center;
  font-size: 13px;
  color: #333;
  margin-left: 8px;
}
.idef0-crumb {
  cursor: pointer;
  padding: 2px 6px;
}
.idef0-crumb:hover {
  background: #eef;
  border-radius: 2px;
}
.idef0-crumb-active {
  font-weight: bold;
  background: #ddf;
  border-radius: 2px;
}
.idef0-zoom {
  margin-left: 8px;
  font-size: 12px;
  color: #666;
  min-width: 45px;
  text-align: right;
}
.idef0-status-bar {
  position: absolute;
  bottom: 8px;
  left: 8px;
  z-index: 10;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  max-width: calc(100% - 16px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.idef0-status-error {
  background: #fee;
  color: #c00;
  border: 1px solid #fcc;
}
.idef0-inline-editor {
  position: absolute;
  z-index: 20;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}
.idef0-inline-editor input {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid #9cf;
  border-radius: 2px;
  background: #fff;
  font-size: inherit;
  outline: none;
}
</style>
