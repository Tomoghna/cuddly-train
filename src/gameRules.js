export const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
export const suits = ['♠', '♥', '♣', '♦']
export const rankValues = Object.fromEntries(ranks.map((rank, index) => [rank, index + 1]))

export function reshuffleDiscardIntoDeck(deck = [], discard = [], random = Math.random) {
  if (!Array.isArray(deck) || !Array.isArray(discard) || deck.length > 0 || discard.length === 0) {
    return { deck: [...(deck ?? [])], discard: [...(discard ?? [])], reshuffled: false }
  }

  const recycled = [...discard]
  for (let index = recycled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1))
    ;[recycled[index], recycled[randomIndex]] = [recycled[randomIndex], recycled[index]]
  }

  return { deck: recycled, discard: [], reshuffled: true }
}

export function rankAfter(rank) {
  const cycle = ranks
  const current = cycle.indexOf(rank)
  return cycle[(current + 1) % cycle.length]
}

export function getJokerLabel(card) {
  if (!card || !card.rank) return 'A of any suit'
  return `${rankAfter(card.rank)} of any suit`
}

export function markJokers(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return []
  const jokerRank = rankAfter(cards[0].rank)
  return cards.map((card) => ({
    ...card,
    isJoker: card.rank === jokerRank,
  }))
}

export function canPlayStackThisTurn(state = {}) {
  if (!state || typeof state !== 'object') return false
  return state.phase === 'draw' && !state.hasDrawnThisTurn
}

export function canDiscardThisTurn(state = {}) {
  if (!state || typeof state !== 'object') return false
  return state.phase === 'play' && Boolean(state.hasDrawnThisTurn)
}

export function canPlayerAct(state = {}, playerId) {
  if (!state || typeof state !== 'object' || !playerId) return false
  if (state.players == null || !Array.isArray(state.players)) return false
  const activePlayer = state.players[state.activeIndex]
  if (!activePlayer) return false
  return activePlayer.id === playerId && ['draw', 'play'].includes(state.phase)
}

export function isStackComplete(stack = []) {
  if (!Array.isArray(stack) || stack.length === 0) return false
  const nonJokers = stack.filter((card) => !card.isJoker && card.rank !== 'JOKER')
  if (nonJokers.length === 0) return false

  const sameRank = new Set(nonJokers.map((card) => card.rank)).size === 1
  if (sameRank) {
    return nonJokers.length >= 4
  }

  return false
}

export function canExtendStack(existing = [], candidate = []) {
  if (!Array.isArray(existing) || !Array.isArray(candidate) || existing.length === 0 || candidate.length === 0) {
    return false
  }

  const merged = [...existing, ...candidate]
  if (!isValidStack(merged)) {
    return false
  }

  const base = existing.filter((card) => !card.isJoker && card.rank !== 'JOKER')
  const next = candidate.filter((card) => !card.isJoker && card.rank !== 'JOKER')

  if (base.length === 0) {
    return false
  }

  if (next.length === 0) return !isStackComplete(existing)

  const sameSuit = new Set(base.map((card) => card.suit)).size === 1 && new Set(next.map((card) => card.suit)).size === 1
  const sameRank = new Set(base.map((card) => card.rank)).size === 1 && new Set(next.map((card) => card.rank)).size === 1

  if (sameRank) {
    return base.length + next.length <= 4
  }

  return sameSuit && !isStackComplete(existing)
}

export function canExtendStackOnSide(existing = [], candidate = [], side) {
  if (!['left', 'right'].includes(side) || !canExtendStack(existing, candidate)) return false

  const base = existing.filter((card) => !card.isJoker && card.rank !== 'JOKER')
  const next = candidate.filter((card) => !card.isJoker && card.rank !== 'JOKER')
  if (next.length === 0) return true

  const baseRanks = new Set(base.map((card) => card.rank))
  const nextRanks = new Set(next.map((card) => card.rank))
  if (baseRanks.size === 1 && nextRanks.size === 1 && baseRanks.has(next[0].rank)) return true

  const baseValues = base.map((card) => rankValues[card.rank])
  const nextValues = next.map((card) => rankValues[card.rank])
  if (side === 'left') return Math.max(...nextValues) < Math.min(...baseValues)
  return Math.min(...nextValues) > Math.max(...baseValues)
}

