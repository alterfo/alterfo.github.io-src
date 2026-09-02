import { shuffle } from './rng.js'

export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades']

const RED_SUITS = new Set(['hearts', 'diamonds'])

export function isRed(suit) {
  return RED_SUITS.has(suit)
}

export function deal(rng) {
  if (typeof rng !== 'function') throw new TypeError('rng must be a function')
  const shuffled = shuffle(createDeck(), rng)
  const tableau = []
  let cursor = 0
  for (let pile = 0; pile < 7; pile += 1) {
    const cards = shuffled.slice(cursor, cursor + pile + 1).map((item, index, all) => ({
      suit: item.suit,
      rank: item.rank,
      faceUp: index === all.length - 1,
    }))
    tableau.push(cards)
    cursor += pile + 1
  }
  const stock = shuffled.slice(cursor).map((item) => ({ suit: item.suit, rank: item.rank, faceUp: false }))
  return {
    stock,
    waste: [],
    foundations: emptyFoundations(),
    tableau,
    score: 0,
    moves: 0,
  }
}

export function legalMoves(state) {
  assertState(state)
  const moves = []
  if (state.stock.length > 0 || state.waste.length > 0) moves.push({ type: 'draw' })

  const wasteTop = top(state.waste)
  if (wasteTop) {
    for (const suit of SUITS) {
      if (canPlaceOnFoundation(wasteTop, state.foundations[suit], suit)) {
        moves.push({ type: 'wasteToFoundation', toSuit: suit })
      }
    }
    for (let target = 0; target < 7; target += 1) {
      if (canPlaceOnTableau(wasteTop, state.tableau[target])) {
        moves.push({ type: 'wasteToTableau', to: target })
      }
    }
  }

  for (let source = 0; source < 7; source += 1) {
    const pile = state.tableau[source]
    const sourceTop = top(pile)
    if (!sourceTop) continue
    for (const suit of SUITS) {
      if (canPlaceOnFoundation(sourceTop, state.foundations[suit], suit)) {
        moves.push({ type: 'tableauToFoundation', from: source, toSuit: suit })
      }
    }
    for (let target = 0; target < 7; target += 1) {
      if (target === source) continue
      for (let count = 1; count <= pile.length; count += 1) {
        const run = runFromTop(pile, count)
        if (!run) break
        if (canPlaceOnTableau(run[0], state.tableau[target])) {
          moves.push({ type: 'tableauToTableau', from: source, to: target, count })
        }
      }
    }
  }

  return moves
}

export function applyMove(state, move) {
  assertState(state)
  if (!move || typeof move !== 'object') throw new TypeError('move must be an object')
  const next = cloneState(state)
  next.moves += 1

  if (move.type === 'draw') {
    if (next.stock.length > 0) {
      const drawn = next.stock.pop()
      next.waste.push({ suit: drawn.suit, rank: drawn.rank, faceUp: true })
      return next
    }
    if (next.waste.length > 0) {
      next.stock = next.waste
        .slice()
        .reverse()
        .map((item) => ({ suit: item.suit, rank: item.rank, faceUp: false }))
      next.waste = []
      return next
    }
    throw new Error('no cards to draw')
  }

  if (move.type === 'wasteToFoundation') {
    if (next.waste.length === 0) throw new Error('waste is empty')
    const card = next.waste[next.waste.length - 1]
    const foundation = next.foundations[move.toSuit]
    if (!foundation || !canPlaceOnFoundation(card, foundation, move.toSuit)) throw new Error('invalid waste-to-foundation move')
    next.waste = next.waste.slice(0, -1)
    foundation.push({ suit: card.suit, rank: card.rank, faceUp: true })
    next.score += 10
    return next
  }

  if (move.type === 'wasteToTableau') {
    if (next.waste.length === 0) throw new Error('waste is empty')
    const card = next.waste[next.waste.length - 1]
    const target = next.tableau[move.to]
    if (!target || !canPlaceOnTableau(card, target)) throw new Error('invalid waste-to-tableau move')
    next.waste = next.waste.slice(0, -1)
    target.push({ suit: card.suit, rank: card.rank, faceUp: true })
    next.score += 5
    return next
  }

  if (move.type === 'tableauToFoundation') {
    const source = next.tableau[move.from]
    if (!source || source.length === 0) throw new Error('tableau pile is empty')
    const card = source[source.length - 1]
    const foundation = next.foundations[move.toSuit]
    if (!foundation || !canPlaceOnFoundation(card, foundation, move.toSuit)) throw new Error('invalid tableau-to-foundation move')
    const result = popFromPile(source)
    next.tableau[move.from] = result.pile
    foundation.push({ suit: card.suit, rank: card.rank, faceUp: true })
    next.score += 10 + (result.flipped ? 5 : 0)
    return next
  }

  if (move.type === 'tableauToTableau') {
    const source = next.tableau[move.from]
    const target = next.tableau[move.to]
    if (!source || !target || move.from === move.to) throw new Error('invalid tableau-to-tableau move')
    const count = Math.floor(move.count)
    if (!Number.isInteger(count) || count < 1) throw new Error('count must be a positive integer')
    const run = runFromTop(source, count)
    if (!run || !canPlaceOnTableau(run[0], target)) throw new Error('invalid tableau-to-tableau move')
    const result = takeRunFromPile(source, count)
    next.tableau[move.from] = result.pile
    next.tableau[move.to] = target.concat(result.cards.map((item) => ({ suit: item.suit, rank: item.rank, faceUp: true })))
    next.score += result.flipped ? 5 : 0
    return next
  }

  throw new Error(`unknown move type: ${move.type}`)
}

