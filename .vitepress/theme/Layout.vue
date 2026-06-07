<template>
  <ClientOnly v-if="frontmatter.layout === 'portfolio'"><Portfolio /></ClientOnly>
  <DefaultLayout v-else>
    <template #layout-top>
      <header class="site-header" id="large-header">
        <canvas ref="canvasEl"></canvas>

        <div :class="`animation-toggler ${animateHeader ? 'top-1' : 'top-2'}`">
          <a href="javascript:void(0)" @click="animateHeader = !animateHeader">
            {{ animateHeader ? 'Выключить анимацию!' : 'Включить анимацию!' }}
          </a>
        </div>

        <div
          v-if="pageTitle"
          class="page-title"
          :style="{ opacity: animateHeader ? 0 : 1 }"
        >{{ pageTitle }}</div>

        <CountDown
          v-else
          class="main-title"
          :style="{ opacity: animateHeader ? 0 : 1 }"
          :countdownDays="1000"
        />
      </header>
    </template>
  </DefaultLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import CountDown from './components/CountDown.vue'
import { WebGPUParticles, isWebGPUSupported } from './components/WebGPUParticles.js'
import Portfolio from './Portfolio.vue'

const DefaultLayout = DefaultTheme.Layout

const { page, frontmatter } = useData()

const pageTitle = computed(() => page.value.title)
const isHomePage = computed(() => page.value.relativePath === 'index.md')

const animateHeader = ref(false)
const canvasEl = ref<HTMLCanvasElement | null>(null)

let useWebGPU = false
let particles: any = null
let raf: number | null = null
let canvas2DParticles: any[] = []

const COLORS = [
  'rgba(26, 204, 255, ',
  'rgba(255, 51, 128, ',
  'rgba(128, 255, 77, ',
  'rgba(255, 153, 26, ',
  'rgba(179, 77, 255, ',
  'rgba(51, 255, 204, ',
  'rgba(255, 230, 51, ',
  'rgba(255, 77, 77, ',
]

let ctx: CanvasRenderingContext2D | null = null
let width = 0
let height = 0

function drawConnections2D() {
  if (!ctx || !canvasEl.value) return
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = 'rgba(2, 2, 4, 0.15)'
  canvasEl.value.width = width
  ctx.fillRect(0, 0, width, height)

  ctx.globalCompositeOperation = 'lighter'

  const connectDistance = 120

  for (let i = 0; i < canvas2DParticles.length; i++) {
    const p = canvas2DParticles[i]

    for (let n = i + 1; n < canvas2DParticles.length; n++) {
      const p2 = canvas2DParticles[n]
      const yd = p2.location.y - p.location.y
      const xd = p2.location.x - p.location.x
      const distance = Math.sqrt(xd * xd + yd * yd)

      if (distance < connectDistance) {
        const alpha = Math.pow(1 - distance / connectDistance, 2) * 0.6
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(p.location.x, p.location.y)
        ctx.lineTo(p2.location.x, p2.location.y)
        ctx.strokeStyle = p.rgba + alpha + ')'
        ctx.stroke()
      }
    }

    p.angle += Math.sin(p.location.x * 0.01 + Date.now() * 0.002) * 0.3
    p.location.x += p.speed * Math.cos((p.angle * Math.PI) / 180)
    p.location.y += p.speed * Math.sin((p.angle * Math.PI) / 180)

    if (p.location.x < -50) p.location.x = width + 50
    if (p.location.x > width + 50) p.location.x = -50
    if (p.location.y < -50) p.location.y = height + 50
    if (p.location.y > height + 50) p.location.y = -50
  }

  for (let i = 0; i < canvas2DParticles.length; i++) {
    const p = canvas2DParticles[i]
    ctx.beginPath()
    ctx.arc(p.location.x, p.location.y, 2 + p.speed, 0, Math.PI * 2)
    ctx.fillStyle = p.rgba + '0.9)'
    ctx.fill()
  }
}

