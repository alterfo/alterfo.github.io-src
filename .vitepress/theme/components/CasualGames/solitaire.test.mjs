import { test } from 'node:test'
import assert from 'node:assert/strict'
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

const RED_SUITS = new Set(['hearts', 'diamonds'])

function card(suit, rank, faceUp = true) {
  return { suit, rank, faceUp }
}

function makeState(overrides = {}) {
  return {
    stock: [],
    waste: [],
    foundations: Object.fromEntries(SUITS.map((suit) => [suit, []])),
    tableau: [[], [], [], [], [], [], []],
    score: 0,
    moves: 0,
    ...overrides,
  }
}

function cardCount(state) {
  return (
    state.stock.length +
    state.waste.length +
    SUITS.reduce((sum, suit) => sum + state.foundations[suit].length, 0) +
    state.tableau.reduce((sum, pile) => sum + pile.length, 0)
  )
}

test('deal creates a valid 52-card Klondike layout', () => {
  const state = deal(mulberry32(2026))
  assert.equal(cardCount(state), 52)
  assert.equal(state.stock.length, 24)
  assert.equal(state.waste.length, 0)
  assert.equal(state.score, 0)
  assert.equal(state.moves, 0)
  for (const suit of SUITS) assert.equal(state.foundations[suit].length, 0)
  assert.deepEqual(state.tableau.map((pile) => pile.length), [1, 2, 3, 4, 5, 6, 7])
  assert.equal(state.tableau.filter((pile) => pile.length > 0 && pile[pile.length - 1].faceUp).length, 7)
  assert.equal(state.tableau.reduce((sum, pile) => sum + pile.filter((item) => !item.faceUp).length, 0), 21)
  assert.equal(state.stock.every((item) => !item.faceUp), true)
  const seen = new Set()
  for (const pile of state.tableau) {
    for (const item of pile) {
      const key = `${item.suit}:${item.rank}`
      assert.equal(seen.has(key), false)
      seen.add(key)
    }
  }
  for (const item of state.stock) {
    const key = `${item.suit}:${item.rank}`
    assert.equal(seen.has(key), false)
    seen.add(key)
  }
  assert.equal(seen.size, 52)
})

test('deal is deterministic for the same seed', () => {
  assert.deepEqual(deal(mulberry32(123)), deal(mulberry32(123)))
})

test('deal rejects a non-function rng', () => {
  assert.throws(() => deal(null), TypeError)
  assert.throws(() => deal(), TypeError)
})

test('isRed distinguishes the two suits', () => {
  assert.equal(isRed('hearts'), true)
  assert.equal(isRed('diamonds'), true)
  assert.equal(isRed('clubs'), false)
  assert.equal(isRed('spades'), false)
})

test('legalMoves reports draw while the stock has cards', () => {
  const state = makeState({ stock: [card('clubs', 3, false)] })
  assert.ok(legalMoves(state).some((move) => move.type === 'draw'))
})

test('legalMoves and applyMove handle waste-to-foundation', () => {
  const state = makeState({ waste: [card('clubs', 1, true)] })
  const move = { type: 'wasteToFoundation', toSuit: 'clubs' }
  assert.ok(legalMoves(state).some((item) => item.type === move.type && item.toSuit === move.toSuit))
  const next = applyMove(state, move)
  assert.deepEqual(next.waste, [])
  assert.deepEqual(next.foundations.clubs.map((item) => item.rank), [1])
  assert.equal(next.score, 10)
  assert.equal(score(next), 10)
})

test('legalMoves and applyMove handle waste-to-tableau', () => {
  const state = makeState({
    waste: [card('hearts', 5, true)],
    tableau: [[], [], [card('spades', 6, true)], [], [], [], []],
  })
  const move = { type: 'wasteToTableau', to: 2 }
  assert.ok(legalMoves(state).some((item) => item.type === move.type && item.to === move.to))
  const next = applyMove(state, move)
  assert.equal(next.waste.length, 0)
  assert.deepEqual(next.tableau[2].map((item) => [item.suit, item.rank]), [['spades', 6], ['hearts', 5]])
  assert.equal(next.score, 5)
})

test('applyMove tableau-to-foundation reveals the newly exposed card', () => {
  const state = makeState({
    tableau: [[], [], [card('diamonds', 2, false), card('diamonds', 1, true)], [], [], [], []],
  })
  const move = { type: 'tableauToFoundation', from: 2, toSuit: 'diamonds' }
  const next = applyMove(state, move)
  assert.deepEqual(next.tableau[2].map((item) => [item.suit, item.rank, item.faceUp]), [['diamonds', 2, true]])
  assert.deepEqual(next.foundations.diamonds.map((item) => item.rank), [1])
  assert.equal(next.score, 15)
})

