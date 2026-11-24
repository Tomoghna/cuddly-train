import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canPlayStackThisTurn,
  canSeeJoker,
  getJokerDisplay,
  getJokerLabel,
  markJokers,
  isValidStack,
  canOpenNewStackForPlayer,
  hasPlayerPlayedStack,
  canPlayerAct,
  canExtendStack,
  canExtendStackOnSide,
  addCardsToStack,
  canInsertCardsAtIndex,
  insertCardsAtIndex,
  orderStackCards,
  isStackComplete,
  advanceTurnIndex,
  getRelativeSeat,
  getStandings,
  canDiscardThisTurn,
  getTurnMessage,
  reshuffleDiscardIntoDeck,
  findAiStackMove,
} from '../src/gameRules.js'

test('recycles and shuffles the discard pile only when the deck is empty', () => {
  const card = (id) => ({ id })
  const discard = [card('a'), card('b'), card('c')]
  const recycled = reshuffleDiscardIntoDeck([], discard, () => 0)

  assert.equal(recycled.reshuffled, true)
  assert.equal(recycled.discard.length, 0)
  assert.equal(recycled.deck.length, 3)
  assert.equal(recycled.deck.map((item) => item.id).sort().join(','), 'a,b,c')

  const unchanged = reshuffleDiscardIntoDeck([card('deck')], discard)
  assert.equal(unchanged.reshuffled, false)
  assert.deepEqual(unchanged.deck.map((item) => item.id), ['deck'])
  assert.deepEqual(unchanged.discard.map((item) => item.id), ['a', 'b', 'c'])
})

test('accepts a valid same-suit sequence', () => {
  const cards = [
    { id: '1', rank: '4', suit: '♠', color: 'black', isJoker: false },
    { id: '2', rank: '5', suit: '♠', color: 'black', isJoker: false },
    { id: '3', rank: '6', suit: '♠', color: 'black', isJoker: false },
  ]

  assert.equal(isValidStack(cards), true)
})

test('accepts a valid same-rank set with a joker substitute', () => {
  const cards = [
    { id: '1', rank: '7', suit: '♠', color: 'black', isJoker: false },
    { id: '2', rank: '7', suit: '♥', color: 'red', isJoker: false },
    { id: '3', rank: 'JOKER', suit: '★', color: 'joker', isJoker: true },
  ]

  assert.equal(isValidStack(cards), true)
})

test('rejects a mixed-suit non-sequence stack', () => {
  const cards = [
    { id: '1', rank: '4', suit: '♠', color: 'black', isJoker: false },
    { id: '2', rank: '5', suit: '♥', color: 'red', isJoker: false },
    { id: '3', rank: '6', suit: '♠', color: 'black', isJoker: false },
  ]

  assert.equal(isValidStack(cards), false)
})

test('rejects same-rank stacks larger than the maximum legal set', () => {
  const cards = [
    { id: '1', rank: '9', suit: '♠', color: 'black', isJoker: false },
    { id: '2', rank: '9', suit: '♥', color: 'red', isJoker: false },
    { id: '3', rank: '9', suit: '♣', color: 'black', isJoker: false },
    { id: '4', rank: '9', suit: '♦', color: 'red', isJoker: false },
    { id: '5', rank: 'JOKER', suit: '★', color: 'joker', isJoker: true },
  ]

  assert.equal(isValidStack(cards), false)
})

test('allows playing a stack instead of drawing on the turn', () => {
  assert.equal(canPlayStackThisTurn({ phase: 'draw', hasDrawnThisTurn: false }), true)
})

test('blocks stack play after drawing a card this turn', () => {
  assert.equal(canPlayStackThisTurn({ phase: 'play', hasDrawnThisTurn: true }), false)
})

