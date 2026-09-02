<script setup>
import { computed, onMounted, ref } from 'vue'
import { mulberry32 } from './rng.js'
import {
  SUITS,
  isRed,
  deal,
  legalMoves,
  applyMove,
  autoMoveToFoundation,
  hint,
  isWon,
  score,
} from './solitaire.js'

const emit = defineEmits(['update'])

const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const SUIT_LABELS = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' }
const SUIT_TITLES = { clubs: 'Трефы', diamonds: 'Бубны', hearts: 'Червы', spades: 'Пики' }

const game = ref(null)
const history = ref([])
const selected = ref(null)
let dragPayload = null

const currentScore = computed(() => (game.value ? score(game.value) : 0))
const canUndo = computed(() => history.value.length > 0)
const won = computed(() => (game.value ? isWon(game.value) : false))

function newGame() {
  game.value = deal(mulberry32(Date.now() >>> 0))
  history.value = []
  selected.value = null
  dragPayload = null
  sync()
}

function sync() {
  emit('update', {
    score: currentScore.value,
    canUndo: canUndo.value,
    won: won.value,
  })
}

function commit(move) {
  if (!game.value || !move) return
  const legal = legalMoves(game.value).some((candidate) => movesEqual(candidate, move))
  if (!legal) return
  history.value.push(game.value)
  game.value = applyMove(game.value, move)
  selected.value = null
  dragPayload = null
  sync()
}

function movesEqual(a, b) {
  if (!a || !b || a.type !== b.type) return false
  if (a.type === 'tableauToFoundation' || a.type === 'tableauToTableau') {
    return a.from === b.from
  }
  if (a.type === 'wasteToFoundation') return a.toSuit === b.toSuit
  if (a.type === 'wasteToTableau') return a.to === b.to
  return true
}

function undo() {
  if (!game.value || history.value.length === 0) return
  game.value = history.value.pop()
  selected.value = null
  dragPayload = null
  sync()
}

function requestHint() {
  if (!game.value || won.value) return
  commit(hint(game.value))
}

function draw() {
  commit({ type: 'draw' })
}

function runCountFrom(pile, start) {
  if (!pile[start] || !pile[start].faceUp) return 0
  let count = 1
  for (let index = start; index < pile.length - 1; index += 1) {
    const lower = pile[index]
    const upper = pile[index + 1]
    if (!lower.faceUp || !upper.faceUp) return 0
    if (upper.rank !== lower.rank - 1) return 0
    if (isRed(upper.suit) === isRed(lower.suit)) return 0
    count += 1
  }
  return count
}

function selectWaste() {
  if (!game.value || won.value) return
  if (selected.value && selected.value.source === 'waste') {
    selected.value = null
    return
  }
  selected.value = { source: 'waste', from: -1, count: 1 }
}

function selectTableau(pileIndex, cardIndex) {
  if (!game.value || won.value) return
  if (selected.value) {
    playToTableau(pileIndex)
    return
  }
  const pile = game.value.tableau[pileIndex]
  const count = runCountFrom(pile, cardIndex)
  if (count > 0) selected.value = { source: 'tableau', from: pileIndex, count }
}

function playToTableau(pileIndex) {
  if (!game.value || !selected.value || won.value) return
  const target = selected.value.source === 'tableau' ? selected.value.from : pileIndex
  if (selected.value.source === 'tableau' && selected.value.from === pileIndex) {
    selected.value = null
    return
  }
  const move = selected.value.source === 'waste'
    ? { type: 'wasteToTableau', to: pileIndex }
    : { type: 'tableauToTableau', from: selected.value.from, to: pileIndex, count: selected.value.count }
  const legal = legalMoves(game.value).some((candidate) => movesEqual(candidate, move))
  if (legal) commit(move)
  else selected.value = null
}

