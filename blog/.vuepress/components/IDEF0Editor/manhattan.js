import { SIZES } from './constants';

/**
 * IDEF0 Orthogonal Arrow Routing Engine
 * Strict right-angle routing with obstacle-aware A* pathfinding.
 */

const ROUTING_K = 20;
const TURN_PENALTY = 100;
const BLOCK_PADDING = 5;

// --- IDEF0 Port Definitions (FIPS 183 Compliance) ---
// According to IDEF0 Standard:
// - CONTROL: top side, arrow points DOWN into box
// - INPUT: left side, arrow points RIGHT into box
// - OUTPUT: right side, arrow points RIGHT out of box
// - MECHANISM: bottom side, arrow points UP into box (means/support)
// - CALL: bottom side, arrow points DOWN out of box (references child diagram)

const PORT_DEFS = {
  CONTROL:   { edge: 'top',    dx: 0, dy: 1,  direction: 'in' },
  INPUT:     { edge: 'left',   dx: 1, dy: 0,  direction: 'in' },
  OUTPUT:    { edge: 'right',  dx: 1, dy: 0,  direction: 'out' },
  MECHANISM: { edge: 'bottom', dx: 0, dy: -1, direction: 'in' },
  CALL:      { edge: 'bottom', dx: 0, dy: 1,  direction: 'out' },
};

function getPortPoint(block, portType, offset = 0) {
  if (!block) return null;
  switch (portType) {
    case 'CONTROL':
      return { x: block.x + block.w / 2 + offset, y: block.y };
    case 'INPUT':
      return { x: block.x, y: block.y + block.h / 2 + offset };
    case 'OUTPUT':
      return { x: block.x + block.w, y: block.y + block.h / 2 + offset };
    case 'MECHANISM':
      return { x: block.x + block.w / 2 + offset, y: block.y + block.h };
    default:
      return getEdgePointFallback(block, portType, offset);
  }
}

function getEdgePointFallback(block, edge, offset = 0) {
  switch (edge) {
    case 'top': return { x: block.x + block.w / 2 + offset, y: block.y };
    case 'right': return { x: block.x + block.w, y: block.y + block.h / 2 + offset };
    case 'bottom': return { x: block.x + block.w / 2 + offset, y: block.y + block.h };
    case 'left': return { x: block.x, y: block.y + block.h / 2 + offset };
    default: return { x: block.x + block.w / 2, y: block.y + block.h / 2 };
  }
}

function getExitPoint(portPoint, portType) {
  if (!portPoint) return null;
  const def = PORT_DEFS[portType];
  if (!def) return { ...portPoint };
  return {
    x: portPoint.x + def.dx * ROUTING_K,
    y: portPoint.y + def.dy * ROUTING_K,
  };
}

function isOrthogonalSegment(a, b) {
  // Check if segment is purely horizontal or vertical
  return Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5;
}

function ensureOrthogonalPath(points) {
  // Ensure all segments in path are orthogonal (horizontal or vertical)
  if (points.length < 2) return points;
  
  const result = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    
    if (!isOrthogonalSegment(curr, next)) {
      // Insert intermediate point to make it orthogonal
      result.push({ x: next.x, y: curr.y });
    }
    result.push(next);
  }
  
  return result;
}

function edgeToPortType(edge, arrowType) {
  if (arrowType) {
    switch (arrowType) {
      case 'input': return 'INPUT';
      case 'output': return 'OUTPUT';
      case 'control': return 'CONTROL';
      case 'mechanism': return 'MECHANISM';
      case 'call': return 'CALL'; // CALL is a special mechanism arrow type
    }
  }
  switch (edge) {
    case 'top': return 'CONTROL';
    case 'right': return 'OUTPUT';
    case 'bottom': return 'MECHANISM'; // Default for bottom is MECHANISM (CALL checked separately)
    case 'left': return 'INPUT';
    default: return 'INPUT';
  }
}

function getBoundaryPortPoint(edge, offset, canvasBounds) {
  if (edge === null || edge === undefined) {
    // floating endpoint: offset is {x,y}
    if (offset && typeof offset === 'object') {
      return { x: offset.x ?? 0, y: offset.y ?? 0 };
    }
    return { x: offset ?? 0, y: canvasBounds?.h ?? 0 };
  }
  const w = canvasBounds?.w ?? 10000;
  const h = canvasBounds?.h ?? 10000;
  const off = offset ?? 0;
  switch (edge) {
    case 'left': return { x: 0, y: off };
    case 'right': return { x: w, y: off };
    case 'top': return { x: off, y: 0 };
    case 'bottom': return { x: off, y: h };
    default: return { x: off, y: off };
  }
}