test('marks the four cards of the rank after the bottom card as jokers', () => {
  const cards = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    .flatMap((rank) => ['♠', '♥', '♣', '♦'].map((suit) => ({
      id: `${rank}-${suit}`,
      rank,
      suit,
    })))
  const bottomCardIndex = cards.findIndex((card) => card.rank === '4' && card.suit === '♥')
  const deck = [...cards.slice(bottomCardIndex), ...cards.slice(0, bottomCardIndex)]
  const markedDeck = markJokers(deck)

  assert.equal(markedDeck.length, 52)
  assert.equal(markedDeck.filter((card) => card.isJoker).length, 4)
  assert.deepEqual(markedDeck.filter((card) => card.isJoker).map((card) => card.rank), ['5', '5', '5', '5'])
  assert.equal(getJokerLabel(deck[0]), '5 of any suit')
})

test('derives the joker label from the bottom card rank', () => {
  assert.equal(getJokerLabel({ rank: '8', suit: '♣' }), '9 of any suit')
  assert.equal(getJokerLabel({ rank: 'K', suit: '♠' }), 'A of any suit')
})

test('blocks opening a third stack when a player already has two active stacks', () => {
  const stacks = [
    { ownerId: 'p1', cards: [] },
    { ownerId: 'p1', cards: [] },
    { ownerId: 'p2', cards: [] },
  ]

  assert.equal(canOpenNewStackForPlayer(stacks, 'p1'), false)
  assert.equal(canOpenNewStackForPlayer(stacks, 'p2'), true)
})

test('tracks whether a player has opened at least one stack', () => {
  const stacks = [{ ownerId: 'p1', cards: [] }]

  assert.equal(hasPlayerPlayedStack(stacks, 'p1'), true)
  assert.equal(hasPlayerPlayedStack(stacks, 'p2'), false)
  assert.equal(hasPlayerPlayedStack([], 'p1'), false)
})

test('shows the joker face-up in seen mode and hides it in blind mode', () => {
  assert.equal(getJokerDisplay('seen', { rank: '8', suit: '♣' }), '9 of any suit')
  assert.equal(getJokerDisplay('blind', { rank: '8', suit: '♣' }), '??')
})

test('only a player who has played a stack sees a blind joker', () => {
  assert.equal(canSeeJoker('blind', 'p1', []), false)
  assert.equal(canSeeJoker('blind', 'p1', ['p1']), true)
  assert.equal(canSeeJoker('blind', 'p2', ['p1']), false)
  assert.equal(canSeeJoker('seen', 'p2', []), true)
})

test('only the active player can act in the current turn phase', () => {
  const state = { activeIndex: 1, phase: 'play', players: [{ id: 'p1' }, { id: 'p2' }] }
  assert.equal(canPlayerAct(state, 'p2'), true)
  assert.equal(canPlayerAct(state, 'p1'), false)
  assert.equal(canPlayerAct({ ...state, phase: 'draw' }, 'p2'), true)
})

test('allows a valid sequence to extend an existing same-suit stack', () => {
  const existing = [
    { id: '1', rank: '4', suit: '♠', color: 'black', isJoker: false },
    { id: '2', rank: '5', suit: '♠', color: 'black', isJoker: false },
    { id: '3', rank: '6', suit: '♠', color: 'black', isJoker: false },
  ]
  const candidate = [
    { id: '4', rank: '7', suit: '♠', color: 'black', isJoker: false },
  ]

  assert.equal(canExtendStack(existing, candidate), true)
  assert.equal(canExtendStack(existing, [{ id: 'x', rank: '9', suit: '♠', color: 'black', isJoker: false }]), false)
})

test('validates left and right sequence extensions and inserts cards at the chosen side', () => {
  const existing = [
    { id: '4', rank: '4', suit: '♠' },
    { id: '5', rank: '5', suit: '♠' },
    { id: '6', rank: '6', suit: '♠' },
  ]
  const lowerCards = [
    { id: '2', rank: '2', suit: '♠' },
    { id: '3', rank: '3', suit: '♠' },
  ]
  const higherCard = { id: '7', rank: '7', suit: '♠' }

  assert.equal(canExtendStackOnSide(existing, lowerCards, 'left'), true)
  assert.equal(canExtendStackOnSide(existing, lowerCards, 'right'), false)
  assert.equal(canExtendStackOnSide(existing, [higherCard], 'right'), true)
  assert.equal(canExtendStackOnSide(existing, [higherCard], 'left'), false)
  assert.deepEqual(addCardsToStack(existing, lowerCards, 'left').map((card) => card.rank), ['2', '3', '4', '5', '6'])
})

