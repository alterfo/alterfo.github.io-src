<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useMidi } from './Piano/midi.js'
import { listScores, loadScore, getScaleKeys, getActiveKey } from './Piano/score.js'
import {
  createLevel1State, createLevel2State, checkNote, repeatSection, getCurrentNote,
} from './Piano/trainer.js'
import { renderPhrase } from './Piano/renderer.js'
import { generateKeyRects, KEYBOARD_SVG_HEIGHT } from './Piano/keyboard.js'
import { loadProgress, saveProgress, cancelPendingSave, computeSessionStats } from './Piano/db.js'

const { status: midiStatus, deviceName, pressedNotes, init: initMidi, dispose: disposeMidi } = useMidi()

// ── Selection ────────────────────────────────────────────────────
const scoreList = listScores()
const selectedScoreId = ref(scoreList[0].id)
const selectedLevel = ref(1)
const tempoFactor = ref(1.0)

const currentScore = computed(() => loadScore(selectedScoreId.value))

// ── Trainer ──────────────────────────────────────────────────────
const trainer = ref(null)
const wrongNoteIdx = ref(-1)
const isComplete = ref(false)

function buildTrainer(score, level, saved) {
  const state = level === 1 ? createLevel1State(score) : createLevel2State(score)
  if (saved) {
    state.phraseIdx = saved.phraseIdx ?? 0
    state.measureIdx = saved.measureIdx ?? 0
    state.stats = saved.stats ? { ...saved.stats } : state.stats
  }
  return state
}

async function initTrainer(scoreId, level) {
  const score = loadScore(scoreId)
  const saved = await loadProgress(scoreId)
  stopCheckLoop()
  wrongNoteIdx.value = -1
  isComplete.value = false
  trainer.value = buildTrainer(score, level, saved)
  await nextTick()
  renderStave()
}

// ── VexFlow stave ─────────────────────────────────────────────────
const staveContainer = ref(null)

function renderStave() {
  if (!staveContainer.value || !trainer.value) return
  const t = trainer.value
  const phrase = t.score.phrases[t.phraseIdx]
  if (!phrase) return
  const cursor = {
    measureIdx: t.measureIdx,
    noteIdx: t.noteIdx,
    lookahead: 2,
    wrongNoteIdx: wrongNoteIdx.value,
    pressedNotes: pressedNotes.value,
  }
  try {
    renderPhrase(staveContainer.value, phrase, cursor, t.score)
  } catch (e) {
    console.warn('[piano] renderPhrase:', e)
  }
}

// ── Note-check loop ──────────────────────────────────────────────
let noteStartTime = 0
let checkIntervalId = null

function startCheckLoop() {
  if (checkIntervalId) return
  checkIntervalId = setInterval(doCheckNote, 16)
}

function stopCheckLoop() {
  if (checkIntervalId) { clearInterval(checkIntervalId); checkIntervalId = null }
  noteStartTime = 0
}

function doCheckNote() {
  if (!trainer.value || trainer.value.complete) { stopCheckLoop(); return }
  const heldMs = noteStartTime > 0 ? Date.now() - noteStartTime : 0
  const result = checkNote(trainer.value, pressedNotes.value, heldMs, tempoFactor.value)

  if (result === 'wrong') {
    wrongNoteIdx.value = trainer.value.noteIdx
    stopCheckLoop()
    renderStave()
    setTimeout(() => {
      wrongNoteIdx.value = -1
      renderStave()
      // Restart loop if the expected notes are still held after the flash
      if (trainer.value && !trainer.value.complete) {
        const curNote = getCurrentNote(trainer.value)
        if (curNote) {
          const expected = Array.isArray(curNote.midi) ? curNote.midi : [curNote.midi]
          if (expected.every(m => pressedNotes.value.has(m))) {
            noteStartTime = Date.now()
            startCheckLoop()
          }
        }
      }
    }, 400)
    return
  }
  if (result === 'waiting') {
    return
  }
  // note-correct | measure-complete | phrase-complete | complete
  stopCheckLoop()
  wrongNoteIdx.value = -1
  if (result === 'complete') isComplete.value = true
  saveProgress(currentScore.value.id, trainer.value)
  renderStave()
}