// --- Collision Detection ---

function lineIntersectsBlock(x1, y1, x2, y2, block, padding = BLOCK_PADDING) {
  if (!block) return false;
  const minX = Math.min(x1, x2) - padding;
  const maxX = Math.max(x1, x2) + padding;
  const minY = Math.min(y1, y2) - padding;
  const maxY = Math.max(y1, y2) + padding;
  return minX < block.x + block.w && maxX > block.x &&
         minY < block.y + block.h && maxY > block.y;
}

function segmentIntersectsAnyBlock(a, b, blocks, excludeIds = []) {
  for (const block of blocks) {
    if (excludeIds.includes(block.id)) continue;
    if (lineIntersectsBlock(a.x, a.y, b.x, b.y, block)) return true;
  }
  return false;
}

function pointInsideBlock(x, y, blocks, padding = BLOCK_PADDING) {
  for (const block of blocks) {
    if (x >= block.x - padding && x <= block.x + block.w + padding &&
        y >= block.y - padding && y <= block.y + block.h + padding) {
      return true;
    }
  }
  return false;
}

// --- Route Simplification ---

function simplifyRoute(points) {
  if (points.length < 3) return points;
  const result = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];
    const sameX = Math.abs(prev.x - curr.x) < 0.5 && Math.abs(curr.x - next.x) < 0.5;
    const sameY = Math.abs(prev.y - curr.y) < 0.5 && Math.abs(curr.y - next.y) < 0.5;
    if (!sameX && !sameY) {
      result.push(curr);
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

// --- Algorithm A: Deterministic 3-Segment Router ---

function tryThreeSegmentRoute(src, dst, blocks, excludeIds) {
  // Horizontal channel via midpoint
  const midX = (src.x + dst.x) / 2;
  const routeH = [src, { x: midX, y: src.y }, { x: midX, y: dst.y }, dst];
  let valid = true;
  for (let i = 0; i < routeH.length - 1; i++) {
    if (segmentIntersectsAnyBlock(routeH[i], routeH[i + 1], blocks, excludeIds)) {
      valid = false;
      break;
    }
  }
  if (valid) return routeH;

  // Vertical channel via midpoint
  const midY = (src.y + dst.y) / 2;
  const routeV = [src, { x: src.x, y: midY }, { x: dst.x, y: midY }, dst];
  valid = true;
  for (let i = 0; i < routeV.length - 1; i++) {
    if (segmentIntersectsAnyBlock(routeV[i], routeV[i + 1], blocks, excludeIds)) {
      valid = false;
      break;
    }
  }
  if (valid) return routeV;

  return null;
}

// --- Algorithm B: Obstacle-Aware A* Grid Router ---

function buildGrid(blocks, src, dst) {
  const xs = new Set();
  const ys = new Set();

  xs.add(src.x); ys.add(src.y);
  xs.add(dst.x); ys.add(dst.y);

  xs.add(src.x - ROUTING_K); xs.add(src.x + ROUTING_K);
  ys.add(src.y - ROUTING_K); ys.add(src.y + ROUTING_K);
  xs.add(dst.x - ROUTING_K); xs.add(dst.x + ROUTING_K);
  ys.add(dst.y - ROUTING_K); ys.add(dst.y + ROUTING_K);

  for (const b of blocks) {
    xs.add(b.x - BLOCK_PADDING);
    xs.add(b.x + b.w + BLOCK_PADDING);
    ys.add(b.y - BLOCK_PADDING);
    ys.add(b.y + b.h + BLOCK_PADDING);
    xs.add(b.x + b.w / 2);
    ys.add(b.y + b.h / 2);
  }

  return {
    xs: Array.from(xs).filter(v => !isNaN(v)).sort((a, b) => a - b),
    ys: Array.from(ys).filter(v => !isNaN(v)).sort((a, b) => a - b),
  };
}

function astarRoute(src, dst, blocks, excludeIds) {
  const grid = buildGrid(blocks, src, dst);
  const { xs, ys } = grid;

  const nodeKey = (x, y) => `${x},${y}`;
  const validNodes = new Set();

  for (const x of xs) {
    for (const y of ys) {
      if (!pointInsideBlock(x, y, blocks, BLOCK_PADDING)) {
        validNodes.add(nodeKey(x, y));
      }
    }
  }

  validNodes.add(nodeKey(src.x, src.y));
  validNodes.add(nodeKey(dst.x, dst.y));

  const open = new Map();
  const closed = new Set();
  const gScore = new Map();
  const fScore = new Map();
  const cameFrom = new Map();
  const cameDir = new Map(); // 'h' | 'v'

  const startKey = nodeKey(src.x, src.y);
  const endKey = nodeKey(dst.x, dst.y);

  gScore.set(startKey, 0);
  fScore.set(startKey, Math.abs(src.x - dst.x) + Math.abs(src.y - dst.y));
  open.set(startKey, { x: src.x, y: src.y });

  while (open.size > 0) {
    let currentKey = null;
    let currentF = Infinity;
    for (const [key] of open) {
      const f = fScore.get(key) ?? Infinity;
      if (f < currentF) {
        currentF = f;
        currentKey = key;
      }
    }

    if (currentKey === endKey) {
      const path = [];
      let k = currentKey;
      while (k) {
        const [x, y] = k.split(',').map(Number);
        path.unshift({ x, y });
        k = cameFrom.get(k);
      }
      return path;
    }

    open.delete(currentKey);
    closed.add(currentKey);

    const [cx, cy] = currentKey.split(',').map(Number);
    const currentDir = cameDir.get(currentKey);

    const neighbors = [];

    // Horizontal neighbors
    for (const nx of xs) {
      if (Math.abs(nx - cx) < 0.1) continue;
      const key = nodeKey(nx, cy);
      if (!validNodes.has(key)) continue;
      if (segmentIntersectsAnyBlock({ x: cx, y: cy }, { x: nx, y: cy }, blocks, excludeIds)) continue;
      neighbors.push({ x: nx, y: cy, key, dir: 'h' });
    }

    // Vertical neighbors
    for (const ny of ys) {
      if (Math.abs(ny - cy) < 0.1) continue;
      const key = nodeKey(cx, ny);
      if (!validNodes.has(key)) continue;
      if (segmentIntersectsAnyBlock({ x: cx, y: cy }, { x: cx, y: ny }, blocks, excludeIds)) continue;
      neighbors.push({ x: cx, y: ny, key, dir: 'v' });
    }

    for (const n of neighbors) {
      if (closed.has(n.key)) continue;

      const dist = Math.abs(n.x - cx) + Math.abs(n.y - cy);
      const turnCost = (currentDir && currentDir !== n.dir) ? TURN_PENALTY : 0;
      const tentativeG = (gScore.get(currentKey) ?? Infinity) + dist + turnCost;
      const existingG = gScore.get(n.key) ?? Infinity;

      if (tentativeG < existingG) {
        cameFrom.set(n.key, currentKey);
        cameDir.set(n.key, n.dir);
        gScore.set(n.key, tentativeG);
        fScore.set(n.key, tentativeG + Math.abs(n.x - dst.x) + Math.abs(n.y - dst.y));
        if (!open.has(n.key)) {
          open.set(n.key, n);
        }
      }
    }
  }

  return null;
}

// --- Public API ---

export function getPreferredEdge(type, isTarget) {
  switch (type) {
    case 'input':
      return isTarget ? 'left' : 'right';
    case 'output':
      return isTarget ? 'right' : 'left';
    case 'control':
      return 'top';
    case 'mechanism':
      return 'bottom';
    case 'call':
      return 'bottom'; // CALL arrows connect to bottom side (like mechanism)
    default:
      return isTarget ? 'left' : 'right';
  }
}

export function getBoundaryEdge(type) {
  switch (type) {
    case 'input': return 'left';
    case 'output': return 'right';
    case 'control': return 'top';
    case 'mechanism': return 'bottom';
    case 'call': return 'bottom'; // CALL arrows use bottom boundary (per IDEF0 spec)
    default: return 'left';
  }
}

/**
 * Check if direct orthogonal route is possible (no obstacles).
 * Returns true if straight line or single-bend orthogonal path is clear.
 */
function canUseDirectRoute(src, dst, blocks, excludeIds) {
  // Check direct straight line (same X or same Y)
  if (Math.abs(src.x - dst.x) < 1 || Math.abs(src.y - dst.y) < 1) {
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (excludeIds.includes(block.id)) continue;
      if (lineIntersectsBlock(src.x, src.y, dst.x, dst.y, block, 0)) return false;
    }
    return true;
  }
  
  // Check L-shaped routes (one bend)
  const lRoutes = [
    [src, { x: dst.x, y: src.y }, dst],  // horizontal then vertical
    [src, { x: src.x, y: dst.y }, dst],  // vertical then horizontal
  ];

  for (const route of lRoutes) {
    let valid = true;
    for (let i = 0; i < route.length - 1; i++) {
      for (const block of blocks) {
        if (excludeIds.includes(block.id)) continue;
        if (lineIntersectsBlock(route[i].x, route[i].y, route[i + 1].x, route[i + 1].y, block, 0)) {
          valid = false;
          break;
        }
      }
      if (!valid) break;
    }
    if (valid) return true;
  }
  
  return false;
}

