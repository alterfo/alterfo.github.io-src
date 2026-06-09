<template>
  <div class="portfolio-page">

    <!-- Full-page particle background -->
    <canvas ref="canvasEl" class="bg-canvas" aria-hidden="true" />

    <!-- ── HERO ─────────────────────────────────────────────── -->
    <header class="hero">
      <div class="hero-inner">
        <h1 class="hero-name">Oleg Sidorkin</h1>
        <p class="hero-roles">Engineer&nbsp;·&nbsp;Musician&nbsp;·&nbsp;Builder</p>
      </div>
    </header>

    <!-- ── PROJECTS ─────────────────────────────────────────── -->
    <section class="projects">
      <div class="section-inner">
        <h2 class="section-title"><span class="title-mono">// </span>projects</h2>
        <div class="projects-grid">
          <a
            v-for="p in projects"
            :key="p.id"
            :href="p.href"
            :target="p.external ? '_blank' : undefined"
            :rel="p.external ? 'noopener noreferrer' : undefined"
            class="card"
            :style="{ '--c': p.color }"
            @click="navigate(p, $event)"
          >
            <div class="card-preview">
              <!-- AR -->
              <template v-if="p.id === 'ar'">
                <iframe v-if="arAvailable" src="/ar/" class="ar-iframe"
                        scrolling="no" tabindex="-1" aria-hidden="true" />
                <svg v-else viewBox="0 0 200 100" class="card-svg" aria-hidden="true">
                  <polyline v-for="(wave, i) in arWaves" :key="i"
                    :points="wave.points" fill="none" :stroke="wave.color" stroke-width="1.2" opacity="0.7"/>
                </svg>
              </template>
              <!-- Blog -->
              <svg v-else-if="p.id === 'blog'" viewBox="0 0 200 100" class="card-svg" aria-hidden="true">
                <rect x="30" y="10" width="140" height="80" rx="3" fill="none" stroke="rgba(26,204,255,0.35)" stroke-width="1"/>
                <rect x="44" y="28" width="90" height="6" rx="3" fill="rgba(26,204,255,0.7)"/>
                <rect x="44" y="38" width="112" height="6" rx="3" fill="rgba(26,204,255,0.3)"/>
                <rect x="44" y="48" width="98" height="6" rx="3" fill="rgba(26,204,255,0.3)"/>
                <rect x="44" y="58" width="105" height="6" rx="3" fill="rgba(26,204,255,0.3)"/>
                <rect x="44" y="68" width="70" height="6" rx="3" fill="rgba(26,204,255,0.3)"/>
              </svg>
              <!-- IDEF0 -->
              <svg v-else-if="p.id === 'idef0'" viewBox="0 0 200 100" class="card-svg" aria-hidden="true">
                <rect x="60" y="25" width="80" height="50" rx="2" fill="none" stroke="rgba(51,255,77,0.7)" stroke-width="1.5"/>
                <line x1="0" y1="50" x2="60" y2="50" stroke="rgba(51,255,77,0.5)" stroke-width="1"/>
                <line x1="140" y1="50" x2="200" y2="50" stroke="rgba(51,255,77,0.5)" stroke-width="1"/>
                <line x1="100" y1="0" x2="100" y2="25" stroke="rgba(51,255,77,0.5)" stroke-width="1"/>
                <line x1="100" y1="75" x2="100" y2="100" stroke="rgba(51,255,77,0.5)" stroke-width="1"/>
                <text x="100" y="54" text-anchor="middle" fill="rgba(51,255,77,0.8)" font-size="10" font-family="monospace">A0</text>
                <text x="52" y="54" text-anchor="middle" fill="rgba(51,255,77,0.6)" font-size="8" font-family="monospace">I</text>
                <text x="148" y="54" text-anchor="middle" fill="rgba(51,255,77,0.6)" font-size="8" font-family="monospace">O</text>
                <text x="104" y="17" text-anchor="middle" fill="rgba(51,255,77,0.6)" font-size="8" font-family="monospace">C</text>
                <text x="104" y="83" text-anchor="middle" fill="rgba(51,255,77,0.6)" font-size="8" font-family="monospace">M</text>
              </svg>
              <!-- Journal -->
              <svg v-else-if="p.id === 'journal'" viewBox="0 0 200 100" class="card-svg" aria-hidden="true">
                <rect x="20" y="8" width="160" height="84" rx="4" fill="#1e1e1e" stroke="rgba(255,100,136,0.5)" stroke-width="1"/>
                <line v-for="ly in [28,44,60,76]" :key="ly" :x1="34" :y1="ly" :x2="166" :y2="ly" stroke="rgba(100,140,220,0.25)" stroke-width="1"/>
                <rect x="34" y="20" width="80" height="5" rx="2" fill="rgba(255,100,136,0.7)"/>
                <rect x="34" y="36" width="110" height="4" rx="2" fill="rgba(255,255,255,0.25)"/>
                <rect x="34" y="52" width="90" height="4" rx="2" fill="rgba(255,255,255,0.2)"/>
                <rect x="34" y="68" width="120" height="4" rx="2" fill="rgba(255,255,255,0.18)"/>
                <text x="166" y="88" text-anchor="end" font-size="8" fill="rgba(255,100,136,0.6)" font-family="monospace">🔒 E2EE</text>
              </svg>
              <!-- Piano -->
              <svg v-else-if="p.id === 'piano'" viewBox="0 0 200 100" class="card-svg" aria-hidden="true">
                <line v-for="y in [18,27,36,45,54]" :key="y" :x1="10" :y1="y" :x2="190" :y2="y" stroke="rgba(255,170,34,0.2)" stroke-width="1"/>
                <rect x="10" y="60" width="14" height="34" rx="1" fill="rgba(255,255,255,0.85)" stroke="rgba(255,170,34,0.4)" stroke-width="0.5"/>
                <rect x="26" y="60" width="14" height="34" rx="1" fill="rgba(255,255,255,0.85)" stroke="rgba(255,170,34,0.4)" stroke-width="0.5"/>
                <rect x="42" y="60" width="14" height="34" rx="1" fill="rgba(74,158,255,0.85)" stroke="rgba(74,158,255,0.6)" stroke-width="0.5"/>
                <rect x="58" y="60" width="14" height="34" rx="1" fill="rgba(255,255,255,0.85)" stroke="rgba(255,170,34,0.4)" stroke-width="0.5"/>
                <rect x="74" y="60" width="14" height="34" rx="1" fill="rgba(200,200,200,0.4)" stroke="rgba(255,170,34,0.2)" stroke-width="0.5"/>
                <rect x="90" y="60" width="14" height="34" rx="1" fill="rgba(255,255,255,0.85)" stroke="rgba(255,170,34,0.4)" stroke-width="0.5"/>
                <rect x="106" y="60" width="14" height="34" rx="1" fill="rgba(255,255,255,0.85)" stroke="rgba(255,170,34,0.4)" stroke-width="0.5"/>
                <rect x="32" y="60" width="9" height="21" rx="1" fill="#222" stroke="#111" stroke-width="0.5"/>
                <rect x="64" y="60" width="9" height="21" rx="1" fill="#222" stroke="#111" stroke-width="0.5"/>
                <rect x="97" y="60" width="9" height="21" rx="1" fill="#222" stroke="#111" stroke-width="0.5"/>
                <text x="49" y="52" text-anchor="middle" fill="rgba(74,158,255,0.9)" font-size="8" font-family="monospace">C4</text>
                <circle cx="49" cy="36" r="3" fill="rgba(255,170,34,0.7)"/>
                <text x="140" y="80" text-anchor="middle" fill="rgba(255,170,34,0.5)" font-size="9" font-family="monospace">MIDI</text>
              </svg>
              <!-- OpenPose -->
              <svg v-else-if="p.id === 'openpose'" viewBox="0 0 200 100" class="card-svg" aria-hidden="true">
                <!-- black background -->
                <rect x="0" y="0" width="200" height="100" fill="#0a0a0a"/>
                <!-- skeleton: head -->
                <circle cx="100" cy="14" r="7" fill="none" stroke="rgba(0,229,255,0.85)" stroke-width="1.5"/>
                <!-- neck -->
                <line x1="100" y1="21" x2="100" y2="32" stroke="rgba(0,229,255,0.7)" stroke-width="1.5"/>
                <!-- shoulders -->
                <line x1="100" y1="32" x2="72" y2="36" stroke="rgba(255,85,0,0.8)" stroke-width="1.5"/>
                <line x1="100" y1="32" x2="128" y2="36" stroke="rgba(85,255,0,0.8)" stroke-width="1.5"/>
                <!-- right arm -->
                <line x1="72" y1="36" x2="58" y2="52" stroke="rgba(255,170,0,0.8)" stroke-width="1.5"/>
                <line x1="58" y1="52" x2="46" y2="66" stroke="rgba(255,255,0,0.8)" stroke-width="1.5"/>
                <!-- left arm -->
                <line x1="128" y1="36" x2="142" y2="52" stroke="rgba(170,255,0,0.8)" stroke-width="1.5"/>
                <line x1="142" y1="52" x2="154" y2="66" stroke="rgba(0,255,0,0.8)" stroke-width="1.5"/>
                <!-- torso to hips -->
                <line x1="100" y1="32" x2="92" y2="58" stroke="rgba(0,255,85,0.8)" stroke-width="1.5"/>
                <line x1="100" y1="32" x2="108" y2="58" stroke="rgba(0,255,255,0.8)" stroke-width="1.5"/>
                <!-- right leg -->
                <line x1="92" y1="58" x2="86" y2="76" stroke="rgba(0,170,255,0.8)" stroke-width="1.5"/>
                <line x1="86" y1="76" x2="82" y2="92" stroke="rgba(0,85,255,0.8)" stroke-width="1.5"/>
                <!-- left leg -->
                <line x1="108" y1="58" x2="114" y2="76" stroke="rgba(0,0,255,0.8)" stroke-width="1.5"/>
                <line x1="114" y1="76" x2="118" y2="92" stroke="rgba(85,0,255,0.8)" stroke-width="1.5"/>
                <!-- joint dots -->
                <circle cx="100" cy="32" r="3" fill="rgba(0,229,255,0.9)"/>
                <circle cx="72" cy="36" r="2.5" fill="rgba(255,85,0,0.9)"/>
                <circle cx="128" cy="36" r="2.5" fill="rgba(85,255,0,0.9)"/>
                <circle cx="58" cy="52" r="2.5" fill="rgba(255,170,0,0.9)"/>
                <circle cx="142" cy="52" r="2.5" fill="rgba(170,255,0,0.9)"/>
                <circle cx="46" cy="66" r="2.5" fill="rgba(255,255,0,0.9)"/>
                <circle cx="154" cy="66" r="2.5" fill="rgba(0,255,0,0.9)"/>
                <circle cx="92" cy="58" r="2.5" fill="rgba(0,255,85,0.9)"/>
                <circle cx="108" cy="58" r="2.5" fill="rgba(0,255,255,0.9)"/>
              </svg>
              <!-- GitHub -->
              <svg v-else-if="p.id === 'github'" viewBox="0 0 200 100" class="card-svg" aria-hidden="true">
                <text x="10" y="16" font-size="9" fill="rgba(255,153,26,0.5)" font-family="monospace">$ git log --oneline</text>
                <rect x="10" y="18" width="100" height="5" rx="2" fill="rgba(255,153,26,0.8)"/>
                <rect x="10" y="30" width="140" height="5" rx="2" fill="rgba(255,153,26,0.4)"/>
                <rect x="10" y="42" width="80" height="5" rx="2" fill="rgba(255,153,26,0.6)"/>
                <rect x="10" y="54" width="120" height="5" rx="2" fill="rgba(255,153,26,0.35)"/>
                <rect x="10" y="66" width="60" height="5" rx="2" fill="rgba(255,153,26,0.5)"/>
                <rect x="10" y="78" width="110" height="5" rx="2" fill="rgba(255,153,26,0.3)"/>
              </svg>
            </div>
            <div class="card-body">
              <span class="card-tag">{{ p.tag }}</span>
              <h2 class="card-title">{{ p.title }}</h2>
              <p class="card-desc">{{ p.desc }}</p>
            </div>
          </a>
        </div>
      </div>
    </section>

    <!-- staff divider -->
    <div class="staff-divider" aria-hidden="true">
      <svg viewBox="0 0 900 24" preserveAspectRatio="none" class="staff-div-svg">
        <line v-for="y in [4,9,14,19,24]" :key="y" x1="0" :y1="y" x2="900" :y2="y" stroke="rgba(200,180,255,0.12)" stroke-width="1"/>
        <text x="12" y="24" font-size="24" fill="rgba(179,77,255,0.4)" font-family="'Times New Roman', Georgia, serif">𝄽</text>
      </svg>
    </div>

    <!-- ── EXPERTISE ─────────────────────────────────────────── -->
    <section class="expertise">
      <div class="section-inner expertise-inner">

        <div class="exp-col">
          <h3 class="exp-heading">
            <span class="exp-icon" aria-hidden="true">𝄞</span> Music
          </h3>
          <ul class="exp-list">
            <li v-for="s in musicSkills" :key="s">{{ s }}</li>
          </ul>
        </div>

        <div class="exp-divider" aria-hidden="true"></div>

        <div class="exp-col">
          <h3 class="exp-heading">
            <span class="exp-icon exp-icon--code" aria-hidden="true">{/}</span> Code
          </h3>
          <ul class="exp-list">
            <li v-for="s in codeSkills" :key="s">{{ s }}</li>
          </ul>
        </div>

      </div>
    </section>

    <!-- ── BIO ──────────────────────────────────────────────── -->
    <section class="bio">
      <div class="section-inner bio-inner">
        <div class="bio-text">
          <p>
            Самоучка в музыке — гитара, барабаны, эрху, кларнет, голос, DAW.
            Изучал теорию музыки: гармония, лады, контрапункт. Пишу и выпускаю
            треки, снимаю клипы через аудио-реактивные пайплайны на ComfyUI.
            Сейчас осваиваю классический репертуар на MIDI-клавиатуре.
          </p>
          <p>
            В IT 20 лет: 10 лет системный инженер, 13 лет в разработке —
            последние 10 как Fullstack TypeScript. Сейчас технический лидер
            в Альфа-Банке. Внедрил CODEOWNERS по всей компании — TTL упал
            с 9&nbsp;месяцев до 2–3. Монорепо ускорило платформенные релизы
            с полугода до квартала. Нанял 10 разработчиков — ни один не ушёл.
          </p>
          <p class="bio-accent">
            Оба мира устроены одинаково: сложные системы требуют правильной
            структуры — и там, и там.
          </p>
        </div>
      </div>
    </section>

    <!-- ── FOOTER ────────────────────────────────────────────── -->
    <footer class="site-footer">
      <span>alterfo</span>
      <span class="footer-sep">·</span>
      <a href="https://github.com/alterfo" target="_blank" rel="noopener noreferrer">github</a>
      <span class="footer-sep">·</span>
      <a href="https://t.me/alterforia" target="_blank" rel="noopener noreferrer" title="Telegram: My pieces of art"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align:middle;margin-right:4px"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>telegram</a>
    </footer>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { createField } from './components/ConnectingParticles.js'

