import test from 'node:test'
import assert from 'node:assert/strict'

import { isValidStack } from '../src/gameRules.js'

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
