export type Suit = '♥' | '♦' | '♣' | '♠' | 'JOKER';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'JOKER';

export interface Card {
  rank: Rank;
  suit: Suit;
  id: string;
}