// ── Data ────────────────────────────────────────────────────────

const arWaves = (() => {
  const amps = [18, 30, 42, 28, 14]
  const colors = ['#b34dff', '#1accff', '#33ff4d', '#ff9933', '#ff3380']
  return [0, 1, 2, 3, 4].map(i => ({
    color: colors[i],
    points: Array.from({ length: 40 }, (_, k) =>
      `${k * 5},${50 + amps[i] * Math.sin((k + i * 4) * 0.4)}`
    ).join(' '),
  }))
})()

const staffNotes = [
  { x: 110, y: 27, sym: '♩' }, { x: 175, y: 37, sym: '♩' },
  { x: 250, y: 17, sym: '♪' }, { x: 330, y: 42, sym: '♩' },
  { x: 400, y: 27, sym: '♪' }, { x: 470, y: 32, sym: '♩' },
  { x: 545, y: 17, sym: '♪' }, { x: 615, y: 37, sym: '♩' },
]

const projects = [
  { id: 'ar',      title: 'AR Engine', href: '/ar/',
    desc: 'Audio-reactive WebGPU визуализатор — частицы и поля реагируют на аудио в реальном времени.',
    tag: 'WebGPU', color: '#b34dff', external: false },
  { id: 'blog',    title: 'Блог', href: '/blog/',
    desc: 'Заметки: разработка, архитектура, музыка, инструменты. Пишу про реальный опыт.',
    tag: 'Blog', color: '#1accff', external: false },
  { id: 'idef0',   title: 'IDEF0 Editor', href: '/idef0',
    desc: 'Браузерный редактор функциональных диаграмм. FIPS 183, иерархия, экспорт SVG/PNG.',
    tag: 'Tool', color: '#33ff4d', external: false },
  { id: 'journal', title: 'Дневник', href: '/journal',
    desc: 'Зашифрованный локальный дневник с целью 500 слов в день. E2EE, IndexedDB. P2P-синхронизация — в планах.',
    tag: 'Tool', color: '#ff6688', external: false },
  { id: 'piano',   title: 'Piano Teacher', href: '/piano',
    desc: 'MIDI-тренажёр: учи пьесы нота за нотой. Web MIDI API, VexFlow, IndexedDB.',
    tag: 'Tool', color: '#ffaa22', external: false },
  { id: 'openpose', title: 'OpenPose Editor', href: '/openpose',
    desc: 'Редактор поз для ControlNet: MediaPipe детекция, ручная правка скелетов, экспорт PNG + JSON.',
    tag: 'AI Tool', color: '#00e5ff', external: false },
  { id: 'github',  title: 'GitHub', href: 'https://github.com/alterfo',
    desc: 'Open source проекты, эксперименты, инструменты.',
    tag: 'Profile', color: '#ff9933', external: true },
]