watch(pressedNotes, (notes) => {
  if (!trainer.value || trainer.value.complete) return
  const curNote = getCurrentNote(trainer.value)
  if (!curNote) return
  const expected = Array.isArray(curNote.midi) ? curNote.midi : [curNote.midi]
  const allPressed = expected.every(m => notes.has(m))
  if (allPressed && noteStartTime === 0) {
    noteStartTime = Date.now()
    startCheckLoop()
  } else if (!allPressed && checkIntervalId) {
    stopCheckLoop()
  }
  renderStave()
}, { deep: true })

// ── Metronome ────────────────────────────────────────────────────
const metronomeOn = ref(false)
const beatIdx = ref(0)
let metronomeIntervalId = null
let audioCtx = null

const beatsPerMeasure = computed(() => currentScore.value.timeSignature?.[0] ?? 4)

function _playMetronomeTick(isDownbeat) {
  if (!audioCtx) return
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.connect(gain); gain.connect(audioCtx.destination)
  osc.frequency.value = isDownbeat ? 1000 : 700
  gain.gain.setValueAtTime(0.12, audioCtx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07)
  osc.start(); osc.stop(audioCtx.currentTime + 0.07)
}

function startMetronome() {
  const msPerBeat = 60000 / (currentScore.value.tempo * tempoFactor.value)
  beatIdx.value = 0
  _playMetronomeTick(true)
  metronomeIntervalId = setInterval(() => {
    beatIdx.value = (beatIdx.value + 1) % beatsPerMeasure.value
    _playMetronomeTick(beatIdx.value === 0)
  }, msPerBeat)
}

function stopMetronome() {
  if (metronomeIntervalId) { clearInterval(metronomeIntervalId); metronomeIntervalId = null }
  beatIdx.value = 0
}

function toggleMetronome() {
  metronomeOn.value = !metronomeOn.value
  if (metronomeOn.value) {
    if (!audioCtx) audioCtx = new AudioContext()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    startMetronome()
  } else {
    stopMetronome()
  }
}

// ── SVG keyboard ─────────────────────────────────────────────────
const keyboardEl = ref(null)
const keyboardWidth = ref(900)

const activeKey = computed(() => {
  if (!trainer.value) return currentScore.value.key
  return getActiveKey(currentScore.value, trainer.value.phraseIdx, trainer.value.measureIdx)
})

const keyRects = computed(() => {
  let expectedMidi = null
  if (trainer.value) {
    const note = getCurrentNote(trainer.value)
    if (note) expectedMidi = Array.isArray(note.midi) ? note.midi[0] : note.midi
  }
  return generateKeyRects(keyboardWidth.value, {
    scaleKeys: getScaleKeys(activeKey.value),
    pressedNotes: pressedNotes.value,
    expectedNote: expectedMidi,
  })
})

// ── Modulation badge ──────────────────────────────────────────────
const modulationBadge = computed(() => {
  const score = currentScore.value
  if (!score.modulations?.length || !trainer.value) return null
  const key = getActiveKey(score, trainer.value.phraseIdx, trainer.value.measureIdx)
  if (key.root === score.key.root && key.mode === score.key.mode) return null
  return `${key.root} ${key.mode === 'minor' ? 'минор' : 'мажор'}`
})

// ── Stats ─────────────────────────────────────────────────────────
const sessionStats = computed(() => {
  if (!trainer.value) return { accuracy: 0, notesPlayed: 0, longestStreak: 0 }
  return computeSessionStats(trainer.value.stats)
})

const cursorLabel = computed(() => {
  if (!trainer.value) return ''
  const t = trainer.value
  const totalPhrases = t.score.phrases.length
  const totalMeasures = t.score.phrases[t.phraseIdx]?.measures.length ?? 0
  return `Фраза ${t.phraseIdx + 1}/${totalPhrases} · Такт ${t.measureIdx + 1}/${totalMeasures}`
})

// ── Controls ──────────────────────────────────────────────────────
function onRepeat() {
  if (!trainer.value) return
  repeatSection(trainer.value)
  stopCheckLoop()
  wrongNoteIdx.value = -1
  renderStave()
}

