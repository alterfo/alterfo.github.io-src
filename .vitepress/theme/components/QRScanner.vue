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
  border: 1px solid var(--ds-border, rgba(34, 32, 27, 0.12));
}

.qr-scan-btn {
  padding: 8px 18px;
  border-radius: 6px;
  border: 1px solid var(--ds-border, rgba(34, 32, 27, 0.12));
  background: var(--ds-surface-solid, #ffffff);
  color: var(--ds-text, #22201b);
  cursor: pointer;
  font-size: 0.9rem;
}

.qr-scan-btn:hover { background: var(--ds-raised, #efe8db); }
.qr-scan-stop { border-color: var(--ds-danger, #d70b0b); color: var(--ds-danger, #d70b0b); }
.qr-scanner-unsupported { color: var(--ds-text-muted, rgba(34, 32, 27, 0.6)); font-size: 0.85rem; text-align: center; }
</style>
