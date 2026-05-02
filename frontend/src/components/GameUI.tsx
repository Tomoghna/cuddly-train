import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import GameTable from './GameTable';
import './GameUI.css';

interface Card {
  id: string;
  suit: string;
  rank: string;
}

interface Player {
  id: string;
  name: string;
  hand: Card[];
  score?: number;
  status?: 'active' | 'eliminated';
  avatar?: string;
}

interface GameUIProps {
  gameMode: 'single' | 'multiplayer' | null;
  playerCount?: number;
  onBack?: () => void;
}

const BACKEND_URL = 'http://localhost:4000';

// Convert Player to GameTable's expected format
const convertPlayer = (player: Player): { id: string; name?: string; hand?: any[] } => ({
  id: player.id,
  name: player.name,
  hand: player.hand.map(card => ({
    id: card.id,
    suit: card.suit as 'hearts' | 'diamonds' | 'clubs' | 'spades',
    rank: String(card.rank)
  }))
});

const GameUI: React.FC<GameUIProps> = ({ gameMode, playerCount = 2, onBack }) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [roomState, setRoomState] = useState<any | null>(null);
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'finished'>('waiting');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [selectedPlayerCount, setSelectedPlayerCount] = useState<number>(playerCount);
  const [roomFull, setRoomFull] = useState<boolean>(false);
  const [connectedRoom, setConnectedRoom] = useState<string | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);

  useEffect(() => {
    // disconnect on unmount
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  const connectSocket = () => {
    setLoading(true);
    setError(null);
    const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.debug('[GameUI] socket connected', socket.id);
      setLoading(false);
      const token = localStorage.getItem('fiss-token');
      if (token) {
        socket.emit('auth', { token });
      }
    });

    socket.on('state', (state) => {
      console.debug('[GameUI] received state', state);
      setRoomState(state || null);
      setPlayers(state.players || []);
      setGameState(state.status || 'waiting');
      if (state.roomId) setConnectedRoom(state.roomId);
    });

    socket.on('joined', ({ roomId: id, playerId, token }) => {
      console.debug('[GameUI] joined', { roomId: id, playerId });
      if (token) localStorage.setItem('fiss-token', token);
      if (id) setConnectedRoom(id);
      if (playerId) setMyPlayerId(String(playerId));
    });

    socket.on('created', ({ roomId: id, playerId, token }) => {
      console.debug('[GameUI] created', { roomId: id, playerId });
      if (token) localStorage.setItem('fiss-token', token);
      if (id) setConnectedRoom(id);
      if (playerId) setMyPlayerId(String(playerId));
    });

    socket.on('auth', (data) => {
      console.debug('[GameUI] auth', data);
      if (data && data.ok) {
        if (data.roomId) setConnectedRoom(data.roomId);
        if (data.token) {
          localStorage.setItem('fiss-token', data.token);
        }
        if (data.playerId) setMyPlayerId(String(data.playerId));
      }
    });

    socket.on('error', (msg: string) => { console.error('[GameUI] socket error', msg); setError(msg); });
    socket.on('connect_error', (err: any) => { console.error('[GameUI] connect_error', err); setError(err?.message || 'Connection error'); });
  };

  const emit = (event: string, payload?: any) => {
    const s = socketRef.current;
    if (!s) {
      setError('Not connected to server');
      return;
    }
    console.debug('[GameUI] emit', event, payload);
    s.emit(event, payload);
  };

  const handleCreateRoom = (desiredRoomId?: string) => {
    // ensure socket connection
    if (!socketRef.current) connectSocket();
    // generate a short room id if none provided
    const genShortId = () => Math.random().toString(36).slice(2, 8).toUpperCase();
    const finalRoomId = (desiredRoomId || genShortId()).toString().trim().toUpperCase();
    setRoomId(finalRoomId);
    setConnectedRoom(finalRoomId);
    // Use the selected player count when creating a room
    const count = selectedPlayerCount;
    emit('create', { roomId: finalRoomId, playerCount: count, playerNames: playerName ? [playerName] : [], maxPlayers: count });
  };

  const handleJoinRoom = () => {
    if (!roomId) {
      setError('Enter a room id to join or create one');
      return;
    }
    if (!socketRef.current) connectSocket();
    // Before joining, request the current state for that room and check capacity
    const s = socketRef.current;
    const doCheckAndJoin = (sock: Socket) => {
      sock.once('state', (state: any) => {
        const activePlayers = (state && state.players) ? state.players.filter((p: any) => p.status !== 'eliminated').length : 0;
        const full = activePlayers >= selectedPlayerCount;
        setRoomFull(full);
        if (full) {
          setError(`Room is full (max ${selectedPlayerCount} players)`);
          return;
        }
        emit('join', { roomId: roomId.toString().trim().toUpperCase(), playerName, maxPlayers: selectedPlayerCount });
      });
      emit('getState', { roomId: roomId.toString().trim().toUpperCase() });
    };

    if (!s) return;
    if ((s as any).connected) {
      doCheckAndJoin(s);
    } else {
      s.once('connect', () => doCheckAndJoin(s));
    }
  };

  const checkRoomCapacity = (idToCheck?: string) => {
    const id = idToCheck || roomId;
    if (!id) return;
    if (!socketRef.current) {
      connectSocket();
    }
    const s = socketRef.current;
    const doCheck = (sock: Socket) => {
      sock.once('state', (state: any) => {
        const activePlayers = (state && state.players) ? state.players.filter((p: any) => p.status !== 'eliminated').length : 0;
        const full = activePlayers >= selectedPlayerCount;
        setRoomFull(full);
        if (full) setError(`Room is full (max ${selectedPlayerCount} players)`);
      });
      emit('getState', { roomId: id.toString().trim().toUpperCase() });
    };
    if (s && (s as any).connected) doCheck(s);
    else if (s) s.once('connect', () => doCheck(s));
  };

  const handleStartGame = () => emit('start', { roomId: connectedRoom });
  const handleEndGame = () => emit('end', { roomId: connectedRoom });
  const handleDeal = () => { console.debug('[GameUI] handleDeal', { roomId: connectedRoom }); emit('deal', { roomId: connectedRoom, handSize: 8 }); };
  const handlePlayCard = (cardId: string) => emit('discard', { roomId: connectedRoom, playerId: myPlayerId, cardId });
  const handleMeld = (cardIds: string[]) => emit('meld', { roomId: connectedRoom, playerId: myPlayerId, cardIds });
  const handleDraw = () => emit('draw', { roomId: connectedRoom, playerId: myPlayerId });
  const handlePickDiscard = () => emit('pickDiscard', { roomId: connectedRoom, playerId: myPlayerId });
  const handleNextTurn = () => { console.debug('[GameUI] handleNextTurn', { roomId: connectedRoom }); emit('next', { roomId: connectedRoom }); };
  const [winner, setWinner] = useState<any>(null);

  // Listen for winner event
  useEffect(() => {
    if (!socketRef.current) return;
    
    socketRef.current.on('winner', (w) => {
      setWinner(w);
    });
    
    return () => {
      if (socketRef.current) {
        socketRef.current.off('winner');
      }
    };
  }, []);

  if (gameMode === 'single') {
    return <div>Single player mode placeholder</div>;
  }

  if (gameMode === 'multiplayer') {
    return (
      <div className="game-ui">
        {loading && <div className="loading">Connecting...</div>}
        {error && <div className="error">{error}</div>}

        {!connectedRoom && (
          <div className="lobby">
            <div>
              <label>Player name: </label>
              <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <label>Room id: </label>
              <input value={roomId} onChange={(e) => { setRoomId(e.target.value.toString().trim().toUpperCase()); setRoomFull(false); }} placeholder="Optional: join existing" />
              <button style={{ marginLeft: '8px' }} onClick={() => checkRoomCapacity()}>Check</button>
              {roomFull && <span style={{ color: 'crimson', marginLeft: '8px' }}>Room is full</span>}
            </div>
            <div>
              <label>Number of players: </label>
              <select 
                value={selectedPlayerCount}
                onChange={(e) => setSelectedPlayerCount(Number(e.target.value))}
              >
                <option value={2}>2 players</option>
                <option value={3}>3 players</option>
                <option value={4}>4 players</option>
              </select>
              <span style={{ fontSize: '0.8em', color: '#888', marginLeft: '10px' }}>
                (Max {selectedPlayerCount} players, min 2 players)
              </span>
            </div>
            <div className="lobby-controls">
              <button onClick={() => handleCreateRoom(undefined)}>Create Room</button>
              <button onClick={handleJoinRoom} disabled={roomFull}>Join Room</button>
            </div>
          </div>
        )}

        {connectedRoom && (
          <>
            <div className="game-info-bar">
              <div className="game-status">
                <span className={`status-indicator ${gameState === 'playing' ? 'playing' : 'waiting'}`}></span>
                <span>Game: {gameState.toUpperCase()}</span>
              </div>
              <div className="room-info">
                <span>Room: {connectedRoom}</span>
                <span>Players: {players.length}</span>
              </div>
            </div>

            <div className="backend-controls">
              <button onClick={onBack} className="back-btn">
                ← Back
              </button>
              <button onClick={handleStartGame} disabled={loading || gameState === 'playing'}>
                Start Game
              </button>
              <button onClick={handleEndGame} disabled={loading || gameState === 'finished'}>
                End Game
              </button>
              <button onClick={handleDeal} disabled={loading}>
                Deal Hands
              </button>
              <button onClick={() => emit('getState', { roomId: connectedRoom })} disabled={loading}>
                Refresh State
              </button>
            </div>

            <GameTable 
              roomState={roomState} 
              players={players.map(convertPlayer)} 
              myPlayerId={myPlayerId} 
              onMeld={handleMeld} 
              onDiscard={handlePlayCard} 
              onDraw={handleDraw}
              onPickDiscard={handlePickDiscard}
              onNextTurn={handleNextTurn}
            />

            {/* Winner Modal */}
            {winner && (
              <div className="winner-modal">
                <div className="winner-content">
                  <div className="winner-icon">🏆</div>
                  <h2>Game Over!</h2>
                  <p className="winner-name">Winner: {winner.name}</p>
                  <div className="winner-actions">
                    <button onClick={() => setWinner(null)} className="close-btn">Close</button>
                    <button onClick={() => { emit('reset', { roomId: connectedRoom }); setWinner(null); }} className="restart-btn">
                      Play Again
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return <div>Game UI placeholder</div>;
};

export default GameUI;