function initCanvas2D() {
  if (!canvasEl.value) return
  ctx = canvasEl.value.getContext('2d')
  canvas2DParticles = []
  const numOfParticles = Math.floor(height / 2.5)

  for (let i = 0; i < numOfParticles; i++) {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]
    canvas2DParticles.push({
      location: { x: Math.random() * width, y: Math.random() * height },
      speed: 0.3 + Math.random() * 1.2,
      angle: Math.random() * 360,
      rgba: color,
    })
  }
  drawConnections2D()
}

function draw() {
  if (animateHeader.value && !useWebGPU) {
    drawConnections2D()
  }
  raf = requestAnimationFrame(draw)
}

async function initWebGPU() {
  if (!canvasEl.value || !isWebGPUSupported()) return false
  particles = new WebGPUParticles(canvasEl.value)
  const success = await particles.init(width, height)
  if (success) {
    useWebGPU = true
    return true
  }
  return false
}

function initHeader() {
  if (!canvasEl.value) return
  if (raf) {
    cancelAnimationFrame(raf)
    raf = null
  }
  width = window.innerWidth
  height = window.innerWidth / (isHomePage.value ? 2 : 4)

  const largeHeader = document.getElementById('large-header')
  if (largeHeader) {
    largeHeader.style.height = height + 'px'
    largeHeader.style.width = width + 'px'
    largeHeader.style.overflow = 'hidden'
  }

  canvasEl.value.width = width
  canvasEl.value.height = height

  if (!useWebGPU && isWebGPUSupported()) {
    initWebGPU().then(success => {
      if (success) {
        particles.render()
      } else {
        initCanvas2D()
        if (animateHeader.value) {
          raf = requestAnimationFrame(draw)
        }
      }
    })
  } else if (!useWebGPU) {
    initCanvas2D()
    if (animateHeader.value) {
      raf = requestAnimationFrame(draw)
    }
  } else if (particles) {
    particles.resize(width, height)
    particles.render()
  }
}

function disableWhenScrolledHalf() {
  if (animateHeader.value && document.documentElement.scrollTop >= height / 2) {
    animateHeader.value = false
  }
}

onMounted(() => {
  window.addEventListener('scroll', disableWhenScrolledHalf)
  window.addEventListener('resize', initHeader)
  initHeader()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', disableWhenScrolledHalf)
  window.removeEventListener('resize', initHeader)
  if (raf) cancelAnimationFrame(raf)
  if (particles && particles.destroy) particles.destroy()
})

watch(animateHeader, val => {
  if (val) {
    if (useWebGPU && particles) {
      particles.start()
    } else {
      raf = requestAnimationFrame(draw)
    }
  } else {
    if (useWebGPU && particles) {
      particles.stop()
    } else {
      if (raf) {
        cancelAnimationFrame(raf)
        raf = null
      }
    }
  }
})
</script>

<style>
.site-header {
  position: relative;
  background: #111;
  background-size: cover;
  background-position: center center;
  z-index: 1;
  color: #fff;
}

.site-header canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.site-header .animation-toggler {
  position: absolute;
  right: 2rem;
  font-size: 1rem;
  z-index: 2;
}

.site-header .animation-toggler a {
  color: yellow;
  font-size: 0.825em;
  text-decoration: none;
  border-bottom: 1px dotted pink;
}

.site-header .animation-toggler.top-1 {
  top: 1em;
}

.site-header .animation-toggler.top-2 {
  top: 2em;
}

.site-header .page-title {
  color: white;
  font-size: calc(1.3em + 3vw);
  letter-spacing: -1px;
  line-height: 1.2;
  position: absolute;
  margin: 0;
  padding: 0;
  text-align: center;
  top: 50%;
  left: 50%;
  transform: translate3d(-50%, -50%, 0);
  transition: opacity 2s ease-in-out 1s;
  z-index: 2;
}

.site-header .main-title {
  font-size: 5vw;
  letter-spacing: -1px;
  line-height: 1.15;
  position: absolute;
  margin: 0;
  padding: 0;
  text-align: center;
  top: 50%;
  left: 50%;
  transform: translate3d(-50%, -50%, 0);
  transition: opacity 2s ease-in-out 1s;
  z-index: 2;
}

.site-header .main-title a {
  color: #fdfdfd;
  text-decoration: none;
}

.site-header .main-title a:hover {
  color: pink;
}
</style>
