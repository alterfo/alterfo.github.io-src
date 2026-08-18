<script setup>
import { computed } from 'vue'

const props = defineProps({ data: Array })

const maxValue = computed(() => {
  if (!props.data || !props.data.length) return 1
  return Math.max(...props.data.map(d => Math.max(d.income || 0, d.expense || 0, Math.abs(d.net || 0))))
})

const chartData = computed(() => {
  const margin = 40
  const width = 800 - 2 * margin
  const height = 260
  const count = (props.data || []).length
  const barWidth = Math.max(20, width / Math.max(1, count * 1.5))
  return { margin, width, height, barWidth }
})

const fmtRub = (x) => {
  const n = Number.isFinite(x) ? x : 0
  if (Math.abs(n) >= 1000000) return (Math.round(n / 100000) / 10) + 'M'
  if (Math.abs(n) >= 1000) return (Math.round(n / 100) / 10) + 'K'
  return Math.round(n).toLocaleString('ru-RU')
}
</script>

<template>
  <g>
    <text x="20" y="25" font-size="12" fill="var(--ds-text-muted)" dominant-baseline="middle">{{ fmtRub(maxValue) }}</text>
    <line x1="40" y1="30" x2="760" y2="30" stroke="var(--ds-border)" stroke-width="1" />
    <text x="20" y="150" font-size="12" fill="var(--ds-text-muted)" dominant-baseline="middle">0</text>
    <line x1="40" y1="150" x2="760" y2="150" stroke="var(--ds-border)" stroke-width="1" />
    <text x="20" y="270" font-size="12" fill="var(--ds-text-muted)" dominant-baseline="middle">{{ fmtRub(-maxValue) }}</text>
    <line x1="40" y1="270" x2="760" y2="270" stroke="var(--ds-border)" stroke-width="1" />

    <g v-for="(item, i) in data" :key="i">
      <rect
        :x="40 + i * (chartData.barWidth + 5)"
        :y="150 - (item.income / maxValue) * 120"
        :width="chartData.barWidth * 0.3"
        :height="(item.income / maxValue) * 120"
        fill="#3f5946"
        opacity="0.6" />
      <rect
        :x="40 + i * (chartData.barWidth + 5) + chartData.barWidth * 0.3 + 2"
        :y="150 - (item.expense / maxValue) * 120"
        :width="chartData.barWidth * 0.3"
        :height="(item.expense / maxValue) * 120"
        fill="#8a5568"
        opacity="0.6" />
      <text
        :x="40 + i * (chartData.barWidth + 5) + chartData.barWidth * 0.5"
        y="265"
        font-size="11"
        fill="var(--ds-text-muted)"
        text-anchor="middle">{{ item.month.slice(5) }}</text>
    </g>

    <g class="fin-legend" transform="translate(40, 20)">
      <rect width="12" height="12" fill="#3f5946" opacity="0.6" />
      <text x="16" y="10" font-size="12" fill="var(--ds-text-muted)">Доход</text>
      <rect x="70" width="12" height="12" fill="#8a5568" opacity="0.6" />
      <text x="86" y="10" font-size="12" fill="var(--ds-text-muted)">Расход</text>
    </g>
  </g>
</template>
