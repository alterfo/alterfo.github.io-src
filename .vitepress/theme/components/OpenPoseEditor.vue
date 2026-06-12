<script setup>
// OpenPose Editor — client-side pose detection + editing app.
// Mounted via openpose.md inside <ClientOnly> (no SSR: uses MediaPipe WASM,
// Canvas, File APIs).
//
// Task 5: batch upload + auto-detect queue. Drop or pick images → each becomes
// a queue entry; when the MediaPipe model is ready the queue auto-processes in
// order (createImageBitmap → detectPoses → render preview). Selecting an entry
// shows its annotated canvas. Editing (Task 6) and export (Task 7) hook in later.

import { ref, computed, watch, onMounted, onUnmounted, nextTick, markRaw } from 'vue'
import { usePoseDetection } from './OpenPose/model.js'
import { snapMissingKeypoints } from './OpenPose/skeleton.js'
import { renderSkeletonOnCanvas, renderSkeletonOnBlack } from './OpenPose/renderer.js'
import { useSkeletonEditor, addPerson, removePerson, MAX_PERSONS } from './OpenPose/editor.js'
import { toOpenPoseJSON, downloadJSON, downloadPNG } from './OpenPose/exporter.js'
import HelpModal from './HelpModal.vue'
import { shouldShowOnboarding } from './onboarding.js'

const model = usePoseDetection()

// First-visit onboarding help (no unlock screen → fire in onMounted, like IDEF0/Piano).
const showHelp = ref(false)

// ─────────────────────────────────────────────────────────────
// Queue
// ─────────────────────────────────────────────────────────────
// Each entry: { id, file, name, dataURL, status, skeletons, imageBitmap, errorMsg }
//   status: 'pending' | 'processing' | 'done' | 'error'
const queue = ref([])
const selectedId = ref(null)

const selectedEntry = computed(
  () => queue.value.find((e) => e.id === selectedId.value) || null,
)

function readDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error || new Error('read failed'))
    r.readAsDataURL(file)
  })
}

async function addFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'))
  for (const file of files) {
    let dataURL = ''
    try {
      dataURL = await readDataURL(file)
    } catch {
      /* thumbnail just won't show */
    }
    const entry = {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      dataURL,
      status: 'pending',
      skeletons: [],
      imageBitmap: null,
      errorMsg: '',
    }
    queue.value.push(entry)
    if (!selectedId.value) selectedId.value = entry.id
  }
  if (model.status.value === 'ready') processQueue()
}

// ─────────────────────────────────────────────────────────────
// Auto-processing
// ─────────────────────────────────────────────────────────────
let processing = false

async function processQueue() {
  if (processing || model.status.value !== 'ready') return
  processing = true
  try {
    for (const entry of queue.value) {
      if (entry.status !== 'pending') continue
      entry.status = 'processing'
      try {
        const bmp = await createImageBitmap(entry.file)
        entry.imageBitmap = markRaw(bmp)
        const skels = await model.detectPoses(bmp)
        const scale = bmp.width / 8
        for (const s of skels) snapMissingKeypoints(s, bmp.width / 2, bmp.height / 2, scale)
        entry.skeletons = skels
        entry.status = 'done'
      } catch (e) {
        entry.status = 'error'
        entry.errorMsg = e?.message || String(e)
      }
      if (entry.id === selectedId.value) await nextTick(renderSelected)
    }
  } finally {
    processing = false
  }
}

// ─────────────────────────────────────────────────────────────
// Canvas preview
// ─────────────────────────────────────────────────────────────
const canvasEl = ref(null)

// Draggable-circle overlay; created on mount, reads the selected entry's skeletons.
let editor = null

function getSelectedSkeletons() {
  return selectedEntry.value?.skeletons || []
}

function renderSelected() {
  const entry = selectedEntry.value
  const canvas = canvasEl.value
  if (!canvas || !entry || !entry.imageBitmap) {
    editor?.hide()
    return
  }
  // Canvas internal size = source image size so skeleton pixel coords line up;
  // CSS scales it to fit the main area (object-fit: contain).
  if (canvas.width !== entry.imageBitmap.width) canvas.width = entry.imageBitmap.width
  if (canvas.height !== entry.imageBitmap.height) canvas.height = entry.imageBitmap.height
  renderSkeletonOnCanvas(canvas, entry.imageBitmap, entry.skeletons)
  // Rebuild the draggable handles over the freshly drawn canvas.
  editor?.render()
}

