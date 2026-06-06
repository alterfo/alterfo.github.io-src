import { COLORS, SIZES } from './constants';

export class Minimap {
  constructor(container) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'idef0-minimap';
    this.canvas.width = SIZES.minimapSize;
    this.canvas.height = SIZES.minimapSize;
    this.ctx = this.canvas.getContext('2d');
    container.appendChild(this.canvas);

    this.visible = true;
    this.worldBounds = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
    this.viewport = { x: 0, y: 0, w: 800, h: 600 };
  }

  destroy() {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }

  setWorldBounds(blocks) {
    if (!blocks || blocks.length === 0) {
      this.worldBounds = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of blocks) {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    const pad = SIZES.diagramBoundsPadding;
    this.worldBounds = {
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
    };
  }

  setViewport(x, y, w, h) {
    this.viewport = { x, y, w, h };
  }

  render(blocks, arrows) {
    if (!this.visible) return;
    const { ctx, canvas } = this;
    const size = SIZES.minimapSize;
    ctx.clearRect(0, 0, size, size);

    const bounds = this.worldBounds;
    const bw = bounds.maxX - bounds.minX || 1;
    const bh = bounds.maxY - bounds.minY || 1;
    const scale = Math.min(size / bw, size / bh);
    const offX = (size - bw * scale) / 2;
    const offY = (size - bh * scale) / 2;

    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);
    ctx.translate(-bounds.minX, -bounds.minY);

    // Blocks
    for (const b of blocks || []) {
      ctx.fillStyle = COLORS.blockFill;
      ctx.strokeStyle = COLORS.blockStroke;
      ctx.lineWidth = 2 / scale;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }

    // Arrows
    for (const a of arrows || []) {
      const color = COLORS.arrow[a.type] || COLORS.arrow.input;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 / scale;
      const points = this.getArrowPoints(a, blocks, bounds);
      if (points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
      }
    }

    ctx.restore();

    // Viewport rect
    const vx = offX + (this.viewport.x - bounds.minX) * scale;
    const vy = offY + (this.viewport.y - bounds.minY) * scale;
    const vw = this.viewport.w * scale;
    const vh = this.viewport.h * scale;
    ctx.fillStyle = COLORS.minimapViewport;
    ctx.strokeStyle = COLORS.selection;
    ctx.lineWidth = 1;
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeRect(vx, vy, vw, vh);
  }

  getArrowPoints(arrow, blocks, bounds) {
    const points = [];
    const fromBlock = blocks.find((b) => b.id === arrow.from?.blockId);
    const toBlock = blocks.find((b) => b.id === arrow.to?.blockId);

    const fromPoint = this.getEdgePoint(fromBlock, arrow.from?.edge, arrow.from?.offset, arrow.from?.x, arrow.from?.y, bounds);
    const toPoint = this.getEdgePoint(toBlock, arrow.to?.edge, arrow.to?.offset, arrow.to?.x, arrow.to?.y, bounds);

    if (!fromPoint || !toPoint) return [];

    points.push(fromPoint);
    if (arrow.segments && arrow.segments.length) {
      points.push(...arrow.segments);
    }
    points.push(toPoint);
    return points;
  }

  getEdgePoint(block, edge, offset, fx, fy, bounds) {
    if (!block) {
      if (edge === null || edge === undefined) {
        // floating endpoint
        return { x: fx ?? 0, y: fy ?? 0 };
      }
      const off = offset || 0;
      switch (edge) {
        case 'top': return { x: off, y: bounds.minY };
        case 'right': return { x: bounds.maxX, y: off };
        case 'bottom': return { x: off, y: bounds.maxY };
        case 'left': return { x: bounds.minX, y: off };
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
}
