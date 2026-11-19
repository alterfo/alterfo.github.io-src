<template>
  <div class="pro-panel pro-shader">
    <div class="pro-panel-bar">
      <span class="pro-bar-label">WGSL / компилятор</span>
      <span class="pro-bar-status" :class="statusClass">{{ statusText }}</span>
    </div>

    <div class="pro-shader-body">
      <div class="pro-editor">
        <div class="pro-editor-head">
          <span class="pro-mono">shader.wgsl</span>
          <div class="pro-presets">
            <button
              v-for="preset in presets"
              :key="preset.id"
              type="button"
              class="pro-chip"
              :class="{ on: activePreset === preset.id }"
              @click="usePreset(preset)"
            >
              {{ preset.label }}
            </button>
          </div>
        </div>
        <textarea
          ref="editorEl"
          v-model="source"
          class="pro-code"
          spellcheck="false"
          autocapitalize="off"
          aria-label="Исходник WGSL"
          @input="schedule"
        />
      </div>

      <div class="pro-preview">
        <canvas ref="canvasEl" class="pro-preview-canvas"></canvas>
        <div v-if="!supported" class="pro-preview-off">
          <p>WebGPU в этом браузере нет. Редактор остался, превью — нет.</p>
        </div>
        <div v-else-if="errors.length" class="pro-preview-off pro-preview-err">
          <p>Шейдер не собрался. Рабочий остался на экране.</p>
          <ul>
            <li v-for="(err, i) in errors.slice(0, 4)" :key="i">{{ err }}</li>
          </ul>
        </div>
        <div class="pro-preview-tag">
          <span>{{ compileLabel }}</span>
          <span class="pro-preview-fps">{{ fps ? fps + ' fps' : '—' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const PRESETS = [
  {
    id: 'plasma',
    label: 'волна',
    code: `struct U {
  res: vec2f,
  time: f32,
  _p0: f32,
  mouse: vec2f,
  _p1: vec2f,
};
@group(0) @binding(0) var<uniform> u: U;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  return vec4f(p[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = (fc.xy * 2.0 - u.res) / min(u.res.x, u.res.y);
  let t = u.time * 0.35;
  var p = uv;
  for (var i = 0; i < 3; i++) {
    p += 0.18 * vec2f(sin(p.y * 2.3 + t * 0.7 + f32(i)), cos(p.x * 2.1 - t * 0.6 + f32(i)));
  }
  let bands = abs(fract((p.x + p.y * 0.6) * 3.2 + t * 0.3) - 0.5);
  let line = smoothstep(0.055, 0.0, bands);
  let halo = smoothstep(0.22, 0.0, bands);
  let m = exp(-length(uv - u.mouse) * 2.4);
  var c = vec3f(0.043, 0.047, 0.055);
  c += vec3f(0.62, 0.47, 0.21) * line * (0.55 + m * 0.8);
  c += vec3f(0.10, 0.34, 0.36) * halo * 0.45;
  return vec4f(c, 1.0);
}`,
  },
  {
    id: 'grid',
    label: 'решётка',
    code: `struct U {
  res: vec2f,
  time: f32,
  _p0: f32,
  mouse: vec2f,
  _p1: vec2f,
};
@group(0) @binding(0) var<uniform> u: U;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  return vec4f(p[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = (fc.xy * 2.0 - u.res) / min(u.res.x, u.res.y);
  let m = u.mouse;
  let bend = exp(-length(uv - m) * 2.2) * 0.45;
  let p = uv + vec2f(sin(uv.y * 3.0 + u.time * 0.5), cos(uv.x * 3.0 + u.time * 0.4)) * bend;
  let g = abs(fract(p * 12.0) - 0.5);
  let line = smoothstep(0.06, 0.0, min(g.x, g.y));
  var c = vec3f(0.043, 0.047, 0.055) + vec3f(0.24, 0.31, 0.30) * line * 0.55;
  c += vec3f(0.36, 0.28, 0.14) * line * exp(-length(uv) * 1.4) * 0.8;
  return vec4f(c, 1.0);
}`,
  },
  {
    id: 'lines',
    label: 'линии',
    code: `struct U {
  res: vec2f,
  time: f32,
  _p0: f32,
  mouse: vec2f,
  _p1: vec2f,
};
@group(0) @binding(0) var<uniform> u: U;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  return vec4f(p[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = (fc.xy * 2.0 - u.res) / min(u.res.x, u.res.y);
  var c = vec3f(0.043, 0.047, 0.055);
  for (var i = 0; i < 7; i++) {
    let fi = f32(i);
    let y = sin(uv.x * (2.2 + fi * 0.55) + u.time * (0.3 + fi * 0.06)) * (0.30 - fi * 0.02);
    let d = abs(uv.y - y);
    let glow = smoothstep(0.02, 0.0, d);
    let hue = mix(vec3f(0.30, 0.40, 0.42), vec3f(0.48, 0.36, 0.18), fi / 6.0);
    c += hue * glow * (0.55 - fi * 0.05);
  }
  return vec4f(c, 1.0);
}`,
  },
]

const source = ref(PRESETS[0].code)
const presets = PRESETS
const activePreset = ref('plasma')
const supported = ref(true)
const errors = ref([])
const compileLabel = ref('ожидание')
const fps = ref(0)

const editorEl = ref(null)
const canvasEl = ref(null)

const compiling = ref(false)

const statusText = computed(() => {
  if (!supported.value) return 'без GPU'
  if (compiling.value) return 'сборка'
  if (errors.value.length) return 'ошибка'
  return 'собрано'
})
const statusClass = computed(() => (errors.value.length ? 'is-err' : 'is-ok'))

let device = null
let context = null
let pipeline = null
let uniform = null
let bind = null
let format = ''
let raf = 0
let startAt = 0
let lastAt = 0
let frames = 0
let visible = true
let observer = null
let timer = 0
let dead = false
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

async function initGPU() {
  if (!navigator.gpu) {
    supported.value = false
    return
  }
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) {
    supported.value = false
    return
  }
  device = await adapter.requestDevice()
  format = navigator.gpu.getPreferredCanvasFormat()
  context = canvasEl.value.getContext('webgpu')
  if (!context) {
    supported.value = false
    return
  }
  context.configure({ device, format, alphaMode: 'opaque' })
  uniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  await compile()
  startAt = performance.now()
  if (reduced) {
    requestAnimationFrame((now) => {
      lastAt = 0
      loop(now)
    })
  } else {
    loop(startAt)
  }
}

let compileSeq = 0

async function compile() {
  if (!device) return
  const seq = ++compileSeq
  compiling.value = true
  const started = performance.now()
  let module
  try {
    module = device.createShaderModule({ code: source.value })
  } catch (err) {
    errors.value = [String(err.message || err)]
    return
  }
  const info = await module.getCompilationInfo()
  if (seq !== compileSeq) return
  const bad = info.messages.filter((m) => m.type === 'error')
  if (bad.length) {
    errors.value = bad.map((m) => `строка ${m.lineNum}: ${m.message}`)
    compiling.value = false
    return
  }
  device.pushErrorScope('validation')
  let next = null
  try {
    next = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    })
  } catch (err) {
    next = null
    errors.value = [String(err.message || err).split('\n')[0]]
  }
  const scope = await device.popErrorScope()
  if (seq !== compileSeq) return
  if (!next || scope) {
    errors.value = [scope ? String(scope.message).split('\n')[0] : 'шейдер не собрался']
    compiling.value = false
    return
  }

  const nextBind = device.createBindGroup({
    layout: next.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniform } }],
  })
  pipeline = next
  bind = nextBind
  errors.value = []
  compiling.value = false
  compileLabel.value = `собрано ${(performance.now() - started).toFixed(1)} ms`
  activePreset.value = PRESETS.find((p) => p.code === source.value)?.id || ''
  if (reduced) {
    lastAt = 0
    requestAnimationFrame((now) => loop(now))
  }
}