function selectEntry(id) {
  selectedId.value = id
}

// ─────────────────────────────────────────────────────────────
// Editing toolbar
// ─────────────────────────────────────────────────────────────
const canEdit = computed(() => !!(selectedEntry.value && selectedEntry.value.imageBitmap))
const personCount = computed(() => selectedEntry.value?.skeletons.length ?? 0)

function onAddPerson() {
  const entry = selectedEntry.value
  const canvas = canvasEl.value
  if (!entry || !canvas) return
  entry.skeletons = addPerson(entry.skeletons, canvas.width / 2, canvas.height / 2, 80)
  nextTick(renderSelected)
}

function onRemovePerson() {
  const entry = selectedEntry.value
  if (!entry) return
  entry.skeletons = removePerson(entry.skeletons)
  nextTick(renderSelected)
}

async function onRedetect() {
  const entry = selectedEntry.value
  if (!entry || !entry.imageBitmap || model.status.value !== 'ready') return
  const skels = await model.detectPoses(entry.imageBitmap)
  const { width, height } = entry.imageBitmap
  for (const s of skels) snapMissingKeypoints(s, width / 2, height / 2, width / 8)
  entry.skeletons = skels
  nextTick(renderSelected)
}

// ─────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────
// Strip the extension from the source filename for export basenames.
function exportBasename(entry) {
  return (entry?.name || 'openpose').replace(/\.[^./\\]+$/, '')
}

// Export the ControlNet-style PNG: black background + skeleton only (no photo).
async function onExportPNG() {
  const entry = selectedEntry.value
  if (!entry || !entry.imageBitmap) return
  const { width, height } = entry.imageBitmap
  const canvas = renderSkeletonOnBlack(width, height, entry.skeletons)
  try {
    await downloadPNG(canvas, exportBasename(entry))
  } catch (e) {
    entry.errorMsg = e?.message || String(e)
  }
}

// Export OpenPose v1.3 keypoints JSON (coordinates normalized 0–1).
function onExportJSON() {
  const entry = selectedEntry.value
  if (!entry || !entry.imageBitmap) return
  const { width, height } = entry.imageBitmap
  const json = toOpenPoseJSON(entry.skeletons, width, height)
  downloadJSON(exportBasename(entry), json)
}

// Re-render when the selection changes. Skeleton edits (drag, add/remove person,
// re-detect, queue processing) each call renderSelected directly, so a deep
// watcher here would only duplicate that render on every pointer move.
watch(selectedId, () => nextTick(renderSelected))

// ─────────────────────────────────────────────────────────────
// File input + drag & drop
// ─────────────────────────────────────────────────────────────
const fileInput = ref(null)
const dragging = ref(false)

function triggerUpload() {
  fileInput.value?.click()
}

function onFileChange(e) {
  if (e.target.files) addFiles(e.target.files)
  e.target.value = '' // allow re-picking the same file
}

function onDragOver(e) {
  e.preventDefault()
  dragging.value = true
}

function onDragLeave(e) {
  e.preventDefault()
  dragging.value = false
}

function onDrop(e) {
  e.preventDefault()
  dragging.value = false
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files)
}

// ─────────────────────────────────────────────────────────────
// Status text
// ─────────────────────────────────────────────────────────────
const statusLabel = computed(() => {
  switch (model.status.value) {
    case 'loading': return 'Загрузка модели…'
    case 'ready': return 'Модель готова'
    case 'error': return 'Ошибка модели'
    default: return '—'
  }
})

function badge(status) {
  switch (status) {
    case 'done': return '✓'
    case 'error': return '✗'
    default: return ''
  }
}

// ─────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────
onMounted(() => {
  model.initModel()
  // Canvas is kept in the DOM via v-show, so its ref is available now.
  editor = useSkeletonEditor(canvasEl, getSelectedSkeletons, renderSelected)
  nextTick(renderSelected)
  if (shouldShowOnboarding('openpose:seen-help')) showHelp.value = true
})

// When the model finishes loading, drain whatever is already queued.
watch(model.status, (s) => {
  if (s === 'ready') processQueue()
})

onUnmounted(() => {
  editor?.destroy()
  editor = null
  for (const entry of queue.value) {
    if (entry.imageBitmap && typeof entry.imageBitmap.close === 'function') {
      try { entry.imageBitmap.close() } catch { /* ignore */ }
    }
  }
  model.dispose()
})
</script>

