<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useMidi } from './Piano/midi.js'
import { usePianoAudio } from './Piano/audio.js'
import { listScores, loadScore, getScaleKeys, getActiveKey, DURATION_BEATS, midiToNoteName } from './Piano/score.js'
import { createLevel1State, createLevel2State, getCurrentNote, getCursor, repeatSection, checkNote } from './Piano/trainer.js'
import { generateKeyRects, KEYBOARD_SVG_HEIGHT } from './Piano/keyboard.js'
import { loadProgress, saveProgress } from './Piano/db.js'

// VexFlow touches the DOM — dynamic import so SSR never loads it
let _renderPhrase = null

// ─────────────────────────────────────────────────────────────
// Score & level
// ─────────────────────────────────────────────────────────────
const scores = listScores()
const selectedScoreId = ref(scores[0]?.id ?? '')
const currentScore = computed(() => loadScore(selectedScoreId.value))
const level = ref(1)          // 1 = note-by-note, 2 = measure-by-measure
const tempoFactor = ref(1.0)  // 0.5 | 0.75 | 1.0

// ─────────────────────────────────────────────────────────────
// MIDI
// ─────────────────────────────────────────────────────────────
const { status: midiStatus, deviceName, pressedNotes, onNoteOn, onNoteOff, init: initMidi, dispose: disposeMidi } = useMidi()

// ─────────────────────────────────────────────────────────────
// Audio
// ─────────────────────────────────────────────────────────────
const { mode: audioMode, samplerReady, samplerLoading, playNote, releaseNote, loadSampler, dispose: disposeAudio } = usePianoAudio()
const samplerError = ref(false)
async function handleLoadSampler() {
  samplerError.value = false
  try { await loadSampler() } catch { samplerError.value = true }
}
onNoteOn((midi, vel) => playNote(midi, vel))
onNoteOff(midi => releaseNote(midi))

const midiLabel = computed(() => {
  if (midiStatus.value === 'unsupported') return 'MIDI: не поддерживается'
  if (midiStatus.value === 'no-device') return 'MIDI: нет устройств'
  if (midiStatus.value === 'connected') return `MIDI: ${deviceName.value}`
  return 'MIDI: …'
})

// ─────────────────────────────────────────────────────────────
// Trainer state (plain mutable object, not reactive)
// ─────────────────────────────────────────────────────────────
let _state = null

const phraseIdx = ref(0)
const measureIdx = ref(0)
const noteIdx = ref(0)
const isComplete = ref(false)

// Stats (reactive copies for display)
const correctCount = ref(0)
const wrongCount = ref(0)
const streak = ref(0)
const longestStreak = ref(0)

const accuracy = computed(() => {
  const total = correctCount.value + wrongCount.value
  return total === 0 ? '—' : Math.round((correctCount.value / total) * 100) + '%'
})

const pressedNoteNames = computed(() =>
  [...pressedNotes.value].sort((a, b) => a - b).map(midiToNoteName).join('  ')
)

// Position label (e.g. "Фраза 1 · Такт 2")
const posLabel = computed(() => {
  const score = currentScore.value
  const pi = phraseIdx.value + 1
  const mi = measureIdx.value + 1
  const pt = score.phrases.length
  const mt = score.phrases[phraseIdx.value]?.measures.length ?? 0
  return `Фраза ${pi}/${pt} · Такт ${mi}/${mt}`
})

// ─────────────────────────────────────────────────────────────
// Wrong-note flash
// ─────────────────────────────────────────────────────────────
const wrongFlashNote = ref(-1)
let _wrongActive = false
let _wrongTimer = null

function triggerWrong() {
  if (_wrongActive) return
  _wrongActive = true
  wrongFlashNote.value = noteIdx.value
  wrongCount.value++
  streak.value = 0
  // Keep _state.stats mirroring Vue refs (Vue refs are primary / display source)
  if (_state) {
    _state.stats.wrong = wrongCount.value
    _state.stats.streak = 0
  }
  clearTimeout(_wrongTimer)
  _wrongTimer = setTimeout(() => {
    wrongFlashNote.value = -1
    _wrongActive = false
    correctHoldStart = null
  }, 400)
  correctHoldStart = null
  if (_state) {
    repeatSection(_state)
    noteIdx.value = _state.noteIdx
    measureIdx.value = _state.measureIdx
    phraseIdx.value = _state.phraseIdx
    nextTick(renderStave)
  }
}

