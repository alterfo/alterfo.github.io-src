import { project, currentDiagram, navigateTo, createDiagram } from './model.js'
import { icomCode } from './icom.js'

let _baCounter = 1
function uid() {
  return `hba-${_baCounter++}`
}

/**
 * Returns the child diagram ID for a box at a given index (0-based) in the parent diagram.
 * A0 box[0] → A1, A0 box[1] → A2, A1 box[2] → A13, etc.
 */
function childDiagramId(parentId, boxIndex) {
  return `${parentId}${boxIndex + 1}`
}

/**
 * Creates (or retrieves) the child diagram for a box via FIPS 183 decomposition.
 * Derives boundary arrows from all parent arrows passing through this box.
 * Sets box.childDiagramId on the parent box.
 *
 * @param {object} box - Box to decompose
 * @param {object} diagram - Parent diagram containing the box
 * @returns {object} Child diagram
 */
function decomposeBox(box, diagram) {
  const idx = diagram.boxes.indexOf(box)
  if (idx === -1) return null

  const newId = childDiagramId(diagram.id, idx)

  // Already decomposed — just ensure the link is set
  if (project.diagrams[newId]) {
    box.childDiagramId = newId
    return project.diagrams[newId]
  }

  const boundaryArrows = []
  const counts = { input: 0, control: 0, output: 0, mechanism: 0, call: 0 }

  function nextCode(type) {
    counts[type] = (counts[type] ?? 0) + 1
    return icomCode(type, counts[type])
  }

  // Parent boundary arrows connected to this box become child boundary arrows
  for (const ba of diagram.boundaryArrows) {
    if (ba.boxId !== box.id) continue
    boundaryArrows.push({
      id: uid(),
      label: ba.label,
      type: ba.type,
      icomCode: nextCode(ba.type),
      boxId: null,
      parentArrowId: ba.id,
    })
  }

  // Internal parent arrows entering this box
  for (const arrow of diagram.arrows) {
    if (arrow.targetBoxId === box.id) {
      boundaryArrows.push({
        id: uid(),
        label: arrow.label,
        type: arrow.type,
        icomCode: nextCode(arrow.type),
        boxId: null,
        parentArrowId: arrow.id,
      })
    }
  }

  // Internal parent arrows exiting this box
  for (const arrow of diagram.arrows) {
    if (arrow.sourceBoxId === box.id) {
      boundaryArrows.push({
        id: uid(),
        label: arrow.label,
        type: arrow.type,
        icomCode: nextCode(arrow.type),
        boxId: null,
        parentArrowId: arrow.id,
      })
    }
  }

  const child = createDiagram(newId, box.label, diagram.id, [], boundaryArrows)
  box.childDiagramId = newId
  return child
}

/**
 * Decomposes the given box and navigates into the child diagram.
 */
function navigateInto(box, diagram) {
  const d = diagram ?? currentDiagram.value
  if (!d) return
  const child = decomposeBox(box, d)
  if (child) navigateTo(child.id)
}

/**
 * Navigates to the parent diagram if one exists.
 */
function navigateUp() {
  const d = currentDiagram.value
  if (d && d.parentId) {
    navigateTo(d.parentId)
  }
}

export { decomposeBox, navigateInto, navigateUp, childDiagramId }
