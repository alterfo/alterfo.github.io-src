<script setup>
import { ref } from 'vue'
import QueensBoard from './CasualGames/QueensBoard.vue'
import TangoBoard from './CasualGames/TangoBoard.vue'

const games = [
  { id: 'queens', label: 'Queens' },
  { id: 'tango', label: 'Tango' },
  { id: 'zip', label: 'Zip' },
  { id: 'solitaire', label: 'Пасьянс' },
]

const activeGame = ref('queens')
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
      <p v-else class="cg-placeholder">Выберите игру. Доска появится после подключения движка.</p>
    </div>

    <footer v-if="activeGame !== 'queens' && activeGame !== 'tango'" class="cg-hud">
      <span class="cg-stat">Счёт: 0</span>
      <span class="cg-stat">Время: 00:00</span>
      <button type="button" class="cg-hint" disabled>Подсказка</button>
    </footer>
  </div>
</template>

<style scoped src="./CasualGames.css"></style>