// ─────────────────────────────────────────────────────────────
// Hold-time tracking & rAF loop
// ─────────────────────────────────────────────────────────────
let correctHoldStart = null
let _rafId = null

function getExpectedMidis() {
  if (!_state || isComplete.value) return []
  const note = getCurrentNote(_state)
  if (!note) return []
  return Array.isArray(note.midi) ? note.midi : [note.midi]
}

// Fires when the set of pressed keys changes
watch(pressedNotes, (newNotes) => {
  if (isComplete.value || !_state || _wrongActive) return
  const expected = getExpectedMidis()
  if (!expected.length) return

  const anyWrong = newNotes.size > 0 && [...newNotes].some(m => !expected.includes(m))
  const allCorrect = !anyWrong && expected.every(m => newNotes.has(m)) && newNotes.size > 0

  if (anyWrong) {
    triggerWrong()
  } else if (allCorrect) {
    if (!correctHoldStart) correctHoldStart = Date.now()
  } else {
    correctHoldStart = null
  }
})

function rafTick() {
  if (!isComplete.value && correctHoldStart && !_wrongActive && _state) {
    const note = getCurrentNote(_state)
    if (note) {
      const heldMs = Date.now() - correctHoldStart
      const beats = DURATION_BEATS[note.duration] ?? 1
      const threshold = (60 / currentScore.value.tempo) * beats * 1000 * tempoFactor.value * 0.6
      if (heldMs >= threshold) {
        correctHoldStart = null
        advanceNote(heldMs)
      }
    }
  }
  _rafId = requestAnimationFrame(rafTick)
}

function advanceNote(heldMs = Infinity) {
  if (!_state || isComplete.value) return

  const result = checkNote(_state, pressedNotes.value, heldMs, tempoFactor.value)
  if (result === 'waiting') return
  if (result === 'wrong') {
    triggerWrong()
    return
  }

  // Sync cursor refs from state (checkNote updated them)
  noteIdx.value = _state.noteIdx
  measureIdx.value = _state.measureIdx
  phraseIdx.value = _state.phraseIdx

  // Sync stats refs from state.stats (checkNote updated them via _updateStats)
  correctCount.value = _state.stats.correct
  streak.value = _state.stats.streak
  longestStreak.value = _state.stats.longestStreak

  if (result === 'complete') {
    isComplete.value = true
  }

  nextTick(renderStave)
  saveProgress(selectedScoreId.value, {
    level: level.value,
    phraseIdx: _state.phraseIdx,
    measureIdx: _state.measureIdx,
    noteIdx: _state.noteIdx,
    stats: { correct: correctCount.value, wrong: wrongCount.value, streak: streak.value, longestStreak: longestStreak.value },
  })
}

// ─────────────────────────────────────────────────────────────
// Stave rendering
// ─────────────────────────────────────────────────────────────
const staveContainer = ref(null)

function renderStave() {
  if (!_renderPhrase || !staveContainer.value || !_state) return
  const phrase = currentScore.value.phrases[phraseIdx.value]
  if (!phrase) return
  try {
    _renderPhrase(staveContainer.value, phrase, {
      measureIdx: measureIdx.value,
      noteIdx: noteIdx.value,
      lookahead: 2,
      wrongNoteIdx: wrongFlashNote.value,
      pressedNotes: pressedNotes.value,
    }, currentScore.value)
  } catch (e) {
    console.warn('[piano] renderPhrase:', e)
  }
}

// Re-render when cursor or flash changes; also on pressed notes (ghost overlay)
watch([phraseIdx, measureIdx, noteIdx, wrongFlashNote], () => nextTick(renderStave))
watch(pressedNotes, () => nextTick(renderStave))

// ─────────────────────────────────────────────────────────────
// SVG Keyboard
// ─────────────────────────────────────────────────────────────
const keyboardWidth = ref(800)
const keyboardEl = ref(null)

