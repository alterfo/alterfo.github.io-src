<script setup>
import { computed } from 'vue'
import { arcPath, fillRadius } from './lifecircle.js'

// Мини-реплика «колеса жизни» с главной страницы — ссылка «домой» в шапках
// приложений. Та же геометрия и готовность сфер, что в LifeCircle.vue, поэтому
// знак читается как «вернуться к кругу»; сфера текущего приложения подсвечена.
const props = defineProps({
  // id сферы текущего приложения: journal | idef0 | ar | piano | openpose | planner | decisions | music
  active: { type: String, default: '' },
})

// Порядок/цвета/готовность зеркалят SEGMENTS в LifeCircle.vue — менять синхронно.
const SPHERES = [
  { id: 'journal',   color: '#ff6688', readiness: 9 },
  { id: 'idef0',     color: '#33ff4d', readiness: 8 },
  { id: 'ar',        color: '#b34dff', readiness: 5 },
  { id: 'piano',     color: '#ffaa22', readiness: 4 },
  { id: 'openpose',  color: '#1accff', readiness: 4 },
  { id: 'planner',   color: '#ff9933', readiness: 4 },
  { id: 'decisions', color: '#33ffcc', readiness: 4 },
  { id: 'music',     color: '#ffe633', readiness: 3 },
]

const GEOM = { cx: 16, cy: 16, innerR: 5, maxOuterR: 15 }
// span = 360/n сфер: каждая сфера i занимает i*span+2 … (i+1)*span−2 (4° зазор).
const SPAN = 360 / SPHERES.length

const segments = computed(() => SPHERES.map((s, i) => ({
  ...s,
  path: arcPath(
    GEOM.cx, GEOM.cy, GEOM.innerR,
    fillRadius(s.readiness, GEOM.innerR, GEOM.maxOuterR),
    i * SPAN + 2, (i + 1) * SPAN - 2,
  ),
  isActive: s.id === props.active,
})))

// Колесо проворачивается ровно на одну сферу при ховере — «жизнь крутится».
const hoverRotation = `${SPAN}deg`
</script>

<template>
  <a href="/" class="home-mark" :class="{ 'no-active': !active }" title="Круг жизни — на главную" aria-label="На главную" :style="{ '--home-rot': hoverRotation }">
    <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
      <path
        v-for="s in segments"
        :key="s.id"
        class="seg"
        :class="{ active: s.isActive }"
        :d="s.path"
        :fill="s.color"
        :style="{ color: s.color }"
      />
    </svg>
  </a>
</template>

<style scoped>
.home-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  text-decoration: none;
  line-height: 0;
}
.home-mark svg {
  transition: transform 0.35s ease;
}
/* Колесо проворачивается на следующую сферу — «жизнь крутится».
   Угол = 360/n сфер (--home-rot задаётся в скрипте). */
.home-mark:hover svg {
  transform: rotate(var(--home-rot, 60deg));
}
.seg {
  opacity: 0.4;
  transition: opacity 0.2s;
}
/* Без активной сферы (блог и др. общие страницы) колесо в среднем тоне, не тусклое */
.home-mark.no-active .seg {
  opacity: 0.75;
}
.seg.active {
  opacity: 1;
  /* currentColor = цвет сферы (style.color на path) */
  filter: drop-shadow(0 0 3px currentColor);
}
.home-mark:hover .seg {
  opacity: 0.85;
}
.home-mark:hover .seg.active {
  opacity: 1;
}
</style>
