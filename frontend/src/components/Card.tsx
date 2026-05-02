import React, { useState } from 'react';
import './Card.css';

interface CardProps {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: number;
  faceUp?: boolean;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
}

const Card: React.FC<CardProps> = ({
  suit,
  rank,
  faceUp = false,
  onClick,
  selected = false,
  disabled = false
}) => {
  // Get suit symbol
  const getSuitSymbol = () => {
    switch (suit) {
      case 'hearts':
        return '♥';
      case 'diamonds':
        return '♦';
      case 'clubs':
        return '♣';
      case 'spades':
        return '♠';
      default:
        return '🂠';
    }
  };

  // Get suit color
  const getSuitColor = () => {
    return suit === 'hearts' || suit === 'diamonds' ? '#e91e63' : '#212121';
  };

  // Get rank display
  const getRankDisplay = () => {
    const rankDisplay = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    return rankDisplay[rank - 1] || '?';
  };

  return (
    <div
      className={`card ${faceUp ? 'face-up' : 'face-down'} ${selected ? 'selected' : ''}`}
      onClick={disabled ? undefined : onClick}
      style={{
        filter: disabled ? 'brightness(0.5)' : 'none'
      }}
    >
      {faceUp ? (
        <div className="card-face">
          <div className="card-corner">
            <span className="corner-rank">{getRankDisplay()}</span>
            <span className="corner-suit" style={{ color: getSuitColor() }}>{getSuitSymbol()}</span>
          </div>
          <div className="card-top">
            <span className="rank">{getRankDisplay()}</span>
            <span className="suit" style={{ color: getSuitColor() }}>
              {getSuitSymbol()}
            </span>
          </div>
          
          <div className="card-center">
            <span className="suit-large" style={{ color: getSuitColor() }}>
              {getSuitSymbol()}
            </span>
          </div>
          
          <div className="card-bottom">
            <span className="rank" style={{ transform: 'rotate(180deg)' }}>
              {getRankDisplay()}
            </span>
            <span className="suit" style={{ color: getSuitColor(), transform: 'rotate(180deg)' }}>
              {getSuitSymbol()}
            </span>
          </div>
        </div>
      ) : (
        <div className="card-back">
          <div className="card-back-pattern">
            <div className="card-back-circle"></div>
            <div className="card-back-circle card-back-circle-2"></div>
            <div className="card-back-circle card-back-circle-3"></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Card;