<script setup>
const props = defineProps({ label: String, amount: Number, total: Number })

const fmtRub = (x) => {
  const n = Number.isFinite(x) ? x : 0
  return Math.round(n).toLocaleString('ru-RU') + ' ₽'
}
</script>

<template>
  <div class="fin-category-bar">
    <div class="fin-category-label">{{ label }}</div>
    <div class="fin-category-bar-bg">
      <div class="fin-category-bar-fill" :style="{ width: (100 * (amount / (total || 1))) + '%' }"></div>
    </div>
    <div class="fin-category-amount">{{ fmtRub(amount) }}</div>
  </div>
</template>

<style scoped>
.fin-category-bar {
  display: grid;
  grid-template-columns: 120px 1fr 100px;
  gap: 12px;
  align-items: center;
  padding: 8px 0;
  font-size: 13px;
}
.fin-category-label {
  color: var(--ds-text);
  text-align: left;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}
.fin-category-bar-bg {
  background: var(--ds-surface-solid);
  border: 1px solid var(--ds-border);
  border-radius: 4px;
  height: 20px;
  overflow: hidden;
}
.fin-category-bar-fill {
  background: var(--ds-accent);
  height: 100%;
  transition: width .15s;
}
.fin-category-amount {
  text-align: right;
  color: var(--ds-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 720px) {
  .fin-category-bar { grid-template-columns: 80px 1fr 80px; }
}
</style>
