<template>
  <div class="idef0-editor">
    <canvas
      ref="canvas"
      class="idef0-canvas"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @wheel="onWheel"
      @dblclick="onDoubleClick"
    />

    <div v-if="editing" class="idef0-inline-editor" :style="editorStyle">
      <input
        ref="editorInput"
        v-model="editing.text"
        @blur="finishEdit"
        @keydown.enter="finishEdit"
        @keydown.esc="cancelEdit"
      />
    </div>

    <div class="idef0-toolbar">
      <button @click="addBlock" title="Добавить блок">+ Блок</button>
      <span class="idef0-separator" />
      <button v-if="canGoBack" @click="goBack">← Назад</button>
      <button v-if="selectedBlock && selectedBlock.diagramId" @click="enterBlock">↳ Войти</button>
      <button v-if="selectedBlock && !selectedBlock.diagramId" @click="createNestedDiagram">+ Вложить</button>
      <span class="idef0-separator" />
      <button @click="exportPNG">PNG</button>
      <button @click="exportSVG">SVG</button>
      <button @click="exportJSON">JSON</button>
      <span class="idef0-separator" />
      <span class="idef0-breadcrumb">
        <span v-for="(crumb, idx) in breadcrumb" :key="crumb.id" class="idef0-crumb"
          :class="{ 'idef0-crumb-active': crumb.id === currentDiagramId }"
          @click="navigateToDiagram(crumb.id)">
          {{ crumb.name }}
          <span v-if="idx < breadcrumb.length - 1">›</span>
        </span>
      </span>
      <span class="idef0-zoom">{{ Math.round(scale * 100) }}%</span>
    </div>

    <div v-if="errors.length" class="idef0-status-bar idef0-status-error">
      Ошибки: {{ errors.map(e => e.message).join('; ') }}
    </div>
  </div>
</template>

<script>
import { COLORS, SIZES, DEFAULT_DIAGRAM } from './IDEF0Editor/constants';
import { loadProject, saveProject, onExternalChange } from './IDEF0Editor/db';
import { validateDiagram } from './IDEF0Editor/validation';
import { exportToPNG, exportToSVG, exportToJSON } from './IDEF0Editor/exporter';
import { getDiagramIdFromQuery, setDiagramIdInQuery } from './IDEF0Editor/router';
import { generateChildDiagramId, getParentDiagramId } from './IDEF0Editor/hierarchy';

