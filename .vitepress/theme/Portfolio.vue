<template>
  <div class="portfolio-page">
    <header class="portfolio-header">
      <canvas ref="canvasEl" class="portfolio-canvas"></canvas>
      <div class="portfolio-title">
        <span class="portfolio-name">Alterfo</span>
        <span class="portfolio-subtitle">Oleg Sidorkin</span>
      </div>
    </header>

    <main class="portfolio-main">
      <div class="portfolio-grid">
        <a
          v-for="project in projects"
          :key="project.title"
          :href="project.href"
          :target="project.external ? '_blank' : undefined"
          :rel="project.external ? 'noopener noreferrer' : undefined"
          class="portfolio-card"
          :style="{ '--tag-color': project.color }"
        >
          <div class="card-preview">
            <template v-if="project.id === 'ar'">
              <iframe
                v-if="arAvailable"
                src="/ar/"
                class="ar-iframe"
                scrolling="no"
                tabindex="-1"
                aria-hidden="true"
              ></iframe>
              <div v-else class="card-icon">{{ project.icon }}</div>
            </template>
            <div v-else class="card-icon">{{ project.icon }}</div>
          </div>

          <div class="card-body">
            <span class="card-tag">{{ project.tag }}</span>
            <h2 class="card-title">{{ project.title }}</h2>
            <p class="card-desc">{{ project.desc }}</p>
          </div>
        </a>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

const projects = [
  {
    id: 'ar',
    title: 'AR Engine',
    href: '/ar/',
    desc: 'Audio-reactive WebGPU визуализатор',
    tag: 'WebGPU',
    icon: '🎵',
    color: '#b34dff',
    external: false,
  },
  {
    id: 'blog',
    title: 'Блог',
    href: '/blog/',
    desc: 'Заметки о разработке и музыке',
    tag: 'Blog',
    icon: '📝',
    color: '#1accff',
    external: false,
  },
  {
    id: 'idef0',
    title: 'IDEF0',
    href: '/idef0',
    desc: 'Редактор функциональных диаграмм',
    tag: 'Tool',
    icon: '📐',
    color: '#33ff4d',
    external: false,
  },
  {
    id: 'github',
    title: 'GitHub',
    href: 'https://github.com/alterfo',
    desc: 'Open source проекты',
    tag: 'Profile',
    icon: '⚡',
    color: '#ff9933',
    external: true,
  },
]

const arAvailable = ref(false)
const canvasEl = ref<HTMLCanvasElement | null>(null)

const COLORS = [
  'rgba(179, 77, 255, ',
  'rgba(26, 204, 255, ',
  'rgba(51, 255, 77, ',
  'rgba(255, 153, 26, ',
  'rgba(51, 255, 204, ',
  'rgba(255, 51, 128, ',
]

let ctx: CanvasRenderingContext2D | null = null
let particles: Array<{
  x: number; y: number; vx: number; vy: number; rgba: string; r: number
}> = []
let raf: number | null = null
let w = 0
let h = 0

function initParticles() {
  if (!canvasEl.value) return
  const canvas = canvasEl.value
  w = canvas.width = canvas.offsetWidth
  h = canvas.height = canvas.offsetHeight
  ctx = canvas.getContext('2d')
  particles = []
  const count = Math.floor(w / 12)
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      rgba: COLORS[Math.floor(Math.random() * COLORS.length)],
      r: 1 + Math.random() * 2,
    })
  }
}

function drawFrame() {
  if (!ctx) return
  ctx.fillStyle = 'rgba(10, 0, 32, 0.15)'
  ctx.fillRect(0, 0, w, h)

  const dist = 100
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]
    p.x += p.vx
    p.y += p.vy
    if (p.x < 0) p.x = w
    if (p.x > w) p.x = 0
    if (p.y < 0) p.y = h
    if (p.y > h) p.y = 0

    for (let j = i + 1; j < particles.length; j++) {
      const q = particles[j]
      const dx = q.x - p.x
      const dy = q.y - p.y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < dist) {
        const alpha = (1 - d / dist) * 0.4
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(q.x, q.y)
        ctx.strokeStyle = p.rgba + alpha + ')'
        ctx.lineWidth = 0.8
        ctx.stroke()
      }
    }

    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fillStyle = p.rgba + '0.8)'
    ctx.fill()
  }

  raf = requestAnimationFrame(drawFrame)
}

async function checkArAvailable() {
  try {
    const res = await fetch('/ar/index.html', { method: 'HEAD', cache: 'no-store' })
    arAvailable.value = res.ok
  } catch {
    arAvailable.value = false
  }
}

onMounted(() => {
  initParticles()
  drawFrame()
  window.addEventListener('resize', initParticles)
  checkArAvailable()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', initParticles)
  if (raf) cancelAnimationFrame(raf)
})
</script>

<style scoped>
.portfolio-page {
  min-height: 100vh;
  background: #0a0020;
  color: #e0e0ff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.portfolio-header {
  position: relative;
  height: 40vh;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #0a0020;
}

.portfolio-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.portfolio-title {
  position: relative;
  z-index: 2;
  text-align: center;
}

.portfolio-name {
  display: block;
  font-size: clamp(2.5rem, 8vw, 5rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
  text-shadow: 0 0 40px rgba(179, 77, 255, 0.6);
}

.portfolio-subtitle {
  display: block;
  font-size: clamp(0.9rem, 2.5vw, 1.2rem);
  color: rgba(200, 180, 255, 0.7);
  letter-spacing: 0.1em;
  margin-top: 0.4em;
}

.portfolio-main {
  padding: 3rem 1.5rem 4rem;
  max-width: 900px;
  margin: 0 auto;
}

.portfolio-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
}

@media (max-width: 600px) {
  .portfolio-grid {
    grid-template-columns: 1fr;
  }
}

.portfolio-card {
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.25s, box-shadow 0.25s, transform 0.2s;
  cursor: pointer;
}

.portfolio-card:hover {
  border-color: var(--tag-color, #b34dff);
  box-shadow: 0 0 24px rgba(var(--tag-color-raw, 179, 77, 255), 0.25),
              0 4px 20px rgba(0, 0, 0, 0.4);
  transform: translateY(-3px);
}

.card-preview {
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.03);
  overflow: hidden;
}

.card-icon {
  font-size: 4rem;
  line-height: 1;
  filter: drop-shadow(0 0 12px var(--tag-color, #b34dff));
}

.ar-iframe {
  width: 100%;
  height: 100%;
  border: none;
  pointer-events: none;
  opacity: 0.85;
}

.card-body {
  padding: 1.25rem 1.5rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.card-tag {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--tag-color, #b34dff);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--tag-color, #b34dff);
  border-radius: 4px;
  padding: 0.15em 0.6em;
  width: fit-content;
}

.card-title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}

.card-desc {
  margin: 0;
  font-size: 0.9rem;
  color: rgba(200, 180, 255, 0.65);
  line-height: 1.5;
}
</style>
