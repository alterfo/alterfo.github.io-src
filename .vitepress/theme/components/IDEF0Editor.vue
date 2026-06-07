<template>
  <ClientOnly>
    <div class="idef0-root">
      <!-- Toolbar -->
      <div class="idef0-toolbar">
        <nav class="idef0-breadcrumb">
          <template v-for="(crumb, i) in breadcrumb" :key="crumb.id">
            <span v-if="i > 0" class="idef0-crumb-sep">›</span>
            <span
              :class="['idef0-crumb', { 'idef0-crumb--current': i === breadcrumb.length - 1 }]"
              @click="i < breadcrumb.length - 1 ? navigateTo(crumb.id) : undefined"
            >{{ crumb.id }}</span>
          </template>
        </nav>
        <span class="idef0-diagram-title">{{ currentDiagram?.title ?? 'IDEF0 Editor' }}</span>
        <div class="idef0-toolbar-actions">
          <button class="idef0-btn" @click="undo(currentDiagram)" :disabled="!canUndo" title="Undo (Ctrl+Z)">↩ Undo</button>
          <button class="idef0-btn" @click="redo(currentDiagram)" :disabled="!canRedo" title="Redo (Ctrl+Y)">↪ Redo</button>
          <button class="idef0-btn" @click="handleAddBox">+ Block</button>
          <button
            v-if="selectedBoxId"
            class="idef0-btn idef0-btn--enter"
            @click="handleEnterBox"
            title="Decompose and enter child diagram"
          >↳ Войти</button>
          <button
            v-if="currentDiagram && currentDiagram.parentId"
            class="idef0-btn"
            @click="handleNavigateUp"
            title="Go up to parent diagram"
          >↑ Выйти</button>
          <button class="idef0-btn" @click="handleResetView">Reset View</button>
          <button class="idef0-btn" @click="handleExportSVG" title="Download current diagram as SVG">SVG</button>
          <button class="idef0-btn" @click="handleExportPNG" title="Download current diagram as PNG (2x)">PNG</button>
          <button class="idef0-btn" @click="handleExportJSON" title="Download entire project as JSON">JSON ↓</button>
          <button class="idef0-btn" @click="handleImportJSON" title="Import project from JSON file">JSON ↑</button>
        </div>
      </div>

      <!-- SVG canvas -->
      <div class="idef0-canvas-wrap">
        <svg
          ref="svgRef"
          class="idef0-svg"
          :style="{ cursor: drawingArrow ? 'crosshair' : isDraggingBox ? 'move' : isPanning ? 'grabbing' : 'grab' }"
          :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
          xmlns="http://www.w3.org/2000/svg"
          @wheel.prevent="onWheel"
          @mousedown="onSvgMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
          @mouseleave="onMouseLeave"
        >
          <!-- Viewport background -->
          <rect x="0" y="0" :width="VIEW_W" :height="VIEW_H" fill="#f0f0f0" />

          <!-- Zoom/pan group -->
          <g :transform="`translate(${panX},${panY}) scale(${zoom})`">
            <!-- Boundary + internal arrows (rendered below boxes) -->
            <g v-if="currentDiagram">
              <g
                v-for="rba in renderedBoundaryArrows"
                :key="rba.bArrow.id"
                class="idef0-arrow"
              >
                <path
                  :d="rba.d"
                  stroke="black"
                  stroke-width="1"
                  :stroke-dasharray="rba.strokeDasharray || ''"
                  fill="none"
                />
                <polygon :points="rba.arrowheadPoints" fill="black" stroke="none" />
                <text
                  :x="rba.icomX"
                  :y="rba.icomY"
                  :text-anchor="rba.icomAnchor"
                  dominant-baseline="auto"
                  font-size="9"
                  font-style="italic"
                  fill="#444"
                >{{ rba.icomCode }}</text>
                <text
                  v-if="rba.labelX !== null"
                  :x="rba.labelX"
                  :y="rba.labelY"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  font-size="10"
                  fill="#555"
                >{{ rba.label }}</text>
              </g>

              <g
                v-for="ra in renderedArrows"
                :key="ra.arrow.id"
                class="idef0-arrow"
              >
                <path
                  :d="ra.d"
                  stroke="black"
                  stroke-width="1"
                  :stroke-dasharray="ra.strokeDasharray || ''"
                  fill="none"
                />
                <polygon :points="ra.arrowheadPoints" fill="black" stroke="none" />
              </g>

              <text
                v-for="al in arrowLabels"
                :key="al.arrow.id + '-lbl'"
                :x="al.x"
                :y="al.y"
                text-anchor="middle"
                dominant-baseline="middle"
                font-size="10"
                :fill="al.text ? '#555' : '#bbb'"
                style="cursor: text"
                @dblclick.stop="onArrowLabelDblClick(al, $event)"
              >{{ al.text || '·' }}</text>
            </g>

            <!-- Boxes (above arrows) -->
            <g v-if="currentDiagram">
              <g
                v-for="(rbox) in renderedBoxes"
                :key="rbox.box.id"
                class="idef0-box"
                @mousedown.stop="onBoxMouseDown(rbox.box, $event)"
                @dblclick.stop="onBoxDblClick(rbox.box, $event)"
                @mouseenter="onBoxMouseEnter(rbox.box)"
                @mouseleave="onBoxMouseLeave(rbox.box)"
              >
                <rect v-bind="rbox.rect" />
                <text
                  v-for="(line, li) in rbox.labelLines"
                  :key="li"
                  :x="rbox.labelX"
                  :y="rbox.labelBaseY + li * rbox.lineHeight"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  font-size="12"
                  fill="#333"
                >{{ line }}</text>
                <text
                  v-if="rbox.numText"
                  :x="rbox.numX"
                  :y="rbox.numY"
                  text-anchor="end"
                  dominant-baseline="auto"
                  font-size="10"
                  fill="#666"
                >{{ rbox.numText }}</text>
                <text
                  v-if="rbox.hasDecomposition"
                  :x="rbox.decompX"
                  :y="rbox.decompY"
                  text-anchor="start"
                  dominant-baseline="auto"
                  font-size="10"
                  fill="#2563eb"
                >[+]</text>
                <!-- ICOM handles: shown on hover or as drop targets during drawing -->
                <template v-if="shouldShowHandles(rbox.box.id)">
                  <circle
                    v-for="(pt, side) in getHandlePositions(rbox.box)"
                    :key="'h-' + side"
                    :cx="pt.x"
                    :cy="pt.y"
                    :r="HANDLE_RADIUS"
                    :fill="isTargetHandle(rbox.box.id, side) ? '#f59e0b' : '#2563eb'"
                    stroke="white"
                    stroke-width="1.5"
                    style="cursor: crosshair"
                    @mousedown.stop="onHandleMouseDown(rbox.box, side, $event)"
                  />
                </template>
              </g>
            </g>

            <!-- Inline label editor -->
            <foreignObject
              v-if="editingBoxId || editingArrowId"
              :x="inlineEditorRect.x"
              :y="inlineEditorRect.y"
              :width="inlineEditorRect.w"
              :height="inlineEditorRect.h"
            >
              <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:2px;box-sizing:border-box;">
                <input
                  ref="editInputRef"
                  type="text"
                  v-model="editingValue"
                  style="width:100%;border:2px solid #2563eb;border-radius:3px;text-align:center;font-size:12px;padding:2px 4px;background:white;box-sizing:border-box;outline:none;font-family:sans-serif;"
                  @keydown.enter.prevent="confirmEdit"
                  @keydown.escape.prevent="cancelEdit"
                  @blur="confirmEdit"
                />
              </div>
            </foreignObject>

            <!-- Rubber-band line during arrow drawing -->
            <line
              v-if="drawingArrow && rubberBandStart"
              :x1="rubberBandStart.x"
              :y1="rubberBandStart.y"
              :x2="drawingArrow.currentX"
              :y2="drawingArrow.currentY"
              stroke="#2563eb"
              stroke-width="1.5"
              stroke-dasharray="4,4"
              pointer-events="none"
            />

            <!-- Empty state -->
            <text
              v-if="!currentDiagram || currentDiagram.boxes.length === 0"
              x="600"
              y="400"
              text-anchor="middle"
              dominant-baseline="middle"
              fill="#999"
              font-size="18"
            >No diagram — click "+ Block" to start</text>
          </g>
        </svg>
      </div>

      <!-- Validation panel -->
      <div class="idef0-validation-bar" v-if="validationErrors.length > 0 || showValidationPanel">
        <button
          class="idef0-validation-toggle"
          :class="{ 'idef0-validation-toggle--error': validationErrors.some(e => e.type === 'error'), 'idef0-validation-toggle--warn': !validationErrors.some(e => e.type === 'error') && validationErrors.length > 0 }"
          @click="showValidationPanel = !showValidationPanel"
        >
          <span v-if="validationErrors.length === 0">✓ Valid</span>
          <span v-else>{{ validationErrors.filter(e => e.type === 'error').length }} error(s), {{ validationErrors.filter(e => e.type === 'warn').length }} warning(s) {{ showValidationPanel ? '▲' : '▼' }}</span>
        </button>
        <div v-if="showValidationPanel && validationErrors.length > 0" class="idef0-validation-list">
          <div
            v-for="(err, i) in validationErrors"
            :key="i"
            :class="['idef0-validation-item', err.type === 'error' ? 'idef0-validation-item--error' : 'idef0-validation-item--warn']"
          >
            <span class="idef0-validation-icon">{{ err.type === 'error' ? '✕' : '⚠' }}</span>
            {{ err.message }}
          </div>
        </div>
      </div>

      <!-- ICOM Legend -->
      <div class="idef0-legend">
        <span v-for="item in ICOM_LEGEND" :key="item.code" class="idef0-legend-item">
          <span class="idef0-legend-code">{{ item.code }}</span>
          <span class="idef0-legend-desc">{{ item.desc }}</span>
        </span>
      </div>
    </div>
  </ClientOnly>