const musicSkills = [
  'Гитара · Барабаны · Эрху · Кларнет · Голос',
  'DAW — продакшн, сведение, мастеринг',
  'Теория музыки, гармония, лады',
  'Собственные релизы и композиции',
  'Классический репертуар на MIDI (в процессе)',
]

const codeSkills = [
  'Fullstack TypeScript · 10+ лет',
  'Vue · React · Angular · Node.js · Nest.js',
  'AI · RAG · Агентные флоу · OpenAI API',
  'Kubernetes · Docker · Kafka · Монорепо',
  'Тимлид: найм, рост сеньоров, техдолг → 0',
]

// ── Particles ───────────────────────────────────────────────────

const arAvailable = ref(false)
const canvasEl = ref<HTMLCanvasElement | null>(null)

let field: { resize: () => void; destroy: () => void } | null = null
const onResize = () => field?.resize()

function navigate(project: { href: string; external: boolean }, event: MouseEvent) {
  if (project.external) return
  event.preventDefault()
  window.location.href = project.href
}

async function checkArAvailable() {
  try {
    const res = await fetch('/ar/index.html', { method: 'HEAD', cache: 'no-store' })
    arAvailable.value = res.ok
  } catch { arAvailable.value = false }
}

onMounted(() => {
  if (canvasEl.value) {
    field = createField(canvasEl.value, { density: 12, connectDistance: 100 })
  }
  window.addEventListener('resize', onResize)
  checkArAvailable()
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  field?.destroy()
})
</script>

