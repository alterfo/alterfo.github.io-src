<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { SPECTRUM } from '../spectrum.js'
import { mulberry32 } from './rng.js'
import { generate, regionAt, validate, isSolved, hint, eliminatedCells, explainHint } from './queens.js'
import { queensScore, formatClock } from './scoring.js'

const emit = defineEmits(['before-new-game'])

const DEFAULT_SIZE = 8

const puzzle = ref(null)
const queens = ref([])
const manualMarks = ref(new Set())
const painting = ref(null)
const hints = ref(0)
const elapsedSeconds = ref(0)
const solved = ref(false)
const hintMessage = ref('')

let startedAt = 0
let timer = null

const conflicts = computed(() => (puzzle.value ? validate(puzzle.value, queens.value) : []))
const conflictKeys = computed(() => {
  const keys = new Set()
  for (const conflict of conflicts.value) {
    if (Number.isInteger(conflict.col)) keys.add(`${conflict.col}:${conflict.row}`)
    if (Number.isInteger(conflict.otherCol)) keys.add(`${conflict.otherCol}:${conflict.otherRow}`)
  }
  return keys
})

const autoMarks = computed(() => {
  const marks = new Set()
  if (!puzzle.value) return marks
  queens.value.forEach((row, col) => {
    if (row < 0) return
    for (const cell of eliminatedCells(puzzle.value, row, col)) {
      marks.add(`${cell.row}:${cell.col}`)
    }
  })
  return marks
})

const displayMarks = computed(() => {
  const marks = new Set(autoMarks.value)
  for (const key of manualMarks.value) marks.add(key)
  queens.value.forEach((row, col) => {
    if (row >= 0) marks.delete(`${row}:${col}`)
  })
  return marks
})

const score = computed(() => (puzzle.value ? queensScore(puzzle.value.size, hints.value, elapsedSeconds.value) : 0))

function regionColor(color) {
  return SPECTRUM[color % SPECTRUM.length]
}

function queenAt(row, col) {
  return queens.value[col] === row
}

function markedAt(row, col) {
  return displayMarks.value.has(`${row}:${col}`)
}

function toggle(row, col) {
  if (!puzzle.value || solved.value) return
  hintMessage.value = ''
  queens.value = queens.value.slice()
  queens.value[col] = queens.value[col] === row ? -1 : row
  solved.value = isSolved(puzzle.value, queens.value)
}

function setMark(row, col, shouldMark) {
  if (queenAt(row, col)) return
  const key = `${row}:${col}`
  const next = new Set(manualMarks.value)
  if (shouldMark) next.add(key)
  else next.delete(key)
  manualMarks.value = next
}

function onRightDown(row, col) {
  if (!puzzle.value || solved.value || queenAt(row, col)) return
  const isMarked = displayMarks.value.has(`${row}:${col}`)
  painting.value = isMarked ? 'unmark' : 'mark'
  setMark(row, col, !isMarked)
}

function onCellEnter(row, col) {
  if (painting.value === null) return
  setMark(row, col, painting.value === 'mark')
}

function stopPainting() {
  painting.value = null
}

function requestHint() {
  if (!puzzle.value || solved.value) return
  const move = hint(puzzle.value, queens.value)
  if (!move) return
  hintMessage.value = explainHint(puzzle.value, queens.value, move)
  queens.value = queens.value.slice()
  queens.value[move.col] = move.row
  hints.value += 1
  solved.value = isSolved(puzzle.value, queens.value)
}

function newGame() {
  if (puzzle.value) emit('before-new-game')
  const rng = mulberry32(Date.now() >>> 0)
  puzzle.value = generate(DEFAULT_SIZE, rng)
  queens.value = new Array(puzzle.value.size).fill(-1)
  manualMarks.value = new Set()
  hintMessage.value = ''
  hints.value = 0
  elapsedSeconds.value = 0
  solved.value = false
  startedAt = Date.now()
}

function tick() {
  if (!puzzle.value || solved.value) return
  elapsedSeconds.value = Math.floor((Date.now() - startedAt) / 1000)
}

onMounted(() => {
  newGame()
  timer = setInterval(tick, 1000)
  window.addEventListener('mouseup', stopPainting)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('mouseup', stopPainting)
})

function getState() {
  if (!puzzle.value) return null
  return {
    won: solved.value,
    score: score.value,
    hints: hints.value,
    elapsedSeconds: elapsedSeconds.value,
    puzzle: {
      size: puzzle.value.size,
      solution: [...puzzle.value.solution],
      regions: Array.from(puzzle.value.regions),
    },
    queens: [...queens.value],
    marks: Array.from(manualMarks.value),
  }
}

