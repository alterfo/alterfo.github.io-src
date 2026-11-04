<script setup>
import { watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

function close() {
  emit('update:modelValue', false)
}

function onKeydown(e) {
  if (e.key === 'Escape' && props.modelValue) close()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="help-overlay" @click.self="close">
      <div class="help-modal" role="dialog" aria-modal="true">
        <button class="help-close" @click="close" aria-label="Закрыть">✕</button>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.help-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 8, 6, 0.75);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.help-modal {
  position: relative;
  background: var(--ds-surface-solid);
  border: 1px solid rgba(122, 51, 72, 0.3);
  border-radius: 12px;
  padding: 2rem;
  max-width: 560px;
  width: 100%;
  max-height: 80vh;
  font-family: var(--ds-font-body);
  overflow-y: auto;
  color: rgba(230, 228, 224, 0.9);
}
.help-modal :deep(h2) {
  color: rgba(230, 228, 224, 0.95);
  margin: 0 0 1rem;
  font-size: 1.2rem;
}
.help-modal :deep(h3) {
  color: rgba(230, 228, 224, 0.7);
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 1.2rem 0 0.5rem;
}
.help-modal :deep(p),
.help-modal :deep(li) {
  font-size: 0.88rem;
  line-height: 1.6;
  color: rgba(230, 228, 224, 0.75);
}
.help-modal :deep(strong) {
  color: rgba(230, 228, 224, 0.95);
}
.help-modal :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  margin: 0.5rem 0;
}
.help-modal :deep(td),
.help-modal :deep(th) {
  padding: 0.35rem 0.6rem;
  border: 1px solid rgba(230, 228, 224, 0.15);
  text-align: left;
}
.help-modal :deep(th) {
  color: rgba(230, 228, 224, 0.5);
  font-weight: normal;
}
.help-modal :deep(code) {
  background: rgba(122, 51, 72, 0.12);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  font-size: 0.82rem;
}
.help-close {
  position: absolute;
  top: 0.8rem;
  right: 0.8rem;
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(230, 228, 224, 0.4);
  font-size: 1rem;
  line-height: 1;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  transition: color 0.2s;
}
.help-close:hover {
  color: rgba(230, 228, 224, 0.9);
}
</style>
