// Поле-рельеф для главной pro-сайта: сетка точек в перспективе, высота из суммы
// синусов, рельеф реагирует на курсор. WebGPU — основной путь, Canvas2D — запасной
// с той же геометрией.

const COLS = 180
const ROWS = 120
const COLOR_LOW = [0.1, 0.22, 0.23]
const COLOR_MID = [0.55, 0.66, 0.63]
const COLOR_WARM = [0.78, 0.62, 0.38]

const WGSL = /* wgsl */ `
struct Params {
  res: vec2f,
  time: f32,
  dt: f32,
  mouse: vec2f,
  aspect: f32,
  hold: f32,
};

@group(0) @binding(0) var<uniform> U: Params;

fn wave(x: f32, z: f32, t: f32) -> f32 {
  var h = 0.0;
  h += 0.42 * sin(x * 0.55 + t * 0.55);
  h += 0.30 * sin(z * 0.70 - t * 0.42);
  h += 0.17 * sin((x + z) * 0.85 + t * 0.8);
  h += 0.09 * sin((x - z * 0.6) * 1.6 - t * 0.9);
  return h;
}

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec4f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let c = corners[vi];

  let ix = f32(ii % 180u);
  let iz = f32(ii / 180u);
  let gx = (ix / 179.0 - 0.5) * 30.0;
  let gz = 2.4 + (iz / 119.0) * 24.0;

  let t = U.time;
  var h = wave(gx, gz, t);

  let mx = U.mouse.x * 9.0;
  let d = distance(vec2f(gx, gz), vec2f(mx, 7.0));
  h += sin(d * 2.2 - t * 3.0) * exp(-d * 0.35) * 0.55 * U.hold;

  let focal = 1.35;
  let camY = 1.35;
  let p = vec2f(gx * focal / gz, (h - camY) * focal / gz + 0.30);

  let sizePx = 2.0 + 1.6 * (0.5 + 0.5 * sin(gx * 0.7 + gz * 0.3 + t * 0.6));
  let sy = sizePx * 2.0 / U.res.y;
  let sx = sy * (U.res.y / U.res.x);

  let lift = smoothstep(-0.18, 0.32, h);
  var col = mix(vec3f(0.10, 0.22, 0.23), vec3f(0.55, 0.66, 0.63), lift);
  col = mix(col, vec3f(0.78, 0.62, 0.38), smoothstep(0.30, 0.48, h) * 0.65);

  let fog = exp(-gz * 0.05) * smoothstep(3.4, 6.2, gz);

  var out: VSOut;
  out.pos = vec4f(p + c * vec2f(sx, sy), 0.0, 1.0);
  out.uv = c;
  out.col = vec4f(col, (0.55 + lift * 0.45) * fog);
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let d = length(in.uv);
  let a = clamp(1.0 - d, 0.0, 1.0);
  return vec4f(in.col.rgb, in.col.a * a);
}
`

export class ProField {
  constructor(canvas, { onStats, reducedMotion = false } = {}) {
    this.canvas = canvas
    this.onStats = onStats || (() => {})
    this.reducedMotion = reducedMotion
    this.mode = 'idle'
    this.device = null
    this.context = null
    this.pipeline = null
    this.bind = null
    this.uniform = null
    this.width = 1
    this.height = 1
    this.dpr = 1
    this.count = COLS * ROWS
    this.raf = 0
    this.running = false
    this.startTime = 0
    this.lastTime = 0
    this.lastFrameAt = 0
    this.fps = 0
    this.frameMs = 0
    this.mouse = [0.35, 0.2]
    this.hold = 0
    this.ctx2d = null
    this.dead = false
    this.visible = true
    this.adapterName = ''
    this.statAt = 0
  }

  async init() {
    this.resize()
    const force2d = typeof location !== 'undefined' && location.search.includes('field2d')
    try {
      const ok = force2d ? false : await this.initGPU()
      if (ok && !this.dead) {
        this.mode = 'webgpu'
        this.emit()
        return true
      }
    } catch (err) {
      console.warn('[pro-field] webgpu init failed', err)
    }
    this.init2D()
    this.mode = 'canvas2d'
    this.emit()
    return false
  }

  async initGPU() {
    if (!navigator.gpu) return false
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) return false
    const device = await adapter.requestDevice()
    if (this.dead) return false
    this.device = device
    device.lost.then((info) => {
      if (this.dead) return
      console.warn('[pro-field] device lost', info.reason)
      this.fallback2D()
    })

    this.context = this.canvas.getContext('webgpu')
    if (!this.context) return false
    const format = navigator.gpu.getPreferredCanvasFormat()
    this.context.configure({ device, format, alphaMode: 'opaque' })

