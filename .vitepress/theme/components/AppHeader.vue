<!-- Общая шапка для всех 6 client-only аппов (journal/idef0/openpose/piano/planner/
     decision-journal). Раньше каждый .md инлайнил один и тот же блок вручную (slate
     фон #0f172a/#1e293b, sphere-цвет в двух местах, таглайн-бар «X · Y · Локально») —
     сильный «сгенерировано»-признак. Теперь один компонент на --ds-* токенах;
     акцент = PROJECT_COLORS[sphere] (spectrum.js), без таглайна. -->
<template>
  <div class="app-shell">
    <div class="app-bar" :style="{ borderBottomColor: accentBorder }">
      <HomeMark :active="sphere" />
      <strong class="app-title" :style="{ color: accent }">{{ title }}</strong>
    </div>
    <div class="app-body">
      <ClientOnly>
        <slot />
      </ClientOnly>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import HomeMark from './HomeMark.vue'
import { PROJECT_COLORS } from './spectrum.js'

const props = defineProps({
  // id сферы в spectrum.js PROJECT_COLORS: ar | blog | idef0 | journal | piano | github | decisions | music
  sphere: { type: String, required: true },
  title: { type: String, required: true },
})

const accent = computed(() => PROJECT_COLORS[props.sphere] || 'var(--ds-text)')
// ~30% alpha border tint — mirrors the old rgba(sphere,.3) border-bottom.
const accentBorder = computed(() => `${accent.value}4d`)
</script>

<style scoped>
.app-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--ds-void);
  font-family: var(--ds-font-body);
}

.app-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--ds-surface-solid);
  border-bottom: 1px solid;
  flex-shrink: 0;
}

.app-title {
  font-size: 14px;
  font-family: var(--ds-font-body);
  font-weight: 600;
  letter-spacing: 0.01em;
}

.app-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