test('applyMove tableau-to-tableau moves a valid descending stack', () => {
  const state = makeState({
    tableau: [
      [card('clubs', 10, false), card('hearts', 6, true), card('spades', 5, true), card('diamonds', 4, true)],
      [card('clubs', 7, true)],
      [],
      [],
      [],
      [],
      [],
    ],
  })
  const move = { type: 'tableauToTableau', from: 0, to: 1, count: 3 }
  assert.ok(legalMoves(state).some((item) => item.type === move.type && item.from === move.from && item.to === move.to && item.count === move.count))
  const next = applyMove(state, move)
  assert.deepEqual(next.tableau[0].map((item) => [item.suit, item.rank, item.faceUp]), [['clubs', 10, true]])
  assert.deepEqual(next.tableau[1].map((item) => [item.suit, item.rank]), [
    ['clubs', 7],
    ['hearts', 6],
    ['spades', 5],
    ['diamonds', 4],
  ])
  assert.equal(next.score, 5)
})

test('legalMoves does not propose an invalid tableau stack', () => {
  const state = makeState({
    tableau: [
      [card('hearts', 6, true), card('spades', 5, true), card('diamonds', 4, true)],
      [card('clubs', 7, true)],
      [],
      [],
      [],
      [],
      [],
    ],
  })
  assert.equal(legalMoves(state).some((item) => item.type === 'tableauToTableau' && item.from === 0 && item.to === 1 && item.count === 2), false)
  assert.equal(legalMoves(state).some((item) => item.type === 'tableauToTableau' && item.from === 0 && item.to === 1 && item.count === 3), true)
})

test('draw moves one stock card to waste and recycles when exhausted', () => {
  const state = makeState({ stock: [card('clubs', 3, false), card('hearts', 8, false)] })
  const first = applyMove(state, { type: 'draw' })
  assert.equal(first.stock.length, 1)
  assert.deepEqual(first.waste.map((item) => [item.suit, item.rank, item.faceUp]), [['hearts', 8, true]])
  const empty = makeState({ waste: [card('hearts', 8, true), card('clubs', 3, true)] })
  const recycled = applyMove(empty, { type: 'draw' })
  assert.equal(recycled.waste.length, 0)
  assert.equal(recycled.stock.length, 2)
  assert.equal(recycled.stock.every((item) => !item.faceUp), true)
  assert.deepEqual(recycled.stock.map((item) => item.rank), [3, 8])
})

test('applyMove rejects an unknown or invalid move', () => {
  const state = makeState()
  assert.throws(() => applyMove(state, { type: 'nope' }), Error)
  assert.throws(() => applyMove(state, { type: 'wasteToFoundation', toSuit: 'clubs' }), Error)
  assert.throws(() => applyMove(state, { type: 'tableauToFoundation', from: 0, toSuit: 'clubs' }), Error)
})

test('isWon detects all four completed foundations', () => {
  const empty = makeState()
  assert.equal(isWon(empty), false)
  const foundations = {}
  for (const suit of SUITS) {
    foundations[suit] = Array.from({ length: 13 }, (_, index) => card(suit, index + 1, true))
  }
  const won = makeState({ foundations })
  assert.equal(isWon(won), true)
})

test('hint prioritizes a foundation move and returns null with no moves', () => {
  const state = makeState({
    waste: [card('clubs', 1, true)],
    stock: [card('hearts', 4, false)],
  })
  assert.deepEqual(hint(state), { type: 'wasteToFoundation', toSuit: 'clubs' })
  const noMoves = makeState({ stock: [], waste: [] })
  assert.equal(hint(noMoves), null)
})

test('autoMoveToFoundation returns the first safe foundation move', () => {
  const state = makeState({
    tableau: [[], [], [card('diamonds', 2, false), card('diamonds', 1, true)], [], [], [], []],
  })
  assert.deepEqual(autoMoveToFoundation(state), { type: 'tableauToFoundation', from: 2, toSuit: 'diamonds' })
  assert.equal(autoMoveToFoundation(makeState()), null)
})

test('score returns the accumulated score', () => {
  const state = makeState({ score: 75 })
  assert.equal(score(state), 75)
})