<template>
  <div
    class="op-root"
    :class="{ 'op-dragging': dragging }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Topbar: upload + model status -->
    <div class="op-topbar">
      <button class="op-btn" @click="triggerUpload">＋ Загрузить изображения</button>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        multiple
        class="op-hidden-input"
        @change="onFileChange"
      />
      <span class="op-status" :class="'op-status-' + model.status.value">
        <span v-if="model.status.value === 'loading'" class="op-spinner" />
        {{ statusLabel }}
      </span>
    </div>

    <!-- Loading / error banner -->
    <div v-if="model.status.value === 'loading'" class="op-banner op-banner-info">
      Загрузка модели MediaPipe…
    </div>
    <div v-else-if="model.status.value === 'error'" class="op-banner op-banner-error">
      <pre class="op-error-text">{{ model.modelError.value }}</pre>
    </div>

    <!-- Body: sidebar + main -->
    <div class="op-body">
      <aside class="op-sidebar">
        <p v-if="queue.length === 0" class="op-sidebar-empty">
          Очередь пуста.<br />Перетащите изображения сюда.
        </p>
        <button
          v-for="entry in queue"
          :key="entry.id"
          class="op-thumb"
          :class="{ 'op-thumb-active': entry.id === selectedId }"
          @click="selectEntry(entry.id)"
        >
          <img v-if="entry.dataURL" :src="entry.dataURL" :alt="entry.name" class="op-thumb-img" />
          <span class="op-thumb-meta">
            <span class="op-thumb-name">{{ entry.name }}</span>
            <span class="op-thumb-badge" :class="'op-badge-' + entry.status">
              <span v-if="entry.status === 'processing'" class="op-spinner op-spinner-sm" />
              <template v-else>{{ badge(entry.status) }}</template>
            </span>
          </span>
        </button>
      </aside>

      <main class="op-main">
        <canvas v-show="selectedEntry && selectedEntry.imageBitmap" ref="canvasEl" class="op-canvas" />
        <div v-if="!selectedEntry || !selectedEntry.imageBitmap" class="op-drop-hint">
          <p>Перетащите изображения сюда или нажмите «Загрузить изображения».</p>
          <p v-if="selectedEntry && selectedEntry.status === 'error'" class="op-drop-err">
            Ошибка: {{ selectedEntry.errorMsg }}
          </p>
        </div>
      </main>
    </div>

    <!-- Bottom toolbar: info + editing actions + PNG/JSON export -->
    <div class="op-toolbar">
      <template v-if="selectedEntry">
        <span class="op-toolbar-name">{{ selectedEntry.name }}</span>
        <span v-if="selectedEntry.imageBitmap" class="op-toolbar-dim">
          {{ selectedEntry.imageBitmap.width }}×{{ selectedEntry.imageBitmap.height }}
        </span>
        <span class="op-toolbar-persons">
          Людей: {{ personCount }}
        </span>
        <span class="op-toolbar-spacer" />
        <button
          class="op-btn op-btn-sm"
          :disabled="!canEdit || personCount >= MAX_PERSONS"
          @click="onAddPerson"
        >＋ Человек</button>
        <button
          class="op-btn op-btn-sm"
          :disabled="!canEdit || personCount === 0"
          @click="onRemovePerson"
        >− Человек</button>
        <button
          class="op-btn op-btn-sm"
          :disabled="!canEdit || model.status.value !== 'ready'"
          @click="onRedetect"
        >↻ Заново</button>
        <span class="op-toolbar-sep" />
        <button
          class="op-btn op-btn-sm"
          :disabled="!canEdit"
          @click="onExportPNG"
        >⤓ PNG</button>
        <button
          class="op-btn op-btn-sm"
          :disabled="!canEdit"
          @click="onExportJSON"
        >⤓ JSON</button>
      </template>
      <template v-else>
        <span class="op-toolbar-name">Нет выбранного изображения</span>
        <span class="op-toolbar-spacer" />
      </template>
      <button class="op-btn op-btn-sm" @click="showHelp = true" title="Справка">?</button>
    </div>

    <!-- Full-page drag overlay -->
    <div v-show="dragging" class="op-drop-overlay">Отпустите, чтобы добавить изображения</div>

    <HelpModal v-model="showHelp">
      <h2>Редактор поз OpenPose</h2>

      <p>Редактор скелетов-поз для <strong>ControlNet / Stable Diffusion</strong>: загрузи фото — поза определится сама, поправь точки мышью и выгрузи готовый скелет.</p>

      <h3>Как пользоваться</h3>
      <ul>
        <li>Перетащи фото в окно (или «Загрузить изображения») — поза найдётся автоматически, до 2 человек на кадр</li>
        <li>Точки-суставы таскаются мышью — двигай их, чтобы поправить скелет</li>
        <li>Низкая уверенность распознавания — точка рисуется полой (контуром)</li>
        <li><strong>＋/− Человек</strong> добавляет/убирает скелет, <strong>↻ Заново</strong> — пересчитать позу</li>
      </ul>

      <h3>Экспорт</h3>
      <ul>
        <li><strong>⤓ PNG</strong> — скелет на чёрном фоне для входа ControlNet (OpenPose)</li>
        <li><strong>⤓ JSON</strong> — ключевые точки в формате OpenPose v1.3, координаты нормированы 0–1</li>
      </ul>

      <h3>Приватность</h3>
      <p>Всё считается прямо в браузере — модель MediaPipe (WASM) работает локально, фотографии никуда не загружаются.</p>
    </HelpModal>
  </div>