</template>

<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { project, currentDiagram, currentDiagramId, addBox, removeBox, updateBox, navigateTo, addArrow, updateArrow, addBoundaryArrow, loadProjectData } from './IDEF0Editor/model.js'
import { pushSnapshot, undo, redo, resetHistory, canUndo, canRedo } from './IDEF0Editor/history.js'
import { navigateInto, navigateUp } from './IDEF0Editor/hierarchy.js'
import {
  renderBox, routeArrow, renderArrow, renderArrowLabel,
  routeBoundaryArrow, renderBoundaryArrow,
} from './IDEF0Editor/renderer.js'
import { icomCode, validateDiagram } from './IDEF0Editor/icom.js'
import { loadProject, saveProject, initCrossTabSync } from './IDEF0Editor/db.js'
import { exportToSVG, exportToPNG, exportToJSON, importFromJSON } from './IDEF0Editor/exporter.js'

const VIEW_W = 1200
const VIEW_H = 800
const HANDLE_RADIUS = 5
const HANDLE_HIT_DIST = 10

const ICOM_LEGEND = [
  { code: 'I', desc: 'Input — enters left' },
  { code: 'C', desc: 'Control — enters top' },
  { code: 'O', desc: 'Output — exits right' },
  { code: 'M', desc: 'Mechanism — enters bottom' },
  { code: 'R', desc: 'Call — exits bottom' },
]