/**
 * Calculate orthogonal route for an IDEF0 arrow.
 * @param {Object} from - { block?, edge?, offset?, portType? }
 * @param {Object} to - { block?, edge?, offset?, portType? }
 * @param {Array} allBlocks - All diagram blocks
 * @param {Array} excludeIds - Block IDs to exclude from collision
 * @param {string} arrowType - Arrow type for port inference
 * @param {Object} canvasBounds - { w, h } for boundary routing
 * @param {boolean} preferDirect - If true, prefer direct route without unnecessary bends during drag
 * @returns {Array} Full waypoint path [fromPort, ..., toPort]
 */
export function routeArrow(from, to, allBlocks, excludeIds = [], arrowType = null, canvasBounds = null, preferDirect = false) {
  const fromPortType = from.portType || edgeToPortType(from.edge, arrowType);
  const toPortType = to.portType || edgeToPortType(to.edge, arrowType);

  const srcPort = from.block
    ? getPortPoint(from.block, fromPortType, from.offset)
    : getBoundaryPortPoint(from.edge, from.edge === null ? { x: from.x, y: from.y } : from.offset, canvasBounds);
  const dstPort = to.block
    ? getPortPoint(to.block, toPortType, to.offset)
    : getBoundaryPortPoint(to.edge, to.edge === null ? { x: to.x, y: to.y } : to.offset, canvasBounds);

  if (!srcPort || !dstPort) return [];

  let src = getExitPoint(srcPort, fromPortType);
  let dst = getExitPoint(dstPort, toPortType);

  if (!from.block || from.edge === null) {
    src = { x: srcPort.x, y: srcPort.y };
  }
  if (!to.block || to.edge === null) {
    dst = { x: dstPort.x, y: dstPort.y };
  }

  const blocks = (allBlocks || []).filter((b) => !excludeIds.includes(b.id));

  // If preferDirect is true and no obstacles, use simple direct route
  if (preferDirect && canUseDirectRoute(src, dst, blocks, excludeIds)) {
    // Simple orthogonal path with minimal bends
    const route = [src, { x: dst.x, y: src.y }, dst];
    const fullRoute = [srcPort, ...route, dstPort];
    return simplifyRoute(ensureOrthogonalPath(fullRoute));
  }

  // Algorithm A: 3-segment deterministic (orthogonal)
  let route = tryThreeSegmentRoute(src, dst, blocks, excludeIds);
  if (route) {
    const fullRoute = [srcPort, ...route, dstPort];
    return simplifyRoute(ensureOrthogonalPath(fullRoute));
  }

  // Algorithm B: A* grid router (guaranteed orthogonal via grid)
  route = astarRoute(src, dst, blocks, excludeIds);
  if (route) {
    route[0] = src;
    route[route.length - 1] = dst;
    const fullRoute = [srcPort, ...route, dstPort];
    return simplifyRoute(ensureOrthogonalPath(fullRoute));
  }

  // Fallback: simple orthogonal via midpoint (L-shaped or Z-shaped)
  const midX = (src.x + dst.x) / 2;
  const midY = (src.y + dst.y) / 2;
  route = [src, { x: midX, y: src.y }, { x: midX, y: dst.y }, dst];
  const fullRoute = [srcPort, ...route, dstPort];
  return simplifyRoute(ensureOrthogonalPath(fullRoute));
}