function getCandidateOrders(candidate) {
  const nonJokers = orderStackCards(candidate.filter((card) => !card.isJoker && card.rank !== 'JOKER'))
  const jokers = candidate.filter((card) => card.isJoker || card.rank === 'JOKER')
  const orders = []

  const interleave = (rankIndex, jokerIndex, ordered) => {
    if (rankIndex === nonJokers.length && jokerIndex === jokers.length) {
      orders.push(ordered)
      return
    }
    if (jokerIndex < jokers.length) {
      interleave(rankIndex, jokerIndex + 1, [...ordered, jokers[jokerIndex]])
    }
    if (rankIndex < nonJokers.length) {
      interleave(rankIndex + 1, jokerIndex, [...ordered, nonJokers[rankIndex]])
    }
  }

  interleave(0, 0, [])
  return orders
}

function getValidStackInsertion(existing = [], candidate = [], index) {
  if (
    !Number.isInteger(index)
    || index < 0
    || index > existing.length
    || !canExtendStack(existing, candidate)
  ) {
    return null
  }

  for (const orderedCandidate of getCandidateOrders(candidate)) {
    const merged = [
      ...existing.slice(0, index),
      ...orderedCandidate,
      ...existing.slice(index),
    ]
    if (!isValidStack(merged)) continue

    const nonJokers = merged
      .map((card, cardIndex) => ({ card, cardIndex }))
      .filter(({ card }) => !card.isJoker && card.rank !== 'JOKER')
    if (new Set(nonJokers.map(({ card }) => card.rank)).size === 1) return merged
    if (new Set(nonJokers.map(({ card }) => card.suit)).size !== 1) continue

    const isInSequenceOrder = nonJokers.every(({ card, cardIndex }, indexInSequence) => {
      if (indexInSequence === 0) return true
      const previous = nonJokers[indexInSequence - 1]
      return rankValues[card.rank] - rankValues[previous.card.rank] === cardIndex - previous.cardIndex
    })
    if (isInSequenceOrder) return merged
  }

  return null
}

export function canInsertCardsAtIndex(existing = [], candidate = [], index) {
  return getValidStackInsertion(existing, candidate, index) !== null
}

export function insertCardsAtIndex(existing = [], candidate = [], index) {
  return getValidStackInsertion(existing, candidate, index)
}

export function orderStackCards(cards = []) {
  const nonJokers = cards.filter((card) => !card.isJoker && card.rank !== 'JOKER')
  const sameSuit = new Set(nonJokers.map((card) => card.suit)).size === 1
  const sameRank = new Set(nonJokers.map((card) => card.rank)).size === 1
  if (!sameSuit || sameRank) return [...cards]

  const orderedNonJokers = [...nonJokers].sort((left, right) => rankValues[left.rank] - rankValues[right.rank])
  const jokers = cards.filter((card) => card.isJoker || card.rank === 'JOKER')
  const ordered = []
  let jokerIndex = 0

  orderedNonJokers.forEach((card, index) => {
    const previous = orderedNonJokers[index - 1]
    if (previous) {
      const missingRanks = rankValues[card.rank] - rankValues[previous.rank] - 1
      for (let missing = 0; missing < missingRanks && jokerIndex < jokers.length; missing += 1) {
        ordered.push(jokers[jokerIndex])
        jokerIndex += 1
      }
    }
    ordered.push(card)
  })

  return [...ordered, ...jokers.slice(jokerIndex)]
}

export function addCardsToStack(existing = [], candidate = [], side = 'right') {
  const orderedExisting = orderStackCards(existing)
  const orderedCandidate = orderStackCards(candidate)
  return side === 'left'
    ? [...orderedCandidate, ...orderedExisting]
    : [...orderedExisting, ...orderedCandidate]
}

export function advanceTurnIndex(playerCount, currentIndex) {
  if (!Number.isInteger(playerCount) || playerCount <= 0) return 0
  const safeCount = Math.max(1, playerCount)
  const safeIndex = Number.isInteger(currentIndex) ? currentIndex : 0
  return (safeIndex + 1) % safeCount
}

export function getRelativeSeat(players = [], viewerId, playerId) {
  if (!Array.isArray(players) || players.length < 2) return null
  const viewerIndex = players.findIndex((player) => player.id === viewerId)
  const playerIndex = players.findIndex((player) => player.id === playerId)
  if (viewerIndex < 0 || playerIndex < 0) return null
  if (viewerIndex === playerIndex) return 'bottom'

  const offset = (playerIndex - viewerIndex + players.length) % players.length
  if (players.length === 2) return 'top'
  if (players.length === 3) return offset === 1 ? 'right' : 'left'
  if (offset === 1) return 'right'
  if (offset === 2) return 'top'
  return 'left'
}

