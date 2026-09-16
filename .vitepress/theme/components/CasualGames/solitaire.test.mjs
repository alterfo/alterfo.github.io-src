import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32 } from './rng.js'
import {
  SUITS,
  isRed,
  movesEqual,
  deal,
  legalMoves,
  applyMove,
  autoMoveToFoundation,
  isUselessTableauMove,
  hint,
  explainHint,
  isWon,
  canAutoComplete,
  solveRemaining,
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

test('explainHint returns null when there is no move', () => {
  assert.equal(explainHint(makeState(), null), null)
})

test('explainHint explains a draw when the stock has cards', () => {
  const state = makeState({ stock: [card('hearts', 4, false)] })
  assert.match(explainHint(state, { type: 'draw' }), /сток/i)
})

test('explainHint explains a redeal when the stock is empty', () => {
  const state = makeState({ waste: [card('hearts', 4, true)] })
  assert.match(explainHint(state, { type: 'draw' }), /пересдайте/i)
})

test('explainHint names the card and target foundation', () => {
  const state = makeState({ waste: [card('clubs', 1, true)] })
  const message = explainHint(state, { type: 'wasteToFoundation', toSuit: 'clubs' })
  assert.match(message, /A♣/)
  assert.match(message, /Трефы/)
})

test('explainHint explains a tableau-to-foundation move', () => {
  const state = makeState({ tableau: [[], [], [card('diamonds', 2, false), card('diamonds', 1, true)], [], [], [], []] })
  const message = explainHint(state, { type: 'tableauToFoundation', from: 2, toSuit: 'diamonds' })
  assert.match(message, /A♦/)
  assert.match(message, /Бубны/)
})

test('explainHint explains placing onto a tableau card by rank and color', () => {
  const state = makeState({
    waste: [card('hearts', 5, true)],
    tableau: [[], [], [], [], [], [card('clubs', 6, true)], []],
  })
  const message = explainHint(state, { type: 'wasteToTableau', to: 5 })
  assert.match(message, /ранг на 1 меньше/)
})

test('explainHint explains placing into an empty tableau column', () => {
  const state = makeState({ waste: [card('spades', 13, true)] })
  const message = explainHint(state, { type: 'wasteToTableau', to: 0 })
  assert.match(message, /пуст/)
})

test('explainHint explains a tableau-to-tableau move', () => {
  const state = makeState({
    tableau: [
      [card('clubs', 6, true)],
      [card('hearts', 5, true)],
      [],
      [],
      [],
      [],
      [],
    ],
  })
  const message = explainHint(state, { type: 'tableauToTableau', from: 1, to: 0, count: 1 })
  assert.match(message, /5♥/)
  assert.match(message, /ранг на 1 меньше/)
})

test('isUselessTableauMove flags relocating a whole pile between two empty columns', () => {
  const state = makeState({ tableau: [[card('spades', 13, true)], [], [], [], [], [], []] })
  const move = { type: 'tableauToTableau', from: 0, to: 1, count: 1 }
  assert.equal(isUselessTableauMove(state, move), true)
})

test('isUselessTableauMove allows a move that reveals a hidden card', () => {
  const state = makeState({ tableau: [[card('hearts', 2, false), card('spades', 13, true)], [], [], [], [], [], []] })
  const move = { type: 'tableauToTableau', from: 0, to: 1, count: 1 }
  assert.equal(isUselessTableauMove(state, move), false)
})

test('isUselessTableauMove ignores moves of other types', () => {
  assert.equal(isUselessTableauMove(makeState(), { type: 'draw' }), false)
  assert.equal(isUselessTableauMove(makeState(), null), false)
})

test('isUselessTableauMove flags splitting off part of an already-attached run', () => {
  const state = makeState({
    tableau: [
      [card('hearts', 2, false), card('clubs', 8, true), card('hearts', 7, true)],
      [],
      [],
      [],
      [],
      [],
      [],
    ],
  })
  const move = { type: 'tableauToTableau', from: 0, to: 1, count: 1 }
  assert.equal(isUselessTableauMove(state, move), true)
})

test('isUselessTableauMove allows moving the full attached run that reveals a hidden card', () => {
  const state = makeState({
    tableau: [
      [card('hearts', 2, false), card('clubs', 8, true), card('hearts', 7, true)],
      [card('diamonds', 9, true)],
      [],
      [],
      [],
      [],
      [],
    ],
  })
  const move = { type: 'tableauToTableau', from: 0, to: 1, count: 2 }
  assert.equal(isUselessTableauMove(state, move), false)
  assert.ok(legalMoves(state).some((candidate) =>
    candidate.type === 'tableauToTableau' && candidate.from === 0 && candidate.to === 1 && candidate.count === 2,
  ))
})

test('hint does not suggest shuffling a lone king between empty tableau columns', () => {
  const state = makeState({ tableau: [[card('spades', 13, true)], [], [], [], [], [], []] })
  assert.equal(hint(state), null)
})

test('hint prefers moving a whole attached run over splitting off just its top card', () => {
  const state = makeState({
    tableau: [
      [card('hearts', 2, false), card('clubs', 8, true), card('hearts', 7, true)],
      [card('diamonds', 9, true)],
      [],
      [],
      [],
      [],
      [],
    ],
  })
  assert.deepEqual(hint(state), { type: 'tableauToTableau', from: 0, to: 1, count: 2 })
})

test('hint still proposes a tableau-to-tableau move that reveals a hidden card', () => {
  const state = makeState({
    tableau: [
      [card('hearts', 2, false), card('clubs', 6, true)],
      [card('diamonds', 7, true)],
      [],
      [],
      [],
      [],
      [],
    ],
  })
  assert.deepEqual(hint(state), { type: 'tableauToTableau', from: 0, to: 1, count: 1 })
})

test('canAutoComplete requires every tableau card face up and the game unfinished', () => {
  const allFaceUp = makeState({ tableau: [[card('hearts', 2, true)], [card('clubs', 5, true)], [], [], [], [], []] })
  assert.equal(canAutoComplete(allFaceUp), true)
  const hidden = makeState({ tableau: [[card('hearts', 2, false)], [], [], [], [], [], []] })
  assert.equal(canAutoComplete(hidden), false)
})

test('canAutoComplete is false once the game is already won', () => {
  const foundations = {}
  for (const suit of SUITS) foundations[suit] = Array.from({ length: 13 }, (_, index) => card(suit, index + 1, true))
  const wonState = makeState({ foundations })
  assert.equal(canAutoComplete(wonState), false)
})

test('solveRemaining finds a winning sequence from a fully revealed near-finished state', () => {
  const foundations = {
    clubs: Array.from({ length: 11 }, (_, index) => card('clubs', index + 1, true)),
    diamonds: Array.from({ length: 13 }, (_, index) => card('diamonds', index + 1, true)),
    hearts: Array.from({ length: 13 }, (_, index) => card('hearts', index + 1, true)),
    spades: Array.from({ length: 13 }, (_, index) => card('spades', index + 1, true)),
  }
  const state = makeState({
    foundations,
    tableau: [[card('clubs', 12, true)], [card('clubs', 13, true)], [], [], [], [], []],
  })
  const moves = solveRemaining(state)
  assert.ok(moves && moves.length > 0)
  const finalState = moves.reduce((current, move) => applyMove(current, move), state)
  assert.equal(isWon(finalState), true)
})

test('solveRemaining returns an empty sequence when already won', () => {
  const foundations = {}
  for (const suit of SUITS) foundations[suit] = Array.from({ length: 13 }, (_, index) => card(suit, index + 1, true))
  assert.deepEqual(solveRemaining(makeState({ foundations })), [])
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

test('movesEqual compares full move identity, not just source', () => {
  assert.equal(movesEqual({ type: 'tableauToFoundation', from: 0, toSuit: 'clubs' }, { type: 'tableauToFoundation', from: 0, toSuit: 'clubs' }), true)
  assert.equal(movesEqual({ type: 'tableauToFoundation', from: 0, toSuit: 'clubs' }, { type: 'tableauToFoundation', from: 0, toSuit: 'diamonds' }), false)
  assert.equal(movesEqual({ type: 'tableauToTableau', from: 1, to: 2, count: 3 }, { type: 'tableauToTableau', from: 1, to: 2, count: 3 }), true)
  assert.equal(movesEqual({ type: 'tableauToTableau', from: 1, to: 2, count: 3 }, { type: 'tableauToTableau', from: 1, to: 2, count: 2 }), false)
  assert.equal(movesEqual({ type: 'wasteToFoundation', toSuit: 'spades' }, { type: 'wasteToFoundation', toSuit: 'spades' }), true)
  assert.equal(movesEqual({ type: 'wasteToFoundation', toSuit: 'spades' }, { type: 'wasteToFoundation', toSuit: 'hearts' }), false)
  assert.equal(movesEqual({ type: 'draw' }, { type: 'draw' }), true)
  assert.equal(movesEqual({ type: 'draw' }, { type: 'wasteToTableau', to: 0 }), false)
})