/**
 * Calculate offset for parallel arrows on same edge.
 * Kept for API compatibility; block ports are strictly centered per IDEF0 spec.
 */
export function calculateParallelOffset(arrows, blockId, edge, newArrowId) {
  const sameEdge = (arrows || []).filter(
    (a) =>
      a.id !== newArrowId &&
      ((a.from.blockId === blockId && a.from.edge === edge) ||
        (a.to.blockId === blockId && a.to.edge === edge))
  );
  const count = sameEdge.length;
  const step = SIZES.arrowOffsetStep;
  const offset = ((count % 2 === 0 ? 1 : 0) + Math.floor(count / 2)) * step;
  return 30 + offset;
}

/**
 * Get the longest horizontal segment for label placement.
 */
export function getLabelSegment(segments) {
  if (!segments || segments.length < 2) return null;
  let best = null;
  let bestLen = -1;
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i];
    const b = segments[i + 1];
    const horizontal = Math.abs(a.y - b.y) < 1;
    const vertical = Math.abs(a.x - b.x) < 1;
    if (horizontal || vertical) {
      const len = horizontal ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
      if (len > bestLen) {
        bestLen = len;
        best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, len, isHorizontal: horizontal };
      }
    }
  }
  return best;
}

/**
 * Check if arrows form forks or joins.
 */
