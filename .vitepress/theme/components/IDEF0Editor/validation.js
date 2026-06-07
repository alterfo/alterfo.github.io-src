export function validateDiagram(diagram) {
  const errors = [];
  const blockIds = new Set();

  for (const block of diagram.blocks || []) {
    if (!block.name || block.name.trim() === '') {
      errors.push({ type: 'block', id: block.id, message: 'Блок без названия' });
    }
    if (blockIds.has(block.id)) {
      errors.push({ type: 'block', id: block.id, message: 'Дублирующийся ID блока' });
    }
    blockIds.add(block.id);
  }

  for (const arrow of diagram.arrows || []) {
    if (!arrow.name || arrow.name.trim() === '') {
      errors.push({ type: 'arrow', id: arrow.id, message: 'Стрелка без названия' });
    }
    const fromExists = !arrow.from.blockId || blockIds.has(arrow.from.blockId);
    const toExists = !arrow.to.blockId || blockIds.has(arrow.to.blockId);
    if (!fromExists) {
      errors.push({ type: 'arrow', id: arrow.id, message: 'Отсутствует исходный блок' });
    }
    if (!toExists) {
      errors.push({ type: 'arrow', id: arrow.id, message: 'Отсутствует целевой блок' });
    }
    // Validate floating endpoints have coordinates
    if (arrow.from.blockId === null && arrow.from.edge === null && (arrow.from.x == null || arrow.from.y == null)) {
      errors.push({ type: 'arrow', id: arrow.id, message: 'Плавающий начальный конец без координат' });
    }
    if (arrow.to.blockId === null && arrow.to.edge === null && (arrow.to.x == null || arrow.to.y == null)) {
      errors.push({ type: 'arrow', id: arrow.id, message: 'Плавающий конечный конец без координат' });
    }
    
    // Validate ICOM edge compatibility per FIPS 183
    const icomError = validateICOMEdge(arrow);
    if (icomError) {
      errors.push({ type: 'arrow', id: arrow.id, message: icomError });
    }
  }

  return errors;
}

/**
 * Validate that arrow connects to ICOM-compatible edge based on its type.
 * Per IDEF0 FIPS 183:
 * - INPUT: must connect to left side
 * - OUTPUT: must connect to right side
 * - CONTROL: must connect to top side
 * - MECHANISM: must connect to bottom side
 * - CALL: must connect to bottom side
 */
function validateICOMEdge(arrow) {
  const { type, from, to } = arrow;

  // Skip completely floating arrows (no block or edge on either end)
  if (!from.blockId && !from.edge && !to.blockId && !to.edge) return null;

  const fromEdge = from.edge;
  const toEdge = to.edge;

  switch (type) {
    case 'input':
      // INPUT enters the block from the left
      if (to.blockId && toEdge !== 'left') {
        return `INPUT arrow must connect to left side, found ${toEdge}`;
      }
      break;
    case 'output':
      // OUTPUT exits the block from the right
      if (from.blockId && fromEdge !== 'right') {
        return `OUTPUT arrow must exit from right side, found ${fromEdge}`;
      }
      break;
    case 'control':
      // CONTROL enters the block from the top
      if (to.blockId && toEdge !== 'top') {
        return `CONTROL arrow must connect to top side, found ${toEdge}`;
      }
      break;
    case 'mechanism':
      // MECHANISM enters the block from the bottom
      if (to.blockId && toEdge !== 'bottom') {
        return `MECHANISM arrow must connect to bottom side, found ${toEdge}`;
      }
      break;
    case 'call':
      // CALL exits the block from the bottom (references another model)
      if (from.blockId && fromEdge !== 'bottom') {
        return `CALL arrow must exit from bottom side, found ${fromEdge}`;
      }
      break;
    default:
      return null;
  }
}

export function hasErrors(diagram) {
  return validateDiagram(diagram).length > 0;
}
