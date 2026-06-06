import { COLORS } from './constants';

export function exportToPNG(canvas, filename = 'idef0-diagram.png') {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('Failed to create blob'));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      resolve();
    }, 'image/png');
  });
}

export function exportToSVG(diagram, width = 800, height = 600) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('xmlns', ns);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  // Background
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', width);
  bg.setAttribute('height', height);
  bg.setAttribute('fill', '#fafafa');
  svg.appendChild(bg);

  // Blocks
  for (const block of diagram.blocks || []) {
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', block.x);
    rect.setAttribute('y', block.y);
    rect.setAttribute('width', block.w);
    rect.setAttribute('height', block.h);
    rect.setAttribute('fill', COLORS.blockFill);
    rect.setAttribute('stroke', COLORS.blockStroke);
    rect.setAttribute('stroke-width', '2');
    svg.appendChild(rect);

    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', block.x + block.w / 2);
    text.setAttribute('y', block.y + block.h / 2);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-family', 'sans-serif');
    text.setAttribute('font-size', '14');
    text.setAttribute('fill', COLORS.text);
    text.textContent = block.name || '';
    svg.appendChild(text);
  }

  // Arrows
  for (const arrow of diagram.arrows || []) {
    const color = COLORS.arrow[arrow.type] || COLORS.arrow.input;
    const points = getArrowPointsForSVG(arrow, diagram.blocks);
    
    const d = points.map((p, i) => (i === 0 ? 'M' : 'L') + `${p.x},${p.y}`).join(' ');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    svg.appendChild(path);

    if (arrow.name) {
      const midPoint = points[Math.floor(points.length / 2)];
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', midPoint.x);
      text.setAttribute('y', midPoint.y - 6);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-family', 'sans-serif');
      text.setAttribute('font-size', '12');
      text.setAttribute('fill', color);
      text.textContent = arrow.name;
      svg.appendChild(text);
    }
  }

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'idef0-diagram.svg';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function getDiagramBounds(blocks) {
  if (!blocks || blocks.length === 0) {
    return { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of blocks) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  const pad = 400;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function getEdgePoint(block, edge, offset, fx, fy, bounds) {
  if (!block) {
    if (edge === null || edge === undefined) {
      return { x: fx ?? 0, y: fy ?? 0 };
    }
    const off = offset || 0;
    switch (edge) {
      case 'top': return { x: off, y: bounds?.minY ?? 0 };
      case 'right': return { x: bounds?.maxX ?? 1000, y: off };
      case 'bottom': return { x: off, y: bounds?.maxY ?? 800 };
      case 'left': return { x: bounds?.minX ?? 0, y: off };
      default: return { x: off, y: off };
    }
  }
  const off = offset || 0;
  switch (edge) {
    case 'top':
      return { x: block.x + block.w / 2 + off, y: block.y };
    case 'right':
      return { x: block.x + block.w, y: block.y + block.h / 2 + off };
    case 'bottom':
      return { x: block.x + block.w / 2 + off, y: block.y + block.h };
    case 'left':
      return { x: block.x, y: block.y + block.h / 2 + off };
    default:
      return { x: block.x + block.w / 2, y: block.y + block.h / 2 };
  }
}

function getArrowPointsForSVG(arrow, blocks) {
  const bounds = getDiagramBounds(blocks);
  const points = [];
  const fromBlock = blocks.find((b) => b.id === arrow.from?.blockId);
  const toBlock = blocks.find((b) => b.id === arrow.to?.blockId);

  const fromPoint = getEdgePoint(fromBlock, arrow.from?.edge, arrow.from?.offset, arrow.from?.x, arrow.from?.y, bounds);
  const toPoint = getEdgePoint(toBlock, arrow.to?.edge, arrow.to?.offset, arrow.to?.x, arrow.to?.y, bounds);

  if (!fromPoint || !toPoint) return [];

  points.push(fromPoint);
  if (arrow.segments && arrow.segments.length) {
    points.push(...arrow.segments);
  }
  points.push(toPoint);
  return points;
}

export function exportToJSON(projectData, filename = 'idef0-project.json') {
  const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function importFromJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
