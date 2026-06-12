import { ref, computed } from 'vue'

const MAX_HISTORY = 50

const undoStack = ref([])
const redoStack = ref([])

function snapshotDiagram(diagram) {
  return JSON.stringify(diagram)
}

function applySnapshot(diagram, snapshot) {
  diagram.title = snapshot.title
  diagram.boxes.splice(0, diagram.boxes.length, ...(snapshot.boxes ?? []))
  diagram.arrows.splice(0, diagram.arrows.length, ...(snapshot.arrows ?? []))
  // boundaryArrows is absent on root diagrams from older projects/defaultProject
  if (!diagram.boundaryArrows) diagram.boundaryArrows = []
  diagram.boundaryArrows.splice(0, diagram.boundaryArrows.length, ...(snapshot.boundaryArrows ?? []))
}

function pushSnapshot(diagram) {
  if (!diagram) return
  undoStack.value.push(snapshotDiagram(diagram))
  if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
  redoStack.value = []
}

function undo(diagram) {
  if (!diagram || undoStack.value.length === 0) return false
  redoStack.value.push(snapshotDiagram(diagram))
  applySnapshot(diagram, JSON.parse(undoStack.value.pop()))
  return true
}

function redo(diagram) {
  if (!diagram || redoStack.value.length === 0) return false
  undoStack.value.push(snapshotDiagram(diagram))
  applySnapshot(diagram, JSON.parse(redoStack.value.pop()))
  return true
}

function resetHistory() {
  undoStack.value = []
  redoStack.value = []
}

const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

export { pushSnapshot, undo, redo, resetHistory, canUndo, canRedo }