test('allows a joker to fill an internal sequence position when opening or extending a stack', () => {
  const ace = { id: 'ace', rank: 'A', suit: '♠' }
  const two = { id: 'two', rank: '2', suit: '♠' }
  const four = { id: 'four', rank: '4', suit: '♠' }
  const joker = { id: 'joker', rank: '6', suit: '♥', isJoker: true }

  assert.equal(isValidStack([ace, two, joker, four]), true)
  assert.deepEqual(
    orderStackCards([four, joker, ace, two]).map((card) => card.id),
    ['ace', 'two', 'joker', 'four'],
  )

  const existing = [ace, two, four]
  assert.equal(canInsertCardsAtIndex(existing, [joker], 2), true)
  assert.equal(canInsertCardsAtIndex(existing, [joker], 1), false)
  assert.deepEqual(insertCardsAtIndex(existing, [joker], 2).map((card) => card.id), [
    'ace',
    'two',
    'joker',
    'four',
  ])
})

test('allows a joker to be added to either physical end of a compatible stack', () => {
  const existing = [
    { id: '4', rank: '4', suit: '♠' },
    { id: '5', rank: '5', suit: '♠' },
    { id: '6', rank: '6', suit: '♠' },
  ]
  const joker = { id: 'joker', rank: '8', suit: '♥', isJoker: true }

  assert.equal(canExtendStackOnSide(existing, [joker], 'left'), true)
  assert.equal(canExtendStackOnSide(existing, [joker], 'right'), true)
})

test('detects a complete same-rank set that cannot accept more cards', () => {
  const stack = [
    { id: '1', rank: '9', suit: '♠', color: 'black', isJoker: false },
    { id: '2', rank: '9', suit: '♥', color: 'red', isJoker: false },
    { id: '3', rank: '9', suit: '♣', color: 'black', isJoker: false },
    { id: '4', rank: '9', suit: '♦', color: 'red', isJoker: false },
  ]

  assert.equal(isStackComplete(stack), true)
})

test('cycles turn order around the table correctly', () => {
  assert.equal(advanceTurnIndex(4, 3), 0)
  assert.equal(advanceTurnIndex(2, 1), 0)
})

test('assigns opponent seats relative to each viewer for two, three, and four players', () => {
  const players = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id }))
  assert.equal(getRelativeSeat(players.slice(0, 2), 'p1', 'p2'), 'top')
  assert.equal(getRelativeSeat(players.slice(0, 3), 'p1', 'p2'), 'right')
  assert.equal(getRelativeSeat(players.slice(0, 3), 'p1', 'p3'), 'left')
  assert.equal(getRelativeSeat(players, 'p1', 'p2'), 'right')
  assert.equal(getRelativeSeat(players, 'p1', 'p3'), 'top')
  assert.equal(getRelativeSeat(players, 'p1', 'p4'), 'left')
})

test('orders standings by cards remaining', () => {
  const players = [
    { id: 'a', name: 'Alice', hand: [1, 2] },
    { id: 'b', name: 'Bob', hand: [1] },
    { id: 'c', name: 'Cara', hand: [1, 2, 3] },
  ]

  assert.deepEqual(getStandings(players).map((player) => player.name), ['Bob', 'Alice', 'Cara'])
})

test('discards are only legal after drawing in the current turn', () => {
  assert.equal(canDiscardThisTurn({ phase: 'play', hasDrawnThisTurn: true }), true)
  assert.equal(canDiscardThisTurn({ phase: 'draw', hasDrawnThisTurn: false }), false)
  assert.equal(canDiscardThisTurn({ phase: 'play', hasDrawnThisTurn: false }), false)
})

test('provides the correct turn message for the current phase', () => {
  assert.equal(getTurnMessage({ phase: 'draw', hasDrawnThisTurn: false }), 'Draw a card or play a stack')
  assert.equal(getTurnMessage({ phase: 'play', hasDrawnThisTurn: true }), 'Discard a card')
  assert.equal(getTurnMessage({ phase: 'play', hasDrawnThisTurn: false }), 'Draw a card or play a stack')
})