function schedule() {
  clearTimeout(timer)
  compileLabel.value = 'сборка…'
  timer = window.setTimeout(compile, 320)
}

function usePreset(preset) {
  source.value = preset.code
  activePreset.value = preset.id
  compile()
}

function resize() {
  if (!canvasEl.value) return
  const rect = canvasEl.value.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = Math.max(1, Math.round(rect.width * dpr))
  const h = Math.max(1, Math.round(rect.height * dpr))
  if (canvasEl.value.width !== w || canvasEl.value.height !== h) {
    canvasEl.value.width = w
    canvasEl.value.height = h
  }
}

function loop(now) {
  if (dead) return
  if (!visible) {
    raf = requestAnimationFrame(loop)
    return
  }
  if (!lastAt) lastAt = now
  const dt = now - lastAt
  lastAt = now

  resize()
  const w = canvasEl.value.width
  const h = canvasEl.value.height
  const t = (now - startAt) / 1000
  device.queue.writeBuffer(uniform, 0, new Float32Array([w, h, t, 0, 0, 0, 0, 0]))

  if (pipeline && bind) {
    const enc = device.createCommandEncoder()
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0.043, g: 0.047, b: 0.055, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    })
    pass.setPipeline(pipeline)
    pass.setBindGroup(0, bind)
    pass.draw(6)
    pass.end()
    device.queue.submit([enc.finish()])
  }

  frames++
  if (frames % 24 === 0 && dt > 0) fps.value = Math.round(1000 / dt)
  if (!reduced) raf = requestAnimationFrame(loop)
}

onMounted(async () => {
  if (!canvasEl.value) return
  try {
    await initGPU()
  } catch (err) {
    console.warn('[shader-lab] init failed', err)
    supported.value = false
  }
  if (canvasEl.value) {
    observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      lastAt = 0
    })
    observer.observe(canvasEl.value)
  }
})

onBeforeUnmount(() => {
  dead = true
  cancelAnimationFrame(raf)
  clearTimeout(timer)
  observer && observer.disconnect()
  if (context) context.unconfigure()
  if (device) device.destroy()
})
</script>
