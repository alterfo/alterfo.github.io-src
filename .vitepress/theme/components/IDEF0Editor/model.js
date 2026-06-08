import { reactive, computed, ref } from 'vue'
import { nextBoxPosition } from './layout.js'

let _idCounter = 1
function uid(prefix = 'id') {
  return `${prefix}-${_idCounter++}`
}

function makeBox(partial = {}) {
  return {
    id: uid('box'),
    label: 'Unnamed',
    x: 100,
    y: 100,
    w: 160,
    h: 80,
    childDiagramId: null,
    ...partial,
  }
}

function makeArrow(partial = {}) {
  return {
    id: uid('arrow'),
    label: '',
    type: 'output',
    sourceBoxId: null,
    targetBoxId: null,
    ...partial,
  }
}

function makeBoundaryArrow(partial = {}) {
  return {
    id: uid('barrow'),
    label: '',
    type: 'input',
    icomCode: 'I1',
    boxId: null,
    parentArrowId: null,
    ...partial,
  }
}

function makeDiagram(partial = {}) {
  return {
    id: 'A0',
    title: 'Untitled',
    parentId: null,
    boxes: [],
    arrows: [],
    boundaryArrows: [],
    ...partial,
  }
}

function makeDefaultProject() {
  const box1 = makeBox({ id: 'box-1', label: 'Prepare', x: 150, y: 200, w: 160, h: 80 })
  const box2 = makeBox({ id: 'box-2', label: 'Execute', x: 480, y: 320, w: 160, h: 80 })
  const a0 = makeDiagram({
    id: 'A0',
    title: 'Context Diagram',
    boxes: [box1, box2],
    arrows: [
      makeArrow({ id: 'arrow-1', label: 'Data', type: 'input', sourceBoxId: 'box-1', targetBoxId: 'box-2' }),
      makeArrow({ id: 'arrow-2', label: 'Config', type: 'control', sourceBoxId: 'box-1', targetBoxId: 'box-2' }),
    ],
    boundaryArrows: [
      makeBoundaryArrow({ id: 'barrow-1', label: 'Input', type: 'input', icomCode: 'I1', boxId: 'box-1' }),
      makeBoundaryArrow({ id: 'barrow-2', label: 'Control', type: 'control', icomCode: 'C1', boxId: 'box-1' }),
      makeBoundaryArrow({ id: 'barrow-3', label: 'Result', type: 'output', icomCode: 'O1', boxId: 'box-2' }),
      makeBoundaryArrow({ id: 'barrow-4', label: 'Resource', type: 'mechanism', icomCode: 'M1', boxId: 'box-2' }),
    ],
  })
  return {
    id: 'default',
    diagrams: { A0: a0 },
  }
}

// ---- Reactive state ----

const project = reactive(makeDefaultProject())
const currentDiagramId = ref('A0')

const currentDiagram = computed(() => project.diagrams[currentDiagramId.value] ?? null)

// ---- Diagram operations ----

function createDiagram(id, title, parentId = null, initialBoxes = [], initialBoundaryArrows = []) {
  if (project.diagrams[id]) return project.diagrams[id]
  const d = makeDiagram({ id, title, parentId, boxes: initialBoxes, boundaryArrows: initialBoundaryArrows })
  project.diagrams[id] = d
  return d
}

function getDiagram(id) {
  return project.diagrams[id] ?? null
}

function navigateTo(diagramId) {
  if (project.diagrams[diagramId]) {
    currentDiagramId.value = diagramId
  }
}

// ---- Box operations ----

function addBox(partial = {}, diagramId = null) {
  const d = diagramId ? project.diagrams[diagramId] : currentDiagram.value
  if (!d) return null
  const hasManualPos = partial.x !== undefined && partial.y !== undefined
  const box = makeBox(partial)
  if (!hasManualPos) {
    const pos = nextBoxPosition(d.boxes.length)
    box.x = pos.x
    box.y = pos.y
  }
  d.boxes.push(box)
  return box
}

function _removeDiagramSubtree(diagramId) {
  const d = project.diagrams[diagramId]
  if (!d) return
  for (const box of d.boxes) {
    if (box.childDiagramId) _removeDiagramSubtree(box.childDiagramId)
  }
  delete project.diagrams[diagramId]
}

function removeBox(boxId, diagramId = null) {
  const d = diagramId ? project.diagrams[diagramId] : currentDiagram.value
  if (!d) return
  const idx = d.boxes.findIndex(b => b.id === boxId)
  if (idx !== -1) {
    const box = d.boxes[idx]
    if (box.childDiagramId) _removeDiagramSubtree(box.childDiagramId)
    d.boxes.splice(idx, 1)
  }
  d.arrows = d.arrows.filter(a => a.sourceBoxId !== boxId && a.targetBoxId !== boxId)
  d.boundaryArrows = d.boundaryArrows.filter(a => a.boxId !== boxId)
}

