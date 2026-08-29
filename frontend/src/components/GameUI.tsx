import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import GameTable from './GameTable';
import './GameUI.css';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | '♥' | '♦' | '♣' | '♠';

export interface CardModel {
  id: string;
  suit: Suit;
  rank: number | string;
}

interface PlayerData {
  id: string;
  name: string;
  score?: number;
  status?: 'active' | 'eliminated';
  hand?: CardModel[];
}

interface RoomState {
  roomId: string;
  status: string;
  players: PlayerData[];
  activePlayerIndex: number;
  deck?: CardModel[];
  discardPile?: CardModel[];
  maxPlayers?: number;
  hostId?: string;
}

interface LocalGameState {
  status: 'playing' | 'finished';
  players: PlayerData[];
  deck: CardModel[];
  discardPile: CardModel[];
  activePlayerIndex: number;
  message: string;
}

interface GameUIProps {
  gameMode: 'single' | 'multiplayer';
  playerName: string;
  roomSize: number;
  onBack: () => void;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000';
const botNames = ['Dealer', 'Rival', 'Opponent', 'CPU'];
const suitOptions: Suit[] = ['♥', '♦', '♣', '♠'];

const createDeck = (): CardModel[] => {
  const deck: CardModel[] = [];
  for (let suit of suitOptions) {
    for (let rank = 1; rank <= 13; rank += 1) {
      deck.push({
        id: `${suit}-${rank}-${Math.random().toString(36).slice(2, 6)}`,
        suit,
        rank,
      });
    }
  }
  return deck;
};

const shuffle = (cards: CardModel[]) => [...cards].sort(() => Math.random() - 0.5);

const dealHands = (players: PlayerData[], deck: CardModel[], handSize = 7) => {
  const nextDeck = [...deck];
  const nextPlayers = players.map((player) => ({ ...player, hand: [] as CardModel[] }));
  for (let i = 0; i < handSize; i += 1) {
    for (const player of nextPlayers) {
      const card = nextDeck.pop();
      if (card) player.hand!.push(card);
    }
  }
  return { players: nextPlayers, deck: nextDeck };
};

const createLocalState = (playerName: string, playerCount: number): LocalGameState => {
  const players: PlayerData[] = [
    { id: '1', name: playerName, score: 0, status: 'active', hand: [] },
    ...Array.from({ length: Math.max(0, playerCount - 1) }, (_, index) => ({
      id: `${index + 2}`,
      name: botNames[index] || `Bot ${index + 2}`,
      score: 0,
      status: 'active' as 'active',
      hand: [],
    })),
  ];
  const shuffled = shuffle(createDeck());
  const { players: dealtPlayers, deck } = dealHands(players, shuffled, 7);
  const discardPile = [deck.pop()].filter(Boolean) as CardModel[];
  return {
    status: 'playing',
    players: dealtPlayers,
    deck,
    discardPile,
    activePlayerIndex: 0,
    message: 'Your turn — play a matching card or draw.',
  };
};

const findCurrentPlayer = (players: PlayerData[], activePlayerIndex: number) => players[activePlayerIndex] || null;

const playBotTurn = (state: LocalGameState): LocalGameState => {
  const active = findCurrentPlayer(state.players, state.activePlayerIndex);
  if (!active || active.id === '1') return state;
  const topCard = state.discardPile[state.discardPile.length - 1];
  let nextState = { ...state, players: state.players.map((p) => ({ ...p, hand: p.hand ? [...p.hand] : [] })), deck: [...state.deck], discardPile: [...state.discardPile] };
  let botHand = nextState.players[state.activePlayerIndex].hand!;
  let played = false;

  if (topCard) {
    const matchIndex = botHand.findIndex((card) => card.suit === topCard.suit || card.rank === topCard.rank);
    if (matchIndex !== -1) {
      const [card] = botHand.splice(matchIndex, 1);
      nextState.discardPile.push(card);
      played = true;
    }
  }

  if (!played && nextState.deck.length > 0) {
    const drawCard = nextState.deck.pop();
    if (drawCard) botHand.push(drawCard);
  } else if (!played && nextState.deck.length === 0 && botHand.length > 0) {
    const card = botHand.splice(0, 1)[0];
    nextState.discardPile.push(card);
  }

  if (botHand.length === 0) {
    return {
      ...nextState,
      status: 'finished',
      message: `${active.name} won the game!`,
    };
  }

  const nextIndex = (state.activePlayerIndex + 1) % state.players.length;
  const nextPlayer = findCurrentPlayer(state.players, nextIndex);
  return {
    ...nextState,
    activePlayerIndex: nextIndex,
    message: nextPlayer?.id === '1' ? 'Your turn!' : `${nextPlayer?.name} is thinking...`,
  };
};

const GameUI: React.FC<GameUIProps> = ({ gameMode, playerName, roomSize, onBack }) => {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomIdInput, setRoomIdInput] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [localState, setLocalState] = useState<LocalGameState | null>(null);

