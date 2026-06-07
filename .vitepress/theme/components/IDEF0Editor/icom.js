export const ICOM_TYPES = ['input', 'control', 'output', 'mechanism', 'call']

// Side of the box where each arrow type connects
export const SIDE_FOR_TYPE = {
  input: 'left',
  control: 'top',
  output: 'right',
  mechanism: 'bottom',
  call: 'bottom',
}

// Whether the arrow enters or exits the box
export const DIRECTION_FOR_TYPE = {
  input: 'enters',
  control: 'enters',
  output: 'exits',
  mechanism: 'enters',
  call: 'exits',
}

const ICOM_PREFIX = {
  input: 'I',
  control: 'C',
  output: 'O',
  mechanism: 'M',
  call: 'R',
}

// icomCode('input', 1) → 'I1', icomCode('call', 2) → 'R2'
export function icomCode(type, index) {
  const prefix = ICOM_PREFIX[type] ?? 'X'
  return `${prefix}${index}`
}

// Returns true if the arrow type is consistent with the sides it connects on source/target box.
// sourceBoxSide / targetBoxSide: 'left' | 'top' | 'right' | 'bottom' | null (null = boundary)
export function isValidConnection(sourceBoxSide, targetBoxSide, arrowType) {
  switch (arrowType) {
    case 'input':     return targetBoxSide === 'left'
    case 'control':   return targetBoxSide === 'top'
    case 'output':    return sourceBoxSide === 'right'
    case 'mechanism': return targetBoxSide === 'bottom'
    case 'call':      return sourceBoxSide === 'bottom'
    default:          return false
  }
}

// FIPS 183 diagram validation. Returns array of { type: 'error'|'warn', message, boxId?, arrowId? }.
export function validateDiagram(diagram) {
  const errors = []
  const { boxes = [], arrows = [], boundaryArrows = [] } = diagram

  if (boxes.length < 3) {
    errors.push({ type: 'warn', message: `Diagram has ${boxes.length} box(es); FIPS 183 recommends 3–6` })
  }
  if (boxes.length > 6) {
    errors.push({ type: 'error', message: `Diagram has ${boxes.length} boxes; FIPS 183 maximum is 6` })
  }

  const boxIds = new Set(boxes.map(b => b.id))

  for (const box of boxes) {
    const incoming = arrows.filter(a => a.targetBoxId === box.id)
    const outgoing = arrows.filter(a => a.sourceBoxId === box.id)
    const boundary = boundaryArrows.filter(ba => ba.boxId === box.id)

    const hasControl =
      incoming.some(a => a.type === 'control') ||
      boundary.some(ba => ba.type === 'control')

    if (!hasControl) {
      errors.push({ type: 'error', boxId: box.id, message: `Box "${box.label}" has no CONTROL arrow` })
    }

    const hasInputOrOutput =
      incoming.some(a => a.type === 'input') ||
      outgoing.some(a => a.type === 'output') ||
      boundary.some(ba => ba.type === 'input' || ba.type === 'output')

    if (!hasInputOrOutput) {
      errors.push({ type: 'error', boxId: box.id, message: `Box "${box.label}" has no INPUT or OUTPUT arrow` })
    }
  }

  for (const arrow of arrows) {
    if (arrow.sourceBoxId && !boxIds.has(arrow.sourceBoxId)) {
      errors.push({ type: 'error', arrowId: arrow.id, message: `Arrow "${arrow.label || arrow.id}" references missing source box` })
    }
    if (arrow.targetBoxId && !boxIds.has(arrow.targetBoxId)) {
      errors.push({ type: 'error', arrowId: arrow.id, message: `Arrow "${arrow.label || arrow.id}" references missing target box` })
    }
    if (arrow.sourceBoxId && arrow.targetBoxId && arrow.sourceBoxId === arrow.targetBoxId) {
      errors.push({ type: 'error', arrowId: arrow.id, boxId: arrow.sourceBoxId, message: `Arrow "${arrow.label || arrow.id}" is a self-loop (source and target are the same box)` })
    }
    const expectedTargetSide = SIDE_FOR_TYPE[arrow.type]
    if (expectedTargetSide && arrow.sourceSide && arrow.targetSide && arrow.targetSide !== expectedTargetSide) {
      errors.push({ type: 'error', arrowId: arrow.id, boxId: arrow.targetBoxId, message: `Arrow "${arrow.label || arrow.id}" (${arrow.type}) connects to ${arrow.targetSide} side but should connect to ${expectedTargetSide}` })
    }
  }

  return errors
}

// Returns true if the diagram has any error-level validation issues
export function hasErrors(diagram) {
  return validateDiagram(diagram).some(e => e.type === 'error')
}