<style scoped>
/* ── Reset & base ─────────────────────────────────────────────── */
.portfolio-page {
  position: relative;
  min-height: 100vh;
  background: transparent;
  color: #e0e0ff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  z-index: 1;
}

.section-inner {
  max-width: 860px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

/* Sections sit above the canvas with a dark transparent backdrop */
.projects, .expertise, .bio, .staff-divider, .site-footer {
  position: relative;
  z-index: 1;
  background: rgba(10, 0, 32, 0.75);
}

/* ── Full-page canvas background ─────────────────────────────── */
.bg-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}

/* ── Hero ────────────────────────────────────────────────────── */
.hero {
  position: relative;
  height: 90px;
  display: flex;
  align-items: center;
  z-index: 1;
}

.hero-inner {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: baseline;
  gap: 1rem;
  padding: 0 1.5rem;
}

.hero-name {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.65rem;
  font-weight: 700;
  color: #fff;
  margin: 0;
  text-shadow: 0 0 40px rgba(179, 77, 255, 0.6);
  white-space: nowrap;
}

.hero-roles {
  font-size: 0.75rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(200, 180, 255, 0.55);
  margin: 0;
  font-weight: 400;
  white-space: nowrap;
}

/* ── Bio ─────────────────────────────────────────────────────── */
.bio {
  padding: 4rem 0 3rem;
}

