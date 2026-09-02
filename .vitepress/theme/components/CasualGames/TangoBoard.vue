<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { mulberry32 } from './rng.js'
import { generate, validate, isSolved, hint, MOON, SUN, EMPTY } from './tango.js'
import { scorePuzzle, formatClock } from './scoring.js'

const puzzle = ref(null)
const board = ref([])
const hints = ref(0)
const elapsedSeconds = ref(0)
const solved = ref(false)

let startedAt = 0
let timer = null

const conflicts = computed(() => (puzzle.value ? validate(puzzle.value, board.value) : []))

const conflictKeys = computed(() => {
  if (!puzzle.value) return new Set()
  const keys = new Set()
  const size = puzzle.value.size
  for (const conflict of conflicts.value) {
    if (conflict.type === 'rowBalance') {
      for (let col = 0; col < size; col += 1) keys.add(`${conflict.row}:${col}`)
    } else if (conflict.type === 'colBalance') {
      for (let row = 0; row < size; row += 1) keys.add(`${row}:${conflict.col}`)
    } else if (conflict.type === 'rowRun') {
      keys.add(`${conflict.row}:${conflict.start}`)
      keys.add(`${conflict.row}:${conflict.start + 1}`)
      keys.add(`${conflict.row}:${conflict.start + 2}`)
    } else if (conflict.type === 'colRun') {
      keys.add(`${conflict.start}:${conflict.col}`)
      keys.add(`${conflict.start + 1}:${conflict.col}`)
      keys.add(`${conflict.start + 2}:${conflict.col}`)
    } else if (conflict.type === 'constraint') {
      keys.add(`${Math.floor(conflict.a / size)}:${conflict.a % size}`)
      keys.add(`${Math.floor(conflict.b / size)}:${conflict.b % size}`)
    }
  }
  return keys
})

const score = computed(() =>
  puzzle.value
    ? scorePuzzle({
        basePoints: puzzle.value.size * 100,
        hints: hints.value,
        elapsedSeconds: elapsedSeconds.value,
      })
    : 0,
)

const constraintGlyphs = computed(() => {
  if (!puzzle.value) return []
  const size = puzzle.value.size
  return puzzle.value.constraints.map((constraint) => {
    const rowA = Math.floor(constraint.a / size)
    const colA = constraint.a % size
    const rowB = Math.floor(constraint.b / size)
    const colB = constraint.b % size
    const horizontal = rowA === rowB
    return {
      x: horizontal ? Math.min(colA, colB) + 1 : colA + 0.5,
      y: horizontal ? rowA + 0.5 : Math.min(rowA, rowB) + 1,
      glyph: constraint.op,
    }
  })
})

function cellValue(row, col) {
  const value = board.value[row * puzzle.value.size + col]
  if (value === SUN) return '☀'
  if (value === MOON) return '🌙'
  return ''
}

function isGiven(row, col) {
  return puzzle.value.givens[row * puzzle.value.size + col] !== EMPTY
}

function cycle(row, col) {
  if (!puzzle.value || solved.value) return
  const index = row * puzzle.value.size + col
  if (isGiven(row, col)) return
  board.value = board.value.slice()
  const value = board.value[index]
  board.value[index] = value === EMPTY ? SUN : value === SUN ? MOON : EMPTY
  solved.value = isSolved(puzzle.value, board.value)
}

function requestHint() {
  if (!puzzle.value || solved.value) return
  const move = hint(puzzle.value, board.value)
  if (!move) return
  board.value = board.value.slice()
  board.value[move.index] = move.value
  hints.value += 1
  solved.value = isSolved(puzzle.value, board.value)
}

function newGame() {
  const rng = mulberry32(Date.now() >>> 0)
  puzzle.value = generate(rng)
  board.value = puzzle.value.givens.slice()
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
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
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
      givens: [...puzzle.value.givens],
      constraints: puzzle.value.constraints.map((constraint) => ({ ...constraint })),
    },
    board: [...board.value],
  }
}