function onNextPhrase() {
  if (!trainer.value || trainer.value.level !== 2) return
  const t = trainer.value
  if (t.phraseIdx < t.score.phrases.length - 1) {
    t.phraseIdx++; t.measureIdx = 0; t.noteIdx = 0
    stopCheckLoop()
    renderStave()
    saveProgress(currentScore.value.id, t)
  }
}

function onRestart() {
  isComplete.value = false
  initTrainer(selectedScoreId.value, selectedLevel.value)
}

// ── Watchers ──────────────────────────────────────────────────────
watch(selectedScoreId, id => initTrainer(id, selectedLevel.value))
watch(selectedLevel, level => initTrainer(selectedScoreId.value, level))

watch(tempoFactor, () => {
  if (metronomeOn.value) { stopMetronome(); startMetronome() }
})

// ── Lifecycle ─────────────────────────────────────────────────────
let resizeObserver = null

onMounted(async () => {
  await initMidi()
  await initTrainer(selectedScoreId.value, selectedLevel.value)
  if (keyboardEl.value) {
    keyboardWidth.value = keyboardEl.value.clientWidth || 900
    resizeObserver = new ResizeObserver(entries => {
      for (const e of entries) keyboardWidth.value = e.contentRect.width || 900
    })
    resizeObserver.observe(keyboardEl.value)
  }
})

onUnmounted(() => {
  disposeMidi()
  stopCheckLoop()
  stopMetronome()
  if (audioCtx) { audioCtx.close(); audioCtx = null }
  cancelPendingSave()
  if (resizeObserver) resizeObserver.disconnect()
})
</script>

<template>
  <div class="piano-app">

    <!-- ── Topbar ── -->
    <div class="topbar">
      <div class="topbar-left">
        <!-- Score picker -->
        <select class="ctrl-select" :value="selectedScoreId" @change="e => selectedScoreId = e.target.value">
          <option v-for="s in scoreList" :key="s.id" :value="s.id">{{ s.title }}</option>
        </select>

        <!-- Level -->
        <div class="btn-group">
          <button class="btn-sm" :class="{ active: selectedLevel === 1 }" @click="selectedLevel = 1">Ур.1</button>
          <button class="btn-sm" :class="{ active: selectedLevel === 2 }" @click="selectedLevel = 2">Ур.2</button>
        </div>

        <!-- Tempo factor -->
        <label class="ctrl-label">
          <span>Темп {{ Math.round(tempoFactor * 100) }}%</span>
          <input type="range" min="0.5" max="1" step="0.25"
            :value="tempoFactor" @input="e => tempoFactor = parseFloat(e.target.value)"
            class="ctrl-range" />
        </label>

        <!-- Metronome toggle -->
        <button class="btn-sm" :class="{ active: metronomeOn }" @click="toggleMetronome" title="Метроном">♩</button>
      </div>

      <div class="topbar-right">
        <!-- MIDI status -->
        <span class="midi-status" :class="`midi-${midiStatus}`">
          <span v-if="midiStatus === 'connected'">MIDI: {{ deviceName }}</span>
          <span v-else-if="midiStatus === 'no-device'">MIDI: нет устройств</span>
          <span v-else-if="midiStatus === 'unsupported'">MIDI: не поддерживается</span>
          <span v-else>MIDI: …</span>
        </span>
      </div>
    </div>

    <!-- ── Main area ── -->
    <div class="main-area">

      <!-- Modulation badge -->
      <div v-if="modulationBadge" class="mod-badge">
        Тональность: {{ modulationBadge }}
      </div>

      <!-- Metronome dots -->
      <div v-if="metronomeOn" class="metro-dots">
        <span
          v-for="i in beatsPerMeasure" :key="i"
          class="metro-dot"
          :class="{ active: (i - 1) === beatIdx }"
        />
      </div>

      <!-- VexFlow stave -->
      <div v-if="!isComplete" ref="staveContainer" class="stave-area" />

      <!-- Complete screen -->
      <div v-else class="complete-screen">
        <div class="complete-title">Готово!</div>
        <div class="complete-stats">
          Точность {{ sessionStats.accuracy }}% · Нот {{ sessionStats.notesPlayed }} · Серия {{ sessionStats.longestStreak }}
        </div>
        <button class="btn-primary" @click="onRestart">Начать заново</button>
      </div>

      <!-- Status bar -->
      <div v-if="!isComplete" class="status-bar">
        <span class="status-cursor">{{ cursorLabel }}</span>
        <span class="status-stats">
          {{ sessionStats.accuracy }}% · серия {{ trainer?.stats?.streak ?? 0 }}
        </span>

        <!-- Controls -->
        <div class="status-controls">
          <button class="btn-sm" @click="onRepeat" title="Повторить такт">↺ Такт</button>
          <button v-if="selectedLevel === 2" class="btn-sm" @click="onNextPhrase" title="Следующая фраза">Фраза →</button>
        </div>
      </div>
    </div>

    <!-- ── Keyboard strip ── -->
    <div ref="keyboardEl" class="keyboard-strip">
      <svg
        :viewBox="`0 0 ${keyboardWidth} ${KEYBOARD_SVG_HEIGHT}`"
        :width="keyboardWidth"
        :height="KEYBOARD_SVG_HEIGHT"
        class="keyboard-svg"
      >
        <rect
          v-for="k in keyRects" :key="k.midi"
          :x="k.x" :y="k.y" :width="k.width" :height="k.height"
          :fill="k.fill" :stroke="k.stroke" :stroke-width="k.strokeWidth"
          rx="0"
        />
      </svg>
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
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  overflow: hidden;
}

