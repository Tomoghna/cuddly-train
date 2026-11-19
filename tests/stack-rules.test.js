import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canPlayStackThisTurn,
  getJokerDisplay,
  getJokerLabel,
  isValidStack,
  canOpenNewStackForPlayer,
  canPlayerAct,
  canExtendStack,
  isStackComplete,
  advanceTurnIndex,
  getStandings,
  canDiscardThisTurn,
  getTurnMessage,
  findAiStackMove,
} from '../src/gameRules.js'

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

test('allows a stack to be played before a draw on the turn', () => {
  assert.equal(canPlayStackThisTurn({ phase: 'play', hasDrawnThisTurn: false }), true)
})

test('blocks stack play after a card has already been drawn this turn', () => {
  assert.equal(canPlayStackThisTurn({ phase: 'play', hasDrawnThisTurn: true }), false)
})

test('derives the joker label from the face-up card at the bottom of the deck', () => {
  assert.equal(getJokerLabel({ rank: '8', suit: '♣' }), '9♣')
  assert.equal(getJokerLabel({ rank: 'K', suit: '♠' }), 'A♠')
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

test('shows the joker face-up in seen mode and hides it in blind mode', () => {
  assert.equal(getJokerDisplay('seen', { rank: '8', suit: '♣' }), '9♣')
  assert.equal(getJokerDisplay('blind', { rank: '8', suit: '♣' }), '??')
})

test('only the active player can act in the current turn phase', () => {
  const state = { activeIndex: 1, phase: 'play', players: [{ id: 'p1' }, { id: 'p2' }] }
  assert.equal(canPlayerAct(state, 'p2'), true)
  assert.equal(canPlayerAct(state, 'p1'), false)
  assert.equal(canPlayerAct({ ...state, phase: 'draw' }, 'p2'), false)
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
  assert.equal(getTurnMessage({ phase: 'draw', hasDrawnThisTurn: false }), 'Draw a card')
  assert.equal(getTurnMessage({ phase: 'play', hasDrawnThisTurn: true }), 'Discard or build a stack')
  assert.equal(getTurnMessage({ phase: 'play', hasDrawnThisTurn: false }), 'Draw before you can act')
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
  assert.deepEqual(move.cards.map((card) => card.id), ['g'])
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