function restoreState(state) {
  if (!state || !state.puzzle) return
  puzzle.value = {
    size: state.puzzle.size,
    solution: [...(state.puzzle.solution || [])],
    givens: [...(state.puzzle.givens || [])],
    constraints: (state.puzzle.constraints || []).map((constraint) => ({ ...constraint })),
  }
  board.value = [...(state.board || [])]
  hints.value = Math.max(0, Number(state.hints) || 0)
  elapsedSeconds.value = Math.max(0, Number(state.elapsedSeconds) || 0)
  solved.value = Boolean(state.won)
  startedAt = Date.now()
}

defineExpose({ getState, restoreState })
</script>

<template>
  <div class="tango">
    <div class="tango-toolbar">
      <span class="tango-score">Счёт: {{ score }}</span>
      <span class="tango-clock">Время: {{ formatClock(elapsedSeconds) }}</span>
      <button type="button" class="tango-btn" @click="newGame">Новая</button>
      <button type="button" class="tango-btn" @click="requestHint" :disabled="solved">Подсказка</button>
    </div>

    <svg
      v-if="puzzle"
      class="tango-grid"
      :viewBox="`0 0 ${puzzle.size} ${puzzle.size}`"
      role="img"
      aria-label="Поле Tango"
    >
      <g v-for="row in puzzle.size" :key="`row-${row - 1}`">
        <g v-for="col in puzzle.size" :key="`${row - 1}-${col - 1}`">
          <rect
            :x="col - 1"
            :y="row - 1"
            width="1"
            height="1"
            :fill="conflictKeys.has(`${row - 1}:${col - 1}`) ? '#3a1a1a' : isGiven(row - 1, col - 1) ? '#262a30' : '#1e2126'"
            :stroke="conflictKeys.has(`${row - 1}:${col - 1}`) ? '#f87171' : '#2a2f36'"
            stroke-width="0.03"
            class="tango-cell"
            :class="{ 'tango-cell-given': isGiven(row - 1, col - 1) }"
            @click="cycle(row - 1, col - 1)"
          />
          <text
            :x="col - 0.5"
            :y="row - 0.32"
            text-anchor="middle"
            class="tango-glyph"
            @click="cycle(row - 1, col - 1)"
          >{{ cellValue(row - 1, col - 1) }}</text>
        </g>
      </g>

      <g v-for="(constraint, index) in constraintGlyphs" :key="`constraint-${index}`">
        <circle :cx="constraint.x" :cy="constraint.y" r="0.16" class="tango-constraint-bg" />
        <text
          :x="constraint.x"
          :y="constraint.y"
          text-anchor="middle"
          dominant-baseline="central"
          class="tango-constraint"
        >{{ constraint.glyph }}</text>
      </g>
    </svg>

    <p v-if="solved" class="tango-win">Победа</p>
  </div>
</template>

<style scoped>
.tango {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 560px;
}

.tango-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.tango-score,
.tango-clock {
  font-size: 14px;
  color: var(--ds-text);
  font-variant-numeric: tabular-nums;
}

.tango-clock {
  color: var(--ds-text-muted);
}

.tango-btn {
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

.tango-btn:first-of-type {
  margin-left: auto;
}

.tango-btn + .tango-btn {
  margin-left: 0;
}

.tango-btn:hover {
  background: var(--ds-accent-hover);
}

.tango-btn:disabled {
  opacity: .5;
  cursor: default;
}

.tango-grid {
  width: min(100%, 480px);
  aspect-ratio: 1;
  border-radius: 8px;
  box-shadow: var(--ds-shadow-card);
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

.tango-cell {
  cursor: pointer;
}

.tango-cell-given {
  cursor: default;
}

.tango-glyph {
  fill: #f7f6f3;
  font-size: .42px;
  pointer-events: none;
}

.tango-constraint-bg {
  fill: var(--ds-surface-solid);
  stroke: var(--ds-border);
  stroke-width: .02;
}

.tango-constraint {
  fill: var(--ds-text);
  font-size: .22px;
  pointer-events: none;
}

.tango-win {
  margin: 0;
  font-size: 16px;
  color: var(--ds-accent-light);
}
</style>
