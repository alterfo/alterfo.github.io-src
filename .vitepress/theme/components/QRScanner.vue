<script setup>
import { ref, onUnmounted } from 'vue'
import { isScannerSupported, startScan } from './Sync/scanner.js'

const emit = defineEmits(['scanned', 'error'])

const supported = isScannerSupported()
const scanning = ref(false)
const videoEl = ref(null)
let stopFn = null

async function start() {
  if (!supported || scanning.value) return
  scanning.value = true
  try {
    stopFn = await startScan(videoEl.value, (text) => {
      scanning.value = false
      stopFn = null
      emit('scanned', text)
    })
  } catch (e) {
    scanning.value = false
    emit('error', e?.message || 'Не удалось получить доступ к камере.')
  }
}

function stop() {
  if (stopFn) { stopFn(); stopFn = null }
  scanning.value = false
}

onUnmounted(stop)

defineExpose({ stop })
</script>

<template>
  <div class="qr-scanner">
    <template v-if="!supported">
      <p class="qr-scanner-unsupported">Сканирование QR недоступно в этом браузере — вставьте код вручную.</p>
    </template>
    <template v-else>
      <video v-show="scanning" ref="videoEl" class="qr-video" muted playsinline></video>
      <button v-if="!scanning" class="qr-scan-btn" @click="start">📷 Сканировать QR</button>
      <button v-else class="qr-scan-btn qr-scan-stop" @click="stop">Остановить камеру</button>
    </template>
  </div>
</template>

<style scoped>
.qr-scanner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.qr-video {
  width: 260px;
  height: 260px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--ds-border, #3a3d42);
}

.qr-scan-btn {
  padding: 8px 18px;
  border-radius: 6px;
  border: 1px solid var(--ds-border, #52565c);
  background: var(--ds-surface-solid, #1e2126);
  color: var(--ds-text, #e6e4e0);
  cursor: pointer;
  font-size: 0.9rem;
}

.qr-scan-btn:hover { background: var(--ds-raised, #262a30); }
.qr-scan-stop { border-color: var(--ds-danger, #f87171); color: var(--ds-danger, #f87171); }
.qr-scanner-unsupported { color: var(--ds-text-muted, #a8a6a0); font-size: 0.85rem; text-align: center; }
</style>