export function autoMoveToFoundation(state) {
  const moves = legalMoves(state)
  return moves.find((move) => move.type === 'tableauToFoundation') || moves.find((move) => move.type === 'wasteToFoundation') || null
}

export function hint(state) {
  const moves = legalMoves(state)
  return moves.find((move) => move.type === 'wasteToFoundation')
    || moves.find((move) => move.type === 'tableauToFoundation')
    || moves.find((move) => move.type === 'wasteToTableau')
    || moves.find((move) => move.type === 'tableauToTableau')
    || moves.find((move) => move.type === 'draw')
    || null
}

export function isWon(state) {
  assertState(state)
  return SUITS.every((suit) => state.foundations[suit].length === 13)
}

export function score(state) {
  assertState(state)
  return state.score
}

function createDeck() {
  const deck = []
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank += 1) {
      deck.push({ suit, rank, faceUp: false })
    }
  }
  return deck
}

function emptyFoundations() {
  return { clubs: [], diamonds: [], hearts: [], spades: [] }
}

function assertState(state) {
  if (!state || typeof state !== 'object') throw new TypeError('state must be an object')
  if (!Array.isArray(state.stock) || !Array.isArray(state.waste) || !Array.isArray(state.tableau)) {
    throw new TypeError('state must contain stock, waste, and tableau arrays')
  }
  if (!state.foundations || SUITS.some((suit) => !Array.isArray(state.foundations[suit]))) {
    throw new TypeError('state must contain all foundation piles')
  }
  if (state.tableau.length !== 7) throw new TypeError('state must contain seven tableau piles')
}

function cloneState(state) {
  return {
    stock: state.stock.map(cloneCard),
    waste: state.waste.map(cloneCard),
    foundations: Object.fromEntries(SUITS.map((suit) => [suit, state.foundations[suit].map(cloneCard)])),
    tableau: state.tableau.map((pile) => pile.map(cloneCard)),
    score: Number(state.score) || 0,
    moves: Number(state.moves) || 0,
  }
}

function cloneCard(item) {
  return { suit: item.suit, rank: item.rank, faceUp: item.faceUp }
}

function top(pile) {
  return pile.length > 0 ? pile[pile.length - 1] : null
}

function canPlaceOnFoundation(card, foundation, suit) {
  if (!card || !card.faceUp) return false
  if (foundation.length === 0) return card.suit === suit && card.rank === 1
  const topCard = foundation[foundation.length - 1]
  return card.suit === topCard.suit && card.rank === topCard.rank + 1
}

function canPlaceOnTableau(card, pile) {
  if (!card || !card.faceUp) return false
  if (pile.length === 0) return card.rank === 13
  const topCard = pile[pile.length - 1]
  return topCard.faceUp && card.rank === topCard.rank - 1 && isRed(card.suit) !== isRed(topCard.suit)
}

function runFromTop(pile, count) {
  if (!Number.isInteger(count) || count < 1 || count > pile.length) return null
  const cards = pile.slice(pile.length - count)
  for (let index = 1; index < cards.length; index += 1) {
    const previous = cards[index - 1]
    const current = cards[index]
    if (!previous.faceUp || !current.faceUp) return null
    if (current.rank !== previous.rank - 1) return null
    if (isRed(current.suit) === isRed(previous.suit)) return null
  }
  return cards
}

function popFromPile(pile) {
  const card = pile[pile.length - 1]
  const remaining = pile.slice(0, -1)
  return { card, pile: revealTop(remaining), flipped: remaining.length > 0 && !remaining[remaining.length - 1].faceUp }
}

function takeRunFromPile(pile, count) {
  const cards = pile.slice(pile.length - count)
  const remaining = pile.slice(0, pile.length - count)
  return { cards, pile: revealTop(remaining), flipped: remaining.length > 0 && !remaining[remaining.length - 1].faceUp }
}

function revealTop(pile) {
  if (pile.length === 0 || pile[pile.length - 1].faceUp) return pile
  const revealed = pile.slice(0, -1)
  revealed.push({ suit: pile[pile.length - 1].suit, rank: pile[pile.length - 1].rank, faceUp: true })
  return revealed
}
