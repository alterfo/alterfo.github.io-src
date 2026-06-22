<template>
  <!-- viewBox is widened past the 400×400 wheel so the outside labels never
       clip; the wheel itself stays centred at 200,200 (innerR 55, maxOuterR
       155) exactly as the geometry helpers are unit-tested for. -->
  <svg
    ref="rootEl"
    class="life-circle"
    viewBox="-45 -5 490 410"
    role="group"
    aria-label="Круг жизни — проекты и их готовность"
  >
    <component
      :is="seg.href ? 'a' : 'g'"
      v-for="seg in segments"
      :key="seg.id"
      :href="seg.href || undefined"
      :target="seg.external ? '_self' : undefined"
      class="segment"
      :class="{ soon: seg.soon }"
      :style="{ '--seg-color': seg.color }"
    >
      <title>{{ seg.title }} — {{ seg.soon ? 'скоро' : seg.readiness + '/10' }}</title>
      <path class="seg-bg" :d="seg.bgPath" />
      <path class="seg-fill" :d="seg.fillPath" />
      <path class="seg-stroke" :d="seg.fillPath" />
      <text
        class="seg-label"
        :x="seg.label.x"
        :y="seg.label.y"
        :text-anchor="seg.anchor"
        dominant-baseline="middle"
      >
        <tspan :x="seg.label.x" dy="-0.1em">{{ seg.title }}</tspan>
        <tspan :x="seg.label.x" dy="1.25em" class="seg-readiness">
          {{ seg.soon ? '⟳ скоро' : seg.readiness + '/10' }}
        </tspan>
      </text>
    </component>

    <!-- Center mark: «ship-ranger» entry to /vacuum-rogues, afloat in the donut
         hole. Inline vector (no raster asset), light monochrome so it reads on the
         dark hole without competing with the colored spheres. MUST carry
         target="_self" or VitePress's SPA router intercepts the click and 404s
         (the directory route /vacuum-rogues/ lives outside the router). -->
    <a
      v-if="gameAvailable"
      class="center-mark"
      href="/vacuum-rogues/"
      target="_self"
    >
      <title>vacuum-rogues</title>
      <polygon class="ship-hull" :points="shipPoints" />
      <circle
        class="ship-cockpit"
        :cx="center.cockpit.cx"
        :cy="center.cockpit.cy"
        :r="center.cockpit.r"
      />
      <circle
        v-for="(e, i) in center.engines"
        :key="i"
        class="ship-engine"
        :cx="e.cx"
        :cy="e.cy"
        :r="e.r"
      />
    </a>
  </svg>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { buildSegments, centerMark } from './lifecircle.js'

// Wheel geometry (mirrors the unit-tested helper inputs).
const GEOM = { cx: 200, cy: 200, innerR: 55, maxOuterR: 155, labelR: 170 }

// 8 spheres = 8 spectrum colors. Hardcoded — they only change with a release.
const SEGMENTS = [
  { id: 'journal',   title: 'Дневник',      href: '/journal',          color: '#ff6688', readiness: 9 },
  { id: 'idef0',     title: 'IDEF0',        href: '/idef0',            color: '#33ff4d', readiness: 8 },
  // external: /ar/ — статическое приложение вне VitePress-роутера. Любой атрибут
  // target (даже _self) заставляет роутер отдать клик браузеру (hasAttribute('target')
  // в router.js) — иначе SPA-навигация ведёт на клиентский 404.
  { id: 'ar',        title: 'AR Engine',    href: '/ar/',              color: '#b34dff', readiness: 5, external: true },
  { id: 'piano',     title: 'Piano',        href: '/piano',            color: '#ffaa22', readiness: 4 },
  { id: 'openpose',  title: 'OpenPose',     href: '/openpose',         color: '#1accff', readiness: 4 },
  { id: 'planner',   title: 'Планировщик',  href: '/planner',          color: '#ff9933', readiness: 4 },
  { id: 'decisions', title: 'Решения',      href: '/decision-journal', color: '#33ffcc', readiness: 4 },
  { id: 'music',     title: 'Музыка',       href: '/music',            color: '#ffe633', readiness: 3 },
]

const segments = computed(() => buildSegments(SEGMENTS, GEOM))

// «ship-ranger» mark inscribed in the donut hole (pure geometry, unit-tested).
const center = computed(() => centerMark(GEOM))
const shipPoints = computed(() =>
  center.value.hull.map(([x, y]) => `${x},${y}`).join(' '),
)

const rootEl = ref(null)

