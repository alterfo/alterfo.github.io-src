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
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import CountDown from './components/CountDown.vue'
import { WebGPUParticles, isWebGPUSupported } from './components/WebGPUParticles.js'
import { createField } from './components/ConnectingParticles.js'
import Portfolio from './Portfolio.vue'

const DefaultLayout = DefaultTheme.Layout

const { page, frontmatter } = useData()

const pageTitle = computed(() => page.value.title)
const isHomePage = computed(() => page.value.relativePath === 'index.md')

const animateHeader = ref(false)
const canvasEl = ref<HTMLCanvasElement | null>(null)

let useWebGPU = false
let particles: any = null
// Shared 2D connecting-particles fallback (see ConnectingParticles.js). Single
// source of truth — the old drawConnections2D/initCanvas2D/COLORS copy is gone.
let field: { start: () => void; stop: () => void; resize: () => void; destroy: () => void } | null = null

let width = 0
let height = 0
// canvas, на котором реально созданы particles/field — для детекта пересоздания
let boundEl: HTMLCanvasElement | null = null

// Create the 2D field on first use, otherwise just resize it; then sync the
// rAF loop to the animation toggle (paused = one static frame already drawn).
function ensureField2D() {
  if (!canvasEl.value) return
  if (field) {
    field.resize()
  } else {
    boundEl = canvasEl.value
    field = createField(canvasEl.value, {
      count: () => Math.floor(height / 2.5),
      connectDistance: 120,
      fade: 'rgba(2,2,4,0.15)',
      autoStart: false,
      getSize: () => ({ w: width, h: height }),
    })
  }
  if (animateHeader.value) field.start()
  else field.stop()
}

// Single-flight: initHeader может выполниться дважды подряд (onMounted +
// watch(canvasEl) на первом монтировании) — повторный вызов до завершения
// init создавал ВТОРОЙ WebGPUParticles на том же canvas; они дрались за
// контекст, 2D-фолбэк получал getContext('2d') === null (canvas уже занят
// webgpu-контекстом) — и шапка оставалась пустой. Один canvas — один init.
let webgpuInit: Promise<boolean> | null = null

function initWebGPU(): Promise<boolean> {
  if (!canvasEl.value || !isWebGPUSupported()) return Promise.resolve(false)
  if (!webgpuInit) {
    boundEl = canvasEl.value
    particles = new WebGPUParticles(canvasEl.value)
    webgpuInit = particles.init(width, height).then((success: boolean) => {
      if (success) useWebGPU = true
      return success
    })
  }
  return webgpuInit
}

function initHeader() {
  if (!canvasEl.value) return
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
        ensureField2D()
      }
    })
  } else if (!useWebGPU) {
    ensureField2D()
  } else if (particles) {
    particles.resize(width, height)
    // Пересев на каждую страницу — по задумке узор частиц везде разный
    // (раньше это давала полная перезагрузка, теперь буфер живёт между SPA-переходами)
    particles.reseed()
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
  field?.destroy()
  if (particles && particles.destroy) particles.destroy()
})

// Re-init when the canvas (re)appears. Сравниваем с boundEl, а не с prev:
// при уходе на главную DefaultLayout размонтируется и ref становится null,
// поэтому prev при следующем входе всегда null — а particles/field остаются
// привязаны к МЁРТВОМУ canvas: рендер уходил в отсоединённый элемент, и при
// повторном входе в блог шапка оставалась пустой. Новый элемент = полный сброс.
watch(canvasEl, (el) => {
  if (!el) return
  if (boundEl && el !== boundEl) {
    if (particles && particles.destroy) particles.destroy()
    particles = null
    useWebGPU = false
    webgpuInit = null
    field?.destroy()
    field = null
    boundEl = null
  }
  nextTick(initHeader)
})

// Re-init on SPA navigation so header height (homepage=50vh vs others=25vh) stays correct.
watch(() => page.value.relativePath, () => { if (canvasEl.value) nextTick(initHeader) })

watch(animateHeader, val => {
  if (val) {
    if (useWebGPU && particles) {
      particles.start()
    } else {
      field?.start()
    }
  } else {
    if (useWebGPU && particles) {
      particles.stop()
    } else {
      field?.stop()
    }
  }
})
</script>

<style>
.site-header {
  position: relative;
  background: var(--ds-void);
  background-size: cover;
  background-position: center center;
  z-index: 1;
  color: var(--ds-text-strong);
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
  color: var(--ds-text-muted);
  font-size: 0.825em;
  text-decoration: none;
  border-bottom: 1px dotted var(--ds-border);
  transition: color 0.15s, border-color 0.15s;
}

.site-header .animation-toggler a:hover {
  color: var(--ds-text-strong);
  border-color: var(--ds-cyan);
}


.site-header .animation-toggler.top-1 {
  top: 1em;
}

.site-header .animation-toggler.top-2 {
  top: 2em;
}

.site-header .page-title {
  color: var(--ds-text-strong);
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
  color: var(--ds-text-strong);
  text-decoration: none;
}

.site-header .main-title a:hover {
  color: pink;
}
</style>
