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
  
  // Only validate if both endpoints connect to blocks
  if (!from.blockId || !to.blockId) return null;
  
  // Check target edge (where arrow enters/connects)
  const targetEdge = to.edge;
  
  switch (type) {
    case 'input':
      if (targetEdge !== 'left') {
        return `INPUT arrow must connect to left side, found ${targetEdge}`;
      }
      break;
    case 'output':
      // OUTPUT typically exits from right, but can connect elsewhere in complex diagrams
      // For strict IDEF0 compliance, output should exit from right side of source
      if (from.edge !== 'right') {
        return `OUTPUT arrow must exit from right side, found ${from.edge}`;
      }
      break;
    case 'control':
      if (targetEdge !== 'top') {
        return `CONTROL arrow must connect to top side, found ${targetEdge}`;
      }
      break;
    case 'mechanism':
      if (targetEdge !== 'bottom') {
        return `MECHANISM arrow must connect to bottom side, found ${targetEdge}`;
      }
      break;
    case 'call':
      if (targetEdge !== 'bottom') {
        return `CALL arrow must connect to bottom side, found ${targetEdge}`;
      }
      break;
    default:
      return null;
  }
  
  return null;
}

export function hasErrors(diagram) {
  return validateDiagram(diagram).length > 0;
}
