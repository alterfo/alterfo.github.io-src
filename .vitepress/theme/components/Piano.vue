<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMidi } from './Piano/midi.js'
import { listScores, loadScore } from './Piano/score.js'

const scores = listScores()
const selectedScoreId = ref(scores[0]?.id ?? '')
const currentScore = computed(() => loadScore(selectedScoreId.value))

const level = ref(1)  // 1 = note-by-note, 2 = measure-by-measure

const { status: midiStatus, deviceName, pressedNotes, init: initMidi, dispose: disposeMidi } = useMidi()

const midiLabel = computed(() => {
  if (midiStatus.value === 'unsupported') return 'MIDI: не поддерживается'
  if (midiStatus.value === 'no-device') return 'MIDI: нет устройств'
  if (midiStatus.value === 'connected') return `MIDI: ${deviceName.value}`
  return 'MIDI: ...'
})

onMounted(() => initMidi())
onUnmounted(() => disposeMidi())
</script>

<template>
  <div class="piano-app">
    <!-- Topbar -->
    <div class="piano-topbar">
      <select v-model="selectedScoreId" class="piano-select">
        <option v-for="s in scores" :key="s.id" :value="s.id">{{ s.title }}</option>
      </select>
      <div class="piano-level-toggle">
        <button :class="['level-btn', { active: level === 1 }]" @click="level = 1">Нота</button>
        <button :class="['level-btn', { active: level === 2 }]" @click="level = 2">Такт</button>
      </div>
      <span class="piano-midi-status" :class="midiStatus">{{ midiLabel }}</span>
    </div>

    <!-- Stave area -->
    <div class="piano-stave-area">
      <div class="piano-stave-placeholder">
        <p class="placeholder-text">Нотный стан (VexFlow renderer — Task 4)</p>
        <p class="score-info">{{ currentScore.title }}<span v-if="currentScore.composer"> — {{ currentScore.composer }}</span></p>
        <p class="score-info">Темп: {{ currentScore.tempo }} | {{ currentScore.timeSignature[0] }}/{{ currentScore.timeSignature[1] }} | {{ currentScore.phrases.length }} фраз</p>
      </div>
    </div>

    <!-- Keyboard strip -->
    <div class="piano-keyboard-strip">
      <div class="piano-keyboard-placeholder">
        <p class="placeholder-text">Клавиатура SVG (Piano/keyboard.js — Task 5)</p>
        <p v-if="pressedNotes.size > 0" class="pressed-notes">
          Нажаты: {{ [...pressedNotes].join(', ') }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.piano-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1a1a2e;
  color: #ddd;
  font-family: system-ui, sans-serif;
  font-size: 13px;
}

.piano-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: #12122a;
  border-bottom: 1px solid #333;
  flex-shrink: 0;
}

.piano-select {
  background: #2a2a4a;
  color: #ddd;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 13px;
  cursor: pointer;
}

.piano-level-toggle {
  display: flex;
  gap: 2px;
}

.level-btn {
  background: #2a2a4a;
  color: #aaa;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.level-btn.active {
  background: #4444aa;
  color: #fff;
  border-color: #6666cc;
}

.piano-midi-status {
  margin-left: auto;
  font-size: 11px;
  color: #666;
}

.piano-midi-status.connected { color: #4caf50; }
.piano-midi-status.no-device { color: #ff9800; }
.piano-midi-status.unsupported { color: #f44336; }

.piano-stave-area {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.piano-stave-placeholder {
  text-align: center;
  color: #555;
  border: 1px dashed #333;
  border-radius: 8px;
  padding: 40px 60px;
  width: 100%;
  max-width: 700px;
}

.placeholder-text {
  font-size: 12px;
  color: #444;
  margin: 0 0 8px;
}

.score-info {
  font-size: 14px;
  color: #777;
  margin: 4px 0 0;
}

.piano-keyboard-strip {
  height: 120px;
  flex-shrink: 0;
  border-top: 1px solid #333;
  display: flex;
  align-items: center;
  justify-content: center;
}

.piano-keyboard-placeholder {
  text-align: center;
  color: #444;
}

.pressed-notes {
  font-size: 12px;
  color: #6a9fd8;
  margin: 4px 0 0;
}
</style>
