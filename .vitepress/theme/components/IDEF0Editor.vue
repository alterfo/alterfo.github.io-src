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
          <button class="idef0-btn" @click="handleAddBox">+ Block</button>
          <button class="idef0-btn" @click="handleResetView">Reset View</button>
          <button class="idef0-btn" @click="handleExportSVG">Export SVG</button>
        </div>
      </div>

      <!-- SVG canvas -->
      <div class="idef0-canvas-wrap">
        <svg
          ref="svgRef"
          class="idef0-svg"
          :style="{ cursor: isDraggingBox ? 'move' : isPanning ? 'grabbing' : 'grab' }"
          :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
          xmlns="http://www.w3.org/2000/svg"
          @wheel.prevent="onWheel"
          @mousedown="onSvgMouseDown"
          @mousemove="onMouseMove"
          @mouseup="onMouseUp"
          @mouseleave="onMouseUp"
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
                fill="#555"
              >{{ al.text }}</text>
            </g>

            <!-- Boxes (above arrows) -->
            <g v-if="currentDiagram">
              <g
                v-for="(rbox) in renderedBoxes"
                :key="rbox.box.id"
                class="idef0-box"
                @mousedown.stop="onBoxMouseDown(rbox.box, $event)"
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
              </g>
            </g>

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
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { project, currentDiagram, addBox, removeBox, updateBox, navigateTo } from './IDEF0Editor/model.js'
import {
  renderBox, routeArrow, renderArrow, renderArrowLabel,
  routeBoundaryArrow, renderBoundaryArrow,
} from './IDEF0Editor/renderer.js'

const VIEW_W = 1200
const VIEW_H = 800

const ICOM_LEGEND = [
  { code: 'I', desc: 'Input — enters left' },
  { code: 'C', desc: 'Control — enters top' },
  { code: 'O', desc: 'Output — exits right' },
  { code: 'M', desc: 'Mechanism — enters bottom' },
  { code: 'R', desc: 'Call — exits bottom' },
]

// --- Selection / Drag ---
const selectedBoxId = ref(null)
const isDraggingBox = ref(false)
const dragOffset = ref({ x: 0, y: 0 })

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
  selectedBoxId.value = null
  isPanning.value = true
  lastMouse.value = { x: e.clientX, y: e.clientY }
}

function onBoxMouseDown(box, e) {
  if (e.button !== 0) return
  e.stopPropagation()
  selectedBoxId.value = box.id
  isDraggingBox.value = true
  const world = toWorldCoords(e.clientX, e.clientY)
  dragOffset.value = { x: world.x - box.x, y: world.y - box.y }
}

function onMouseMove(e) {
  if (isDraggingBox.value && selectedBoxId.value) {
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

function onMouseUp() {
  isPanning.value = false
  isDraggingBox.value = false
}

function onKeyDown(e) {
  if (!selectedBoxId.value) return
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    removeBox(selectedBoxId.value)
    selectedBoxId.value = null
  }
}

onMounted(() => document.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeyDown))

function handleResetView() {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
}

// --- Toolbar actions ---
function handleAddBox() {
  addBox({ label: 'New Block' })
}

function handleExportSVG() {
  const svgEl = svgRef.value
  if (!svgEl) return
  const clone = svgEl.cloneNode(true)
  const g = clone.querySelector('g[transform]')
  if (g) g.removeAttribute('transform')
  const svgStr = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([svgStr], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `idef0-${currentDiagram.value?.id ?? 'diagram'}.svg`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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

// --- Rendered data ---
const renderedBoxes = computed(() => {
  if (!currentDiagram.value) return []
  return currentDiagram.value.boxes.map((box, idx) =>
    renderBox(box, box.id === selectedBoxId.value, idx + 1)
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
</style>