/* ── Topbar ── */
.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  background: #12122a;
  border-bottom: 1px solid #2a2a4a;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.ctrl-select {
  background: #1e1e3a;
  color: #ccc;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
  cursor: pointer;
}

.ctrl-select:focus { outline: none; border-color: #6060aa; }

.btn-group {
  display: flex;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  overflow: hidden;
}

.btn-sm {
  background: #1e1e3a;
  color: #aaa;
  border: none;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.btn-group .btn-sm { border-radius: 0; border-right: 1px solid #3a3a5a; }
.btn-group .btn-sm:last-child { border-right: none; }

.btn-sm:hover { background: #2a2a4a; color: #ddd; }
.btn-sm.active { background: #4a4aaa; color: #fff; }

.ctrl-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #888;
  white-space: nowrap;
}

.ctrl-range {
  width: 72px;
  accent-color: #6060cc;
  cursor: pointer;
}

.midi-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}
.midi-connected { color: #4caf80; background: rgba(76,175,80,0.12); }
.midi-no-device, .midi-checking { color: #888; background: rgba(128,128,128,0.1); }
.midi-unsupported { color: #f44336; background: rgba(244,67,54,0.12); }

/* ── Main area ── */
.main-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  padding: 8px 12px 4px;
  gap: 6px;
}

.mod-badge {
  align-self: flex-start;
  font-size: 11px;
  padding: 2px 10px;
  background: rgba(255,200,50,0.12);
  border: 1px solid rgba(255,200,50,0.35);
  color: #ffcc44;
  border-radius: 10px;
}

/* ── Metronome ── */
.metro-dots {
  display: flex;
  gap: 8px;
  align-self: center;
}

.metro-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #333;
  border: 1px solid #555;
  transition: background 0.06s, border-color 0.06s;
}

.metro-dot.active {
  background: #4a9eff;
  border-color: #1a6fcc;
  box-shadow: 0 0 6px rgba(74,158,255,0.6);
}

/* ── Stave ── */
.stave-area {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: #fff;
  border-radius: 4px;
}

.stave-area :deep(svg) {
  display: block;
}

/* ── Complete screen ── */
.complete-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #ccc;
}

.complete-title {
  font-size: 2rem;
  font-weight: 700;
  color: #4caf80;
}

.complete-stats {
  font-size: 0.9rem;
  color: #888;
}

.btn-primary {
  background: #4a4aaa;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 24px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-primary:hover { background: #5a5acc; }

/* ── Status bar ── */
.status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.status-cursor {
  font-size: 12px;
  color: #7788bb;
}

.status-stats {
  font-size: 12px;
  color: #55aa88;
}

.status-controls {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

/* ── Keyboard ── */
.keyboard-strip {
  flex-shrink: 0;
  background: #111;
  border-top: 1px solid #2a2a4a;
  overflow: hidden;
}

.keyboard-svg {
  display: block;
  width: 100%;
}
</style>