.bio-inner {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.bio-text {
  max-width: 640px;
}

.bio-text p {
  margin: 0 0 1rem;
  font-size: 1rem;
  line-height: 1.75;
  color: rgba(220, 210, 255, 0.75);
}

.bio-text p:last-child { margin: 0; }

.bio-accent {
  color: rgba(200, 180, 255, 0.9) !important;
  font-style: italic;
  border-left: 2px solid rgba(179, 77, 255, 0.6);
  padding-left: 1rem;
  margin-top: 1.25rem !important;
}

/* ── Staff divider ───────────────────────────────────────────── */
.staff-divider {
  padding: 0.5rem 0;
}
.staff-div-svg {
  width: 100%;
  height: 24px;
  display: block;
}

/* ── Projects ────────────────────────────────────────────────── */
.projects {
  padding: 2rem 0 3.5rem;
}

.section-title {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.4rem, 3.5vw, 2rem);
  font-weight: 700;
  color: #fff;
  margin: 0 0 2rem;
  letter-spacing: -0.01em;
}

.title-mono {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 0.75em;
  color: rgba(179, 77, 255, 0.8);
  font-style: normal;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.5rem;
}

@media (max-width: 580px) {
  .projects-grid { grid-template-columns: 1fr; }
}

.card {
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.22s, box-shadow 0.22s, transform 0.18s;
  cursor: pointer;
}

