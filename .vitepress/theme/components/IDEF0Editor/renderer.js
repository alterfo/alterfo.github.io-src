import { COLORS, SIZES } from './constants';
import { getLabelSegment, getPreferredEdge, getMagneticGuides } from './manhattan';

/**
 * Simple direct arrow routing (no obstacles) - for use during drag with Shift key
 * Returns minimal orthogonal path without unnecessary bends
 */
function routeArrowDirect(fromPoint, toPoint, excludeBlock = null) {
  const dx = Math.abs(toPoint.x - fromPoint.x);
  const dy = Math.abs(toPoint.y - fromPoint.y);
  
  // If already aligned horizontally or vertically, use straight line
  if (dx < 2 || dy < 2) {
    return [fromPoint, toPoint];
  }
  
  // L-shaped path (one bend)
  return [fromPoint, { x: toPoint.x, y: fromPoint.y }, toPoint];
}

export class IDEF0Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.blocks = [];
    this.arrows = [];
    this.selectedBlockId = null;
    this.selectedArrowId = null;
    this.hoveredHandler = null;
    this.gridSize = SIZES.gridSize;
    this.errors = new Set();
    this.canvasWidth = 800;
    this.canvasHeight = 600;
  }

  resize(width, height) {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  setState(blocks, arrows, errors = []) {
    this.blocks = blocks || [];
    this.arrows = arrows || [];
    this.errors = new Set((errors || []).map((e) => e.id));
    this.canvasWidth = this.canvas.clientWidth;
    this.canvasHeight = this.canvas.clientHeight;
    this.render();
  }

  setViewport(x, y, scale) {
    this.offsetX = x;
    this.offsetY = y;
    this.scale = scale;
    this.render();
  }

  setSelection(blockId, arrowId) {
    this.selectedBlockId = blockId;
    this.selectedArrowId = arrowId;
    this.render();
  }

  render() {
    const { ctx, canvas } = this;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    this.drawGrid(width, height);
    this.drawArrows();
    this.drawBlocks();
    this.drawSelection();
    this.drawHandlers();

    ctx.restore();
  }

  drawGrid(width, height) {
    const { ctx, gridSize } = this;
    const w = width / this.scale;
    const h = height / this.scale;
    const startX = Math.floor(-this.offsetX / this.scale / gridSize) * gridSize;
    const startY = Math.floor(-this.offsetY / this.scale / gridSize) * gridSize;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1 / this.scale;

    for (let x = startX; x < startX + w + gridSize; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, startY + h + gridSize);
      ctx.stroke();
    }
    for (let y = startY; y < startY + h + gridSize; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(startX + w + gridSize, y);
      ctx.stroke();
    }
  }

  drawBlocks() {
    const { ctx } = this;
    for (const block of this.blocks) {
      const hasError = this.errors.has(block.id);
      ctx.fillStyle = COLORS.blockFill;
      ctx.strokeStyle = hasError ? COLORS.blockError : COLORS.blockStroke;
      ctx.lineWidth = hasError ? 3 : 2;

      ctx.fillRect(block.x, block.y, block.w, block.h);
      ctx.strokeRect(block.x, block.y, block.w, block.h);

      ctx.fillStyle = hasError ? COLORS.blockError : COLORS.text;
      const availableWidth = block.w - 16;
      const availableHeight = block.h - 16;
      const text = block.name || '';
      this.drawFittedText(ctx, text, block.x + block.w / 2, block.y + block.h / 2, availableWidth, availableHeight);
    }
  }

  drawFittedText(ctx, text, cx, cy, maxWidth, maxHeight) {
    let fontSize = SIZES.fontSize;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    while (fontSize >= SIZES.fontSizeMin) {
      ctx.font = `${fontSize}px sans-serif`;
      const lines = this.wrapText(ctx, text, maxWidth);
      const lineHeight = fontSize * 1.2;
      const totalHeight = lines.length * lineHeight;
      if (totalHeight <= maxHeight) {
        const startY = cy - totalHeight / 2 + lineHeight / 2;
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], cx, startY + i * lineHeight);
        }
        return;
      }
      fontSize -= 1;
    }

    ctx.font = `${SIZES.fontSizeMin}px sans-serif`;
    const ellipsis = this.truncateText(ctx, text, maxWidth);
    ctx.fillText(ellipsis, cx, cy);
  }

  wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let current = '';
    for (const word of words) {
      const test = current ? current + ' ' + word : word;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [text];
  }

  truncateText(ctx, text, maxWidth) {
    let width = ctx.measureText(text).width;
    if (width <= maxWidth) return text;
    const ellipsis = '..';
    while (text.length > 0) {
      text = text.slice(0, -1);
      width = ctx.measureText(text + ellipsis).width;
      if (width <= maxWidth) return text + ellipsis;
    }
    return '';
  }

  drawArrows() {
    const { ctx } = this;
    for (const arrow of this.arrows) {
      const hasError = this.errors.has(arrow.id);
      const color = hasError ? COLORS.blockError : (COLORS.arrow[arrow.type] || COLORS.arrow.input);
      const points = this.getArrowPoints(arrow);
      if (points.length < 2) continue;

      // 1. Draw orthogonal segments
      ctx.strokeStyle = color;
      ctx.lineWidth = hasError ? 3 : 2;
      if (hasError) {
        ctx.setLineDash([4, 4]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Draw arrowhead on last segment
      this.drawArrowhead(ctx, points[points.length - 2], points[points.length - 1], color);
      
      // 3. Draw fork/join markers (solid circles at junctions)
      this.drawForkJoinMarkers(ctx, points, color);
      
      // 4. Draw arrow label parallel to horizontal segment
      this.drawArrowLabel(ctx, arrow, points, color);
      
      // 5. Draw ICOM marker on canvas boundary
      this.drawBoundaryMarker(arrow, points[0], color);
      this.drawBoundaryMarker(arrow, points[points.length - 1], color, true);
    }
  }

  getArrowPoints(arrow) {
    const points = [];
    const fromBlock = this.blocks.find((b) => b.id === arrow.from?.blockId);
    const toBlock = this.blocks.find((b) => b.id === arrow.to?.blockId);

    const fromIsFloating = arrow.from?.blockId === null && arrow.from?.edge === null;
    const toIsFloating = arrow.to?.blockId === null && arrow.to?.edge === null;

    const fromOffset = fromIsFloating ? { x: arrow.from?.x ?? 0, y: arrow.from?.y ?? 0 } : arrow.from?.offset;
    const toOffset = toIsFloating ? { x: arrow.to?.x ?? 0, y: arrow.to?.y ?? 0 } : arrow.to?.offset;

    const fromPoint = this.getEdgePoint(fromBlock, arrow.from?.edge, fromOffset, arrow.from?.blockId === null);
    const toPoint = this.getEdgePoint(toBlock, arrow.to?.edge, toOffset, arrow.to?.blockId === null);

    if (!fromPoint || !toPoint) return [];

    points.push(fromPoint);
    if (arrow.segments && arrow.segments.length) {
      points.push(...arrow.segments);
    }
    points.push(toPoint);
    return points;
  }

  getEdgePoint(block, edge, offset, isCanvasEdge) {
    if (!block || isCanvasEdge) {
      if (edge === null || edge === undefined) {
        // floating endpoint
        return { x: offset?.x ?? 0, y: offset?.y ?? 0 };
      }
      // Canvas edge: offset is absolute position on the edge
      // Use diagram bounds instead of viewport size
      const bounds = this.getDiagramBounds();
      switch (edge) {
        case 'top':
          return { x: offset ?? 0, y: bounds.minY };
        case 'bottom':
          return { x: offset ?? 0, y: bounds.maxY };
        case 'left':
          return { x: bounds.minX, y: offset ?? 0 };
        case 'right':
          return { x: bounds.maxX, y: offset ?? 0 };
        default:
          return { x: offset ?? 0, y: offset ?? 0 };
      }
    }
    // Use offset along the edge
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

  getDiagramBounds() {
    if (!this.blocks || this.blocks.length === 0) {
      return { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of this.blocks) {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    const pad = SIZES.diagramBoundsPadding;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  drawArrowhead(ctx, from, to, color) {
    const headLen = 10;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);
    
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    
    ctx.lineJoin = 'miter';
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - headLen * Math.cos(angle - Math.PI / 6),
      to.y - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      to.x - headLen * Math.cos(angle + Math.PI / 6),
      to.y - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  drawForkJoinMarkers(ctx, points, color) {
    // Draw solid circles at junction points (T-junctions)
    const markerRadius = 3;
    
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      
      // Check if this is a T-junction (one horizontal, one vertical segment)
      const prevHorizontal = Math.abs(prev.y - curr.y) < 1;
      const nextHorizontal = Math.abs(curr.y - next.y) < 1;
      
      if (prevHorizontal !== nextHorizontal) {
        // This is a junction point - draw marker
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(curr.x, curr.y, markerRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawArrowLabel(ctx, arrow, points, color) {
    if (!arrow.name) return;
    
    const fontSize = SIZES.arrowLabelFontSize;
    ctx.font = `${fontSize}px sans-serif`;
    const textWidth = ctx.measureText(arrow.name).width;
    const textHeight = fontSize;
    
    let mx, my, angle, isHorizontal;

    if (arrow.labelX != null && arrow.labelY != null) {
      mx = arrow.labelX;
      my = arrow.labelY;
      angle = (arrow.labelAngle || 0) * Math.PI / 180;
      isHorizontal = Math.abs(Math.cos(angle)) > 0.707;
    } else {
      const seg = getLabelSegment(points);
      if (!seg) return;
      mx = seg.x;
      my = seg.y;
      isHorizontal = seg.isHorizontal;
      if (isHorizontal) {
        angle = 0;
        my -= 5;
      } else {
        angle = -Math.PI / 2;
        mx -= 5;
      }
    }
    
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(angle);

    // Background
    const padding = 3;
    ctx.fillStyle = COLORS.textBg;
    ctx.fillRect(-textWidth / 2 - padding, -textHeight / 2 - padding, textWidth + padding * 2, textHeight + padding * 2);

    // Text
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(arrow.name, 0, 0);

    ctx.restore();

    // Draw label handle if arrow selected
    if (this.selectedArrowId === arrow.id) {
      ctx.fillStyle = COLORS.handler;
      const hs = SIZES.labelHandleSize / this.scale;
      ctx.fillRect(mx - hs / 2, my - hs / 2, hs, hs);
    }
  }

  drawBoundaryMarker(arrow, point, color, isTarget = false) {
    // Check if this point is on diagram boundary
    const bounds = this.getDiagramBounds();
    const onBoundary = 
      Math.abs(point.x - bounds.minX) < 2 || Math.abs(point.x - bounds.maxX) < 2 ||
      Math.abs(point.y - bounds.minY) < 2 || Math.abs(point.y - bounds.maxY) < 2;
    
    if (!onBoundary) return;
    
    // Don't draw marker if it connects to a block
    if ((isTarget && arrow.to.blockId) || (!isTarget && arrow.from.blockId)) return;
    
    // Draw ICOM type marker
    const marker = this.getICOMMarker(arrow.type, isTarget);
    if (!marker) return;
    
    const fontSize = 10;
    const padding = 4;
    
    this.ctx.font = `bold ${fontSize}px sans-serif`;
    const textWidth = this.ctx.measureText(marker).width;
    const boxW = textWidth + padding * 2;
    const boxH = fontSize + padding * 2;
    
    // Position box near the boundary point
    let bx = point.x;
    let by = point.y;
    
    if (point.x <= bounds.minX + 1) {
      bx = point.x + 2;
    } else if (point.x >= bounds.maxX - 1) {
      bx = point.x - boxW - 2;
    } else if (point.y <= bounds.minY + 1) {
      by = point.y + 2;
    } else {
      by = point.y - boxH - 2;
    }
    
    // Draw box
    this.ctx.fillStyle = color;
    this.ctx.fillRect(bx, by, boxW, boxH);
    
    // Draw text
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(marker, bx + boxW / 2, by + boxH / 2);
  }

  getICOMMarker(type, isTarget) {
    // Per IDEF0 FIPS 183:
    // - Show ICOM markers on boundary arrows
    // - CALL arrows use 'C' marker but are distinguished by downward direction
    switch (type) {
      case 'input':
        return isTarget ? 'I' : '';
      case 'output':
        return isTarget ? 'O' : '';
      case 'control':
        return isTarget ? 'C' : '';
      case 'mechanism':
        return isTarget ? 'M' : '';
      case 'call':
        // CALL arrows use 'C' marker but should point DOWN (away from box)
        // This distinguishes them from CONTROL arrows which point UP/into box
        return isTarget ? 'C' : '';
      default:
        return '';
    }
  }

  drawSelection() {
    const { ctx } = this;
    if (this.selectedBlockId) {
      const block = this.blocks.find((b) => b.id === this.selectedBlockId);
      if (block) {
        ctx.strokeStyle = COLORS.selection;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(block.x - 2, block.y - 2, block.w + 4, block.h + 4);
        ctx.setLineDash([]);
      }
    }
    if (this.selectedArrowId) {
      const arrow = this.arrows.find((a) => a.id === this.selectedArrowId);
      if (arrow) {
        const points = this.getArrowPoints(arrow);
        ctx.strokeStyle = COLORS.selection;
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw arrow-end handles for block-attached ends
        this.drawArrowEndHandle(ctx, arrow.from, points[0]);
        this.drawArrowEndHandle(ctx, arrow.to, points[points.length - 1]);
      }
    }
  }

  drawArrowEndHandle(ctx, endpoint, point) {
    if (!endpoint) return;
    // Показываем handle для всех концов стрелок
    const hs = SIZES.arrowEndHandleSize / this.scale;
    ctx.fillStyle = COLORS.handler;
    ctx.fillRect(point.x - hs / 2, point.y - hs / 2, hs, hs);
  }

  drawHandlers() {
    const { ctx } = this;
    if (this.selectedBlockId) {
      const block = this.blocks.find((b) => b.id === this.selectedBlockId);
      if (block) {
        const s = SIZES.handlerSize / this.scale;
        const hs = s / 2;
        const corners = [
          { x: block.x - hs, y: block.y - hs },
          { x: block.x + block.w - hs, y: block.y - hs },
          { x: block.x + block.w - hs, y: block.y + block.h - hs },
          { x: block.x - hs, y: block.y + block.h - hs },
        ];
        ctx.fillStyle = COLORS.handler;
        for (const c of corners) {
          ctx.fillRect(c.x, c.y, s, s);
        }
      }
    }
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.offsetX) / this.scale,
      y: (sy - this.offsetY) / this.scale,
    };
  }

  worldToScreen(wx, wy) {
    return {
      x: wx * this.scale + this.offsetX,
      y: wy * this.scale + this.offsetY,
    };
  }

  hitTestBlock(sx, sy) {
    const pos = this.screenToWorld(sx, sy);
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      if (pos.x >= b.x && pos.x <= b.x + b.w && pos.y >= b.y && pos.y <= b.y + b.h) {
        return b;
      }
    }
    return null;
  }

  hitTestHandler(sx, sy) {
    if (!this.selectedBlockId) return null;
    const block = this.blocks.find((b) => b.id === this.selectedBlockId);
    if (!block) return null;
    const pos = this.screenToWorld(sx, sy);
    const threshold = SIZES.handlerSize / this.scale;
    const corners = [
      { x: block.x, y: block.y, cursor: 'nwse-resize', dx: -1, dy: -1 },
      { x: block.x + block.w, y: block.y, cursor: 'nesw-resize', dx: 1, dy: -1 },
      { x: block.x + block.w, y: block.y + block.h, cursor: 'nwse-resize', dx: 1, dy: 1 },
      { x: block.x, y: block.y + block.h, cursor: 'nesw-resize', dx: -1, dy: 1 },
    ];
    for (const c of corners) {
      if (Math.abs(pos.x - c.x) <= threshold && Math.abs(pos.y - c.y) <= threshold) {
        return c;
      }
    }
    return null;
  }

  hitTestArrow(sx, sy) {
    const pos = this.screenToWorld(sx, sy);
    const threshold = 6 / this.scale;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i];
      const points = this.getArrowPoints(arrow);
      if (points.length < 2) continue;
      for (let j = 0; j < points.length - 1; j++) {
        const dist = this.pointToSegmentDistance(pos, points[j], points[j + 1]);
        if (dist <= threshold) return arrow;
      }
    }
    return null;
  }

  hitTestLabel(sx, sy) {
    const pos = this.screenToWorld(sx, sy);
    const threshold = 8 / this.scale;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i];
      if (!arrow.name) continue;
      let mx, my;
      if (arrow.labelX != null && arrow.labelY != null) {
        mx = arrow.labelX;
        my = arrow.labelY;
      } else {
        const points = this.getArrowPoints(arrow);
        const seg = getLabelSegment(points);
        if (!seg) continue;
        mx = seg.x;
        my = seg.y;
      }
      if (Math.abs(pos.x - mx) <= threshold && Math.abs(pos.y - my) <= threshold) {
        return arrow;
      }
    }
    return null;
  }

  hitTestArrowEnd(sx, sy) {
    const pos = this.screenToWorld(sx, sy);
    const threshold = 12 / this.scale; // Больше порог для удобства
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i];
      const points = this.getArrowPoints(arrow);
      if (points.length < 1) continue;
      const ends = [
        { end: 'from', point: points[0], endpoint: arrow.from },
        { end: 'to', point: points[points.length - 1], endpoint: arrow.to },
      ];
      for (const e of ends) {
        if (!e.endpoint) continue;
        // Проверяем все концы - и привязанные к блокам, и на границе
        if (Math.abs(pos.x - e.point.x) <= threshold && Math.abs(pos.y - e.point.y) <= threshold) {
          return { arrow, end: e.end };
        }
      }
    }
    return null;
  }

  pointToSegmentDistance(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    return Math.hypot(p.x - projX, p.y - projY);
  }

  /**
   * Draw snap preview when dragging arrow endpoint.
   */
  drawSnapPreview(snapInfo, startPos, color = COLORS.selection) {
    if (!snapInfo || !snapInfo.preview) return;

    const { ctx } = this;
    const preview = snapInfo.preview;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    // Draw magnetic line from start to snap target
    ctx.beginPath();
    ctx.moveTo(startPos.x, startPos.y);
    ctx.lineTo(snapInfo.target.x, snapInfo.target.y);
    ctx.stroke();

    if (snapInfo.mode === 'block-edge' || snapInfo.mode === 'block-center') {
      // Highlight target block
      const { block } = preview;
      ctx.fillStyle = 'rgba(52, 152, 219, 0.1)';
      ctx.fillRect(block.x, block.y, block.w, block.h);
      
      ctx.strokeStyle = preview.isPreferred ? '#2ecc71' : color;
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(block.x, block.y, block.w, block.h);

      // Highlight target edge
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.beginPath();
      switch (preview.edge) {
        case 'top':
          ctx.moveTo(block.x, block.y);
          ctx.lineTo(block.x + block.w, block.y);
          break;
        case 'bottom':
          ctx.moveTo(block.x, block.y + block.h);
          ctx.lineTo(block.x + block.w, block.y + block.h);
          break;
        case 'left':
          ctx.moveTo(block.x, block.y);
          ctx.lineTo(block.x, block.y + block.h);
          break;
        case 'right':
          ctx.moveTo(block.x + block.w, block.y);
          ctx.lineTo(block.x + block.w, block.y + block.h);
          break;
      }
      ctx.stroke();

      // Draw snap indicator at edge center
      const center = this.getBlockEdgeCenter(block, preview.edge);
      ctx.fillStyle = preview.isPreferred ? '#2ecc71' : '#f39c12';
      ctx.beginPath();
      ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Show ICOM marker if applicable
      if (preview.isPreferred) {
        const marker = this.getICOMMarkerForEdge(preview.edge);
        if (marker) {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(marker, center.x, center.y);
        }
      }
    } else if (snapInfo.mode === 'boundary') {
      // Highlight boundary edge
      const bounds = this.getDiagramBounds();
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.beginPath();
      switch (preview.edge) {
        case 'top':
          ctx.moveTo(bounds.minX, bounds.minY);
          ctx.lineTo(bounds.maxX, bounds.minY);
          break;
        case 'bottom':
          ctx.moveTo(bounds.minX, bounds.maxY);
          ctx.lineTo(bounds.maxX, bounds.maxY);
          break;
        case 'left':
          ctx.moveTo(bounds.minX, bounds.minY);
          ctx.lineTo(bounds.minX, bounds.maxY);
          break;
        case 'right':
          ctx.moveTo(bounds.maxX, bounds.minY);
          ctx.lineTo(bounds.maxX, bounds.maxY);
          break;
      }
      ctx.stroke();

      // Draw snap indicator on boundary
      const point = this.getBoundaryEdgeCenter(preview.edge, bounds);
      ctx.fillStyle = '#f39c12';
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw snap target point
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(snapInfo.target.x, snapInfo.target.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(snapInfo.target.x, snapInfo.target.y, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Get center point of a block edge.
   */
  getBlockEdgeCenter(block, edge) {
    switch (edge) {
      case 'top':
        return { x: block.x + block.w / 2, y: block.y };
      case 'bottom':
        return { x: block.x + block.w / 2, y: block.y + block.h };
      case 'left':
        return { x: block.x, y: block.y + block.h / 2 };
      case 'right':
        return { x: block.x + block.w, y: block.y + block.h / 2 };
      default:
        return { x: block.x + block.w / 2, y: block.y + block.h / 2 };
    }
  }

  /**
   * Get center point of diagram boundary edge.
   */
  getBoundaryEdgeCenter(edge, bounds) {
    switch (edge) {
      case 'top':
        return { x: (bounds.minX + bounds.maxX) / 2, y: bounds.minY };
      case 'bottom':
        return { x: (bounds.minX + bounds.maxX) / 2, y: bounds.maxY };
      case 'left':
        return { x: bounds.minX, y: (bounds.minY + bounds.maxY) / 2 };
      case 'right':
        return { x: bounds.maxX, y: (bounds.minY + bounds.maxY) / 2 };
      default:
        return { x: bounds.minX, y: bounds.minY };
    }
  }

  /**
   * Get ICOM marker for edge type.
   */
  getICOMMarkerForEdge(edge) {
    switch (edge) {
      case 'top': return 'C';
      case 'bottom': return 'M';
      case 'left': return 'I';
      case 'right': return 'O';
      default: return '';
    }
  }

  /**
   * Draw magnetic guide lines for alignment.
   */
  drawMagneticGuides(guides) {
    if (!guides || guides.length === 0) return;

    const { ctx, canvasWidth, canvasHeight } = this;
    
    ctx.save();
    ctx.strokeStyle = 'rgba(243, 156, 18, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);

    for (const guide of guides) {
      if (guide.type === 'vertical') {
        ctx.beginPath();
        ctx.moveTo(guide.value, 0);
        ctx.lineTo(guide.value, canvasHeight);
        ctx.stroke();
      } else if (guide.type === 'horizontal') {
        ctx.beginPath();
        ctx.moveTo(0, guide.value);
        ctx.lineTo(canvasWidth, guide.value);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /**
   * Validate arrow direction per IDEF0 FIPS 183.
   * Checks if arrow direction matches its type:
   * - CONTROL: points DOWN into box (top side)
   * - INPUT: points RIGHT into box (left side)
   * - OUTPUT: points RIGHT out of box (right side)
   * - MECHANISM: points UP into box (bottom side)
   * - CALL: points DOWN out of box (bottom side)
   * @param {Object} arrow - Arrow to validate
   * @returns {Object|null} { valid: boolean, error?: string }
   */
  validateArrowDirection(arrow) {
    if (!arrow || !arrow.from || !arrow.to) return { valid: true };
    
    const points = this.getArrowPoints(arrow);
    if (points.length < 2) return { valid: true };
    
    // Get arrow direction at the head (end)
    const from = points[points.length - 2];
    const to = points[points.length - 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    
    // Determine which side of target box the arrow connects to
    const toBlock = this.blocks.find(b => b.id === arrow.to.blockId);
    
    if (toBlock) {
      // Arrow connects to a block - check entry direction
      const topDist = Math.abs(to.y - toBlock.y);
      const bottomDist = Math.abs(to.y - (toBlock.y + toBlock.h));
      const leftDist = Math.abs(to.x - toBlock.x);
      const rightDist = Math.abs(to.x - (toBlock.x + toBlock.w));
      
      // Find closest edge
      let closestEdge = 'left';
      let minDist = leftDist;
      if (topDist < minDist) { closestEdge = 'top'; minDist = topDist; }
      if (rightDist < minDist) { closestEdge = 'right'; minDist = rightDist; }
      if (bottomDist < minDist) { closestEdge = 'bottom'; minDist = bottomDist; }
      
      // Validate based on arrow type
      switch (arrow.type) {
        case 'control':
          // CONTROL must enter from top, pointing DOWN (dy > 0)
          if (closestEdge !== 'top') {
            return { valid: false, error: `CONTROL arrow must connect to top side, found ${closestEdge}` };
          }
          if (dy < 0) {
            return { valid: false, error: 'CONTROL arrow must point DOWN into box' };
          }
          break;
          
        case 'input':
          // INPUT must enter from left, pointing RIGHT (dx > 0)
          if (closestEdge !== 'left') {
            return { valid: false, error: `INPUT arrow must connect to left side, found ${closestEdge}` };
          }
          if (dx < 0) {
            return { valid: false, error: 'INPUT arrow must point RIGHT into box' };
          }
          break;
          
        case 'output':
          // OUTPUT must exit from right, pointing RIGHT (dx > 0)
          if (closestEdge !== 'right') {
            return { valid: false, error: `OUTPUT arrow must connect to right side, found ${closestEdge}` };
          }
          if (dx < 0) {
            return { valid: false, error: 'OUTPUT arrow must point RIGHT out of box' };
          }
          break;
          
        case 'mechanism':
          // MECHANISM must enter from bottom, pointing UP (dy < 0)
          if (closestEdge !== 'bottom') {
            return { valid: false, error: `MECHANISM arrow must connect to bottom side, found ${closestEdge}` };
          }
          if (dy > 0) {
            return { valid: false, error: 'MECHANISM arrow must point UP into box' };
          }
          break;
          
        case 'call':
          // CALL must exit from bottom, pointing DOWN (dy > 0)
          if (closestEdge !== 'bottom') {
            return { valid: false, error: `CALL arrow must connect to bottom side, found ${closestEdge}` };
          }
          if (dy < 0) {
            return { valid: false, error: 'CALL arrow must point DOWN out of box' };
          }
          break;
      }
    }
    
    return { valid: true };
  }

  /**
   * Recalculate arrow path during drag (direct route without obstacles).
   * Use this when dragging with Shift key for smooth movement without bends.
   * @param {Object} arrow - Arrow to recalculate
   * @param {string} draggingEnd - 'from' or 'to'
   * @param {Object} newPos - New world position of dragged endpoint
   * @param {boolean} directMode - If true, use direct L-shaped route (Shift key)
   * @returns {Array} New segments array
   */
  recalculateArrow(arrow, draggingEnd, newPos, directMode = false) {
    const fromBlock = this.blocks.find(b => b.id === arrow.from?.blockId);
    const toBlock = this.blocks.find(b => b.id === arrow.to?.blockId);
    
    // Get current endpoint points
    const fromPortType = arrow.from?.portType || 'INPUT';
    const toPortType = arrow.to?.portType || 'OUTPUT';
    
    let fromPoint, toPoint;
    
    // Calculate from point
    if (arrow.from?.blockId && fromBlock) {
      fromPoint = this.getEdgePoint(fromBlock, arrow.from.edge, arrow.from.offset, false);
    } else if (arrow.from?.edge === null) {
      // Floating endpoint
      fromPoint = { x: arrow.from.x, y: arrow.from.y };
    } else {
      // Boundary endpoint
      fromPoint = this.getEdgePoint(null, arrow.from.edge, arrow.from.offset, true);
    }
    
    // Calculate to point
    if (arrow.to?.blockId && toBlock) {
      toPoint = this.getEdgePoint(toBlock, arrow.to.edge, arrow.to.offset, false);
    } else if (arrow.to?.edge === null) {
      // Floating endpoint
      toPoint = { x: arrow.to.x, y: arrow.to.y };
    } else {
      // Boundary endpoint
      toPoint = this.getEdgePoint(null, arrow.to.edge, arrow.to.offset, true);
    }
    
    // Update dragged endpoint
    if (draggingEnd === 'from' && (!arrow.from?.blockId || arrow.from?.edge === null)) {
      fromPoint = newPos;
    } else if (draggingEnd === 'to' && (!arrow.to?.blockId || arrow.to?.edge === null)) {
      toPoint = newPos;
    }
    
    // Route the arrow
    let segments;
    if (directMode) {
      // Direct L-shaped route without obstacles
      segments = routeArrowDirect(fromPoint, toPoint);
    } else {
      // Use full orthogonal routing (would need to import routeArrow from manhattan)
      // For now, use simple L-shaped as fallback
      segments = routeArrowDirect(fromPoint, toPoint);
    }
    
    // Remove endpoints from segments (they are added by getArrowPoints)
    if (segments.length > 2) {
      return segments.slice(1, segments.length - 1);
    }
    return [];
  }
}