</template>

<style scoped>
.op-root {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 13px;
}

/* Topbar */
.op-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  flex-shrink: 0;
}
.op-btn {
  background: #334155;
  color: #e2e8f0;
  border: 1px solid #475569;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
}
.op-btn:hover { background: #475569; }
.op-hidden-input { display: none; }
.op-status {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #94a3b8;
}
.op-status-ready { color: #6ee787; }
.op-status-error { color: #ff6b6b; }
.op-status-loading { color: #ffd479; }

/* Banner */
.op-banner {
  flex-shrink: 0;
  padding: 8px 12px;
  font-size: 12px;
}
.op-banner-info { background: #1e293b; color: #ffd479; }
.op-banner-error { background: #2a1414; color: #ff9b9b; }
.op-error-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}

/* Body */
.op-body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.op-sidebar {
  width: 220px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid #334155;
  background: #1e293b;
  padding: 8px;
}
.op-sidebar-empty {
  color: #64748b;
  font-size: 12px;
  text-align: center;
  margin-top: 24px;
  line-height: 1.6;
}
.op-thumb {
  display: block;
  width: 100%;
  text-align: left;
  background: #273449;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 6px;
  margin-bottom: 8px;
  cursor: pointer;
  color: #e2e8f0;
}
.op-thumb:hover { border-color: #64748b; }
.op-thumb-active { border-color: #4fc3f7; }
.op-thumb-img {
  width: 100%;
  height: 96px;
  object-fit: cover;
  border-radius: 4px;
  display: block;
  background: #000;
}
.op-thumb-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}
.op-thumb-name {
  flex: 1;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.op-thumb-badge {
  flex-shrink: 0;
  font-size: 12px;
  line-height: 1;
}
.op-badge-done { color: #6ee787; }
.op-badge-error { color: #ff6b6b; }

/* Main canvas area */
.op-main {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  background: #0b1120;
  padding: 12px;
}
.op-canvas {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  background: #000;
}
.op-drop-hint {
  color: #64748b;
  text-align: center;
  font-size: 13px;
  line-height: 1.6;
}
.op-drop-err { color: #ff6b6b; margin-top: 8px; }

/* Bottom toolbar */
.op-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 12px;
  background: #1e293b;
  border-top: 1px solid #334155;
  font-size: 12px;
  color: #94a3b8;
}
.op-toolbar-name { color: #cbd5e1; }
.op-toolbar-dim, .op-toolbar-persons { color: #94a3b8; }
.op-toolbar-spacer { flex: 1; }
.op-toolbar-sep {
  width: 1px;
  align-self: stretch;
  background: #334155;
  margin: 0 2px;
}
.op-btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}
.op-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.op-btn:disabled:hover { background: #334155; }

/* Spinner */
.op-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff;
  border-radius: 50%;
  display: inline-block;
  animation: op-spin 0.8s linear infinite;
}
.op-spinner-sm { width: 10px; height: 10px; border-width: 2px; }
@keyframes op-spin { to { transform: rotate(360deg); } }

/* Drag overlay */
.op-drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(79, 195, 247, 0.12);
  border: 3px dashed #4fc3f7;
  color: #4fc3f7;
  font-size: 16px;
  pointer-events: none;
}
.op-dragging { outline: none; }
</style>