export default {
  name: 'IDEF0Editor',
  props: {
    projectId: { type: String, default: 'project-1' }
  },
  data() {
    return {
      diagrams: {},
      currentDiagramId: 'A0',
      canvas: null,
      ctx: null,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      blocks: [],
      arrows: [],
      selectedBlockId: null,
      selectedArrowId: null,
      errors: [],
      editing: null,
      isPanning: false,
      lastX: 0,
      lastY: 0,
      dragBlock: null,
      dragOffsetX: 0,
      dragOffsetY: 0,
      dragArrowEnd: null,
    };
  },
  computed: {
    currentDiagram() {
      return this.diagrams[this.currentDiagramId] || null;
    },
    canGoBack() {
      const parentId = getParentDiagramId(this.currentDiagramId);
      return !!(parentId && this.diagrams[parentId]);
    },
    selectedBlock() {
      return this.blocks.find(b => b.id === this.selectedBlockId) || null;
    },
    breadcrumb() {
      const path = [];
      let current = this.currentDiagramId;
      while (current) {
        const d = this.diagrams[current];
        if (!d) break;
        path.unshift({ id: current, name: d.name || current });
        current = d.parentDiagramId;
      }
      return path;
    },
    editorStyle() {
      if (!this.editing) return {};
      return {
        left: this.worldToScreen(this.editing.x).x + 'px',
        top: this.worldToScreen(this.editing.y).y + 'px',
        width: (this.editing.w * this.scale) + 'px',
        height: (this.editing.h * this.scale) + 'px',
      };
    },
  },
  async mounted() {
    this.canvas = this.$refs.canvas;
    
    this.ctx = this.canvas.getContext('2d');
    this.handleResize();
    
    const saved = await loadProject(this.projectId);
    if (saved && saved.diagrams) {
      this.diagrams = saved.diagrams;
    } else {
      this.initDefaultDiagram();
    }
      
    const qId = getDiagramIdFromQuery();
    if (qId && this.diagrams[qId]) {
      this.currentDiagramId = qId;
    }
    
    this.loadDiagram();
    this.render();
    
    onExternalChange(this.projectId, () => this.loadDiagram());
    
    window.addEventListener('resize', () => this.handleResize());
    
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !this.editing) {
        if (this.selectedBlockId) this.deleteSelectedBlock();
        if (this.selectedArrowId) this.deleteSelectedArrow();
      }
      if (e.key === ' ' && !this.editing) {
        e.preventDefault();
        this.isPanning = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') this.isPanning = false;
    });
  },
  methods: {
    handleResize() {
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(rect.width, 800);
      const h = Math.max(rect.height, 600);
      this.canvas.width = w * window.devicePixelRatio;
      this.canvas.height = h * window.devicePixelRatio;
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      if (this.ctx) {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
      this.render();
    },
    initDefaultDiagram() {
      const block = {
        id: 'block-1',
        name: 'Контекстная функция',
        x: 350, y: 250, w: 180, h: 100,
        diagramId: null,
      };
      
      const bounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
      
      // Create default arrows pointing to/from block center
      const arrows = [
        {
          id: `arrow-${Date.now()}`, name: '', type: 'input',
          from: { blockId: null, edge: 'left', offset: block.y + block.h/2 },
          to: { blockId: block.id, edge: 'left', offset: 0 },
          segments: [],
        },
        {
          id: `arrow-${Date.now()}`, name: '', type: 'control',
          from: { blockId: null, edge: 'top', offset: block.x + block.w/2 },
          to: { blockId: block.id, edge: 'top', offset: 0 },
          segments: [],
        },
        {
          id: `arrow-${Date.now()}`, name: '', type: 'output',
          from: { blockId: block.id, edge: 'right', offset: 0 },
          to: { blockId: null, edge: 'right', offset: block.y + block.h/2 },
          segments: [],
        },
        {
          id: `arrow-${Date.now()}`, name: '', type: 'mechanism',
          from: { blockId: null, edge: 'bottom', offset: block.x + block.w/2 },
          to: { blockId: block.id, edge: 'bottom', offset: 0 },
          segments: [],
        },
      ];

      this.$set(this.diagrams, 'A0', {
        ...DEFAULT_DIAGRAM,
        id: 'A0',
        name: 'Контекстная диаграмма',
        blocks: [block],
        arrows,
        view: { x: 50, y: 50, scale: 1 },
      });
    },

    loadDiagram() {
      const d = this.currentDiagram;
      if (!d) return;
      this.blocks = d.blocks || [];
      this.arrows = d.arrows || [];
      if (d.view) {
        this.offsetX = d.view.x;
        this.offsetY = d.view.y;
        this.scale = d.view.scale;
      }
      this.errors = validateDiagram(d);
      this.render();
    },

    saveDiagram() {
      const d = this.currentDiagram;
      if (d) {
        d.view = { x: this.offsetX, y: this.offsetY, scale: this.scale };
      }
      saveProject(this.projectId, { diagrams: this.diagrams });
    },

    // --- Rendering ---

    render() {
      if (!this.ctx || !this.canvas) return;
      const { ctx, canvas, scale, offsetX, offsetY } = this;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      this.drawGrid(w, h);
      this.drawArrows();
      this.drawBlocks();
      this.drawSelection();

      ctx.restore();
    },

    drawGrid(w, h) {
      const { ctx, scale, offsetX, offsetY } = this;
      const gs = SIZES.gridSize || 20;
      const startX = Math.floor(-offsetX / scale / gs) * gs;
      const startY = Math.floor(-offsetY / scale / gs) * gs;
      ctx.strokeStyle = COLORS.grid || '#ddd';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = startX; x < startX + w / scale + gs; x += gs) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, startY + h / scale + gs);
      }
      for (let y = startY; y < startY + h / scale + gs; y += gs) {
        ctx.moveTo(startX, y);
        ctx.lineTo(startX + w / scale + gs, y);
      }
      ctx.stroke();
    },

    drawBlocks() {
      const { ctx } = this;
      for (const b of this.blocks) {
        ctx.fillStyle = COLORS.blockFill;
        ctx.strokeStyle = COLORS.blockStroke;
        ctx.lineWidth = 2;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeRect(b.x, b.y, b.w, b.h);

        ctx.fillStyle = COLORS.text;
        ctx.font = `${SIZES.fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const maxW = b.w - 16, maxH = b.h - 16;
        let text = b.name || '';
        let fs = SIZES.fontSize;
        while (fs >= SIZES.fontSizeMin) {
          ctx.font = `${fs}px sans-serif`;
          const lines = this.wrapText(ctx, text, maxW);
          const lh = fs * 1.2, th = lines.length * lh;
          if (th <= maxH) {
            const sy = b.y + b.h / 2 - th / 2 + lh / 2;
            lines.forEach((l, i) => ctx.fillText(l, b.x + b.w / 2, sy + i * lh));
            return;
          }
          fs--;
        }
        ctx.font = `${SIZES.fontSizeMin}px sans-serif`;
        ctx.fillText(this.truncateText(ctx, text, maxW), b.x + b.w / 2, b.y + b.h / 2);
      }
    },

    wrapText(ctx, text, maxW) {
      const words = text.split(/\s+/), lines = [];
      let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (ctx.measureText(t).width <= maxW) cur = t;
        else { if (cur) lines.push(cur); cur = w; }
      }
      return cur ? [...lines, cur] : [text];
    },

    truncateText(ctx, text, maxW) {
      let w = ctx.measureText(text).width;
      if (w <= maxW) return text;
      let result = text;
      while (result.length > 0) {
        result = result.slice(0, -1);
        if (ctx.measureText(result + '..').width <= maxW) return result + '..';
      }
      return '';
    },

    drawArrows() {
      const { ctx } = this;
      for (const a of this.arrows) {
        const pts = this.getArrowPoints(a);
        if (pts.length < 2) continue;
        const col = COLORS.arrow[a.type] || COLORS.arrow.input;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        const n = pts.length - 1;
        const dx = pts[n].x - pts[n-1].x, dy = pts[n].y - pts[n-1].y;
        const ang = Math.atan2(dy, dx);
        const hl = 10;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(pts[n].x, pts[n].y);
        ctx.lineTo(pts[n].x - hl * Math.cos(ang - Math.PI/6), pts[n].y - hl * Math.sin(ang - Math.PI/6));
        ctx.lineTo(pts[n].x - hl * Math.cos(ang + Math.PI/6), pts[n].y - hl * Math.sin(ang + Math.PI/6));
        ctx.closePath();
        ctx.fill();

        if (a.name) this.drawArrowLabel(a, pts, col);
        this.drawBoundaryMarker(a, pts[0], col, false);
        this.drawBoundaryMarker(a, pts[pts.length-1], col, true);
      }
    },

    getArrowPoints(arrow) {
      const pts = [];
      const fromB = this.blocks.find(b => b.id === arrow.from?.blockId);
      const toB = this.blocks.find(b => b.id === arrow.to?.blockId);

      const getPoint = (blk, edge, offset, isFloating, coord) => {
        if (isFloating) return { x: coord?.x ?? 0, y: coord?.y ?? 0 };
        if (!blk && edge) {
          // Boundary point - use a fixed distance from the diagram center area
          // offset is the coordinate along the edge (e.g., Y for left/right edges)
          const dist = 150; // Distance from center area to boundary
          if (edge === 'top') return { x: offset, y: -dist };
          if (edge === 'bottom') return { x: offset, y: 800 + dist };
          if (edge === 'left') return { x: -dist, y: offset };
          if (edge === 'right') return { x: 1000 + dist, y: offset };
        }
        if (!blk && coord) {
          return coord;
        }
        const o = offset || 0;
        if (!blk) return { x: 0, y: 0 };
        if (edge === 'top') return { x: blk.x + blk.w/2 + o, y: blk.y };
        if (edge === 'right') return { x: blk.x + blk.w, y: blk.y + blk.h/2 + o };
        if (edge === 'bottom') return { x: blk.x + blk.w/2 + o, y: blk.y + blk.h };
        if (edge === 'left') return { x: blk.x, y: blk.y + blk.h/2 + o };
        return { x: blk.x + blk.w/2, y: blk.y + blk.h/2 };
      };

      const fromFloat = arrow.from?.blockId === null && arrow.from?.edge === null;
      const toFloat = arrow.to?.blockId === null && arrow.to?.edge === null;
      
      const fromCoord = fromFloat ? { x: arrow.from?.x, y: arrow.from?.y } : null;
      const toCoord = toFloat ? { x: arrow.to?.x, y: arrow.to?.y } : null;
      
      pts.push(getPoint(fromB, arrow.from?.edge, arrow.from?.offset, fromFloat, fromCoord));
      if (arrow.segments && arrow.segments.length) pts.push(...arrow.segments);
      pts.push(getPoint(toB, arrow.to?.edge, arrow.to?.offset, toFloat, toCoord));
      return pts;
    },

    getDiagramBounds() {
      if (!this.blocks.length) return { minX: -200, minY: -200, maxX: 1200, maxY: 1000 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const b of this.blocks) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w);
        maxY = Math.max(maxY, b.y + b.h);
      }
      const pad = 150;
      return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    },

    drawArrowLabel(arrow, pts, col) {
      const { ctx } = this;
      const fs = SIZES.arrowLabelFontSize || 12;
      ctx.font = `${fs}px sans-serif`;
      const tw = ctx.measureText(arrow.name).width, th = fs;
      let mx, my, ang, horiz;
      if (arrow.labelX != null && arrow.labelY != null) {
        mx = arrow.labelX; my = arrow.labelY;
        ang = (arrow.labelAngle || 0) * Math.PI / 180;
        horiz = Math.abs(Math.cos(ang)) > 0.707;
      } else {
        // Calculate midpoint of arrow path
        const midIdx = Math.floor(pts.length / 2);
        const mid = pts[midIdx];
        // Get direction for proper text orientation
        const prevPt = pts[Math.max(0, midIdx - 1)];
        const nextPt = pts[Math.min(pts.length - 1, midIdx + 1)];
        const dx = nextPt.x - prevPt.x;
        const dy = nextPt.y - prevPt.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          horiz = Math.abs(dx) > Math.abs(dy);
          ang = horiz ? 0 : -Math.PI/2;
        } else {
          horiz = true;
          ang = 0;
        }
        mx = mid.x;
        my = mid.y - 5; // Offset slightly above the line
      }
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(ang);
      ctx.fillStyle = COLORS.textBg || '#fff';
      ctx.fillRect(-tw/2 - 3, -th/2 - 3, tw + 6, th + 6);
      ctx.fillStyle = col;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(arrow.name, 0, 0);
      ctx.restore();
      if (this.selectedArrowId === arrow.id) {
        ctx.fillStyle = COLORS.handler || '#0ff';
        const hs = (SIZES.labelHandleSize || 8) / this.scale;
        ctx.fillRect(mx - hs/2, my - hs/2, hs, hs);
      }
    },

    drawBoundaryMarker(arrow, pt, col, isTarget) {
      const bounds = this.getDiagramBounds();
      const onBd = Math.abs(pt.x - bounds.minX) < 2 || Math.abs(pt.x - bounds.maxX) < 2 ||
                   Math.abs(pt.y - bounds.minY) < 2 || Math.abs(pt.y - bounds.maxY) < 2;
      if (!onBd) return;
      if ((isTarget && arrow.to.blockId) || (!isTarget && arrow.from.blockId)) return;
      const m = isTarget ? this.getICOMMarker(arrow.type) : '';
      if (!m) return;
      const fs = 10, pad = 4;
      this.ctx.font = `bold ${fs}px sans-serif`;
      const tw = this.ctx.measureText(m).width, bw = tw + pad*2, bh = fs + pad*2;
      let bx = pt.x, by = pt.y;
      if (pt.x <= bounds.minX + 1) bx = pt.x + 2;
      else if (pt.x >= bounds.maxX - 1) bx = pt.x - bw - 2;
      else if (pt.y <= bounds.minY + 1) by = pt.y + 2;
      else by = pt.y - bh - 2;
      this.ctx.fillStyle = col;
      this.ctx.fillRect(bx, by, bw, bh);
      this.ctx.fillStyle = '#fff';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(m, bx + bw/2, by + bh/2);
    },

    getICOMMarker(type) {
      switch (type) {
        case 'input': return 'I';
        case 'output': return 'O';
        case 'control': return 'C';
        case 'mechanism': return 'M';
        case 'call': return 'C';
        default: return '';
      }
    },

    drawSelection() {
      const { ctx } = this;
      if (this.selectedBlockId) {
        const b = this.blocks.find(x => x.id === this.selectedBlockId);
        if (b) {
          ctx.strokeStyle = COLORS.selection;
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 3]);
          ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
        }
      }
      if (this.selectedArrowId) {
        const a = this.arrows.find(x => x.id === this.selectedArrowId);
        if (a) {
          const pts = this.getArrowPoints(a);
          ctx.strokeStyle = COLORS.selection;
          ctx.lineWidth = 3;
          ctx.setLineDash([5, 3]);
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
          // Draw handles at arrow ends
          ctx.fillStyle = COLORS.handler;
          const hs = SIZES.arrowEndHandleSize / this.scale;
          ctx.fillRect(pts[0].x - hs/2, pts[0].y - hs/2, hs, hs);
          const n = pts.length - 1;
          ctx.fillRect(pts[n].x - hs/2, pts[n].y - hs/2, hs, hs);
        }
      }
    },

    // --- Block operations ---

    addBlock() {
      const rect = this.canvas.getBoundingClientRect();
      const cw = this.worldToScreen(rect.width / 2, rect.height / 2);
      const id = `block-${Date.now()}`;
      const b = {
        id, name: `Блок ${this.blocks.length + 1}`,
        x: cw.x - SIZES.blockDefaultW/2, y: cw.y - SIZES.blockDefaultH/2,
        w: SIZES.blockDefaultW, h: SIZES.blockDefaultH,
        diagramId: null,
      };
      this.blocks.push(b);

      // Создаём 4 стрелки по умолчанию
      this.createAutoArrows(b);

      this.selectedBlockId = id;
      this.selectedArrowId = null;
      this.render();
      this.saveDiagram();
    },

    createAutoArrows(block) {
      // Input (left): from left boundary -> to block left (center)
      this.arrows.push({
        id: `arrow-${Date.now()}`, name: '', type: 'input',
        from: { blockId: null, edge: 'left', offset: block.y + block.h/2 },
        to: { blockId: block.id, edge: 'left', offset: 0 },
        segments: [],
      });
      // Control (top): from top boundary -> to block top (center)
      this.arrows.push({
        id: `arrow-${Date.now()}`, name: '', type: 'control',
        from: { blockId: null, edge: 'top', offset: block.x + block.w/2 },
        to: { blockId: block.id, edge: 'top', offset: 0 },
        segments: [],
      });
      // Output (right): from block right (center) -> to right boundary
      this.arrows.push({
        id: `arrow-${Date.now()}`, name: '', type: 'output',
        from: { blockId: block.id, edge: 'right', offset: 0 },
        to: { blockId: null, edge: 'right', offset: block.y + block.h/2 },
        segments: [],
      });
      // Mechanism (bottom): from bottom boundary -> to block bottom (center)
      this.arrows.push({
        id: `arrow-${Date.now()}`, name: '', type: 'mechanism',
        from: { blockId: null, edge: 'bottom', offset: block.x + block.w/2 },
        to: { blockId: block.id, edge: 'bottom', offset: 0 },
        segments: [],
      });
    },

    getNextAutoOffset(blockId) {
      const counts = { input: 0, control: 0, output: 0, mechanism: 0 };
      for (const a of this.arrows) {
        if (a.from.blockId === blockId || a.to.blockId === blockId) {
          counts[a.type] = (counts[a.type] || 0) + 1;
        }
      }
      const step = SIZES.arrowOffsetStep;
      return {
        input: counts.input * step,
        control: counts.control * step,
        output: counts.output * step,
        mechanism: counts.mechanism * step,
      };
    },

    createArrow(type, fromBlock, fromEdge, fromOff, toBlock, toEdge, toOff, toX, toY) {
      const fromX = fromBlock ? fromBlock.x + fromBlock.w/2 : fromOff;
      const fromY = fromBlock ? fromBlock.y + fromBlock.h/2 : fromOff;
      const pts = this.calcArrowPath(
        fromBlock ? {x: fromX, y: fromY} : {x: fromX, y: fromY},
        toBlock ? {x: toBlock.x + toBlock.w/2, y: toBlock.y + toBlock.h/2} : {x: toX, y: toY}
      );
      return {
        id: `arrow-${Date.now()}`,
        name: '',
        type,
        from: fromBlock ? { blockId: fromBlock.id, edge: fromEdge, offset: fromOff } : { blockId: null, edge: fromEdge, offset: fromOff || 0 },
        to: toBlock ? { blockId: toBlock.id, edge: toEdge, offset: toOff } : { blockId: null, edge: null, x: toX, y: toY },
        segments: pts.length > 2 ? pts.slice(1, -1) : [],
      };
    },

    calcArrowPath(from, to) {
      const dx = Math.abs(to.x - from.x), dy = Math.abs(to.y - from.y);
      if (dx < 2 || dy < 2) return [from, to];
      return [from, {x: to.x, y: from.y}, to];
    },

    deleteSelectedBlock() {
      if (!this.selectedBlockId) return;
      const idx = this.blocks.findIndex(b => b.id === this.selectedBlockId);
      if (idx === -1) return;
      const b = this.blocks[idx];
      this.arrows = this.arrows.filter(a => a.from.blockId !== b.id && a.to.blockId !== b.id);
      this.blocks.splice(idx, 1);
      if (b.diagramId) this.$delete(this.diagrams, b.diagramId);
      this.selectedBlockId = null;
      this.render();
      this.saveDiagram();
    },

    deleteSelectedArrow() {
      if (!this.selectedArrowId) return;
      this.arrows = this.arrows.filter(a => a.id !== this.selectedArrowId);
      this.selectedArrowId = null;
      this.render();
      this.saveDiagram();
    },

    // --- Arrow drag & connect ---

    reconnectArrowToBlock(arrow, end, block) {
      const ep = end === 'from' ? arrow.from : arrow.to;
      const ex = ep.x ?? 0, ey = ep.y ?? 0;
      const distL = Math.abs(ex - block.x), distR = Math.abs(ex - (block.x + block.w));
      const distT = Math.abs(ey - block.y), distB = Math.abs(ey - (block.y + block.h));
      const min = Math.min(distL, distR, distT, distB);
      if (min > 30) return false;

      let edge, off;
      if (min === distL) { edge = 'left'; off = ey - (block.y + block.h/2); }
      else if (min === distR) { edge = 'right'; off = ey - (block.y + block.h/2); }
      else if (min === distT) { edge = 'top'; off = ex - (block.x + block.w/2); }
      else { edge = 'bottom'; off = ex - (block.x + block.w/2); }

      const maxOff = edge === 'top' || edge === 'bottom' ? block.w/2 - 8 : block.h/2 - 8;
      off = Math.max(-maxOff, Math.min(maxOff, off));

      ep.blockId = block.id;
      ep.edge = edge;
      ep.offset = off;
      delete ep.x; delete ep.y;

      const pts = this.getArrowPoints(arrow);
      arrow.segments = pts.length > 2 ? pts.slice(1, -1) : [];
      this.render();
      return true;
    },

    // --- Decomposition ---

    createNestedDiagram() {
      if (!this.selectedBlock) return;
      this.enterBlock();
    },

    enterBlock() {
      const b = this.selectedBlock;
      if (!b.diagramId) {
        const idx = this.blocks.findIndex(x => x.id === b.id);
        const childId = generateChildDiagramId(this.currentDiagramId, idx);
        b.diagramId = childId;
        const child = {
          id: childId, name: `Декомпозиция ${b.name}`,
          parentDiagramId: this.currentDiagramId, parentBlockId: b.id,
          blocks: [], arrows: [],
          view: { x: 0, y: 0, scale: 1 },
        };
        this.$set(this.diagrams, childId, child);
      }
      this.currentDiagramId = b.diagramId;
      this.selectedBlockId = null;
      this.selectedArrowId = null;
      this.loadDiagram();
      this.saveDiagram();
    },

    goBack() {
      const parentId = getParentDiagramId(this.currentDiagramId);
      if (!parentId || !this.diagrams[parentId]) return;
      this.currentDiagramId = parentId;
      this.selectedBlockId = null;
      this.selectedArrowId = null;
      this.loadDiagram();
    },

    navigateToDiagram(id) {
      if (this.diagrams[id]) {
        this.currentDiagramId = id;
        this.loadDiagram();
      }
    },

    // --- Editing ---

    onDoubleClick(e) {
      const b = this.hitTestBlock(e.offsetX, e.offsetY);
      if (b) {
        if (b.diagramId) {
          this.selectedBlockId = b.id;
          this.enterBlock();
        } else {
          this.startEditBlock(b);
        }
        return;
      }
      const a = this.hitTestArrow(e.offsetX, e.offsetY);
      if (a) {
        this.startEditArrow(a);
      }
    },

    startEditBlock(b) {
      this.editing = { type: 'block', id: b.id, text: b.name, x: b.x, y: b.y, w: b.w, h: b.h };
      this.$nextTick(() => this.$refs.editorInput?.focus());
    },

    startEditArrow(a) {
      const pts = this.getArrowPoints(a);
      if (!pts.length) return;
      // Calculate midpoint of arrow path
      const midIdx = Math.floor(pts.length / 2);
      const mid = pts[midIdx];
      const prevPt = pts[Math.max(0, midIdx - 1)];
      const nextPt = pts[Math.min(pts.length - 1, midIdx + 1)];
      const dx = nextPt.x - prevPt.x;
      const dy = nextPt.y - prevPt.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const horiz = len > 0 ? Math.abs(dx) > Math.abs(dy) : true;
      const w = 120, h = 24;
      // Position above the arrow line
      const x = mid.x - w/2;
      const y = mid.y - h/2 - 5;
      this.editing = { type: 'arrow', id: a.id, text: a.name, x, y, w, h };
      this.$nextTick(() => this.$refs.editorInput?.focus());
    },

    finishEdit() {
      if (!this.editing) return;
      const txt = this.editing.text.trim();
      if (this.editing.type === 'block') {
        const b = this.blocks.find(x => x.id === this.editing.id);
        if (b) b.name = txt;
      } else {
        const a = this.arrows.find(x => x.id === this.editing.id);
        if (a) a.name = txt;
      }
      this.editing = null;
      this.render();
      this.saveDiagram();
    },

    cancelEdit() { this.editing = null; },

    // --- Mouse events ---

    screenToWorld(sx, sy) {
      return { x: (sx - this.offsetX) / this.scale, y: (sy - this.offsetY) / this.scale };
    },
    worldToScreen(wx, wy) {
      return { x: wx * this.scale + this.offsetX, y: wy * this.scale + this.offsetY };
    },

    hitTestBlock(sx, sy) {
      const p = this.screenToWorld(sx, sy);
      for (let i = this.blocks.length - 1; i >= 0; i--) {
        const b = this.blocks[i];
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
      }
      return null;
    },

    hitTestArrowEnd(sx, sy) {
      const p = this.screenToWorld(sx, sy);
      const th = 12 / this.scale;
      for (let i = this.arrows.length - 1; i >= 0; i--) {
        const a = this.arrows[i];
        const pts = this.getArrowPoints(a);
        if (pts.length < 1) continue;
        for (const e of [{end: 'from', pt: pts[0]}, {end: 'to', pt: pts[pts.length-1]}]) {
          if (Math.abs(p.x - e.pt.x) <= th && Math.abs(p.y - e.pt.y) <= th) return { arrow: a, end: e.end };
        }
      }
      return null;
    },

    hitTestArrow(sx, sy) {
      const p = this.screenToWorld(sx, sy);
      const th = 6 / this.scale;
      for (let i = this.arrows.length - 1; i >= 0; i--) {
        const a = this.arrows[i];
        const pts = this.getArrowPoints(a);
        for (let j = 0; j < pts.length - 1; j++) {
          const d = this.pointSegDist(p, pts[j], pts[j+1]);
          if (d <= th) return a;
        }
      }
      return null;
    },

    pointSegDist(p, a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, len2 = dx*dx + dy*dy;
      if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
      let t = ((p.x - a.x)*dx + (p.y - a.y)*dy) / len2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(p.x - (a.x + t*dx), p.y - (a.y + t*dy));
    },

    onMouseDown(e) {
      if (this.editing) { this.finishEdit(); return; }
      if (e.button === 1 || (e.button === 0 && (e.altKey || this.isPanning))) {
        this.isPanning = true; this.lastX = e.clientX; this.lastY = e.clientY; return;
      }
      if (e.button !== 0) return;

      const endHit = this.hitTestArrowEnd(e.offsetX, e.offsetY);
      if (endHit) {
        const ep = endHit.end === 'from' ? endHit.arrow.from : endHit.arrow.to;
        if (e.shiftKey && ep.blockId) {
          ep.blockId = null; ep.edge = null;
          const pts = this.getArrowPoints(endHit.arrow);
          endHit.arrow.segments = pts.length > 2 ? pts.slice(1, -1) : [];
          this.render();
          this.saveDiagram();
          return;
        }
        this.dragArrowEnd = { arrowId: endHit.arrow.id, end: endHit.end };
        this.selectedArrowId = endHit.arrow.id;
        this.selectedBlockId = null;
        return;
      }

      const b = this.hitTestBlock(e.offsetX, e.offsetY);
      if (b) {
        this.selectedBlockId = b.id;
        this.selectedArrowId = null;
        this.dragBlock = b;
        const p = this.screenToWorld(e.offsetX, e.offsetY);
        this.dragOffsetX = p.x - b.x;
        this.dragOffsetY = p.y - b.y;
        this.render();
        return;
      }

      const a = this.hitTestArrow(e.offsetX, e.offsetY);
      if (a) {
        this.selectedArrowId = a.id;
        this.selectedBlockId = null;
        this.render();
        return;
      }

      this.selectedBlockId = null;
      this.selectedArrowId = null;
      this.render();
    },

    onMouseMove(e) {
      if (this.isPanning) {
        this.offsetX += e.clientX - this.lastX;
        this.offsetY += e.clientY - this.lastY;
        this.lastX = e.clientX; this.lastY = e.clientY;
        this.render();
        return;
      }

      if (this.dragArrowEnd) {
        const a = this.arrows.find(x => x.id === this.dragArrowEnd.arrowId);
        if (a) {
          const ep = this.dragArrowEnd.end === 'from' ? a.from : a.to;
          const p = this.screenToWorld(e.offsetX, e.offsetY);
          let connected = false;
          for (const b of this.blocks) {
            if (this.reconnectArrowToBlock(a, this.dragArrowEnd.end, b)) {
              connected = true;
              break;
            }
          }
          if (!connected) {
            // Floating endpoint - store explicit coordinates
            ep.blockId = null;
            ep.edge = null;
            ep.x = p.x;
            ep.y = p.y;
            const pts = this.getArrowPoints(a);
            a.segments = pts.length > 2 ? pts.slice(1, -1) : [];
          }
          this.render();
        }
        return;
      }

      if (this.dragBlock) {
        const p = this.screenToWorld(e.offsetX, e.offsetY);
        this.dragBlock.x = p.x - this.dragOffsetX;
        this.dragBlock.y = p.y - this.dragOffsetY;
        
        this.render();
      }

      const endHit = this.hitTestArrowEnd(e.offsetX, e.offsetY);
      this.canvas.style.cursor = endHit ? 'move' : (this.hitTestBlock(e.offsetX, e.offsetY) ? 'move' : 'default');
    },

    onMouseUp() {
      if (this.dragArrowEnd || this.dragBlock) {
        this.saveDiagram();
      }
      this.dragArrowEnd = null;
      this.dragBlock = null;
      this.isPanning = false;
    },

    onWheel(e) {
      e.preventDefault();
      const zoom = e.deltaY < 0 ? 1.1 : 0.9;
      const limit = this.canvas.clientWidth / this.scale;
      const newScale = Math.max(0.2, Math.min(5, this.scale * zoom));
      if (newScale === this.scale) return;
      const mx = e.offsetX, my = e.offsetY;
      const wx = (mx - this.offsetX) / this.scale, wy = (my - this.offsetY) / this.scale;
      this.offsetX = mx - wx * newScale;
      this.offsetY = my - wy * newScale;
      this.scale = newScale;
      this.render();
    },

    // --- Export ---

    exportPNG() { exportToPNG(this.canvas, this.currentDiagram?.name || 'idef0'); },
    exportSVG() { exportToSVG(this.canvas, this.currentDiagram?.name || 'idef0'); },
    exportJSON() { exportToJSON(this.projectId, this.diagrams); },
  },
};
</script>

<style scoped>
.idef0-editor {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 600px;
  overflow: auto;
}
.idef0-canvas {
  width: 100%;
  height: 100%;
  min-height: 600px;
  display: block;
  background: #fafafa;
  cursor: default;
}
.idef0-toolbar {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  display: flex;
  gap: 4px;
  background: rgba(255,255,255,0.95);
  padding: 6px 10px;
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
  white-space: nowrap;
}
.idef0-toolbar button {
  padding: 4px 10px;
  border: 1px solid #ccc;
  background: #fff;
  border-radius: 3px;
  cursor: pointer;
  font-size: 13px;
}
.idef0-toolbar button:hover {
  background: #eef;
}
.idef0-toolbar button:active {
  background: #ddf;
}
.idef0-separator {
  width: 1px;
  background: #ccc;
  margin: 0 4px;
  min-width: 1px;
}
.idef0-breadcrumb {
  display: flex;
  align-items: center;
  font-size: 13px;
  color: #333;
  margin-left: 8px;
}
.idef0-crumb {
  cursor: pointer;
  padding: 2px 6px;
}
.idef0-crumb:hover {
  background: #eef;
  border-radius: 2px;
}
.idef0-crumb-active {
  font-weight: bold;
  background: #ddf;
  border-radius: 2px;
}
.idef0-crumb-sep {
  margin: 0 4px;
  color: #999;
}
.idef0-zoom {
  margin-left: 8px;
  font-size: 12px;
  color: #666;
  min-width: 45px;
  text-align: right;
}
.idef0-status-bar {
  position: absolute;
  bottom: 8px;
  left: 8px;
  z-index: 10;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  max-width: calc(100% - 16px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.idef0-status-error {
  background: #fee;
  color: #c00;
  border: 1px solid #fcc;
}
.idef0-inline-editor {
  position: absolute;
  z-index: 20;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
}
.idef0-inline-editor input {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid #9cf;
  border-radius: 2px;
  background: #fff;
  font-size: inherit;
  outline: none;
}
</style>
