export const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
export const suits = ['♠', '♥', '♣', '♦']
export const rankValues = Object.fromEntries(ranks.map((rank, index) => [rank, index + 1]))

export function rankAfter(rank) {
  const cycle = ranks
  const current = cycle.indexOf(rank)
  return cycle[(current + 1) % cycle.length]
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
