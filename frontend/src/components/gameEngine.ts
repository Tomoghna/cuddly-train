import { type Suit, type Rank, type Card } from './Card';

export interface Player {
  id: number;
  name: string;
  hand: Card[];
}

export function createDeck(size: number): Card[] {
  const suits: Suit[] = ['♥', '♦', '♣', '♠'];
  const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  
  const deck: Card[] = [];
  
  // Add standard cards
  for (let i = 0; i < size - 4; i++) { // -4 for jokers
    deck.push({
      rank: ranks[Math.floor(Math.random() * ranks.length)],
      suit: suits[Math.floor(Math.random() * suits.length)],
      id: `card-${i}`,
    });
  }
  
  // Add jokers (bottom cards that reveal next)
  for (let i = 0; i < 4; i++) {
    deck.push({
      rank: 'JOKER',
      suit: 'JOKER',
      id: `joker-${i}`,
    });
  }
  
  return deck;
}

export function createPlayers(numPlayers: number): Player[] {
  const players: Player[] = [];
  const names = ['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5'];
  
  for (let i = 0; i < numPlayers; i++) {
    players.push({
      id: i,
      name: names[i] || `Player ${i + 1}`,
      hand: [],
    });
  }
  
  return players;
}

export function validateStack(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  
  const sameRank = cards.every((c) => c.rank === cards[0].rank);
  const sameSuit = cards.every((c) => c.suit === cards[0].suit);
  
  if (sameRank) return true; // e.g., 2-2-2
  
  if (sameSuit) {
    const rankOrder: { [key: string]: number } = {
      'A': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7,
      '9': 8, '10': 9, 'J': 10, 'Q': 11, 'K': 12,
    };
    
    const sortedCards = [...cards].sort((a, b) => {
      return rankOrder[a.rank] - rankOrder[b.rank];
    });
    
    let minRankIndex = -1;
    let maxRankIndex = -1;
    
    sortedCards.forEach((c) => {
      if (minRankIndex === -1 || rankOrder[c.rank] < minRankIndex) {
        minRankIndex = rankOrder[c.rank];
      }
      if (maxRankIndex === -1 || rankOrder[c.rank] > maxRankIndex) {
        maxRankIndex = rankOrder[c.rank];
      }
    });
    
    const rankSpan = maxRankIndex - minRankIndex;
    return rankSpan >= 2 && rankSpan <= 3; // e.g., 2-3-4 (span=2), 2-3-4-5 (span=3)
  }
  
  return false;
}

export function canAddCardToStack(stackCards: Card[], newCard: Card): boolean {
  const combined = [...stackCards, newCard];
  return validateStack(combined);
}

export function isJoker(card: Card): boolean {
  return card.rank === 'JOKER';
}

export type { Card };