export function detectForkJoin(arrows) {
  const forks = [];
  const joins = [];

  for (const arrow of arrows) {
    const points = arrow.segments || [];
    if (points.length < 3) continue;

    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];

      const prevHorizontal = Math.abs(prev.y - curr.y) < 1;
      const nextHorizontal = Math.abs(curr.y - next.y) < 1;

      if (prevHorizontal !== nextHorizontal) {
        forks.push({ x: curr.x, y: curr.y, type: 'junction' });
      }
    }
  }

  return { forks, joins };
}

/**
 * Snap detection for arrow endpoints.
 * Returns snap target info when cursor is close to block edges or diagram boundary.
 * 
 * @param {Object} worldPos - {x, y} cursor position
 * @param {Array} blocks - All blocks
 * @param {Object} diagramBounds - Diagram bounds
 * @param {string} arrowType - Arrow type for ICOM preference
 * @param {string} excludeBlockId - Block ID to exclude (source block)
 * @param {boolean} disableSnap - If true (e.g., Shift held), disable block snap but keep boundary snap
 * @param {Object} currentEndpoint - Current endpoint being dragged {blockId, edge, x, y}
 * @returns {Object} Snap result with mode, target, edge, offset, blockId, preview, shouldDetach
 */
export function findSnapTarget(worldPos, blocks, diagramBounds, arrowType = null, excludeBlockId = null, disableSnap = false, currentEndpoint = null) {
  const SNAP_THRESHOLD = {
    TO_BLOCK: 30,        // Distance to snap to block edge (reduced for better control)
    TO_BOUNDARY: 30,     // Distance to snap to diagram boundary
    TO_BLOCK_CENTER: 20, // Distance to snap to block edge center
    DETACH_THRESHOLD: 15, // Min distance from block edge to detach floating endpoint
  };

  const result = {
    mode: 'free', // 'block-edge', 'block-center', 'boundary', 'free'
    target: null,
    edge: null,
    offset: 0,
    blockId: null,
    preview: null,
    shouldDetach: false, // True if floating endpoint should detach from block
    detachFromBlockId: null, // Block ID to detach from
  };

  const { x, y } = worldPos;

  // Check if we're dragging away from a block (detach logic)
  if (currentEndpoint && currentEndpoint.blockId && !disableSnap) {
    const draggingBlock = blocks.find(b => b.id === currentEndpoint.blockId);
    if (draggingBlock) {
      // Calculate distance from current edge position
      let edgeX, edgeY;
      switch (currentEndpoint.edge) {
        case 'top':
          edgeX = draggingBlock.x + draggingBlock.w / 2 + (currentEndpoint.offset || 0);
          edgeY = draggingBlock.y;
          break;
        case 'bottom':
          edgeX = draggingBlock.x + draggingBlock.w / 2 + (currentEndpoint.offset || 0);
          edgeY = draggingBlock.y + draggingBlock.h;
          break;
        case 'left':
          edgeX = draggingBlock.x;
          edgeY = draggingBlock.y + draggingBlock.h / 2 + (currentEndpoint.offset || 0);
          break;
        case 'right':
          edgeX = draggingBlock.x + draggingBlock.w;
          edgeY = draggingBlock.y + draggingBlock.h / 2 + (currentEndpoint.offset || 0);
          break;
        default:
          edgeX = x;
          edgeY = y;
      }
      
      const distFromEdge = Math.hypot(x - edgeX, y - edgeY);
      
      // If dragged more than DETACH_THRESHOLD, mark for detach
      if (distFromEdge > SNAP_THRESHOLD.DETACH_THRESHOLD) {
        result.shouldDetach = true;
        result.detachFromBlockId = currentEndpoint.blockId;
      }
    }
  }

  // If snap is disabled (e.g., Shift held), only check boundary snap
  if (disableSnap) {
    // Skip block snap, only check boundary
  } else {
    // Priority 1: Snap to block edges (excluding source block and block we're detaching from)
    for (const block of blocks) {
      if (block.id === excludeBlockId) continue;
      if (result.shouldDetach && block.id === result.detachFromBlockId) continue;

      const edges = [
        { edge: 'top',    x1: block.x, y1: block.y,          x2: block.x + block.w, y2: block.y,          isHorizontal: true },
        { edge: 'right',  x1: block.x + block.w, y1: block.y, x2: block.x + block.w, y2: block.y + block.h, isHorizontal: false },
        { edge: 'bottom', x1: block.x, y1: block.y + block.h, x2: block.x + block.w, y2: block.y + block.h, isHorizontal: true },
        { edge: 'left',   x1: block.x, y1: block.y,          x2: block.x, y2: block.y + block.h, isHorizontal: false },
      ];

      for (const e of edges) {
        let dist, projX, projY;

        if (e.isHorizontal) {
          projX = Math.max(e.x1, Math.min(x, e.x2));
          projY = e.y1;
          dist = Math.abs(y - projY);
        } else {
          projX = e.x1;
          projY = Math.max(e.y1, Math.min(y, e.y2));
          dist = Math.abs(x - projX);
        }

        if (dist <= SNAP_THRESHOLD.TO_BLOCK) {
          // Calculate offset from edge center
          const edgeCenterX = (e.x1 + e.x2) / 2;
          const edgeCenterY = (e.y1 + e.y2) / 2;
          const offset = e.isHorizontal ? (projX - edgeCenterX) : (projY - edgeCenterY);

          // Check if we're close to edge center (for better ICOM alignment)
          const distToCenter = e.isHorizontal ? Math.abs(x - edgeCenterX) : Math.abs(y - edgeCenterY);
          
          // Prefer ICOM-compatible edge based on arrow type
          const preferredEdge = arrowType ? getEdgeForArrowType(arrowType, false) : e.edge;
          const edgeMatch = e.edge === preferredEdge || distToCenter <= SNAP_THRESHOLD.TO_BLOCK_CENTER;

          return {
            mode: edgeMatch ? 'block-center' : 'block-edge',
            target: { x: projX, y: projY },
            edge: e.edge,
            offset: Math.round(offset / 4) * 4, // Snap to 4px grid
            blockId: block.id,
            preview: {
              block,
              edge: e.edge,
              dist,
              isPreferred: edgeMatch,
            },
            shouldDetach: false,
            detachFromBlockId: null,
          };
        }
      }
    }
  }

  // Priority 2: Snap to diagram boundary
  const boundaryEdges = [
    { edge: 'top',    x1: diagramBounds.minX, y1: diagramBounds.minY, x2: diagramBounds.maxX, y2: diagramBounds.minY, isHorizontal: true },
    { edge: 'bottom', x1: diagramBounds.minX, y1: diagramBounds.maxY, x2: diagramBounds.maxX, y2: diagramBounds.maxY, isHorizontal: true },
    { edge: 'left',   x1: diagramBounds.minX, y1: diagramBounds.minY, x2: diagramBounds.minX, y2: diagramBounds.maxY, isHorizontal: false },
    { edge: 'right',  x1: diagramBounds.maxX, y1: diagramBounds.minY, x2: diagramBounds.maxX, y2: diagramBounds.maxY, isHorizontal: false },
  ];

  for (const e of boundaryEdges) {
    let dist, projX, projY;

    if (e.isHorizontal) {
      projX = Math.max(e.x1, Math.min(x, e.x2));
      projY = e.y1;
      dist = Math.abs(y - projY);
    } else {
      projX = e.x1;
      projY = Math.max(e.y1, Math.min(y, e.y2));
      dist = Math.abs(x - projX);
    }

    if (dist <= SNAP_THRESHOLD.TO_BOUNDARY) {
      const edgeCenterX = (e.x1 + e.x2) / 2;
      const edgeCenterY = (e.y1 + e.y2) / 2;
      const offset = e.isHorizontal ? projX : projY;
      const centerOffset = e.isHorizontal ? (edgeCenterX - e.x1) : (edgeCenterY - e.y1);

      return {
        mode: 'boundary',
        target: { x: projX, y: projY },
        edge: e.edge,
        offset: offset - centerOffset,
        blockId: null,
        preview: {
          edge: e.edge,
          dist,
        },
        shouldDetach: false,
        detachFromBlockId: null,
      };
    }
  }

  // Priority 3: Free floating (no snap)
  return {
    mode: 'free',
    target: { x, y },
    edge: null,
    offset: 0,
    blockId: null,
    preview: null,
    shouldDetach: result.shouldDetach,
    detachFromBlockId: result.detachFromBlockId,
  };
}