const activeKey = computed(() =>
  currentScore.value
    ? getActiveKey(currentScore.value, phraseIdx.value, measureIdx.value)
    : currentScore.value?.key
)
const scaleKeys = computed(() => activeKey.value ? getScaleKeys(activeKey.value) : null)

const expectedNote = computed(() => {
  if (!_state || isComplete.value) return null
  const note = getCurrentNote(_state)
  if (!note) return null
  return Array.isArray(note.midi) ? note.midi[0] : note.midi
})

const keyRects = computed(() =>
  generateKeyRects(keyboardWidth.value, {
    scaleKeys: scaleKeys.value,
    pressedNotes: pressedNotes.value,
    expectedNote: expectedNote.value,
  })
)

// Non-scale note names for the hint row
const nonScaleLabel = computed(() => {
  if (!scaleKeys.value) return ''
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  return names.filter((_, i) => !scaleKeys.value.has(i)).join('  ')
})

// Modulation indicator
const showModulation = computed(() => {
  const base = currentScore.value.key
  const active = activeKey.value
  return active && (active.root !== base.root || active.mode !== base.mode)
})
const keyLabel = computed(() => {
  const k = activeKey.value
  if (!k) return ''
  return `${k.root} ${k.mode === 'minor' ? 'min' : 'maj'}`
})

function updateKeyboardWidth() {
  if (keyboardEl.value) keyboardWidth.value = keyboardEl.value.clientWidth || 800
}

// ─────────────────────────────────────────────────────────────
// Metronome
// ─────────────────────────────────────────────────────────────
const metronomeOn = ref(false)
const beatPhase = ref(0)
let _metroTimer = null

function startMetronome() {
  stopMetronome()
  const bpm = currentScore.value.tempo
  const beatsPerMeasure = currentScore.value.timeSignature[0]
  beatPhase.value = 0
  _metroTimer = setInterval(() => {
    beatPhase.value = (beatPhase.value + 1) % beatsPerMeasure
  }, (60 / bpm) * 1000)
}

function stopMetronome() {
  clearInterval(_metroTimer)
  _metroTimer = null
  beatPhase.value = 0
}

watch(metronomeOn, on => on ? startMetronome() : stopMetronome())
watch(() => currentScore.value.tempo, () => { if (metronomeOn.value) startMetronome() })

// ─────────────────────────────────────────────────────────────
// Init & restart
// ─────────────────────────────────────────────────────────────
function initTrainer() {
  clearTimeout(_wrongTimer)
  wrongFlashNote.value = -1
  _wrongActive = false
  correctHoldStart = null
  isComplete.value = false
  correctCount.value = 0
  wrongCount.value = 0
  streak.value = 0
  longestStreak.value = 0

  _state = level.value === 1
    ? createLevel1State(currentScore.value)
    : createLevel2State(currentScore.value)

  phraseIdx.value = 0
  measureIdx.value = 0
  noteIdx.value = 0

  nextTick(renderStave)
  if (metronomeOn.value) startMetronome()
}

watch([selectedScoreId, level], initTrainer)

function doRepeat() {
  if (!_state || isComplete.value) return
  repeatSection(_state)
  noteIdx.value = _state.noteIdx
  measureIdx.value = _state.measureIdx
  phraseIdx.value = _state.phraseIdx
  correctHoldStart = null
  nextTick(renderStave)
}

// ─────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────
onMounted(async () => {
  const mod = await import('./Piano/renderer.js')
  _renderPhrase = mod.renderPhrase
  await initMidi()
  initTrainer()
  _rafId = requestAnimationFrame(rafTick)
  updateKeyboardWidth()
  window.addEventListener('resize', updateKeyboardWidth)
})

onUnmounted(() => {
  disposeMidi()
  disposeAudio()
  cancelAnimationFrame(_rafId)
  stopMetronome()
  clearTimeout(_wrongTimer)
  window.removeEventListener('resize', updateKeyboardWidth)
})
</script>

