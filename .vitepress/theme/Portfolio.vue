<template>
  <div class="portfolio-page">

    <!-- Full-page particle background -->
    <canvas ref="canvasEl" class="bg-canvas" aria-hidden="true" />

    <!-- ── HERO ─────────────────────────────────────────────── -->
    <header class="hero">
      <div class="hero-inner">
        <h1 class="hero-name">Alterfo</h1>
        <p class="hero-roles">Musician&nbsp;·&nbsp;Writer&nbsp;·&nbsp;Maker</p>
      </div>
    </header>

    <!-- ── PROJECTS — колесо жизни ───────────────────────────── -->
    <section class="life-circle-section">
      <div class="section-inner">
        <h2 class="section-title">проекты</h2>
        <LifeCircle :only="CREATIVE_SPHERES" :show-readiness="false" />
        <p class="case-study-links">
          <span class="case-study-label">Ещё:</span>
          <a href="/projects/ar-engine">Аудио-реактив&nbsp;→</a>
          <a href="/projects/polymuse">polymuse&nbsp;→</a>
          <a href="/projects/vacuum-rogues">Вакуумные Пройдохи&nbsp;→</a>
        </p>
      </div>
    </section>

    <div class="staff-divider" aria-hidden="true">
      <svg viewBox="0 0 900 24" preserveAspectRatio="none" class="staff-div-svg">
        <line v-for="y in [4,9,14,19,24]" :key="y" x1="0" :y1="y" x2="900" :y2="y" stroke="currentColor" stroke-opacity="0.14" stroke-width="1"/>
      </svg>
    </div>

    <!-- ── BIO ──────────────────────────────────────────────── -->
    <section class="bio">
      <div class="section-inner bio-inner">
        <div class="bio-text">
          <p>
            Alterfo — это музыка, тексты и игры. Всё, что делается не по работе:
            эмбиент, даунтемпо, инструменты для собственных треков.
          </p>
          <p>
            Самоучка: гитара, барабаны, эрху, кларнет, голос. Изучал гармонию,
            лады, контрапункт — и всё равно сначала играю, потом объясняю.
            Сейчас осваиваю классический репертуар на MIDI-клавиатуре.
          </p>
          <p class="bio-accent">
            Написать можно на <a href="mailto:alterfo@ya.ru">alterfo@ya.ru</a>
            или в телеграм.
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
      <span class="footer-sep">·</span>
      <a href="https://oleg-sidorkin.ru" target="_blank" rel="noopener noreferrer">инженерное&nbsp;→</a>
      <span class="footer-sep">·</span>
      <a href="https://t.me/alterforia" target="_blank" rel="noopener noreferrer" title="Telegram: My pieces of art"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align:middle;margin-right:4px"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>telegram</a>
    </footer>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { createField } from './components/ConnectingParticles.js'
import LifeCircle from './components/LifeCircle.vue'

const CREATIVE_SPHERES = ['music', 'ar', 'piano', 'openpose', 'games']

// ── Data ────────────────────────────────────────────────────────

// ── Particles ───────────────────────────────────────────────────

const canvasEl = ref<HTMLCanvasElement | null>(null)

let field: { resize: () => void; destroy: () => void } | null = null
const onResize = () => field?.resize()