// Reset history whenever we navigate to a different diagram
watch(currentDiagramId, () => resetHistory())

// --- Persistence ---
// Use a counter so nested/concurrent withSuppressedSave calls don't clear prematurely
let _suppressSaveDepth = 0
let _crossTabCleanup = null

watch(project, () => {
  if (_suppressSaveDepth === 0) saveProject(project)
}, { deep: true })

async function withSuppressedSave(fn) {
  _suppressSaveDepth++
  try { await fn() }
  finally { _suppressSaveDepth-- }
}

async function initPersistence() {
  await withSuppressedSave(async () => {
    const saved = await loadProject()
    if (saved) loadProjectData(saved)
  })
  _crossTabCleanup = initCrossTabSync(async () => {
    await withSuppressedSave(async () => {
      const saved = await loadProject()
      if (saved) loadProjectData(saved)
    })
  })
}

// --- Inline editing ---
const editingBoxId = ref(null)
const editingArrowId = ref(null)
const editingValue = ref('')
const editInputRef = ref(null)

const editingBox = computed(() => {
  if (!editingBoxId.value || !currentDiagram.value) return null
  return currentDiagram.value.boxes.find(b => b.id === editingBoxId.value) ?? null
})

const editingArrowLabelInfo = computed(() => {
  if (!editingArrowId.value) return null
  return arrowLabels.value.find(al => al.arrow.id === editingArrowId.value) ?? null
})