<template>
  <div class="piano-app">

    <!-- ── Topbar ───────────────────────────────────────────── -->
    <div class="piano-topbar">
      <select v-model="selectedScoreId" class="piano-select">
        <option v-for="s in scores" :key="s.id" :value="s.id">{{ s.title }}</option>
      </select>

      <div class="piano-level-toggle">
        <button :class="['level-btn', { active: level === 1 }]" @click="level = 1" title="Нота за нотой">Нота</button>
        <button :class="['level-btn', { active: level === 2 }]" @click="level = 2" title="Такт за тактом">Такт</button>
      </div>

      <div class="piano-tempo-toggle">
        <button v-for="f in [0.5, 0.75, 1.0]" :key="f"
          :class="['tempo-btn', { active: tempoFactor === f }]"
          @click="tempoFactor = f">
          {{ f === 1.0 ? '100%' : f === 0.75 ? '75%' : '50%' }}
        </button>
      </div>

      <button :class="['metro-btn', { active: metronomeOn }]" @click="metronomeOn = !metronomeOn" title="Метроном">
        <span v-for="i in currentScore.timeSignature[0]" :key="i"
              :class="['metro-dot', { pulse: metronomeOn && beatPhase === i - 1 }]"></span>
      </button>

      <button @click="handleLoadSampler" :disabled="samplerLoading || audioMode === 'sampler'" class="tb-btn">
        {{ samplerLoading ? 'Загрузка…' : audioMode === 'sampler' ? 'HD ✓' : samplerError ? 'HD ✗' : 'HD звук' }}
      </button>

      <span class="piano-midi-status" :class="midiStatus">{{ midiLabel }}</span>
    </div>

    <!-- ── Stave area ───────────────────────────────────────── -->
    <div class="piano-stave-wrap">
      <div v-if="isComplete" class="piano-complete">
        <div class="complete-icon">🎉</div>
        <div class="complete-text">Пьеса завершена!</div>
        <div class="complete-stats">Точность: {{ accuracy }} · Лучшая серия: {{ longestStreak }}</div>
        <button class="restart-btn" @click="initTrainer">Заново</button>
      </div>
      <div v-else ref="staveContainer" class="piano-stave-container"></div>
    </div>

    <!-- ── Status bar ───────────────────────────────────────── -->
    <div class="piano-statusbar">
      <span class="pos-label">{{ posLabel }}</span>

      <span v-if="showModulation" class="mod-badge">
        Модуляция: {{ keyLabel }}
      </span>
      <span v-else class="key-badge">
        {{ currentScore.key.root }} {{ currentScore.key.mode === 'minor' ? 'min' : 'maj' }}
      </span>

      <span class="stat-item" title="Точность">
        <span class="stat-val">{{ accuracy }}</span> точность
      </span>
      <span class="stat-item" title="Серия">
        <span class="stat-val">{{ streak }}</span> серия
      </span>

      <span v-if="pressedNoteNames" class="status-notes">{{ pressedNoteNames }}</span>

      <button class="repeat-btn" @click="doRepeat" title="Повторить текущий такт">↺ Повтор</button>
    </div>

    <!-- ── Keyboard ─────────────────────────────────────────── -->
    <div class="piano-keyboard-wrap" ref="keyboardEl">
      <svg
        class="piano-keyboard-svg"
        :viewBox="`0 0 ${keyboardWidth} ${KEYBOARD_SVG_HEIGHT}`"
        :width="keyboardWidth"
        :height="KEYBOARD_SVG_HEIGHT"
        preserveAspectRatio="xMidYMid meet"
      >
        <rect
          v-for="k in keyRects"
          :key="k.midi"
          :x="k.x"
          :y="k.y"
          :width="k.width"
          :height="k.height"
          :fill="k.fill"
          :stroke="k.stroke"
          :stroke-width="k.strokeWidth ?? 1"
        />
      </svg>

      <div v-if="nonScaleLabel" class="piano-scale-hint">
        Не в гамме: <span class="hint-notes">{{ nonScaleLabel }}</span>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ── Layout ──────────────────────────────────────────────────── */
.piano-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1a1a2e;
  color: #ddd;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  overflow: hidden;
}

/* ── Topbar ──────────────────────────────────────────────────── */
.piano-topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: #12122a;
  border-bottom: 1px solid #2a2a4a;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.piano-select {
  background: #252545;
  color: #ddd;
  border: 1px solid #444;
  border-radius: 5px;
  padding: 4px 8px;
  font-size: 13px;
  cursor: pointer;
  max-width: 200px;
}