// Show the «ship-ranger» entry only when the game is actually reachable at
// /vacuum-rogues/ (HEAD → 200). Until it's deployed there, the donut hole stays
// empty rather than pointing at a 404 (or a "coming soon" placeholder). It auto-
// appears once the game ships — no rebuild needed. `VITE_GAME_LOGO=1` forces it on
// for local visual testing (where /vacuum-rogues/ doesn't exist).
const gameAvailable = ref(false)

// VitePress-префетчер в колбэке IntersectionObserver читает `.pathname` прямо
// с элемента <a>. У SVGAElement такого свойства нет → pathToFile(undefined)
// кидает TypeError и убивает префетч всего батча видимых ссылок. Полифиллим
// недостающие свойства — заодно страницы сфер получают настоящий префетч.
function polyfillAnchors() {
  rootEl.value?.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href')
    if (!href || 'pathname' in a) return
    a.pathname = href
    a.hostname = location.hostname
  })
}

onMounted(async () => {
  polyfillAnchors()
  if (import.meta.env.VITE_GAME_LOGO === '1') {
    gameAvailable.value = true
  } else {
    try {
      const res = await fetch('/vacuum-rogues/', { method: 'HEAD' })
      gameAvailable.value = res.ok
    } catch {
      /* offline / network error → keep the hole empty */
    }
  }
  // The center-mark anchor renders only after the probe flips the flag; polyfill
  // it too so prefetch doesn't choke on the new SVG <a>.
  if (gameAvailable.value) {
    await nextTick()
    polyfillAnchors()
  }
})
</script>

<style scoped>
.life-circle {
  display: block;
  width: 100%;
  max-width: 420px;
  height: auto;
  margin: 0 auto;
  overflow: visible;
}

.segment {
  cursor: pointer;
  transition: transform 0.2s ease, filter 0.2s ease;
  transform-box: fill-box;
  transform-origin: center;
}

.segment.soon {
  cursor: default;
}

/* Faint full-radius track that shows the «empty» part of each sphere. */
.seg-bg {
  fill: var(--seg-color);
  opacity: 0.12;
}

/* Readiness fill — outer radius encodes how complete the sphere is. */
.seg-fill {
  fill: var(--seg-color);
  opacity: 0.85;
  transition: opacity 0.2s ease;
}

.seg-stroke {
  fill: none;
  stroke: var(--seg-color);
  stroke-width: 1.5;
  opacity: 0.9;
}

/* «coming soon» sphere reads as unfinished: dashed track + dim fill. */
.segment.soon .seg-bg {
  stroke: var(--seg-color);
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
  opacity: 0.3;
}

.segment.soon .seg-fill {
  opacity: 0.25;
}

.segment.soon .seg-stroke {
  stroke-dasharray: 5 4;
  opacity: 0.5;
}

.seg-label {
  fill: var(--ds-text);
  font-family: var(--ds-font-body);
  font-size: 13px;
  font-weight: 600;
  pointer-events: none;
}

.seg-readiness {
  fill: var(--ds-text-muted);
  font-size: 11px;
  font-weight: 400;
}

.segment.soon .seg-label {
  fill: var(--ds-text-muted);
  font-style: italic;
}

.segment.soon .seg-readiness {
  fill: var(--ds-text-dim);
}

/* Hover: lift the sphere and glow it in its own color. */
.segment:not(.soon):hover {
  transform: scale(1.02);
}

.segment:not(.soon):hover .seg-fill {
  opacity: 1;
  filter: drop-shadow(0 0 8px var(--seg-color));
}

.segment:not(.soon):hover .seg-label {
  fill: var(--ds-text-strong);
}

/* Center «ship-ranger» mark — light monochrome on the dark hole. Hover mirrors
   the .segment affordance: subtle scale + a neutral glow (no per-sphere color, so
   it stays neutral against the 8 colored spheres). */
.center-mark {
  cursor: pointer;
  transition: transform 0.2s ease, filter 0.2s ease;
  transform-box: fill-box;
  transform-origin: center;
}

.ship-hull {
  fill: var(--ds-text);
}

/* Dark cockpit notch reads as a window on the light hull. */
.ship-cockpit {
  fill: var(--ds-void);
}

.ship-engine {
  fill: var(--ds-text-muted);
}

.center-mark:hover {
  transform: scale(1.06);
}

.center-mark:hover .ship-hull {
  fill: var(--ds-text-strong);
  filter: drop-shadow(0 0 6px var(--ds-text));
}

@media (max-width: 480px) {
  .seg-label { font-size: 11px; }
  .seg-readiness { font-size: 9.5px; }
}
</style>
