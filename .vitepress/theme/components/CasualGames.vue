<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import QueensBoard from './CasualGames/QueensBoard.vue'
import TangoBoard from './CasualGames/TangoBoard.vue'
import ZipBoard from './CasualGames/ZipBoard.vue'
import SolitaireBoard from './CasualGames/SolitaireBoard.vue'
import { emptyStats, recordResult, hasUsableSavedGame } from './CasualGames/stats.js'
import { loadStats, saveStats, saveGame, loadGame } from './CasualGames/db.js'

const games = [
  { id: 'queens', label: 'Queens' },
  { id: 'tango', label: 'Tango' },
  { id: 'zip', label: 'Zip' },
  { id: 'solitaire', label: 'Пасьянс' },
]

const activeGame = ref('queens')
const queensBoard = ref(null)
const tangoBoard = ref(null)
const zipBoard = ref(null)
const solitaireBoard = ref(null)
const solitaireHud = ref({ score: 0, time: 0, canUndo: false, won: false })

const stats = ref(emptyStats())
const savedGames = ref({ queens: null, tango: null, zip: null, solitaire: null })
const lastWon = ref({ queens: false, tango: false, zip: false, solitaire: false })
const loaded = ref(false)

let solitaireTimer = null
let autosaveTimer = null

const boardRefs = {
  queens: queensBoard,
  tango: tangoBoard,
  zip: zipBoard,
  solitaire: solitaireBoard,
}

const activeBest = computed(() => stats.value.games?.[activeGame.value]?.best ?? 0)
const activeStreak = computed(() => stats.value.games?.[activeGame.value]?.currentStreak ?? 0)
const activeHasSave = computed(() => hasUsableSavedGame(savedGames.value[activeGame.value]))
const savedGamesList = computed(() => games.filter((game) => hasUsableSavedGame(savedGames.value[game.id])))

watch(activeGame, (value, oldValue) => {
  if (oldValue && oldValue !== value) persistGame(oldValue)
  if (value === 'solitaire') startSolitaireTimer()
  else stopSolitaireTimer()
})

function activeBoard() {
  return boardRefs[activeGame.value]?.value || null
}

function onSolitaireUpdate(payload) {
  solitaireHud.value = { ...solitaireHud.value, ...payload }
  if (payload.won) stopSolitaireTimer()
}

function formatSolitaireClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

function startSolitaireTimer() {
  if (solitaireTimer) return
  solitaireTimer = setInterval(() => {
    solitaireHud.value.time += 1
  }, 1000)
}

function stopSolitaireTimer() {
  if (!solitaireTimer) return
  clearInterval(solitaireTimer)
  solitaireTimer = null
}

function solitaireNew() {
  if (solitaireBoard.value?.newGame) solitaireBoard.value.newGame()
  solitaireHud.value.time = 0
  startSolitaireTimer()
}

function solitaireUndo() {
  if (solitaireBoard.value?.undo) solitaireBoard.value.undo()
}

function solitaireHint() {
  if (solitaireBoard.value?.requestHint) solitaireBoard.value.requestHint()
}

async function initPersistence() {
  const storedStats = await loadStats()
  if (storedStats) stats.value = storedStats
  const [queens, tango, zip, solitaire] = await Promise.all([
    loadGame('queens'),
    loadGame('tango'),
    loadGame('zip'),
    loadGame('solitaire'),
  ])
  savedGames.value = { queens, tango, zip, solitaire }
  loaded.value = true
}

function recordWinIfNeeded(gameId, score) {
  if (lastWon.value[gameId]) return
  stats.value = recordResult(stats.value, gameId, score, true)
  saveStats(stats.value)
}

function persistGame(gameId) {
  if (!loaded.value) return
  const board = boardRefs[gameId]?.value
  const state = board?.getState?.()
  if (!state) return
  if (state.won) {
    recordWinIfNeeded(gameId, state.score)
    savedGames.value = { ...savedGames.value, [gameId]: null }
    saveGame(gameId, null)
  } else {
    savedGames.value = { ...savedGames.value, [gameId]: { gameId, state } }
    saveGame(gameId, state)
  }
  lastWon.value = { ...lastWon.value, [gameId]: Boolean(state.won) }
}

function persistActive() {
  persistGame(activeGame.value)
}

async function continueGame(gameId) {
  const saved = savedGames.value[gameId]
  if (!hasUsableSavedGame(saved)) return
  activeGame.value = gameId
  await nextTick()
  const board = boardRefs[gameId]?.value
  if (board?.restoreState) board.restoreState(saved.state)
}

function startAutosave() {
  if (autosaveTimer) return
  autosaveTimer = setInterval(persistActive, 2000)
}

function stopAutosave() {
  if (!autosaveTimer) return
  clearInterval(autosaveTimer)
  autosaveTimer = null
}

function handleBeforeUnload() {
  persistActive()
}

onMounted(() => {
  initPersistence()
  startAutosave()
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  stopAutosave()
  window.removeEventListener('beforeunload', handleBeforeUnload)
  persistActive()
})
</script>

<template>
  <div class="cg-root">
    <nav class="cg-tabs" role="tablist" aria-label="Игры">
      <button
        v-for="game in games"
        :key="game.id"
        type="button"
        class="cg-tab"
        role="tab"
        :class="{ active: activeGame === game.id }"
        :aria-selected="activeGame === game.id"
        @click="activeGame = game.id"
      >
        {{ game.label }}
      </button>
    </nav>

    <div class="cg-meta">
      <span class="cg-stat">Рекорд: {{ activeBest }}</span>
      <span class="cg-stat">Серия: {{ activeStreak }}</span>
      <span v-if="activeHasSave" class="cg-stat cg-save-hint">Партия сохранена</span>
    </div>

    <div v-if="savedGamesList.length" class="cg-saves">
      <span class="cg-saves-label">Сохранённые партии:</span>
      <button
        v-for="game in savedGamesList"
        :key="game.id"
        type="button"
        class="cg-resume"
        @click="continueGame(game.id)"
      >
        Продолжить {{ game.label }}
      </button>
    </div>

    <div class="cg-board" role="tabpanel">
      <QueensBoard v-if="activeGame === 'queens'" ref="queensBoard" />
      <TangoBoard v-else-if="activeGame === 'tango'" ref="tangoBoard" />
      <ZipBoard v-else-if="activeGame === 'zip'" ref="zipBoard" />
      <SolitaireBoard v-else-if="activeGame === 'solitaire'" ref="solitaireBoard" @update="onSolitaireUpdate" />
      <p v-else class="cg-placeholder">Выберите игру. Доска появится после подключения движка.</p>
    </div>

    <footer v-if="activeGame === 'solitaire'" class="cg-hud">
      <span class="cg-stat">Счёт: {{ solitaireHud.score }}</span>
      <span class="cg-stat">Время: {{ formatSolitaireClock(solitaireHud.time) }}</span>
      <button type="button" class="cg-hint" @click="solitaireNew">Новая</button>
      <button type="button" class="cg-hint" :disabled="!solitaireHud.canUndo" @click="solitaireUndo">Отмена</button>
      <button type="button" class="cg-hint" :disabled="solitaireHud.won" @click="solitaireHint">Подсказка</button>
    </footer>
  </div>
</template>

<style scoped src="./CasualGames.css"></style>