.piano-level-toggle,
.piano-tempo-toggle {
  display: flex;
  gap: 2px;
}

.level-btn,
.tempo-btn {
  background: #252545;
  color: #999;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  padding: 3px 9px;
  font-size: 11px;
  cursor: pointer;
  transition: background .15s, color .15s;
}
.level-btn.active,
.tempo-btn.active {
  background: #4040aa;
  color: #fff;
  border-color: #6060cc;
}

/* Metronome */
.metro-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #252545;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  transition: background .15s;
}
.metro-btn.active { background: #1a2a3a; border-color: #4488aa; }

.metro-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #445;
  transition: background .1s, transform .1s;
  display: block;
}
.metro-dot.pulse {
  background: #66aaff;
  transform: scale(1.35);
}

.tb-btn {
  background: #252545;
  color: #aaa;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  padding: 3px 9px;
  font-size: 11px;
  cursor: pointer;
  transition: background .15s, color .15s;
  white-space: nowrap;
}
.tb-btn:hover:not(:disabled) { background: #353565; color: #fff; }
.tb-btn:disabled { opacity: 0.6; cursor: default; }

.piano-midi-status {
  margin-left: auto;
  font-size: 11px;
  color: #555;
  white-space: nowrap;
}
.piano-midi-status.connected { color: #4caf50; }
.piano-midi-status.no-device { color: #ff9800; }
.piano-midi-status.unsupported { color: #f44336; }

/* ── Stave ───────────────────────────────────────────────────── */
.piano-stave-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 12px 8px;
  background: #1a1a2e;
}

.piano-stave-container {
  width: 100%;
}

/* VexFlow injects an SVG — make it responsive */
.piano-stave-container :deep(svg) {
  width: 100% !important;
  height: auto !important;
  color: #ddd;
}

/* VexFlow uses black strokes by default — invert for dark bg */
.piano-stave-container :deep(path),
.piano-stave-container :deep(rect),
.piano-stave-container :deep(text) {
  color: #ddd;
}

/* ── Complete screen ─────────────────────────────────────────── */
.piano-complete {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 24px;
}
.complete-icon { font-size: 48px; }
.complete-text { font-size: 22px; font-weight: 600; color: #fff; }
.complete-stats { font-size: 14px; color: #aaa; }
.restart-btn {
  background: #4040aa;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 24px;
  font-size: 14px;
  cursor: pointer;
  margin-top: 8px;
}
.restart-btn:hover { background: #5555cc; }

/* ── Status bar ──────────────────────────────────────────────── */
.piano-statusbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 5px 14px;
  background: #141424;
  border-top: 1px solid #2a2a4a;
  border-bottom: 1px solid #2a2a4a;
  flex-shrink: 0;
  font-size: 11px;
  flex-wrap: wrap;
}

.pos-label { color: #888; }

.key-badge {
  background: #1e2e1e;
  color: #77cc77;
  border: 1px solid #336633;
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}
.mod-badge {
  background: #2e1e2e;
  color: #cc77cc;
  border: 1px solid #663366;
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
}

.stat-item { color: #666; }
.stat-val { color: #aaa; font-weight: 600; }

.status-notes {
  font-family: monospace;
  color: #4a9eff;
  min-width: 80px;
  font-size: 0.85rem;
}

.repeat-btn {
  margin-left: auto;
  background: #252545;
  color: #aaa;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
}
.repeat-btn:hover { background: #353565; color: #fff; }

/* ── Keyboard ────────────────────────────────────────────────── */
.piano-keyboard-wrap {
  flex-shrink: 0;
  background: #0f0f1e;
  border-top: 1px solid #2a2a4a;
  padding: 8px 0 0;
  overflow: hidden;
}

.piano-keyboard-svg {
  display: block;
  width: 100%;
  height: auto;
}

.piano-scale-hint {
  font-size: 10px;
  color: #555;
  padding: 3px 10px 6px;
  letter-spacing: 0.03em;
}
.hint-notes {
  color: #ff7744;
  font-family: monospace;
  letter-spacing: 0.08em;
}
</style>
