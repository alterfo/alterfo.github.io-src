<template>
  <!-- viewBox is widened past the 400×400 wheel so the outside labels never
       clip; the wheel itself stays centred at 200,200 (innerR 55, maxOuterR
       155) exactly as the geometry helpers are unit-tested for. -->
  <svg
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
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { buildSegments } from './lifecircle.js'

// Wheel geometry (mirrors the unit-tested helper inputs).
const GEOM = { cx: 200, cy: 200, innerR: 55, maxOuterR: 155, labelR: 170 }

// 6 spheres = 6 spectrum colors. Hardcoded — they only change with a release.
const SEGMENTS = [
  { id: 'journal',  title: 'Дневник',      href: '/journal',  color: '#ff6688', readiness: 9 },
  { id: 'idef0',    title: 'IDEF0',        href: '/idef0',    color: '#33ff4d', readiness: 8 },
  // external: /ar/ — статическое приложение вне VitePress-роутера. Любой атрибут
  // target (даже _self) заставляет роутер отдать клик браузеру (hasAttribute('target')
  // в router.js) — иначе SPA-навигация ведёт на клиентский 404.
  { id: 'ar',       title: 'AR Engine',    href: '/ar/',      color: '#b34dff', readiness: 5, external: true },
  { id: 'piano',    title: 'Piano',        href: '/piano',    color: '#ffaa22', readiness: 4 },
  { id: 'openpose', title: 'OpenPose',     href: '/openpose', color: '#1accff', readiness: 4 },
  { id: 'planner',  title: 'Планировщик',  href: '/planner',  color: '#ff9933', readiness: 4 },
]

const segments = computed(() => buildSegments(SEGMENTS, GEOM))
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

@media (max-width: 480px) {
  .seg-label { font-size: 11px; }
  .seg-readiness { font-size: 9.5px; }
}
</style>