const inlineEditorRect = computed(() => {
  if (editingBoxId.value && editingBox.value) {
    const b = editingBox.value
    return { x: b.x, y: b.y, w: b.w, h: b.h }
  }
  if (editingArrowId.value && editingArrowLabelInfo.value) {
    const { x, y } = editingArrowLabelInfo.value
    return { x: x - 60, y: y - 12, w: 120, h: 24 }
  }
  return { x: 0, y: 0, w: 0, h: 0 }
})

function onBoxDblClick(box, e) {
  e.stopPropagation()
  editingArrowId.value = null
  editingBoxId.value = box.id
  editingValue.value = box.label
  nextTick(() => {
    if (editInputRef.value) {
      editInputRef.value.focus()
      editInputRef.value.select()
    }
  })
}

function onArrowLabelDblClick(arrowLabel, e) {
  e.stopPropagation()
  editingBoxId.value = null
  editingArrowId.value = arrowLabel.arrow.id
  editingValue.value = arrowLabel.arrow.label
  nextTick(() => {
    if (editInputRef.value) {
      editInputRef.value.focus()
      editInputRef.value.select()
    }
  })
}

function confirmEdit() {
  if (!editingBoxId.value && !editingArrowId.value) return
  if (editingBoxId.value) {
    pushSnapshot(currentDiagram.value)
    updateBox(editingBoxId.value, { label: editingValue.value.trim() || 'Unnamed' })
    editingBoxId.value = null
  } else if (editingArrowId.value) {
    pushSnapshot(currentDiagram.value)
    updateArrow(editingArrowId.value, { label: editingValue.value })
    editingArrowId.value = null
  }
  editingValue.value = ''
}

function cancelEdit() {
  editingBoxId.value = null
  editingArrowId.value = null
  editingValue.value = ''
}

// --- Selection / Drag ---
const selectedBoxId = ref(null)
const isDraggingBox = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const dragSnapshotNeeded = ref(false)

// --- Arrow Drawing ---
const hoveredBoxId = ref(null)
const drawingArrow = ref(null)  // { fromBoxId, fromSide, currentX, currentY }
const targetHandle = ref(null)  // { boxId, side } when hovering a valid drop target

// --- Zoom / Pan ---
const svgRef = ref(null)
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const isPanning = ref(false)
const lastMouse = ref({ x: 0, y: 0 })

function toSvgCoords(clientX, clientY) {
  const el = svgRef.value
  if (!el) return { x: clientX, y: clientY }
  const rect = el.getBoundingClientRect()
  return {
    x: (clientX - rect.left) * (VIEW_W / rect.width),
    y: (clientY - rect.top) * (VIEW_H / rect.height),
  }
}

function toWorldCoords(clientX, clientY) {
  const { x: svgX, y: svgY } = toSvgCoords(clientX, clientY)
  return {
    x: (svgX - panX.value) / zoom.value,
    y: (svgY - panY.value) / zoom.value,
  }
}

function onWheel(e) {
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
  const newZoom = Math.max(0.1, Math.min(3, zoom.value * factor))
  const { x: mx, y: my } = toSvgCoords(e.clientX, e.clientY)
  panX.value = mx - (mx - panX.value) * (newZoom / zoom.value)
  panY.value = my - (my - panY.value) * (newZoom / zoom.value)
  zoom.value = newZoom
}

function onSvgMouseDown(e) {
  if (e.button !== 0) return
  if (drawingArrow.value) {
    drawingArrow.value = null
    targetHandle.value = null
    return
  }
  selectedBoxId.value = null
  isPanning.value = true
  lastMouse.value = { x: e.clientX, y: e.clientY }
}