onMounted(() => {
  if (canvasEl.value) {
    field = createField(canvasEl.value, {
      density: 12,
      connectDistance: 100,
    })
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

.life-circle-section, .growth, .expertise, .bio, .staff-divider, .site-footer {
  position: relative;
  z-index: 1;
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
  gap: 0.75rem;
  padding: 4rem 0 2rem;
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

.growth-inner {
  display: flex;
  justify-content: center;
  padding-top: 3.5rem;
  padding-bottom: 3.5rem;
  --cd-value-size: clamp(1.7rem, 5vw, 2.6rem);
}

@media (max-width: 576px) {
  .growth-inner {
    --cd-value-size: 1.7rem;
  }
}

.hero-name {
  font-family: var(--ds-font-display);
  font-size: clamp(2.6rem, 7vw, 4.75rem);
  font-weight: 700;
  font-style: italic;
  color: var(--ds-text-strong);
  margin: 0;
  letter-spacing: -0.02em;
}

.hero-roles {
  font-family: var(--ds-font-display);
  font-size: clamp(1rem, 1.6vw, 1.25rem);
  font-style: italic;
  letter-spacing: 0.01em;
  color: var(--ds-text-muted);
  margin: 0.6rem 0 0;
  font-weight: 400;
}

/* ── Bio ─────────────────────────────────────────────────────── */
.bio {
  padding: 8rem 0 6rem;
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
  color: color-mix(in srgb, var(--ds-text) 75%, transparent);
}

.bio-text p:last-child { margin: 0; }

.bio-accent {
  color: color-mix(in srgb, var(--ds-text) 90%, transparent) !important;
  font-style: italic;
  border-left: 2px solid color-mix(in srgb, var(--ds-violet) 60%, transparent);
  padding-left: 1rem;
  margin-top: 1.25rem !important;
}

/* ── Staff divider ───────────────────────────────────────────── */
.staff-divider {
  padding: 1rem 0;
}
.staff-div-svg {
  width: 100%;
  height: 24px;
  display: block;
}

/* ── Projects — колесо жизни ─────────────────────────────────── */
.life-circle-section {
  padding: 6rem 0 6rem;
}

.case-study-links {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: 0.5rem 1.5rem;
  margin: 2rem 0 0;
  font-size: 0.85rem;
}

.case-study-label {
  color: var(--ds-text-muted);
  letter-spacing: 0.04em;
}

.case-study-links a {
  color: color-mix(in srgb, var(--ds-violet) 55%, var(--ds-text));
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: color 0.2s, border-color 0.2s;
}

.case-study-links a:hover {
  color: var(--ds-text-strong);
  border-bottom-color: currentColor;
}

.section-title {
  font-family: var(--ds-font-display);
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  font-style: italic;
  font-weight: 700;
  color: var(--ds-text-strong);
  margin: 0 0 2.5rem;
  letter-spacing: -0.01em;
}

.title-mono {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 0.75em;
  color: color-mix(in srgb, var(--ds-violet) 55%, var(--ds-text));
  font-style: normal;
}

/* ── Expertise ───────────────────────────────────────────────── */
.expertise {
  padding: 6rem 0 8rem;
}

.expertise-inner {
  display: grid;
  grid-template-columns: 1fr 1px 1fr;
  gap: 0 3rem;
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
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ds-text-strong);
  margin: 0 0 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.exp-icon {
  font-size: 1.5rem;
  color: color-mix(in srgb, var(--ds-violet) 60%, var(--ds-text));
  font-style: normal;
  font-family: 'Times New Roman', Georgia, serif;
  line-height: 1;
}

.exp-icon--code {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 1rem;
  letter-spacing: -0.05em;
  color: color-mix(in srgb, var(--ds-cyan) 65%, var(--ds-text));
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
  color: color-mix(in srgb, var(--ds-text) 80%, transparent);
  line-height: 1.5;
  padding-left: 1rem;
  position: relative;
}

.exp-list li::before {
  content: '—';
  position: absolute;
  left: 0;
  color: color-mix(in srgb, var(--ds-violet) 50%, var(--ds-text-muted));
  font-size: 0.75em;
  top: 0.15em;
}

/* ── Footer ──────────────────────────────────────────────────── */
.site-footer {
  border-top: 1px solid var(--ds-border);
  padding: 2rem 1.5rem;
  text-align: center;
  font-size: 0.8rem;
  color: color-mix(in srgb, var(--ds-text) 70%, transparent);
  letter-spacing: 0.08em;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}

.site-footer a {
  color: color-mix(in srgb, var(--ds-text) 78%, transparent);
  text-decoration: none;
  transition: color 0.2s;
}

.site-footer a:hover {
  color: color-mix(in srgb, var(--ds-text) 95%, transparent);
}

.footer-sep {
  opacity: 0.4;
}
</style>