.card:hover {
  border-color: var(--c, #b34dff);
  box-shadow: 0 0 28px color-mix(in srgb, var(--c, #b34dff) 30%, transparent),
              0 4px 20px rgba(0, 0, 0, 0.4);
  transform: translateY(-3px);
}

.card-preview {
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.025);
  overflow: hidden;
}

.card-svg {
  width: 100%;
  height: 100%;
}

.ar-iframe {
  width: 100%;
  height: 100%;
  border: none;
  pointer-events: none;
  opacity: 0.85;
}

.card-body {
  padding: 1.1rem 1.4rem 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.card-tag {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c, #b34dff);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--c, #b34dff);
  border-radius: 3px;
  padding: 0.15em 0.55em;
  width: fit-content;
  opacity: 0.9;
}

.card-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #fff;
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.2;
}

.card-desc {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(200, 180, 255, 0.55);
  line-height: 1.55;
}

/* ── Expertise ───────────────────────────────────────────────── */
.expertise {
  padding: 3.5rem 0 4.5rem;
}

.expertise-inner {
  display: grid;
  grid-template-columns: 1fr 1px 1fr;
  gap: 0 2.5rem;
  align-items: start;
}

@media (max-width: 580px) {
  .expertise-inner {
    grid-template-columns: 1fr;
    gap: 2.5rem 0;
  }
  .exp-divider { display: none; }
}

.exp-divider {
  background: rgba(255, 255, 255, 0.08);
  height: 100%;
  min-height: 180px;
}

.exp-heading {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.3rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 1.1rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.exp-icon {
  font-size: 1.5rem;
  color: rgba(179, 77, 255, 0.85);
  font-style: normal;
  font-family: 'Times New Roman', Georgia, serif;
  line-height: 1;
}

.exp-icon--code {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 1rem;
  letter-spacing: -0.05em;
  color: rgba(26, 204, 255, 0.85);
}

.exp-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.exp-list li {
  font-size: 0.88rem;
  color: rgba(200, 180, 255, 0.65);
  line-height: 1.5;
  padding-left: 1rem;
  position: relative;
}

.exp-list li::before {
  content: '—';
  position: absolute;
  left: 0;
  color: rgba(179, 77, 255, 0.45);
  font-size: 0.75em;
  top: 0.15em;
}

/* ── Footer ──────────────────────────────────────────────────── */
.site-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding: 1.5rem;
  text-align: center;
  font-size: 0.8rem;
  color: rgba(200, 180, 255, 0.3);
  letter-spacing: 0.08em;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.site-footer a {
  color: rgba(200, 180, 255, 0.4);
  text-decoration: none;
  transition: color 0.2s;
}

.site-footer a:hover {
  color: rgba(200, 180, 255, 0.8);
}

.footer-sep {
  opacity: 0.4;
}
</style>
