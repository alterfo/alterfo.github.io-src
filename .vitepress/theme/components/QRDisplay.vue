<script setup>
import { ref, watch, onMounted } from 'vue'
import { drawQR } from './Sync/qr.js'

const props = defineProps({
  text: { type: String, required: true },
})

const canvas = ref(null)

async function render() {
  if (!canvas.value || !props.text) return
  try {
    await drawQR(canvas.value, props.text)
  } catch { /* text too large or canvas not ready */ }
}

onMounted(render)
watch(() => props.text, render)
</script>

<template>
  <canvas ref="canvas" class="qr-canvas"></canvas>
</template>

<style scoped>
.qr-canvas {
  display: block;
  margin: 0 auto;
  border-radius: 6px;
}
</style>