function onBoxMouseDown(box, e) {
  if (e.button !== 0) return
  if (drawingArrow.value) return
  e.stopPropagation()
  selectedBoxId.value = box.id
  isDraggingBox.value = true
  dragSnapshotNeeded.value = true
  const world = toWorldCoords(e.clientX, e.clientY)
  dragOffset.value = { x: world.x - box.x, y: world.y - box.y }
}

function onMouseMove(e) {
  if (drawingArrow.value) {
    const world = toWorldCoords(e.clientX, e.clientY)
    drawingArrow.value.currentX = world.x
    drawingArrow.value.currentY = world.y
    targetHandle.value = findNearestHandle(world.x, world.y, drawingArrow.value.fromBoxId)
    return
  }
  if (isDraggingBox.value && selectedBoxId.value) {
    if (dragSnapshotNeeded.value) {
      pushSnapshot(currentDiagram.value)
      dragSnapshotNeeded.value = false
    }
    const world = toWorldCoords(e.clientX, e.clientY)
    updateBox(selectedBoxId.value, {
      x: world.x - dragOffset.value.x,
      y: world.y - dragOffset.value.y,
    })
    return
  }
  if (!isPanning.value) return
  const el = svgRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  panX.value += (e.clientX - lastMouse.value.x) * (VIEW_W / rect.width)
  panY.value += (e.clientY - lastMouse.value.y) * (VIEW_H / rect.height)
  lastMouse.value = { x: e.clientX, y: e.clientY }
}

function onMouseUp(e) {
  if (drawingArrow.value) {
    if (targetHandle.value) {
      const { fromBoxId, fromSide } = drawingArrow.value
      const { boxId: toBoxId, side: toSide } = targetHandle.value
      const arrowType = typeFromSides(fromSide, toSide)
      if (arrowType) {
        pushSnapshot(currentDiagram.value)
        addArrow({ label: '', type: arrowType, sourceBoxId: fromBoxId, targetBoxId: toBoxId })
      }
    } else if (e) {
      // Release near boundary → create boundary arrow
      // Use SVG coords (not world coords) so the zone is correct at any zoom/pan level
      const svg = toSvgCoords(e.clientX, e.clientY)
      const BOUNDARY_ZONE = 40
      const { fromBoxId, fromSide } = drawingArrow.value
      let bType = null
      if (svg.x <= BOUNDARY_ZONE) bType = 'input'
      else if (svg.x >= VIEW_W - BOUNDARY_ZONE) bType = 'output'
      else if (svg.y <= BOUNDARY_ZONE) bType = 'control'
      // Bottom edge: call exits bottom; mechanism enters bottom
      else if (svg.y >= VIEW_H - BOUNDARY_ZONE) bType = fromSide === 'bottom' ? 'call' : 'mechanism'
      if (bType && currentDiagram.value) {
        pushSnapshot(currentDiagram.value)
        const maxIdx = currentDiagram.value.boundaryArrows
          .filter(ba => ba.type === bType)
          .reduce((m, ba) => Math.max(m, parseInt(ba.icomCode.slice(1)) || 0), 0)
        addBoundaryArrow({ label: '', type: bType, icomCode: icomCode(bType, maxIdx + 1), boxId: fromBoxId })
      }
    }
    drawingArrow.value = null
    targetHandle.value = null
    return
  }
  isPanning.value = false
  isDraggingBox.value = false
  dragSnapshotNeeded.value = false
}

function onMouseLeave() {
  if (drawingArrow.value) {
    drawingArrow.value = null
    targetHandle.value = null
    return
  }
  isPanning.value = false
  isDraggingBox.value = false
}

function onKeyDown(e) {
  if (editingBoxId.value || editingArrowId.value) return
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    undo(currentDiagram.value)
    return
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault()
    redo(currentDiagram.value)
    return
  }
  if (!selectedBoxId.value) return
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    pushSnapshot(currentDiagram.value)
    removeBox(selectedBoxId.value)
    selectedBoxId.value = null
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeyDown)
  initPersistence()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeyDown)
  _crossTabCleanup?.()
})

function handleResetView() {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
}