function restoreState(state) {
  if (!state || !state.puzzle) return
  const size = state.puzzle.size
  puzzle.value = {
    size,
    solution: [...state.puzzle.solution],
    regions: Uint8Array.from(state.puzzle.regions || []),
  }
  queens.value = new Array(size).fill(-1).map((_, index) =>
    Number.isInteger(state.queens?.[index]) ? state.queens[index] : -1,
  )
  manualMarks.value = new Set(Array.isArray(state.marks) ? state.marks : [])
  hints.value = Math.max(0, Number(state.hints) || 0)
  elapsedSeconds.value = Math.max(0, Number(state.elapsedSeconds) || 0)
  solved.value = Boolean(state.won)
  startedAt = Date.now() - elapsedSeconds.value * 1000
}

defineExpose({ getState, restoreState })
</script>

<template>
  <div class="queens">
    <div class="queens-toolbar">
      <span class="queens-score">Счёт: {{ score }}</span>
      <span class="queens-clock">Время: {{ formatClock(elapsedSeconds) }}</span>
      <button type="button" class="queens-btn" @click="newGame">Новая</button>
      <button type="button" class="queens-btn" @click="requestHint" :disabled="solved">Подсказка</button>
    </div>

    <svg
      v-if="puzzle"
      class="queens-grid"
      :viewBox="`0 0 ${puzzle.size} ${puzzle.size}`"
      role="img"
      aria-label="Поле Queens"
    >
      <g v-for="row in puzzle.size" :key="`row-${row - 1}`">
        <g v-for="col in puzzle.size" :key="`${row - 1}-${col - 1}`">
          <rect
            :x="col - 1"
            :y="row - 1"
            width="1"
            height="1"
            :fill="regionColor(regionAt(puzzle, row - 1, col - 1))"
            :stroke="conflictKeys.has(`${col - 1}:${row - 1}`) ? '#f87171' : '#1e2126'"
            stroke-width="0.045"
            class="queens-cell"
            @click="toggle(row - 1, col - 1)"
            @mousedown.right.prevent="onRightDown(row - 1, col - 1)"
            @mouseenter="onCellEnter(row - 1, col - 1)"
            @contextmenu.prevent
          />
          <text
            v-if="queenAt(row - 1, col - 1)"
            :x="col - 0.5"
            :y="row - 0.28"
            text-anchor="middle"
            class="queens-queen"
            @click="toggle(row - 1, col - 1)"
          >♛</text>
          <text
            v-else-if="markedAt(row - 1, col - 1)"
            :x="col - 0.5"
            :y="row - 0.28"
            text-anchor="middle"
            class="queens-mark"
            @click="toggle(row - 1, col - 1)"
          >✕</text>
        </g>
      </g>
    </svg>

    <p v-if="solved" class="queens-win">Победа</p>
    <p v-else-if="hintMessage" class="queens-hint">{{ hintMessage }}</p>
  </div>
</template>

<style scoped>
.queens {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 560px;
}

.queens-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.queens-score,
.queens-clock {
  font-size: 14px;
  color: var(--ds-text);
  font-variant-numeric: tabular-nums;
}

.queens-clock {
  color: var(--ds-text-muted);
}

.queens-btn {
  margin-left: auto;
  padding: 8px 16px;
  font-size: 14px;
  font-family: var(--ds-font-body);
  color: var(--ds-text-strong);
  background: var(--ds-accent);
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.queens-btn:first-of-type {
  margin-left: auto;
}

.queens-btn + .queens-btn {
  margin-left: 0;
}

.queens-btn:hover {
  background: var(--ds-accent-hover);
}

.queens-btn:disabled {
  opacity: .5;
  cursor: default;
}

.queens-grid {
  width: min(100%, 480px);
  aspect-ratio: 1;
  border-radius: 8px;
  box-shadow: var(--ds-shadow-card);
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

.queens-cell {
  cursor: pointer;
}

.queens-queen {
  fill: #f7f6f3;
  font-size: .62px;
  pointer-events: none;
}

.queens-mark {
  fill: var(--ds-text-dim);
  font-size: .5px;
  pointer-events: none;
}

.queens-win {
  margin: 0;
  font-size: 16px;
  color: var(--ds-accent-light);
}

.queens-hint {
  margin: 0;
  font-size: 14px;
  color: var(--ds-text-muted);
  text-align: center;
}
</style>
