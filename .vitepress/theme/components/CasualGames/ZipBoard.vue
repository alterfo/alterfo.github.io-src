<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { mulberry32 } from './rng.js'
import { generate, validatePath, isSolved, hint } from './zip.js'
import { scorePuzzle, formatClock } from './scoring.js'

const puzzle = ref(null)
const path = ref([])
const hints = ref(0)
const elapsedSeconds = ref(0)
const solved = ref(false)

let startedAt = 0
let timer = null
let dragging = false

const size = computed(() => (puzzle.value ? puzzle.value.size : 0))
const totalCells = computed(() => size.value * size.value)
const waypoints = computed(() => (puzzle.value ? puzzle.value.waypoints : []))
const conflicts = computed(() => (puzzle.value ? validatePath(puzzle.value, path.value) : []))

const pathSet = computed(() => new Set(path.value))

const conflictKeys = computed(() => {
  const keys = new Set()
  for (const conflict of conflicts.value) {
    if (conflict.type === 'adjacent') {
      keys.add(conflict.from)
      keys.add(conflict.to)
    } else if (Number.isInteger(conflict.cell)) {
      keys.add(conflict.cell)
    }
  }
  return keys
})

const startCell = computed(() => {
  const values = waypoints.value
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === 1) return index
  }
  return -1
})

const endCell = computed(() => {
  const values = waypoints.value
  let end = -1
  let maxNumber = 0
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] > maxNumber) {
      maxNumber = values[index]
      end = index
    }
  }
  return end
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

const pathPoints = computed(() =>
  path.value
    .map((cell) => `${(cell % size.value) + 0.5},${Math.floor(cell / size.value) + 0.5}`)
    .join(' '),
)

function areAdjacent(a, b) {
  const rowA = Math.floor(a / size.value)
  const colA = a % size.value
  const rowB = Math.floor(b / size.value)
  const colB = b % size.value
  return (
    (rowA === rowB && Math.abs(colA - colB) === 1) ||
    (colA === colB && Math.abs(rowA - rowB) === 1)
  )
}

function append(cell) {
  if (!puzzle.value || solved.value) return
  const current = path.value
  if (current.length === 0) {
    if (cell !== startCell.value) return
    path.value = [cell]
  } else {
    const last = current[current.length - 1]
    if (current.includes(endCell.value) && current.length < totalCells.value) return
    if (cell === last || current.includes(cell) || !areAdjacent(last, cell)) return
    path.value = [...current, cell]
  }
  solved.value = isSolved(puzzle.value, path.value)
}

function startDrag(row, col) {
  if (!puzzle.value) return
  dragging = true
  append(row * size.value + col)
}

function enterCell(row, col) {
  if (!dragging) return
  append(row * size.value + col)
}

function endDrag() {
  dragging = false
}

function undoLast() {
  if (!puzzle.value || path.value.length === 0 || solved.value) return
  path.value = path.value.slice(0, -1)
}

function requestHint() {
  if (!puzzle.value || solved.value) return
  const move = hint(puzzle.value, path.value)
  if (!move) return
  const solution = puzzle.value.solution
  if (path.value.length === 0 || path.value[path.value.length - 1] === move.from) {
    const next = path.value.length === 0 ? [move.from] : path.value.slice()
    if (next[next.length - 1] !== move.to) next.push(move.to)
    path.value = next
  } else {
    path.value = solution.slice(0, solution.indexOf(move.to) + 1)
  }
  hints.value += 1
  solved.value = isSolved(puzzle.value, path.value)
}

function newGame() {
  const rng = mulberry32(Date.now() >>> 0)
  puzzle.value = generate(rng)
  path.value = []
  hints.value = 0
  elapsedSeconds.value = 0
  solved.value = false
  startedAt = Date.now()
}

function tick() {
  if (!puzzle.value || solved.value) return
  elapsedSeconds.value = Math.floor((Date.now() - startedAt) / 1000)
}

function waypointAt(index) {
  return waypoints.value[index] > 0 ? waypoints.value[index] : ''
}

function cellFill(index) {
  if (conflictKeys.value.has(index)) return '#3a1a1a'
  if (pathSet.value.has(index)) return 'var(--ds-accent-bg)'
  if (waypoints.value[index] > 0) return '#262a30'
  return '#1e2126'
}

function cellStroke(index) {
  return conflictKeys.value.has(index) ? '#f87171' : '#2a2f36'
}

function cellCenter(index) {
  return (index % size.value) + 0.5
}