// --- Arrow Drawing Helpers ---
function getHandlePositions(box) {
  return {
    left:   { x: box.x,             y: box.y + box.h / 2 },
    right:  { x: box.x + box.w,     y: box.y + box.h / 2 },
    top:    { x: box.x + box.w / 2, y: box.y             },
    bottom: { x: box.x + box.w / 2, y: box.y + box.h     },
  }
}

function findNearestHandle(worldX, worldY, excludeBoxId) {
  if (!currentDiagram.value) return null
  for (const box of currentDiagram.value.boxes) {
    if (box.id === excludeBoxId) continue
    for (const [side, pt] of Object.entries(getHandlePositions(box))) {
      if (Math.hypot(worldX - pt.x, worldY - pt.y) <= HANDLE_HIT_DIST) {
        return { boxId: box.id, side }
      }
    }
  }
  return null
}

function shouldShowHandles(boxId) {
  if (drawingArrow.value) return boxId !== drawingArrow.value.fromBoxId
  return boxId === hoveredBoxId.value
}

function isTargetHandle(boxId, side) {
  return targetHandle.value?.boxId === boxId && targetHandle.value?.side === side
}

function typeFromSides(fromSide, toSide) {
  if (toSide === 'left')   return 'input'
  if (toSide === 'top')    return 'control'
  if (toSide === 'right')  return 'output'
  if (toSide === 'bottom') return fromSide === 'bottom' ? 'call' : 'mechanism'
  return null
}

function onHandleMouseDown(box, side, e) {
  if (e.button !== 0) return
  e.stopPropagation()
  const world = toWorldCoords(e.clientX, e.clientY)
  isDraggingBox.value = false
  isPanning.value = false
  hoveredBoxId.value = null
  drawingArrow.value = { fromBoxId: box.id, fromSide: side, currentX: world.x, currentY: world.y }
}

function onBoxMouseEnter(box) {
  if (!drawingArrow.value) hoveredBoxId.value = box.id
}

function onBoxMouseLeave(box) {
  if (hoveredBoxId.value === box.id && !drawingArrow.value) hoveredBoxId.value = null
}

const rubberBandStart = computed(() => {
  if (!drawingArrow.value || !currentDiagram.value) return null
  const box = currentDiagram.value.boxes.find(b => b.id === drawingArrow.value.fromBoxId)
  if (!box) return null
  return getHandlePositions(box)[drawingArrow.value.fromSide] ?? null
})

// --- Toolbar actions ---
function handleAddBox() {
  pushSnapshot(currentDiagram.value)
  addBox({ label: 'New Block' })
}

function handleEnterBox() {
  if (!selectedBoxId.value || !currentDiagram.value) return
  const box = currentDiagram.value.boxes.find(b => b.id === selectedBoxId.value)
  if (!box) return
  selectedBoxId.value = null
  navigateInto(box, currentDiagram.value)
}

function handleNavigateUp() {
  selectedBoxId.value = null
  navigateUp()
}

function handleExportSVG() {
  exportToSVG(svgRef.value, currentDiagram.value?.id ?? 'diagram')
}

function handleExportPNG() {
  exportToPNG(svgRef.value, currentDiagram.value?.id ?? 'diagram')
}

function handleExportJSON() {
  exportToJSON(project)
}

async function handleImportJSON() {
  try {
    const data = await importFromJSON()
    await withSuppressedSave(() => loadProjectData(data))
    resetHistory()
  } catch (err) {
    if (err.message !== 'No file selected') {
      alert('Import failed: ' + err.message)
    }
  }
}

// --- Breadcrumb ---
const breadcrumb = computed(() => {
  if (!currentDiagram.value) return []
  const path = []
  let id = currentDiagram.value.id
  while (id) {
    const d = project.diagrams[id]
    if (!d) break
    path.unshift({ id: d.id, title: d.title })
    id = d.parentId
  }
  return path
})

// --- Validation ---
const validationErrors = computed(() => {
  if (!currentDiagram.value) return []
  return validateDiagram(currentDiagram.value)
})

const errorBoxIds = computed(() => {
  const ids = new Set()
  for (const e of validationErrors.value) {
    if (e.boxId) ids.add(e.boxId)
  }
  return ids
})

