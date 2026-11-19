<template>
  <div class="pro-panel pro-neural">
    <div class="pro-panel-bar">
      <span class="pro-bar-label">MLP / обучение в браузере</span>
      <span class="pro-bar-status is-ok">{{ running ? 'идёт обучение' : 'сошлось' }}</span>
    </div>

    <div class="pro-neural-body">
      <div class="pro-neural-canvas-wrap">
        <canvas ref="canvasEl" class="pro-neural-canvas" width="900" height="620"></canvas>
        <div class="pro-neural-stats">
          <div><span>эпоха</span><b>{{ epoch }}</b></div>
          <div><span>loss</span><b>{{ loss }}</b></div>
          <div><span>точность</span><b>{{ acc }}%</b></div>
        </div>
      </div>

      <div class="pro-neural-controls">
        <div class="pro-seg">
          <button
            v-for="set in sets"
            :key="set.id"
            type="button"
            class="pro-chip"
            :class="{ on: kind === set.id }"
            @click="restart(set.id)"
          >
            {{ set.label }}
          </button>
        </div>
        <button type="button" class="pro-chip" @click="restart(kind, true)">заново</button>
        <p class="pro-note">2·16·16·2, tanh, Adam, 360 точек. Считается здесь.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createAdam, createNet, evaluate, frame, makeDataset, trainEpoch } from './neural.js'

const sets = [
  { id: 'spirals', label: 'спирали' },
  { id: 'moons', label: 'луны' },
  { id: 'circles', label: 'круги' },
]

const canvasEl = ref(null)
const kind = ref('spirals')
const epoch = ref(0)
const loss = ref('—')
const acc = ref(0)
const running = ref(true)

let ds = null
let net = null
let adam = null
let raf = 0
let startAt = 0
let lastDraw = 0
let visible = true
let observer = null
let offscreen = null
let offctx = null

function reset(kindId) {
  ds = makeDataset(kindId, 360, kindId === 'spirals' ? 11 : kindId === 'moons' ? 5 : 3)
  net = createNet([2, 16, 16, 2], 7)
  adam = createAdam(net)
  epoch.value = 0
  running.value = true
  loss.value = '—'
  acc.value = 0
}

function restart(nextKind, force) {
  kind.value = nextKind || kind.value
  reset(kind.value)
  if (force) {
    startAt = performance.now()
    lastDraw = 0
  }
}

function draw() {
  const canvas = canvasEl.value
  if (!canvas || !net) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height

  const N = 128
  if (!offscreen) {
    offscreen = document.createElement('canvas')
    offscreen.width = N
    offscreen.height = N
    offctx = offscreen.getContext('2d')
  }

  const field = frame(net, N, N)
  const img = offctx.createImageData(N, N)
  for (let i = 0; i < field.length; i++) {
    const p = field[i]
    const edge = Math.exp(-Math.pow((p - 0.5) * 52, 2))
    const o = i * 4
    const br = 118 + (30 - 118) * p
    const bg = 86 + (100 - 86) * p
    const bb = 42 + (108 - 42) * p
    img.data[o] = Math.round(br + (236 - br) * edge)
    img.data[o + 1] = Math.round(bg + (230 - bg) * edge)
    img.data[o + 2] = Math.round(bb + (218 - bb) * edge)
    img.data[o + 3] = Math.round(84 + edge * 120)
  }
  offctx.putImageData(img, 0, 0)

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#0b0c0e'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  ctx.globalAlpha = 0.95
  ctx.drawImage(offscreen, 0, 0, w, h)
  ctx.globalAlpha = 1

  const s = 3.4
  for (let i = 0; i < ds.n; i++) {
    const x = ((ds.X[i * 2] + 1) / 2) * w
    const y = ((1 - ds.X[i * 2 + 1]) / 2) * h
    ctx.beginPath()
    ctx.arc(x, y, ds.Y[i] ? s : s * 1.15, 0, Math.PI * 2)
    ctx.fillStyle = ds.Y[i] ? '#8fd2d2' : '#e8c07e'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(11,12,14,0.75)'
    ctx.stroke()
  }

  ctx.strokeStyle = 'rgba(230,228,224,0.06)'
  ctx.lineWidth = 1
  for (let i = 1; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo((w / 4) * i, 0)
    ctx.lineTo((w / 4) * i, h)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, (h / 4) * i)
    ctx.lineTo(w, (h / 4) * i)
    ctx.stroke()
  }
}

function tick(now) {
  if (!visible) {
    raf = requestAnimationFrame(tick)
    return
  }
  if (!lastDraw) lastDraw = now
  if (running.value) {
    for (let i = 0; i < 2; i++) trainEpoch(net, ds, 0.02, adam)
    epoch.value += 2
    if (epoch.value >= 1600) running.value = false
    if (now - lastDraw > 110) {
      const m = evaluate(net, ds)
      loss.value = m.loss.toFixed(3)
      acc.value = Math.round(m.acc * 100)
      draw()
      lastDraw = now
    }
  }
  raf = requestAnimationFrame(tick)
}

onMounted(() => {
  reset('spirals')
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    for (let i = 0; i < 900; i++) trainEpoch(net, ds, 0.02, adam)
    epoch.value = 900
    running.value = false
    const m = evaluate(net, ds)
    loss.value = m.loss.toFixed(3)
    acc.value = Math.round(m.acc * 100)
  }
  draw()
  observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    lastDraw = 0
  })
  if (canvasEl.value) observer.observe(canvasEl.value)
  if (!reduced) raf = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  observer && observer.disconnect()
})
</script>
