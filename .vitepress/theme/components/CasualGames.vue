<script setup>
import { ref, watch } from 'vue'
import QueensBoard from './CasualGames/QueensBoard.vue'
import TangoBoard from './CasualGames/TangoBoard.vue'
import ZipBoard from './CasualGames/ZipBoard.vue'
import SolitaireBoard from './CasualGames/SolitaireBoard.vue'

const games = [
  { id: 'queens', label: 'Queens' },
  { id: 'tango', label: 'Tango' },
  { id: 'zip', label: 'Zip' },
  { id: 'solitaire', label: 'Пасьянс' },
]

const activeGame = ref('queens')
const solitaireBoard = ref(null)
const solitaireHud = ref({ score: 0, time: 0, canUndo: false, won: false })
let solitaireTimer = null

watch(activeGame, (value) => {
  if (value === 'solitaire') startSolitaireTimer()
  else stopSolitaireTimer()
})

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

    <div class="cg-board" role="tabpanel">
      <QueensBoard v-if="activeGame === 'queens'" />
      <TangoBoard v-else-if="activeGame === 'tango'" />
      <ZipBoard v-else-if="activeGame === 'zip'" />
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