function _isDescendant(candidateId, rootId) {
  const d = project.diagrams[candidateId]
  if (!d) return false
  if (d.parentId === rootId) return true
  return d.parentId ? _isDescendant(d.parentId, rootId) : false
}

function removeDecomposition(boxId, diagramId = null) {
  const d = diagramId ? project.diagrams[diagramId] : currentDiagram.value
  if (!d) return
  const box = d.boxes.find(b => b.id === boxId)
  if (!box?.childDiagramId) return
  const childId = box.childDiagramId
  if (currentDiagramId.value === childId || _isDescendant(currentDiagramId.value, childId)) {
    currentDiagramId.value = d.id
  }
  _removeDiagramSubtree(childId)
  box.childDiagramId = null
}

function getBox(boxId, diagramId = null) {
  const d = diagramId ? project.diagrams[diagramId] : currentDiagram.value
  if (!d) return null
  return d.boxes.find(b => b.id === boxId) ?? null
}

function updateBox(boxId, changes, diagramId = null) {
  const box = getBox(boxId, diagramId)
  if (!box) return
  Object.assign(box, changes)
}

// ---- Arrow operations ----

function addArrow(partial = {}, diagramId = null) {
  const d = diagramId ? project.diagrams[diagramId] : currentDiagram.value
  if (!d) return null
  const arrow = makeArrow(partial)
  d.arrows.push(arrow)
  return arrow
}

function removeArrow(arrowId, diagramId = null) {
  const d = diagramId ? project.diagrams[diagramId] : currentDiagram.value
  if (!d) return
  const idx = d.arrows.findIndex(a => a.id === arrowId)
  if (idx !== -1) d.arrows.splice(idx, 1)
}

function updateArrow(arrowId, changes, diagramId = null) {
  const d = diagramId ? project.diagrams[diagramId] : currentDiagram.value
  if (!d) return
  const arrow = d.arrows.find(a => a.id === arrowId)
  if (arrow) Object.assign(arrow, changes)
}

// ---- BoundaryArrow operations ----

function addBoundaryArrow(partial = {}, diagramId = null) {
  const d = diagramId ? project.diagrams[diagramId] : currentDiagram.value
  if (!d) return null
  const arrow = makeBoundaryArrow(partial)
  d.boundaryArrows.push(arrow)
  return arrow
}

function removeBoundaryArrow(arrowId, diagramId = null) {
  const d = diagramId ? project.diagrams[diagramId] : currentDiagram.value
  if (!d) return
  const idx = d.boundaryArrows.findIndex(a => a.id === arrowId)
  if (idx !== -1) d.boundaryArrows.splice(idx, 1)
}

function updateBoundaryArrow(arrowId, changes, diagramId = null) {
  const d = diagramId ? project.diagrams[diagramId] : currentDiagram.value
  if (!d) return
  const arrow = d.boundaryArrows.find(a => a.id === arrowId)
  if (arrow) Object.assign(arrow, changes)
}

// ---- Project-level helpers ----

function syncIdCounter() {
  const pattern = /^(?:box|arrow|barrow)-(\d+)$/
  let max = 0
  for (const d of Object.values(project.diagrams)) {
    for (const item of [...d.boxes, ...d.arrows, ...d.boundaryArrows]) {
      const m = pattern.exec(item.id)
      if (m) max = Math.max(max, +m[1])
    }
  }
  if (max >= _idCounter) _idCounter = max + 1
}

function loadProjectData(data) {
  Object.assign(project, data)
  if (!project.diagrams[currentDiagramId.value]) {
    currentDiagramId.value = Object.keys(project.diagrams)[0] ?? 'A0'
  }
  syncIdCounter()
}

function getProjectSnapshot() {
  return JSON.parse(JSON.stringify(project))
}

function resetProject() {
  const fresh = makeDefaultProject()
  project.id = fresh.id
  project.diagrams = fresh.diagrams
  currentDiagramId.value = 'A0'
}

export {
  project,
  currentDiagramId,
  currentDiagram,
  // Diagram
  createDiagram,
  navigateTo,
  // Box
  addBox,
  removeBox,
  removeDecomposition,
  getBox,
  updateBox,
  // Arrow
  addArrow,
  removeArrow,
  updateArrow,
  // BoundaryArrow
  addBoundaryArrow,
  removeBoundaryArrow,
  updateBoundaryArrow,
  // Project
  loadProjectData,
  getProjectSnapshot,
  resetProject,
}
