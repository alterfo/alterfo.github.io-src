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
      <CountDown class="hero-countdown" :countdownDays="1000" />
    </header>

    <!-- ── PROJECTS — колесо жизни ───────────────────────────── -->
    <section class="life-circle-section">
      <div class="section-inner">
        <h2 class="section-title"><span class="title-mono">// </span>проекты</h2>
        <LifeCircle />
        <p class="case-study-links">
          <span class="case-study-label">Разборы:</span>
          <a href="/projects/ar-engine">AR Engine&nbsp;→</a>
          <a href="/projects/idef0-editor">IDEF0 Editor&nbsp;→</a>
        </p>
      </div>
    </section>

    <!-- staff divider -->
    <div class="staff-divider" aria-hidden="true">
      <!-- Только линейки стана: глиф паузы (U+1D13D) убран — на части систем
           рендерился «тофу»-квадратом, а preserveAspectRatio="none" ещё и
           расплющивал его по горизонтали. -->
      <svg viewBox="0 0 900 24" preserveAspectRatio="none" class="staff-div-svg">
        <line v-for="y in [4,9,14,19,24]" :key="y" x1="0" :y1="y" x2="900" :y2="y" stroke="rgba(200,180,255,0.12)" stroke-width="1"/>
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
      <a href="/blog/">блог</a>
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
import CountDown from './components/CountDown.vue'
import LifeCircle from './components/LifeCircle.vue'

// ── Data ────────────────────────────────────────────────────────

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

const canvasEl = ref<HTMLCanvasElement | null>(null)

let field: { resize: () => void; destroy: () => void } | null = null
const onResize = () => field?.resize()

onMounted(() => {
  if (canvasEl.value) {
    field = createField(canvasEl.value, { density: 12, connectDistance: 100 })
  }
  window.addEventListener('resize', onResize)
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
  color: var(--ds-text);
  font-family: var(--ds-font-body);
  z-index: 1;
}

.section-inner {
  max-width: 860px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

/* Sections sit above the canvas with a dark transparent backdrop */
.life-circle-section, .expertise, .bio, .staff-divider, .site-footer {
  position: relative;
  z-index: 1;
  background: var(--ds-surface);
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
  height: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.5rem 0 0.5rem;
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

/* Countdown «1000 дней роста» — scaled compactly into the hero.
   transform (not r/cx/cy override) keeps the ring-fill math correct;
   the negative margin reclaims the empty space the scale leaves below. */
.hero-countdown {
  position: relative;
  z-index: 2;
  transform: scale(0.62);
  transform-origin: top center;
  margin-bottom: -7rem;
}

@media (max-width: 768px) {
  .hero-countdown {
    transform: scale(0.85);
    margin-bottom: -2.5rem;
  }
}

@media (max-width: 576px) {
  .hero-countdown {
    transform: none;
    margin-bottom: 0;
  }
}

.hero-name {
  font-family: var(--ds-font-display);
  font-size: 1.65rem;
  font-weight: 700;
  color: var(--ds-text-strong);
  margin: 0;
  text-shadow: var(--ds-glow-violet);
  white-space: nowrap;
}

.hero-roles {
  font-size: 0.75rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ds-text-muted);
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
  border-left: 2px solid color-mix(in srgb, var(--ds-violet) 60%, transparent);
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

/* ── Projects — колесо жизни ─────────────────────────────────── */
.life-circle-section {
  padding: 2rem 0 3.5rem;
}

/* «Подробнее» links to the long-form case studies (the wheel spheres
   themselves still link to the live apps). */
.case-study-links {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: 0.4rem 1.25rem;
  margin: 1.75rem 0 0;
  font-size: 0.85rem;
}

.case-study-label {
  color: var(--ds-text-muted);
  letter-spacing: 0.04em;
}

.case-study-links a {
  color: color-mix(in srgb, var(--ds-violet) 85%, white 15%);
  text-decoration: none;
  transition: color 0.2s, text-shadow 0.2s;
}

.case-study-links a:hover {
  color: var(--ds-text-strong);
  text-shadow: var(--ds-glow-violet);
}

.section-title {
  font-family: var(--ds-font-display);
  font-size: clamp(1.4rem, 3.5vw, 2rem);
  font-weight: 700;
  color: var(--ds-text-strong);
  margin: 0 0 2rem;
  letter-spacing: -0.01em;
}

.title-mono {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 0.75em;
  color: color-mix(in srgb, var(--ds-violet) 80%, transparent);
  font-style: normal;
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
  background: var(--ds-border);
  height: 100%;
  min-height: 180px;
}

.exp-heading {
  font-family: var(--ds-font-display);
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--ds-text-strong);
  margin: 0 0 1.1rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.exp-icon {
  font-size: 1.5rem;
  color: color-mix(in srgb, var(--ds-violet) 85%, transparent);
  font-style: normal;
  font-family: 'Times New Roman', Georgia, serif;
  line-height: 1;
}

.exp-icon--code {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 1rem;
  letter-spacing: -0.05em;
  color: color-mix(in srgb, var(--ds-cyan) 85%, transparent);
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
  color: color-mix(in srgb, var(--ds-violet) 45%, transparent);
  font-size: 0.75em;
  top: 0.15em;
}

/* ── Footer ──────────────────────────────────────────────────── */
.site-footer {
  border-top: 1px solid var(--ds-border);
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