/**
 * Get the preferred ICOM edge for an arrow type when connecting TO a block.
 * Per IDEF0 FIPS 183:
 * - Input: left side
 * - Control: top side  
 * - Output: right side
 * - Mechanism: bottom side (arrow points UP)
 * - Call: bottom side (arrow points DOWN, references child diagram)
 */
function getEdgeForArrowType(arrowType, isTarget) {
  switch (arrowType) {
    case 'input':
      return isTarget ? 'left' : 'right';
    case 'output':
      return isTarget ? 'right' : 'left';
    case 'control':
      return 'top';
    case 'mechanism':
      return 'bottom';
    case 'call':
      return 'bottom'; // CALL uses bottom edge per IDEF0 spec
    default:
      return isTarget ? 'left' : 'right';
  }
}

/**
 * Calculate distance from point to line segment.
 */
export function pointToSegmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  
  if (len2 === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  
  return {
    distance: Math.hypot(p.x - projX, p.y - projY),
    projection: { x: projX, y: projY },
    t,
  };
}

/**
 * Get magnetic guide lines for alignment.
 */
export function getMagneticGuides(worldPos, blocks, diagramBounds, selectedBlockId = null) {
  const guides = [];
  const { x, y } = worldPos;
  const MAX_GUIDES = 4;

  // Vertical guides from block centers and edges
  const verticalLines = new Set();
  verticalLines.add(x); // Current position
  
  for (const block of blocks) {
    if (block.id === selectedBlockId) continue;
    verticalLines.add(block.x);
    verticalLines.add(block.x + block.w / 2);
    verticalLines.add(block.x + block.w);
  }
  verticalLines.add(diagramBounds.minX);
  verticalLines.add(diagramBounds.maxX);

  for (const gx of verticalLines) {
    if (Math.abs(gx - x) <= 30 && Math.abs(gx - x) > 0) {
      guides.push({ type: 'vertical', value: gx, dist: Math.abs(gx - x) });
    }
  }

  // Horizontal guides
  const horizontalLines = new Set();
  horizontalLines.add(y);

  for (const block of blocks) {
    if (block.id === selectedBlockId) continue;
    horizontalLines.add(block.y);
    horizontalLines.add(block.y + block.h / 2);
    horizontalLines.add(block.y + block.h);
  }
  horizontalLines.add(diagramBounds.minY);
  horizontalLines.add(diagramBounds.maxY);

  for (const gy of horizontalLines) {
    if (Math.abs(gy - y) <= 30 && Math.abs(gy - y) > 0) {
      guides.push({ type: 'horizontal', value: gy, dist: Math.abs(gy - y) });
    }
  }

  // Sort by distance and return closest
  return guides
    .sort((a, b) => a.dist - b.dist)
    .slice(0, MAX_GUIDES);
}
