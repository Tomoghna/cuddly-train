import React from 'react';
import CardView from './CardView';
import './GameTable.css';
import type { CardModel } from './GameUI';

interface PlayerSummary {
  name: string;
  count: number;
  active: boolean;
}

interface GameTableProps {
  players: PlayerSummary[];
  hand: CardModel[];
  deckCount: number;
  discardTop?: CardModel;
  onPlayCard: (cardId: string) => void;
  onDraw: () => void;
  onNextTurn: () => void;
}

const GameTable: React.FC<GameTableProps> = ({
  players,
  hand,
  deckCount,
  discardTop,
  onPlayCard,
  onDraw,
  onNextTurn,
}) => {
  const topPlayer = players[1] ?? { name: 'Opponent', count: 0, active: false };
  const leftPlayer = players[3] ?? { name: 'Opponent', count: 0, active: false };
  const rightPlayer = players[2] ?? { name: 'Opponent', count: 0, active: false };
  const youPlayer = players[0] ?? { name: 'You', count: hand.length, active: true };

  return (
    <div className="table-container">
      <div className="table-grid">
        <div className="player-slot top-slot">
          <div className={`player-chip ${topPlayer.active ? 'active' : ''}`}>
            <span>{topPlayer.name}</span>
            <small>{topPlayer.count} cards</small>
          </div>
        </div>

        <div className="player-slot left-slot">
          <div className={`player-chip ${leftPlayer.active ? 'active' : ''}`}>
            <span>{leftPlayer.name}</span>
            <small>{leftPlayer.count} cards</small>
          </div>
        </div>

        <div className="center-slot">
          <div className="table-surface">
            <div className="table-logo">FISS</div>
            <div className="deck-zone">
              <div className="deck-stack" aria-label="Deck">
                <span>{deckCount}</span>
              </div>
              <div className="discard-stack">
                {discardTop ? <CardView faceUp suit={discardTop.suit} rank={discardTop.rank} /> : <div className="empty-pile">Discard</div>}
              </div>
            </div>
            <div className="table-actions">
              <button type="button" onClick={onDraw} disabled={deckCount === 0}>
                Draw
              </button>
              <button type="button" onClick={onNextTurn}>
                Next Turn
              </button>
            </div>
          </div>
        </div>

        <div className="player-slot right-slot">
          <div className={`player-chip ${rightPlayer.active ? 'active' : ''}`}>
            <span>{rightPlayer.name}</span>
            <small>{rightPlayer.count} cards</small>
          </div>
        </div>

        <div className="player-slot bottom-slot">
          <div className={`player-chip player-you ${youPlayer.active ? 'active' : ''}`}>
            <span>{youPlayer.name}</span>
            <small>{youPlayer.count} cards</small>
          </div>
          <div className="hand-row">
            {hand.length > 0 ? (
              hand.map((card) => (
                <button key={card.id} className="hand-card-button" type="button" onClick={() => onPlayCard(card.id)}>
                  <CardView suit={card.suit} rank={card.rank} faceUp />
                </button>
              ))
            ) : (
              <div className="empty-hand">No cards in hand</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameTable;