    this.uniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })

    const module = device.createShaderModule({ code: WGSL })
    const info = await module.getCompilationInfo?.()
    const bad = (info?.messages || []).filter((m) => m.type === 'error')
    if (bad.length) {
      throw new Error('shader: ' + bad.map((m) => m.lineNum + ': ' + m.message).join('; '))
    }

    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    })
    this.bind = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniform } }],
    })

    const parts = [adapter.info?.vendor, adapter.info?.architecture, adapter.info?.description].filter(
      (v) => typeof v === 'string' && v.length > 0 && v !== 'unknown',
    )
    this.adapterName = parts.join(' · ') || 'webgpu'
    return true
  }

  init2D() {
    this.ctx2d = this.canvas.getContext('2d')
  }

  fallback2D() {
    if (this.mode === 'canvas2d' || this.dead) return
    this.stop()
    this.teardownGPU()
    this.mode = 'canvas2d'
    this.init2D()
    this.emit()
    this.start()
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width || window.innerWidth))
    const h = Math.max(1, Math.round(rect.height || window.innerHeight))
    this.width = w
    this.height = h
    this.dpr = Math.min(window.devicePixelRatio || 1, w > 900 ? 1.75 : 2)
    const pw = Math.round(w * this.dpr)
    const ph = Math.round(h * this.dpr)
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw
      this.canvas.height = ph
    }
  }

  setPointer(clientX, clientY, hold = 1) {
    const rect = this.canvas.getBoundingClientRect()
    this.mouse = [
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1),
    ]
    this.hold = hold
  }

  emit() {
    this.onStats({
      api: this.mode,
      device: this.adapterName || (this.mode === 'canvas2d' ? 'cpu fallback' : '…'),
      particles: this.count,
      workgroups: 1,
      frameMs: this.frameMs,
      fps: this.fps,
      dpr: this.dpr,
    })
  }

  uniforms(time, dt) {
    return new Float32Array([
      this.canvas.width,
      this.canvas.height,
      time,
      dt,
      this.mouse[0],
      this.mouse[1],
      this.width / this.height,
      this.hold,
    ])
  }

  frameGPU(time) {
    const dt = Math.min((time - this.lastTime) / 1000 || 0.016, 0.05)
    this.lastTime = time
    const t = (time - this.startTime) / 1000
    this.device.queue.writeBuffer(this.uniform, 0, this.uniforms(t, dt))

    const enc = this.device.createCommandEncoder()
    const view = this.context.getCurrentTexture().createView()
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.043, g: 0.047, b: 0.055, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    })
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, this.bind)
    pass.draw(6, this.count)
    pass.end()
    this.device.queue.submit([enc.finish()])
  }

  frame2D(time) {
    const ctx = this.ctx2d
    if (!ctx) return
    const dt = Math.min((time - this.lastTime) / 1000 || 0.016, 0.05)
    this.lastTime = time
    const t = (time - this.startTime) / 1000
    const w = this.width
    const h = this.height
    const focal = 1.35
    const camY = 1.35

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#0b0c0e'
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'lighter'

    for (let iz = 0; iz < ROWS; iz += 2) {
      const gz = 2.4 + (iz / (ROWS - 1)) * 24
      for (let ix = 0; ix < COLS; ix += 2) {
        const gx = (ix / (COLS - 1) - 0.5) * 30
        let hv =
          0.42 * Math.sin(gx * 0.55 + t * 0.55) +
          0.3 * Math.sin(gz * 0.7 - t * 0.42) +
          0.17 * Math.sin((gx + gz) * 0.85 + t * 0.8) +
          0.09 * Math.sin((gx - gz * 0.6) * 1.6 - t * 0.9)
        const d = Math.hypot(gx - this.mouse[0] * 9, gz - 7)
        hv += Math.sin(d * 2.2 - t * 3) * Math.exp(-d * 0.35) * 0.38 * this.hold

        const px = ((gx * focal) / gz + 1) * 0.5 * w
        const py = (1 - ((hv - camY) * focal) / gz - 0.3) * 0.5 * h
        const lift = Math.min(1, Math.max(0, (hv + 0.18) / 0.5))
        const fog = Math.exp(-gz * 0.05) * Math.min(1, Math.max(0, (gz - 3.4) / 2.8))
        const r = Math.round((COLOR_LOW[0] + (COLOR_MID[0] - COLOR_LOW[0]) * lift) * 255)
        const g = Math.round((COLOR_LOW[1] + (COLOR_MID[1] - COLOR_LOW[1]) * lift) * 255)
        const b = Math.round((COLOR_LOW[2] + (COLOR_MID[2] - COLOR_LOW[2]) * lift) * 255)
        const warm = Math.max(0, Math.min(1, (hv - 0.3) / 0.18)) * 0.65
        const a = (0.55 + lift * 0.45) * fog
        ctx.fillStyle = `rgba(${Math.round(r + (COLOR_WARM[0] * 255 - r) * warm)},${Math.round(g + (COLOR_WARM[1] * 255 - g) * warm)},${Math.round(b + (COLOR_WARM[2] * 255 - b) * warm)},${a.toFixed(3)})`
        ctx.fillRect(px, py, 1.6, 1.6)
      }
    }
  }

  tick = (time) => {
    if (!this.running) return
    if (this.mode === 'webgpu' && this.device) this.frameGPU(time)
    else if (this.mode === 'canvas2d') this.frame2D(time)

    if (this.lastFrameAt) {
      const gap = time - this.lastFrameAt
      this.frameMs = this.frameMs * 0.88 + gap * 0.12
      this.fps = this.fps * 0.88 + (1000 / Math.max(gap, 1)) * 0.12
      if (!this.statAt || time - this.statAt > 420) {
        this.statAt = time
        this.emit()
      }
    }
    this.lastFrameAt = time
    if (!this.reducedMotion) this.raf = requestAnimationFrame(this.tick)
    else this.running = false
  }

  start() {
    if (this.running || this.dead) return
    this.running = true
    this.startTime = performance.now()
    this.lastTime = this.startTime
    this.lastFrameAt = 0
    this.raf = requestAnimationFrame(this.tick)
  }

  stop() {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  teardownGPU() {
    if (this.uniform) this.uniform.destroy()
    this.uniform = null
    if (this.context) this.context.unconfigure()
    this.context = null
    this.pipeline = null
    this.bind = null
    if (this.device) {
      this.device.destroy()
      this.device = null
    }
  }

  destroy() {
    this.dead = true
    this.stop()
    this.teardownGPU()
  }
}
