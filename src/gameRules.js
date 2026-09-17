export const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
export const suits = ['♠', '♥', '♣', '♦']
export const rankValues = Object.fromEntries(ranks.map((rank, index) => [rank, index + 1]))

export function rankAfter(rank) {
  const cycle = ranks
  const current = cycle.indexOf(rank)
  return cycle[(current + 1) % cycle.length]
}

export function getJokerLabel(card) {
  if (!card || !card.rank) return 'A♠'
  return `${rankAfter(card.rank)}${card.suit ?? '♠'}`
}

export function canPlayStackThisTurn(state = {}) {
  if (!state || typeof state !== 'object') return false
  return state.phase === 'play' && !state.hasDrawnThisTurn
}

export function canDiscardThisTurn(state = {}) {
  if (!state || typeof state !== 'object') return false
  return state.phase === 'play' && Boolean(state.hasDrawnThisTurn)
}

export function canOpenNewStack(state = {}) {
  if (!state || typeof state !== 'object') return false
  return Number(state.stackCount ?? 0) < 2
}

export function canPlayerAct(state = {}, playerId) {
  if (!state || typeof state !== 'object' || !playerId) return false
  if (state.players == null || !Array.isArray(state.players)) return false
  const activePlayer = state.players[state.activeIndex]
  if (!activePlayer) return false
  return activePlayer.id === playerId && state.phase === 'play'
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

  if (base.length === 0 || next.length === 0) {
    return false
  }

  const sameSuit = new Set(base.map((card) => card.suit)).size === 1 && new Set(next.map((card) => card.suit)).size === 1
  const sameRank = new Set(base.map((card) => card.rank)).size === 1 && new Set(next.map((card) => card.rank)).size === 1

  if (sameRank) {
    return base.length + next.length <= 4
  }

  return sameSuit && !isStackComplete(existing)
}

export function advanceTurnIndex(playerCount, currentIndex) {
  if (!Number.isInteger(playerCount) || playerCount <= 0) return 0
  const safeCount = Math.max(1, playerCount)
  const safeIndex = Number.isInteger(currentIndex) ? currentIndex : 0
  return (safeIndex + 1) % safeCount
}

export function getStandings(players = []) {
  if (!Array.isArray(players)) return []
  return [...players].sort((left, right) => left.hand.length - right.hand.length)
}

export function getTurnMessage(state = {}) {
  if (!state || typeof state !== 'object') return 'Draw a card'
  if (state.phase === 'draw') return 'Draw a card'
  if (state.hasDrawnThisTurn) return 'Discard or build a stack'
  return 'Draw before you can act'
}

export function countStacksForPlayer(stacks, playerId) {
  if (!Array.isArray(stacks)) return 0
  return stacks.filter((stack) => stack && stack.ownerId === playerId).length
}

export function canOpenNewStackForPlayer(stacks, playerId) {
  return countStacksForPlayer(stacks, playerId) < 2
}

export function getJokerDisplay(mode = 'seen', card) {
  if (mode === 'blind') return '??'
  if (!card || !card.rank) return 'A♠'
  return `${rankAfter(card.rank)}${card.suit ?? '♠'}`
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