function cellMiddle(index) {
  return Math.floor(index / size.value) + 0.5
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
      waypoints: [...puzzle.value.waypoints],
    },
    path: [...path.value],
  }
}

function restoreState(state) {
  if (!state || !state.puzzle) return
  puzzle.value = {
    size: state.puzzle.size,
    solution: [...(state.puzzle.solution || [])],
    waypoints: [...(state.puzzle.waypoints || [])],
  }
  path.value = [...(state.path || [])]
  hints.value = Math.max(0, Number(state.hints) || 0)
  elapsedSeconds.value = Math.max(0, Number(state.elapsedSeconds) || 0)
  solved.value = Boolean(state.won)
  startedAt = Date.now()
}

defineExpose({ getState, restoreState })
</script>

<template>
  <div class="zip">
    <div class="zip-toolbar">
      <span class="zip-score">Счёт: {{ score }}</span>
      <span class="zip-clock">Время: {{ formatClock(elapsedSeconds) }}</span>
      <button type="button" class="zip-btn" @click="newGame">Новая</button>
      <button type="button" class="zip-btn" @click="undoLast" :disabled="solved || path.length === 0">Отмена</button>
      <button type="button" class="zip-btn" @click="requestHint" :disabled="solved">Подсказка</button>
    </div>

    <svg
      v-if="puzzle"
      class="zip-grid"
      :viewBox="`0 0 ${size} ${size}`"
      role="img"
      aria-label="Поле Zip"
      @pointerup="endDrag"
      @pointercancel="endDrag"
    >
      <g v-for="row in size" :key="`row-${row - 1}`">
        <g v-for="col in size" :key="`${row - 1}-${col - 1}`">
          <rect
            :x="col - 1"
            :y="row - 1"
            width="1"
            height="1"
            :fill="cellFill((row - 1) * size + (col - 1))"
            :stroke="cellStroke((row - 1) * size + (col - 1))"
            stroke-width="0.03"
            class="zip-cell"
            @pointerdown.prevent="startDrag(row - 1, col - 1)"
            @pointerenter="enterCell(row - 1, col - 1)"
          />
        </g>
      </g>

      <polyline
        v-if="path.length > 1"
        class="zip-path"
        :points="pathPoints"
      />

      <g v-for="cell in path" :key="`node-${cell}`">
        <circle
          :cx="cellCenter(cell)"
          :cy="cellMiddle(cell)"
          r="0.13"
          class="zip-node"
        />
      </g>

      <g v-for="row in size" :key="`label-row-${row - 1}`">
        <g v-for="col in size" :key="`label-${row - 1}-${col - 1}`">
          <text
            v-if="waypointAt((row - 1) * size + (col - 1))"
            :x="col - 0.5"
            :y="row - 0.3"
            text-anchor="middle"
            class="zip-waypoint"
          >{{ waypointAt((row - 1) * size + (col - 1)) }}</text>
        </g>
      </g>
    </svg>

    <p v-if="solved" class="zip-win">Победа</p>
    <p v-else-if="path.length > 0 && path[path.length - 1] === endCell" class="zip-incomplete">Путь дошёл до финиша, но остались пустые клетки.</p>
  </div>
</template>

<style scoped>
.zip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 560px;
}

.zip-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.zip-score,
.zip-clock {
  font-size: 14px;
  color: var(--ds-text);
  font-variant-numeric: tabular-nums;
}

.zip-clock {
  color: var(--ds-text-muted);
}

.zip-btn {
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

.zip-btn:first-of-type {
  margin-left: auto;
}

.zip-btn + .zip-btn {
  margin-left: 0;
}

.zip-btn:hover {
  background: var(--ds-accent-hover);
}

.zip-btn:disabled {
  opacity: .5;
  cursor: default;
}

.zip-grid {
  width: min(100%, 480px);
  aspect-ratio: 1;
  border-radius: 8px;
  box-shadow: var(--ds-shadow-card);
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

.zip-cell {
  cursor: pointer;
}

.zip-path {
  fill: none;
  stroke: var(--ds-accent-light);
  stroke-width: 0.12;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}

.zip-node {
  fill: var(--ds-accent-light);
  pointer-events: none;
}

.zip-waypoint {
  fill: #f7f6f3;
  font-size: .32px;
  font-family: var(--ds-font-body);
  font-weight: 600;
  pointer-events: none;
}

.zip-win {
  margin: 0;
  font-size: 16px;
  color: var(--ds-accent-light);
}

.zip-incomplete {
  margin: 0;
  font-size: 14px;
  color: var(--ds-text-muted);
}
</style>
