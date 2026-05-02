import React, { useEffect, useRef, useState } from 'react';
import './GameTable.css';
import Card from './Card.tsx';

type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

type CardModel = { id: string; suit: Suit; rank: number };

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

const createDeck = (): CardModel[] => {
  const deck: CardModel[] = [];
  for (const suit of SUITS) {
    for (let r = 1; r <= 13; r++) {
      deck.push({ id: `${suit}-${r}`, suit, rank: r });
    }
  }
  // simple shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

const PLAYER_NAMES = ['North', 'East', 'You', 'West'];

interface GameTableProps {
  roomState?: any;
  players?: { id: string; name?: string; hand?: CardModel[] }[];
  myPlayerId?: string | null;
  onMeld?: (cardIds: string[]) => void;
  onDiscard?: (cardId: string) => void;
  onDraw?: () => void;
  onPickDiscard?: () => void;
  onNextTurn?: () => void;
}

const GameTable: React.FC<GameTableProps> = (props) => {
  const [deck, setDeck] = useState<CardModel[]>(() => createDeck());
  const [players, setPlayers] = useState<CardModel[][]>(() => [[], [], [], []]);
  const [discardPile, setDiscardPile] = useState<CardModel[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<number>(2); // bottom is "You"

  // Pointer / swipe tracking
  const pointerRef = useRef<{ x: number; y: number; card?: CardModel } | null>(null);

  // Draw one card from deck to current player
  const drawOne = () => {
    // if parent handles draw, call it
    if (props.onDraw) {
      props.onDraw();
      return;
    }
    setDeck(prev => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const card = next.shift() as CardModel;
      setPlayers(ps => {
        const copy = ps.map(h => [...h]);
        copy[currentPlayer].push(card);
        return copy;
      });
      return next;
    });
  };

  // Discard card (send to center pile)
  const discardCard = (playerIndex: number, cardId: string) => {
    // if parent handles discard, call it
    if (props.onDiscard) {
      props.onDiscard(cardId);
      return;
    }
    setPlayers(ps => {
      const copy = ps.map(h => [...h]);
      const idx = copy[playerIndex].findIndex(c => c.id === cardId);
      if (idx >= 0) {
        const [c] = copy[playerIndex].splice(idx, 1);
        setDiscardPile(d => [c, ...d]);
      }
      return copy;
    });
  };

  // Simple sort: ascending rank
  const sortHand = (playerIndex: number, ascending = true) => {
    setPlayers(ps => {
      const copy = ps.map(h => [...h]);
      copy[playerIndex].sort((a, b) => (ascending ? a.rank - b.rank : b.rank - a.rank));
      return copy;
    });
  };

  // Fan style transform for hand cards
  const getCardStyleForSide = (idx: number, total: number, side: number) => {
    if (total === 0) return {};
    const center = (total - 1) / 2;
    const offset = idx - center;
    const spacing = 36; // px - larger spread
    const rotateSpacing = 8; // degrees per card

    let translateX = offset * spacing;
    let translateY = Math.abs(offset) * -4; // more vertical separation
    let rotate = offset * rotateSpacing;

    // adjust for side
    if (side === 0) {
      // top - upside down
      rotate += 180;
      translateY *= 1.2;
    } else if (side === 1) {
      // right - vertical fan
      rotate += 90;
      translateX = 0;
      translateY = offset * spacing * 0.6;
    } else if (side === 3) {
      // left
      rotate -= 90;
      translateX = 0;
      translateY = offset * spacing * 0.6;
    }

    const transform = `translateX(-50%) translate(${translateX}px, ${translateY}px) rotate(${rotate}deg)`;
    const zIndex = 1000 - Math.abs(offset);
    return { transform, zIndex } as React.CSSProperties;
  };

  // Pointer handlers for swipe gestures on individual cards
  const onPointerDownCard = (e: React.PointerEvent, card: CardModel) => {
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch (err) {
      // ignore if pointer capture isn't supported
    }
    pointerRef.current = { x: e.clientX, y: e.clientY, card };
  };

  const onPointerUpCard = (e: React.PointerEvent, playerIndex: number) => {
    const start = pointerRef.current;
    if (!start || !start.card) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const threshold = 40;
    // swipe up -> discard
    if (dy < -threshold) {
      discardCard(playerIndex, start.card.id);
    }
    // small horizontal swipes on single card sort that player's hand
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
      sortHand(playerIndex, dx > 0);
    }
    pointerRef.current = null;
  };

  const onPointerCancel = () => {
    pointerRef.current = null;
  };

  // Swipe on hand area to sort all cards in that hand
  const handTouchStart = (e: React.PointerEvent) => {
    pointerRef.current = { x: e.clientX, y: e.clientY };
  };

  const handTouchEnd = (e: React.PointerEvent) => {
    const start = pointerRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const threshold = 60;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold) {
      sortHand(currentPlayer, dx > 0);
    }
    pointerRef.current = null;
  };

  // Helper to render a player's hand
  const renderHand = (hand: CardModel[], sideIndex: number) => {
    return (
      <div
        className="hand-area"
        onPointerDown={(e) => handTouchStart(e)}
        onPointerUp={(e) => handTouchEnd(e)}
      >
        <div className="hand-cards" style={{ position: 'relative', height: 'calc(var(--card-height) * 1.15)' }}>
          {hand.map((c, i) => (
            <div
              key={c.id}
              style={{ position: 'absolute', left: '50%', transformOrigin: 'bottom center' }}
            >
                <div
                onPointerDown={(e) => onPointerDownCard(e, c)}
                onPointerUp={(e) => onPointerUpCard(e, sideIndex)}
                onPointerCancel={onPointerCancel}
                onPointerLeave={onPointerCancel}
                onClick={() => {
                  // if parent provided an onDiscard handler, use that for multiplayer
                  if (sideIndex === currentPlayer) {
                    if (props.onDiscard) props.onDiscard(c.id);
                    else discardCard(sideIndex, c.id);
                  }
                }}
                style={getCardStyleForSide(i, hand.length, sideIndex)}
              >
                <Card suit={c.suit} rank={c.rank} faceUp={sideIndex === 2 || sideIndex === 0} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // clicking player panel selects active player
  const onSelectPlayer = (i: number) => setCurrentPlayer(i);

  // Deal initial four cards each for demo if empty
  useEffect(() => {
    setPlayers(ps => {
      if (props.players && props.players.length > 0) {
        // use provided players' hands when available and normalize ranks
        const mapped: CardModel[][] = [[], [], [], []];
        const rankMap: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };

        const toCardModel = (h: any) => {
          const rRaw = String((h as any).rank || '0');
          const rNum = Number(rRaw);
          const rank = Number.isFinite(rNum) && rNum > 0 ? rNum : (rankMap[rRaw.toUpperCase()] || 0);
          return { id: (h as any).id, suit: (h as any).suit as Suit, rank } as CardModel;
        };

        // Special case: exactly 2 active players -> place them opposite (bottom + top)
        const activePlayers = (props.players || []).filter((p: any) => p.status !== 'eliminated');
        if (activePlayers.length === 2) {
          const pA = activePlayers[0];
          const pB = activePlayers[1];
          // If myPlayerId is provided, prefer to put that player at bottom (index 2)
          if (props.myPlayerId) {
            if (String(pA.id) === String(props.myPlayerId)) {
              mapped[2] = (pA.hand || []).map(toCardModel);
              mapped[0] = (pB.hand || []).map(toCardModel);
            } else if (String(pB.id) === String(props.myPlayerId)) {
              mapped[2] = (pB.hand || []).map(toCardModel);
              mapped[0] = (pA.hand || []).map(toCardModel);
            } else {
              mapped[2] = (pA.hand || []).map(toCardModel);
              mapped[0] = (pB.hand || []).map(toCardModel);
            }
          } else {
            // no myPlayerId: place first active at bottom, second at top
            mapped[2] = (pA.hand || []).map(toCardModel);
            mapped[0] = (pB.hand || []).map(toCardModel);
          }
          return mapped;
        }

        // General mapping: place sequentially starting at top (0), right (1), bottom (2), left (3)
        for (let i = 0; i < Math.min(4, props.players.length); i++) {
          const hand = props.players[i].hand || [];
          mapped[i] = hand.map(toCardModel);
        }

        return mapped;
      }

      // Demo deal when no players/hands exist: deal 8 cards each
      if (ps.every(h => h.length === 0)) {
        const copy = [[], [], [], []] as CardModel[][];
        const d = createDeck();
        const handSize = 8;
        for (let i = 0; i < handSize; i++) {
          for (let p = 0; p < 4; p++) {
            const card = d.pop();
            if (card) copy[p].push(card);
          }
        }
        setDeck(d);
        return copy;
      }

      return ps;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="game-table">
      <div className="game-table-header">
        <h2>Card Table</h2>
      </div>

      <div className="table-layout">
        <div className="player-side top-side" onClick={() => onSelectPlayer(0)}>
          <div className={`opponent-card ${currentPlayer === 0 ? 'active' : ''}`}>
            <div className="opponent-name">{PLAYER_NAMES[0]}</div>
            <div className="opponent-count">{players[0].length} cards</div>
          </div>
          {renderHand(players[0], 0)}
        </div>

        <div className="player-side right-side" onClick={() => onSelectPlayer(1)}>
          <div className={`opponent-card ${currentPlayer === 1 ? 'active' : ''}`}>
            <div className="opponent-name">{PLAYER_NAMES[1]}</div>
            <div className="opponent-count">{players[1].length} cards</div>
          </div>
          {renderHand(players[1], 1)}
        </div>

        <div className="center-area">
          <div className="table-cloth">
            <div style={{ position: 'absolute', top: 12, right: 12 }}>
              <div className="deck">
                <div className="deck-count">{deck.length}</div>
                <button
                  className="deck-card"
                  onClick={drawOne}
                  aria-label="Deck"
                  disabled={deck.length === 0}
                  style={{ border: 'none', background: 'transparent', padding: 0 }}
                />
                <button
                  className="draw-button"
                  onClick={drawOne}
                  disabled={deck.length === 0}
                >
                  Draw
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="pile">
                <div className="pile-label">Discard</div>
                {discardPile.length === 0 ? (
                  <div className="empty-pile">Empty</div>
                ) : (
                  <div className="pile-card card clickable" onClick={props.onPickDiscard}>
                    <div className="card-rank">{discardPile[0].rank}</div>
                    <div className="card-suit">{discardPile[0].suit}</div>
                  </div>
                )}
              </div>
              <div className="table-controls">
                <button 
                  className="next-turn-btn" 
                  onClick={props.onNextTurn}
                  disabled={!props.onNextTurn}
                >
                  Next Turn →
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="player-side left-side" onClick={() => onSelectPlayer(3)}>
          <div className={`opponent-card ${currentPlayer === 3 ? 'active' : ''}`}>
            <div className="opponent-name">{PLAYER_NAMES[3]}</div>
            <div className="opponent-count">{players[3].length} cards</div>
          </div>
          {renderHand(players[3], 3)}
        </div>

        <div className="player-side bottom-side" onClick={() => onSelectPlayer(2)}>
          <div className={`player-card ${currentPlayer === 2 ? 'active' : ''}`}>
            <div>
              <div className="player-name">{PLAYER_NAMES[2]}</div>
              <div className="player-count">{players[2].length} cards</div>
            </div>
          </div>
          {renderHand(players[2], 2)}
        </div>
      </div>
    </div>
  );
};

export default GameTable;