test('finds a valid stack for an AI to open', () => {
  const hand = [
    { id: '1', rank: '4', suit: '♠' },
    { id: '2', rank: '5', suit: '♠' },
    { id: '3', rank: '6', suit: '♠' },
    { id: '4', rank: 'Q', suit: '♥' },
  ]

  const move = findAiStackMove(hand, [], 'cpu-1')
  assert.deepEqual(move.cards.map((card) => card.id), ['1', '2', '3'])
  assert.equal(move.stackIndex, -1)
})

test('does not let an AI use an unknown joker in its opening stack', () => {
  const hand = [
    { id: '1', rank: '4', suit: '♠' },
    { id: '2', rank: '5', suit: '♠' },
    { id: '3', rank: '6', suit: '♠' },
    { id: '4', rank: '7', suit: '♠', isJoker: true },
  ]

  const move = findAiStackMove(hand, [], 'cpu-1', false)

  assert.deepEqual(move.cards.map((card) => card.id), ['1', '2', '3'])
  assert.equal(move.cards.some((card) => card.isJoker), false)
})

test('handles an unknown joker when the AI has no valid opening stack', () => {
  const hand = [
    { id: '1', rank: '4', suit: '♠' },
    { id: '2', rank: '5', suit: '♥' },
    { id: '3', rank: '6', suit: '♣' },
    { id: '4', rank: '7', suit: '♦', isJoker: true },
  ]

  assert.equal(findAiStackMove(hand, [], 'cpu-1', false), null)
})

test('finds a one-card stack extension even when the AI already has two stacks', () => {
  const existing = [
    { id: 'a', rank: '4', suit: '♠' },
    { id: 'b', rank: '5', suit: '♠' },
    { id: 'c', rank: '6', suit: '♠' },
  ]
  const stacks = [
    { ownerId: 'cpu-1', cards: existing },
    { ownerId: 'cpu-1', cards: [{ id: 'd', rank: '8', suit: '♦' }, { id: 'e', rank: '8', suit: '♠' }, { id: 'f', rank: '8', suit: '♥' }] },
  ]
  const hand = [{ id: 'g', rank: '7', suit: '♠' }]

  const move = findAiStackMove(hand, stacks, 'cpu-1')
  assert.equal(move.stackIndex, 0)
  assert.equal(move.side, 'right')
  assert.deepEqual(move.cards.map((card) => card.id), ['g'])
})

test('does not let an AI extend another player stack before opening its own', () => {
  const stacks = [{
    ownerId: 'player-1',
    cards: [
      { id: 'a', rank: '4', suit: '♠' },
      { id: 'b', rank: '5', suit: '♠' },
      { id: 'c', rank: '6', suit: '♠' },
    ],
  }]
  const hand = [{ id: 'd', rank: '7', suit: '♠' }]

  assert.equal(findAiStackMove(hand, stacks, 'cpu-1'), null)
})

test('lets an AI open its own first stack when those cards could also extend another stack', () => {
  const stacks = [{
    ownerId: 'player-1',
    cards: [
      { id: 'a', rank: '5', suit: '♠' },
      { id: 'b', rank: '6', suit: '♠' },
      { id: 'c', rank: '7', suit: '♠' },
    ],
  }]
  const hand = [
    { id: 'd', rank: '2', suit: '♠' },
    { id: 'e', rank: '3', suit: '♠' },
    { id: 'f', rank: '4', suit: '♠' },
  ]

  assert.equal(findAiStackMove(hand, stacks, 'cpu-1').stackIndex, -1)
})

test('does not open a third AI stack when no extension is available', () => {
  const stacks = [
    { ownerId: 'cpu-1', cards: [] },
    { ownerId: 'cpu-1', cards: [] },
  ]
  const hand = [
    { id: '1', rank: '4', suit: '♠' },
    { id: '2', rank: '5', suit: '♠' },
    { id: '3', rank: '6', suit: '♠' },
  ]

  assert.equal(findAiStackMove(hand, stacks, 'cpu-1'), null)
})