const showValidationPanel = ref(true)

// --- Rendered data ---
const renderedBoxes = computed(() => {
  if (!currentDiagram.value) return []
  return currentDiagram.value.boxes.map((box, idx) =>
    renderBox(box, box.id === selectedBoxId.value, idx + 1, errorBoxIds.value.has(box.id))
  )
})

const renderedArrows = computed(() => {
  if (!currentDiagram.value) return []
  return currentDiagram.value.arrows
    .map(arrow => {
      const route = routeArrow(arrow, currentDiagram.value.boxes)
      return route.length >= 2 ? renderArrow(arrow, route, false) : null
    })
    .filter(Boolean)
})

const renderedBoundaryArrows = computed(() => {
  if (!currentDiagram.value) return []
  const boxMap = {}
  for (const b of currentDiagram.value.boxes) boxMap[b.id] = b
  return currentDiagram.value.boundaryArrows
    .map(bArrow => {
      const box = boxMap[bArrow.boxId]
      const result = routeBoundaryArrow(bArrow, box, VIEW_W, VIEW_H)
      if (!result) return null
      return renderBoundaryArrow(bArrow, result.route, result.boundaryPt)
    })
    .filter(Boolean)
})

const arrowLabels = computed(() => {
  if (!currentDiagram.value) return []
  return currentDiagram.value.arrows
    .map(arrow => {
      const route = routeArrow(arrow, currentDiagram.value.boxes)
      return route.length >= 2 ? renderArrowLabel(arrow, route) : null
    })
    .filter(Boolean)
})
</script>

<style scoped>
.idef0-root {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
  font-family: sans-serif;
}

.idef0-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  background: #fff;
  border-bottom: 1px solid #ddd;
  flex-shrink: 0;
  height: 40px;
}

.idef0-breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}

.idef0-crumb {
  color: #2563eb;
  cursor: pointer;
}

.idef0-crumb--current {
  color: #333;
  cursor: default;
  font-weight: 600;
}

.idef0-crumb-sep {
  color: #bbb;
}

.idef0-diagram-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  flex: 1;
  text-align: center;
}

.idef0-toolbar-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.idef0-btn {
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #f9f9f9;
  cursor: pointer;
}

.idef0-btn:hover {
  background: #e8e8e8;
}

.idef0-btn--enter {
  background: #eff6ff;
  border-color: #2563eb;
  color: #2563eb;
}

.idef0-btn--enter:hover {
  background: #dbeafe;
}

.idef0-canvas-wrap {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.idef0-svg {
  width: 100%;
  height: 100%;
  display: block;
  cursor: grab;
  user-select: none;
}

.idef0-svg:active {
  cursor: grabbing;
}

.idef0-box {
  cursor: move;
}

.idef0-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 6px 16px;
  background: #fff;
  border-top: 1px solid #ddd;
  font-size: 12px;
  color: #555;
  flex-shrink: 0;
}

.idef0-legend-item {
  display: flex;
  gap: 5px;
  align-items: center;
}

.idef0-legend-code {
  font-weight: bold;
  font-style: italic;
  color: #333;
  background: #f0f0f0;
  padding: 1px 5px;
  border-radius: 2px;
  font-size: 11px;
}

.idef0-validation-bar {
  flex-shrink: 0;
  background: #fff;
  border-top: 1px solid #ddd;
  font-size: 12px;
}

.idef0-validation-toggle {
  display: block;
  width: 100%;
  text-align: left;
  padding: 4px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: #555;
}

.idef0-validation-toggle--error {
  color: #dc2626;
  font-weight: 600;
}

.idef0-validation-toggle--warn {
  color: #d97706;
  font-weight: 600;
}

.idef0-validation-list {
  padding: 4px 12px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 100px;
  overflow-y: auto;
}

.idef0-validation-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 11px;
}

.idef0-validation-item--error {
  color: #dc2626;
  background: #fef2f2;
}

.idef0-validation-item--warn {
  color: #d97706;
  background: #fffbeb;
}

.idef0-validation-icon {
  font-size: 10px;
  font-weight: bold;
  flex-shrink: 0;
}
</style>
