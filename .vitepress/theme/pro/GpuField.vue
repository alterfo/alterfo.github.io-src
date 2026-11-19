<template>
  <div class="pro-field" ref="rootEl">
    <canvas ref="canvasEl" class="pro-field-canvas" aria-hidden="true"></canvas>
    <div class="pro-field-vignette" aria-hidden="true"></div>
    <div class="pro-field-grain" aria-hidden="true"></div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const emit = defineEmits(['stats'])

const rootEl = ref(null)
const canvasEl = ref(null)
let field = null
let observer = null
let moveTimer = 0
let removePointer = null
let removeVisibility = null

function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

onMounted(async () => {
  if (!canvasEl.value) return
  const { ProField } = await import('./gpuField.js')
  if (!canvasEl.value) return

  field = new ProField(canvasEl.value, {
    reducedMotion: reducedMotion(),
    onStats: (stats) => emit('stats', stats),
  })
  await field.init()

  observer = new IntersectionObserver(
    ([entry]) => {
      if (!field) return
      if (entry.isIntersecting && !document.hidden) field.start()
      else field.stop()
    },
    { threshold: 0.02 },
  )
  observer.observe(rootEl.value)
  field.start()

  const onMove = (event) => {
    if (!field) return
    field.setPointer(event.clientX, event.clientY, 1)
    clearTimeout(moveTimer)
    moveTimer = window.setTimeout(() => field && (field.hold = 0.15), 2200)
  }
  window.addEventListener('pointermove', onMove, { passive: true })
  removePointer = () => window.removeEventListener('pointermove', onMove)

  const onVisibility = () => {
    if (!field) return
    if (document.hidden) field.stop()
    else field.start()
  }
  document.addEventListener('visibilitychange', onVisibility)
  removeVisibility = () => document.removeEventListener('visibilitychange', onVisibility)

  const onResize = () => field && field.resize()
  window.addEventListener('resize', onResize)
  const prevRemove = removePointer
  removePointer = () => {
    prevRemove && prevRemove()
    window.removeEventListener('resize', onResize)
  }
})

onBeforeUnmount(() => {
  clearTimeout(moveTimer)
  removePointer && removePointer()
  removeVisibility && removeVisibility()
  observer && observer.disconnect()
  field && field.destroy()
  field = null
})
</script>