function playToFoundation(suit) {
  if (!game.value || !selected.value || won.value) return
  const move = selected.value.source === 'waste'
    ? { type: 'wasteToFoundation', toSuit: suit }
    : { type: 'tableauToFoundation', from: selected.value.from, toSuit: suit }
  const legal = legalMoves(game.value).some((candidate) => movesEqual(candidate, move))
  if (legal) commit(move)
  else selected.value = null
}

function autoFoundation() {
  if (!game.value || won.value) return
  commit(autoMoveToFoundation(game.value))
}

function startDrag(event, source, from, count) {
  dragPayload = { source, from, count }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', JSON.stringify(dragPayload))
  }
}

function dropOnTableau(event, pileIndex) {
  const payload = readDragPayload(event)
  if (!payload) return
  if (payload.source === 'waste') selected.value = payload
  else selected.value = payload
  playToTableau(pileIndex)
}

function dropOnFoundation(event, suit) {
  const payload = readDragPayload(event)
  if (!payload) return
  selected.value = payload
  playToFoundation(suit)
}

function readDragPayload(event) {
  if (dragPayload) return dragPayload
  if (!event.dataTransfer) return null
  try {
    return JSON.parse(event.dataTransfer.getData('text/plain'))
  } catch {
    return null
  }
}

function endDrag() {
  dragPayload = null
}

function rankLabel(card) {
  return RANK_LABELS[card.rank] || card.rank
}

function suitLabel(card) {
  return SUIT_LABELS[card.suit] || card.suit
}

function suitTitle(card) {
  return SUIT_TITLES[card.suit] || card.suit
}

function isSelected(pileIndex, cardIndex) {
  if (!selected.value || selected.value.source !== 'tableau') return false
  if (selected.value.from !== pileIndex) return false
  const pile = game.value.tableau[pileIndex]
  return cardIndex >= pile.length - selected.value.count
}

onMounted(() => {
  newGame()
})

function cloneGame(state) {
  if (!state) return null
  return JSON.parse(JSON.stringify(state))
}

function getState() {
  if (!game.value) return null
  return {
    won: won.value,
    score: currentScore.value,
    game: cloneGame(game.value),
    history: history.value.map(cloneGame),
  }
}

function restoreState(state) {
  if (!state || !state.game) return
  game.value = cloneGame(state.game)
  history.value = (state.history || []).map(cloneGame)
  selected.value = null
  dragPayload = null
  sync()
}

defineExpose({
  newGame,
  undo,
  requestHint,
  getState,
  restoreState,
})
</script>