  const isSinglePlayer = gameMode === 'single';

  useEffect(() => {
    if (!isSinglePlayer) return;
    setLocalState(createLocalState(playerName, roomSize));
  }, [isSinglePlayer, playerName, roomSize]);

  useEffect(() => {
    if (isSinglePlayer) return;

    const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'], autoConnect: false });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setError(null);
      const storedToken = localStorage.getItem('fiss-token');
      if (storedToken) {
        socket.emit('auth', { token: storedToken });
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('state', (state: RoomState) => {
      setRoomState(state);
      if (state.roomId) setRoomId(state.roomId);
    });

    socket.on('joined', ({ roomId: id, playerId: pid, token }) => {
      setRoomId(id);
      setPlayerId(pid);
      if (token) localStorage.setItem('fiss-token', token);
      emit('getState', { roomId: id });
    });

    socket.on('created', ({ roomId: id, playerId: pid, token }) => {
      setRoomId(id);
      setPlayerId(pid);
      if (token) localStorage.setItem('fiss-token', token);
      emit('getState', { roomId: id });
    });

    socket.on('auth', (data) => {
      if (data?.ok) {
        if (data.roomId) setRoomId(data.roomId);
        if (data.playerId) setPlayerId(String(data.playerId));
        if (data.token) localStorage.setItem('fiss-token', data.token);
      }
    });

    socket.on('room-full', ({ roomId: id }) => {
      setError(`Room ${id || ''} is full.`);
    });

    socket.on('error', (message) => {
      setError(typeof message === 'string' ? message : JSON.stringify(message));
    });

    socket.connect();

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isSinglePlayer]);

  useEffect(() => {
    if (!isSinglePlayer || !localState || localState.status !== 'playing') return;
    const active = findCurrentPlayer(localState.players, localState.activePlayerIndex);
    if (!active || active.id === '1') return;

    const timer = window.setTimeout(() => {
      setLocalState((prev) => (prev ? playBotTurn(prev) : prev));
    }, 800);

    return () => window.clearTimeout(timer);
  }, [isSinglePlayer, localState]);

  const emit = (event: string, payload: Record<string, any> = {}) => {
    const socket = socketRef.current;
    if (!socket) {
      setError('Socket not ready');
      return;
    }
    if (!socket.connected) {
      socket.connect();
      socket.once('connect', () => socket.emit(event, payload));
      return;
    }
    socket.emit(event, payload);
  };

  const handleCreateRoom = () => {
    setError(null);
    const normalizedRoom = roomIdInput.trim().toUpperCase() || undefined;
    emit('create', { roomId: normalizedRoom, playerCount: roomSize, playerNames: [playerName], maxPlayers: roomSize });
  };

  const handleJoinRoom = () => {
    if (!roomIdInput.trim()) {
      setError('Enter a room ID');
      return;
    }
    setError(null);
    emit('join', { roomId: roomIdInput.trim().toUpperCase(), playerName });
  };

  const handleStartGame = () => {
    if (!roomId) return;
    emit('start', { roomId });
  };

  const handleDeal = () => {
    if (!roomId) return;
    emit('deal', { roomId, handSize: 8 });
  };

  const handlePlayCard = (cardId: string) => {
    if (isSinglePlayer) {
      if (!localState) return;
      const current = findCurrentPlayer(localState.players, localState.activePlayerIndex);
      if (!current || current.id !== '1') return;
      const hand = current.hand || [];
      const idx = hand.findIndex((card) => card.id === cardId);
      if (idx === -1) return;
      const card = hand[idx];
      const nextPlayers = localState.players.map((player, index) => {
        if (index !== localState.activePlayerIndex) return player;
        return { ...player, hand: hand.filter((_, cardIndex) => cardIndex !== idx) };
      });
      const nextDiscard = [...localState.discardPile, card];
      const nextIndex = (localState.activePlayerIndex + 1) % localState.players.length;
      const nextState = {
        ...localState,
        players: nextPlayers,
        discardPile: nextDiscard,
        activePlayerIndex: nextIndex,
        message: `Waiting for ${nextPlayers[nextIndex].name}`,
      };
      if (nextPlayers[localState.activePlayerIndex].hand?.length === 0) {
        setLocalState({ ...nextState, status: 'finished', message: `You won!` });
      } else {
        setLocalState(nextState);
      }
      return;
    }

    if (!roomId || !playerId) return;
    emit('play', { roomId, playerId, cardId });
  };

  const handleDraw = () => {
    if (isSinglePlayer) {
      if (!localState) return;
      const current = findCurrentPlayer(localState.players, localState.activePlayerIndex);
      if (!current || current.id !== '1') return;
      if (localState.deck.length === 0) return;
      const nextPlayers = localState.players.map((player, index) => {
        if (index !== localState.activePlayerIndex) return player;
        return { ...player, hand: [...(player.hand || []), localState.deck[localState.deck.length - 1]] };
      });
      setLocalState({ ...localState, players: nextPlayers, deck: localState.deck.slice(0, -1), message: 'You drew a card. Play or end turn.' });
      return;
    }

    if (!roomId || !playerId) return;
    emit('draw', { roomId, playerId });
  };

  const handleNextTurn = () => {
    if (isSinglePlayer) {
      if (!localState) return;
      const nextIndex = (localState.activePlayerIndex + 1) % localState.players.length;
      const nextPlayer = localState.players[nextIndex];
      setLocalState({ ...localState, activePlayerIndex: nextIndex, message: nextPlayer.id === '1' ? 'Your turn' : `${nextPlayer.name} is thinking...` });
      return;
    }

    if (!roomId) return;
    emit('next', { roomId });
  };

  const currentPlayer = useMemo(() => {
    if (isSinglePlayer) {
      return localState ? findCurrentPlayer(localState.players, localState.activePlayerIndex) : null;
    }
    if (!roomState || !playerId) return null;
    return roomState.players.find((player) => String(player.id) === String(playerId)) ?? null;
  }, [isSinglePlayer, localState, roomState, playerId]);

  const hand = currentPlayer?.hand ?? [];
  const deckCount = isSinglePlayer ? localState?.deck.length ?? 0 : roomState?.deck?.length ?? 0;
  const discardTop = isSinglePlayer
    ? localState?.discardPile[localState.discardPile.length - 1]
    : roomState?.discardPile?.[roomState?.discardPile?.length - 1];
  const activeName = isSinglePlayer
    ? localState ? findCurrentPlayer(localState.players, localState.activePlayerIndex)?.name ?? 'Waiting' : 'Loading'
    : roomState?.players?.[roomState.activePlayerIndex]?.name ?? 'Waiting';

  const playerSummaries = useMemo(() => {
    const source = isSinglePlayer ? localState?.players || [] : roomState?.players || [];
    return source.map((player, index) => ({
      name: player.name,
      count: player.hand?.length ?? 0,
      active: index === (isSinglePlayer ? localState?.activePlayerIndex : roomState?.activePlayerIndex),
    }));
  }, [isSinglePlayer, localState, roomState]);

  const roomPhase = roomState?.status === 'playing' || roomState?.status === 'finished' ? 'game' : 'lobby';
  const isHost = Boolean(roomState && playerId && roomState.hostId === playerId);
  const roomSizeLabel = roomState?.maxPlayers ?? roomSize;
  const roomCodeLabel = roomId || 'Room code will appear here';

  if (isSinglePlayer) {
    return (
      <div className="game-ui game-ui-single">
        <header className="game-header">
          <div>
            <button type="button" className="back-button" onClick={onBack}>
              ← Menu
            </button>
          </div>
          <div className="game-summary">
            <span>Single Player</span>
            <strong> vs. Computer</strong>
          </div>
          <div className="game-stats">
            <span>{localState?.status === 'finished' ? 'Game over' : 'Playing'}</span>
            <span>{localState?.message}</span>
          </div>
        </header>

        <section className="board-layout">
          <div className="single-info-card">
            <div className="room-info">
              <span>Players</span>
              <strong>{roomSize}</strong>
            </div>
            <div className="room-info">
              <span>Active</span>
              <strong>{activeName}</strong>
            </div>
            <button className="primary" type="button" onClick={() => setLocalState(createLocalState(playerName, roomSize))}>
              Restart Game
            </button>
          </div>

          <GameTable
            players={playerSummaries}
            hand={hand}
            deckCount={deckCount}
            discardTop={discardTop}
            onPlayCard={handlePlayCard}
            onDraw={handleDraw}
            onNextTurn={handleNextTurn}
          />
        </section>
      </div>
    );
  }

  return (
    <div className="game-ui game-ui-multiplayer">
      <header className="game-header">
        <div>
          <button type="button" className="back-button" onClick={onBack}>
            ← Menu
          </button>
        </div>
        <div className="game-summary">
          <span>Multiplayer</span>
          <strong>{roomPhase === 'lobby' ? ' Lobby' : ' Live Match'}</strong>
        </div>
        <div className="game-stats">
          <span>{connected ? 'Connected' : 'Offline'}</span>
          <span>{roomState?.maxPlayers ? `Room size: ${roomState.players.length}/${roomState.maxPlayers}` : 'Waiting'}</span>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      {roomPhase === 'lobby' ? (
        <section className="lobby-panel">
          <div className="lobby-card">
            <div className="room-status-bar">
              <div>
                <span className="label">Name</span>
                <strong>{playerName}</strong>
              </div>
              <div>
                <span className="label">Room code</span>
                <strong>{roomCodeLabel}</strong>
              </div>
              <div>
                <span className="label">Players</span>
                <strong>{roomState?.players.length ?? 0}/{roomSizeLabel}</strong>
              </div>
            </div>

            <label>
              Enter room code
              <input
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
                placeholder="ENTER ROOM ID"
              />
            </label>

            <div className="action-buttons">
              <button className="primary" type="button" onClick={handleCreateRoom}>
                Create Room
              </button>
              <button className="secondary" type="button" onClick={handleJoinRoom}>
                Join Room
              </button>
            </div>

            <div className="player-list-card">
              <h3>Players in room</h3>
              <ul className="player-list">
                {roomState?.players.length ? (
                  roomState.players.map((player, index) => (
                    <li key={player.id}>
                      <span>{player.name}</span>
                      <strong>{player.id === roomState.hostId ? 'Host' : `Seat ${index + 1}`}</strong>
                    </li>
                  ))
                ) : (
                  <li className="empty">No players joined yet</li>
                )}
              </ul>
            </div>
            {roomState && roomState.status === 'waiting' ? (
              <div className="room-hint">
                {isHost ? 'You can start the game once everyone is ready.' : 'Waiting for the host to start the game.'}
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="board-layout">
          <div className="backend-controls">
            <button onClick={handleStartGame} disabled={!roomId || roomState?.status === 'playing' || !isHost}>
              {isHost ? 'Start Match' : 'Waiting for host'}
            </button>
            <button onClick={handleDeal} disabled={!roomId || !isHost}>
              Deal Hands
            </button>
            <button onClick={() => emit('getState', { roomId })} disabled={!roomId}>
              Refresh State
            </button>
            <div className="room-info">
              <span>Room: {roomId}</span>
              <span>Players: {roomState?.players.length}/{roomSizeLabel}</span>
              <span>Turn: {activeName}</span>
            </div>
          </div>

          <GameTable
            players={playerSummaries}
            hand={hand}
            deckCount={deckCount}
            discardTop={discardTop}
            onPlayCard={handlePlayCard}
            onDraw={handleDraw}
            onNextTurn={handleNextTurn}
          />
        </section>
      )}
    </div>
  );
};

export default GameUI;
