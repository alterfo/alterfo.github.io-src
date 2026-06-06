/**
 * Hierarchy helpers for nested IDEF0 diagrams.
 * ID scheme: A0 -> A1, A2... -> A11, A12... -> A111, A112...
 */

/**
 * Generate next child diagram ID based on parent diagram ID and block index.
 * A0 + block 0 -> A1
 * A1 + block 2 -> A13
 * A11 + block 0 -> A111
 */
export function generateChildDiagramId(parentDiagramId, blockIndex) {
  if (parentDiagramId === 'A0') {
    return `A${blockIndex + 1}`;
  }
  // Extract numeric part after A
  const num = parentDiagramId.slice(1);
  return `A${num}${blockIndex + 1}`;
}

/**
 * Get parent diagram ID from child ID.
 * A11 -> A1
 * A111 -> A11
 * A1 -> A0
 */
export function getParentDiagramId(diagramId) {
  if (diagramId === 'A0') return null;
  const num = diagramId.slice(1);
  if (num.length <= 1) return 'A0';
  return 'A' + num.slice(0, -1);
}

/**
 * Get breadcrumb path from root to given diagram.
 * @param {string} diagramId
 * @param {Record<string, Diagram>} diagrams
 * @returns {Array<{id: string, name: string}>}
 */
export function getBreadcrumbPath(diagramId, diagrams) {
  const path = [];
  let current = diagramId;
  while (current) {
    const d = diagrams[current];
    if (!d) break;
    path.unshift({ id: current, name: d.name || current });
    current = d.parentDiagramId;
  }
  return path;
}

/**
 * Find diagram that contains a given block.
 * @param {string} blockId
 * @param {Record<string, Diagram>} diagrams
 * @returns {string|null} diagramId
 */
export function findDiagramContainingBlock(blockId, diagrams) {
  for (const [id, d] of Object.entries(diagrams)) {
    if (d.blocks && d.blocks.some((b) => b.id === blockId)) {
      return id;
    }
  }
  return null;
}

/**
 * Recursively delete a diagram and all its descendants.
 * @param {string} diagramId
 * @param {Record<string, Diagram>} diagrams
 * @returns {string[]} deleted diagram IDs
 */
export function deleteDiagramRecursive(diagramId, diagrams) {
  const deleted = [];
  const toDelete = [diagramId];

  while (toDelete.length) {
    const id = toDelete.pop();
    const d = diagrams[id];
    if (!d) continue;

    // Queue child diagrams
    for (const block of d.blocks || []) {
      if (block.diagramId && diagrams[block.diagramId]) {
        toDelete.push(block.diagramId);
      }
    }

    deleted.push(id);
  }

  return deleted;
}

/**
 * Get all descendant diagram IDs (excluding the root).
 */
export function getDescendantIds(diagramId, diagrams) {
  const descendants = [];
  const d = diagrams[diagramId];
  if (!d) return descendants;

  for (const block of d.blocks || []) {
    if (block.diagramId && diagrams[block.diagramId]) {
      descendants.push(block.diagramId);
      descendants.push(...getDescendantIds(block.diagramId, diagrams));
    }
  }

  return descendants;
}

/**
 * Check if assigning targetDiagramId to block's diagramId would create a cycle.
 */
export function wouldCreateCycle(targetDiagramId, blockDiagramId, diagrams) {
  if (!blockDiagramId) return false;
  if (targetDiagramId === blockDiagramId) return true;
  // Check if target is a descendant of block's current diagram
  const descendants = getDescendantIds(blockDiagramId, diagrams);
  return descendants.includes(targetDiagramId);
}
