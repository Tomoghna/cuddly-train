import React from 'react';
import './Card.css';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | '♥' | '♦' | '♣' | '♠';

interface CardProps {
  suit: Suit;
  rank: number | string;
  faceUp?: boolean;
}

const suitSymbols: Record<Exclude<Suit, '♥' | '♦' | '♣' | '♠'>, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const rankLabels = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const getSuitSymbol = (suit: Suit) => {
  if (suit === '♥' || suit === '♦' || suit === '♣' || suit === '♠') return suit;
  return suitSymbols[suit] || '♠';
};

const getRankLabel = (rank: number | string) => {
  if (typeof rank === 'number') {
    return rankLabels[rank - 1] || String(rank);
  }
  return String(rank);
};

const CardView: React.FC<CardProps> = ({ suit, rank, faceUp = true }) => {
  const symbol = getSuitSymbol(suit);
  const label = getRankLabel(rank);
  const color = suit === 'hearts' || suit === 'diamonds' || suit === '♥' || suit === '♦' ? '#eb5757' : '#1f2937';

  return (
    <div className={`card ${faceUp ? 'face-up' : 'face-down'}`}>
      {faceUp ? (
        <>
          <div className="card-corner top-left">
            <span>{label}</span>
            <span style={{ color }}>{symbol}</span>
          </div>
          <div className="card-center">
            <span style={{ color }}>{symbol}</span>
          </div>
          <div className="card-corner bottom-right">
            <span>{label}</span>
            <span style={{ color }}>{symbol}</span>
          </div>
        </>
      ) : (
        <div className="card-back" />
      )}
    </div>
  );
};

export default CardView;