<template>
  <div class="solitaire">
    <div v-if="game" class="solitaire-table">
      <div class="solitaire-top">
        <button
          type="button"
          class="solitaire-stock"
          :class="{ empty: game.stock.length === 0 }"
          :aria-label="game.stock.length ? 'Сток' : 'Пересдать'"
          @click="draw"
        >
          <span v-if="game.stock.length" class="card card-back">♠</span>
          <span v-else class="card card-empty">↺</span>
        </button>

        <button
          type="button"
          class="solitaire-waste"
          :class="{ empty: game.waste.length === 0 }"
          aria-label="Сброс"
          @click="selectWaste"
          @dblclick="autoFoundation"
        >
          <span v-if="game.waste.length" class="card" :class="{ red: isRed(game.waste[game.waste.length - 1].suit) }">
            <span class="card-rank">{{ rankLabel(game.waste[game.waste.length - 1]) }}</span>
            <span class="card-suit">{{ suitLabel(game.waste[game.waste.length - 1]) }}</span>
          </span>
          <span v-else class="card card-empty"></span>
        </button>

        <div class="solitaire-foundations">
          <button
            v-for="suit in SUITS"
            :key="suit"
            type="button"
            class="solitaire-foundation"
            :class="{ empty: game.foundations[suit].length === 0, drop: !!selected }"
            :aria-label="`База ${suit}`"
            @click="playToFoundation(suit)"
            @dragover.prevent
            @drop.prevent="dropOnFoundation($event, suit)"
          >
            <span v-if="game.foundations[suit].length" class="card" :class="{ red: isRed(suit) }">
              <span class="card-rank">{{ rankLabel(game.foundations[suit][game.foundations[suit].length - 1]) }}</span>
              <span class="card-suit">{{ suitLabel(game.foundations[suit][game.foundations[suit].length - 1]) }}</span>
            </span>
            <span v-else class="card card-empty"></span>
          </button>
        </div>
      </div>

      <div class="solitaire-tableau">
        <div
          v-for="(pile, pileIndex) in game.tableau"
          :key="pileIndex"
          class="solitaire-pile"
          @dragover.prevent
          @drop.prevent="dropOnTableau($event, pileIndex)"
        >
          <button
            v-if="pile.length === 0"
            type="button"
            class="solitaire-pile-empty"
            aria-label="Пустая колонка"
            @click="playToTableau(pileIndex)"
          ></button>
          <button
            v-for="(card, cardIndex) in pile"
            :key="`${pileIndex}-${cardIndex}`"
            type="button"
            class="card"
            :class="{
              'card-face-down': !card.faceUp,
              red: card.faceUp && isRed(card.suit),
              selected: isSelected(pileIndex, cardIndex),
            }"
            :draggable="card.faceUp"
            :aria-label="card.faceUp ? `${rankLabel(card)} ${suitTitle(card)}` : 'Закрытая карта'"
            @click="selectTableau(pileIndex, cardIndex)"
            @dblclick="autoFoundation"
            @dragstart="startDrag($event, 'tableau', pileIndex, runCountFrom(pile, cardIndex))"
            @dragend="endDrag"
          >
            <template v-if="card.faceUp">
              <span class="card-rank">{{ rankLabel(card) }}</span>
              <span class="card-suit">{{ suitLabel(card) }}</span>
            </template>
            <span v-else class="card-back-symbol">♠</span>
          </button>
        </div>
      </div>
    </div>

    <p v-if="won" class="solitaire-win">Победа</p>
  </div>
</template>

<style scoped>
.solitaire {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: 0;
}

.solitaire-table {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: min(100%, 760px);
}

.solitaire-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.solitaire-stock,
.solitaire-waste,
.solitaire-foundation,
.solitaire-pile-empty {
  width: 56px;
  height: 78px;
  padding: 0;
  background: transparent;
  border: 1px dashed var(--ds-border-strong);
  border-radius: 8px;
  cursor: pointer;
}

.solitaire-foundations {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

.solitaire-tableau {
  display: grid;
  grid-template-columns: repeat(7, minmax(56px, 1fr));
  gap: 10px;
  align-items: start;
}

.solitaire-pile {
  min-height: 78px;
}

.card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  width: 56px;
  height: 78px;
  padding: 6px 7px;
  font-family: var(--ds-font-body);
  color: var(--ds-text-strong);
  background: var(--ds-surface-solid);
  border: 1px solid var(--ds-border);
  border-radius: 8px;
  cursor: pointer;
  box-shadow: var(--ds-shadow-card);
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

.solitaire-pile .card {
  margin-top: -54px;
}

.solitaire-pile .card:first-child {
  margin-top: 0;
}

.solitaire-pile .card.card-face-down {
  color: var(--ds-accent-light);
  background: linear-gradient(145deg, #2c2730, #17191d);
}

.solitaire-pile .card.selected {
  outline: 2px solid var(--ds-accent-light);
  outline-offset: 1px;
}

.card.red {
  color: var(--ds-accent-light);
}

.card-rank {
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
}

.card-suit {
  align-self: flex-end;
  font-size: 22px;
  line-height: 1;
}

.card-back-symbol {
  align-self: center;
  margin: auto;
  font-size: 22px;
  opacity: .65;
}

.card-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ds-text-muted);
  border-color: transparent;
}

.solitaire-pile-empty {
  display: block;
  border-color: var(--ds-border);
}

.solitaire-win {
  margin: 0;
  font-size: 16px;
  color: var(--ds-accent-light);
}
</style>