export function getStandings(players = []) {
  if (!Array.isArray(players)) return []
  return [...players].sort((left, right) => left.hand.length - right.hand.length)
}

export function getTurnMessage(state = {}) {
  if (!state || typeof state !== 'object') return 'Draw a card'
  if (state.phase === 'draw') return 'Draw a card or play a stack'
  if (state.hasDrawnThisTurn) return 'Discard a card'
  return 'Draw a card or play a stack'
}

export function countStacksForPlayer(stacks, playerId) {
  if (!Array.isArray(stacks)) return 0
  return stacks.filter((stack) => stack && stack.ownerId === playerId).length
}

export function hasPlayerPlayedStack(stacks, playerId) {
  return countStacksForPlayer(stacks, playerId) > 0
}

export function canOpenNewStackForPlayer(stacks, playerId) {
  return countStacksForPlayer(stacks, playerId) < 2
}

export function getJokerDisplay(mode = 'seen', card) {
  if (mode === 'blind') return '??'
  return getJokerLabel(card)
}

export function canSeeJoker(mode, playerId, seenBy = []) {
  return mode === 'seen' || (mode === 'blind' && seenBy.includes(playerId))
}

export function isValidStack(cards) {
  if (!Array.isArray(cards) || cards.length < 3) return false
  if (new Set(cards.map((card) => card.id)).size !== cards.length) return false

  const jokerCount = cards.filter((card) => card.isJoker || card.rank === 'JOKER').length
  const nonJokers = cards.filter((card) => !card.isJoker && card.rank !== 'JOKER')

  if (nonJokers.length === 0) return true

  const hasDuplicateSuitAndRank = new Set(
    nonJokers.map((card) => `${card.rank}-${card.suit}`),
  ).size !== nonJokers.length
  if (hasDuplicateSuitAndRank) return false

  const sameRank = new Set(nonJokers.map((card) => card.rank)).size === 1
  if (sameRank) {
    if (nonJokers.length > 4) return false
    const totalCards = nonJokers.length + jokerCount
    if (totalCards > 4) return false
    return totalCards >= 3
  }

  const sameSuit = new Set(nonJokers.map((card) => card.suit)).size === 1
  if (!sameSuit) return false

  const values = [...new Set(nonJokers.map((card) => rankValues[card.rank]))].sort((a, b) => a - b)
  if (values.length < 2) {
    return values.length + jokerCount >= 3
  }

  const span = values[values.length - 1] - values[0] + 1
  const missing = span - values.length

  return values.length + jokerCount >= 3 && missing <= jokerCount
}

export function findAiStackMove(hand, stacks = [], playerId, jokerKnown = true) {
  if (!Array.isArray(hand) || !Array.isArray(stacks) || hand.length === 0) return null

  const eligibleHand = jokerKnown
    ? hand
    : hand.filter((card) => !card.isJoker && card.rank !== 'JOKER')
  const maxSize = Math.min(4, eligibleHand.length)
  const canOpenStack = countStacksForPlayer(stacks, playerId) < 2
  const canExtendExistingStack = hasPlayerPlayedStack(stacks, playerId)
  let newStackMove = null

  if (maxSize === 0) return null

  for (let size = maxSize; size >= 1; size -= 1) {
    const search = (startIndex, selected) => {
      if (selected.length === size) {
        const cards = selected.map((index) => eligibleHand[index])
        const extension = canExtendExistingStack
          ? stacks.reduce((match, stack, stackIndex) => {
            if (match) return match
            const side = ['left', 'right'].find((candidateSide) =>
              canExtendStackOnSide(stack.cards, cards, candidateSide),
            )
            return side ? { stackIndex, side } : null
          }, null)
          : null
        if (extension) return { cards, ...extension }
        if (!newStackMove && canOpenStack && cards.length >= 3 && isValidStack(cards)) {
          newStackMove = { cards, stackIndex: -1 }
        }
        return null
      }

      for (let index = startIndex; index < eligibleHand.length; index += 1) {
        const result = search(index + 1, [...selected, index])
        if (result) return result
      }
      return null
    }

    const move = search(0, [])
    if (move) return move
  }

  return newStackMove
}
