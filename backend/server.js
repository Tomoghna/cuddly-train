import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import {
  createGame,
  getState,
  startGame,
  finishGame,
  advanceTurn,
  scorePlayer,
  eliminatePlayer,
  resetGame,
  getWinner,
  dealHands,
  playCard,
  playMeld,
  attachToMeld,
  drawCard,
  pickDiscard,
  discardCard,
  addPlayer,
  assignTokenForPlayer,
  getTokenMapping,
  persistToken,
} from './gameState.js';

const app = express();
const port = process.env.PORT || 4000;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// HTTP endpoints (kept for compatibility)
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'Backend game server is running' });
});

app.post('/api/game', (req, res) => {
  const { playerCount, playerNames } = req.body;
  const game = createGame({ playerCount, playerNames });
  res.json(game);
});

app.get('/api/game', (req, res) => {
  res.json(getState());
});

app.post('/api/game/start', (req, res) => {
  try {
    const game = startGame();
    res.json(game);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/end', (req, res) => {
  const game = finishGame();
  res.json(game);
});

app.post('/api/game/next', (req, res) => {
  try {
    const game = advanceTurn();
    res.json(game);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/score', (req, res) => {
  try {
    const { playerId, amount } = req.body;
    const game = scorePlayer(playerId, amount ?? 1);
    res.json(game);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/eliminate', (req, res) => {
  try {
    const { playerId } = req.body;
    const game = eliminatePlayer(playerId);
    res.json(game);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/game/reset', (req, res) => {
  resetGame();
  res.json(getState());
});

app.get('/api/game/winner', (req, res) => {
  res.json({ winner: getWinner() });
});

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// Normalize room IDs from clients to avoid case/whitespace mismatches
function normalizeRoomId(r) {
  if (!r && r !== 0) return null;
  try {
    return String(r).trim().toUpperCase();
  } catch (e) {
    return null;
  }
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('join', ({ roomId, playerName, maxPlayers = 4 } = {}) => {
    try {
      console.log(`[server] join request: socket=${socket.id} room=${roomId} playerName=${playerName} maxPlayers=${maxPlayers}`);
      const normalized = normalizeRoomId(roomId);
      const id = normalized || `room-${socket.id.slice(0,6)}`;
      socket.join(id);
      const state = addPlayer(id, playerName || `Player-${socket.id.slice(0,4)}`, maxPlayers);
      console.log(`[server] join: added player -> room=${id} players=${state.players.map(p=>p.id).join(',')}`);
      // assign token for the newly added player (last index)
      const newPlayerId = `${state.players.length}`;
      assignTokenForPlayer(id, newPlayerId).then((token) => {
        io.to(id).emit('state', state);
        socket.emit('joined', { roomId: id, playerId: newPlayerId, token, maxPlayers });
      }).catch((err) => socket.emit('error', err.message));
    } catch (err) {
      const msg = err && err.message ? err.message : 'Unknown error';
      console.error('[server] join error', msg);
      if (msg === 'Room is full') {
        socket.emit('room-full', { roomId: roomId || null, maxPlayers });
      } else {
        socket.emit('error', msg);
      }
    }
  });

  socket.on('create', ({ roomId, playerCount = 4, playerNames = [], maxPlayers = 4 } = {}) => {
    try {
      const normalized = normalizeRoomId(roomId);
      const state = createGame(normalized || undefined, { playerCount, playerNames });
      const id = state.roomId;
      socket.join(id);
      // If the creator provided a player name in `playerNames`, `createGame` already
      // created that player. Avoid adding a duplicate placeholder player. Otherwise
      // add the creator as a player.
      const creatorName = (playerNames && playerNames.length > 0 && playerNames[0]) ? playerNames[0] : `Player-${socket.id.slice(0,4)}`;

      const finalizeWithPlayer = (player) => {
        const creatorId = player.id;
        assignTokenForPlayer(id, creatorId).then((token) => {
          // emit the latest state from storage (getState ensures a copy)
          const latest = getState(id);
          io.to(id).emit('state', latest);
          socket.emit('created', { roomId: id, playerId: creatorId, token, maxPlayers });
        }).catch((err) => socket.emit('error', err.message));
      };

      // Try to find an existing player with the creator name
      let creatorPlayer = null;
      if (playerNames && playerNames.length > 0) {
        creatorPlayer = state.players.find(p => String(p.name) === String(creatorName));
      }

      if (creatorPlayer) {
        // player already exists from createGame
        finalizeWithPlayer(creatorPlayer);
      } else {
        // create and add the creator player
        const newState = addPlayer(id, creatorName, maxPlayers);
        const added = newState.players[newState.players.length - 1];
        finalizeWithPlayer(added);
      }
    } catch (err) {
      const msg = err && err.message ? err.message : 'Unknown error';
      if (msg === 'Room is full') {
        socket.emit('room-full', { roomId: roomId || null, maxPlayers });
      } else {
        socket.emit('error', msg);
      }
    }
  });

  // authenticate using an existing token (reconnect)
  socket.on('auth', async ({ token } = {}) => {
    try {
      if (!token) {
        socket.emit('auth', { ok: false });
        return;
      }
      const mapping = await getTokenMapping(token);
      if (!mapping) {
        socket.emit('auth', { ok: false });
        return;
      }
      const { roomId: mappedRoomId, playerId } = mapping;
      const room = normalizeRoomId(mappedRoomId) || mappedRoomId || 'local-game';
      socket.join(room);
      socket.emit('auth', { ok: true, roomId: room, playerId, token });
      socket.emit('state', getState(room));
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('start', ({ roomId } = {}) => {
    try {
      const id = normalizeRoomId(roomId) || 'local-game';
      const state = startGame(id);
      io.to(state.roomId).emit('state', state);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('end', ({ roomId } = {}) => {
    try {
      const id = normalizeRoomId(roomId) || 'local-game';
      const state = finishGame(id);
      io.to(state.roomId).emit('state', state);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('next', ({ roomId } = {}) => {
    try {
      const id = normalizeRoomId(roomId) || 'local-game';
      console.log(`[server] next requested: socket=${socket.id} room=${id}`);
      const state = advanceTurn(id);
      console.log(`[server] next: new active=${state.activePlayerIndex}`);
      io.to(state.roomId).emit('state', state);
    } catch (err) {
      console.error('[server] next error', err.message);
      socket.emit('error', err.message);
    }
  });

  socket.on('score', ({ roomId, playerId, amount = 1 } = {}) => {
    try {
      const id = normalizeRoomId(roomId) || 'local-game';
      const state = scorePlayer(id, playerId, amount);
      io.to(state.roomId).emit('state', state);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('eliminate', ({ roomId, playerId } = {}) => {
    try {
      const id = normalizeRoomId(roomId) || 'local-game';
      const state = eliminatePlayer(id, playerId);
      io.to(state.roomId).emit('state', state);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('reset', ({ roomId } = {}) => {
    try {
      const id = normalizeRoomId(roomId) || 'local-game';
      resetGame(id);
      io.to(id).emit('state', getState(id));
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('deal', ({ roomId, handSize = 5 } = {}) => {
    try {
      const id = normalizeRoomId(roomId) || 'local-game';
      const state = dealHands(id, handSize);
      io.to(state.roomId).emit('state', state);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('meld', ({ roomId, playerId, cardIds = [] } = {}) => {
    try {
      const id = normalizeRoomId(roomId) || 'local-game';
      const state = playMeld(id, playerId, cardIds);
      io.to(state.roomId).emit('state', state);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('attach', ({ roomId, playerId, meldId, cardIds = [] } = {}) => {
    try {
      const id = normalizeRoomId(roomId) || 'local-game';
      const state = attachToMeld(id, playerId, meldId, cardIds);
      io.to(state.roomId).emit('state', state);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('pickDiscard', ({ roomId, playerId } = {}) => {
    try {
      const id = normalizeRoomId(roomId) || 'local-game';
      const state = pickDiscard(id, playerId);
      io.to(state.roomId).emit('state', state);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('discard', ({ roomId, playerId, cardId } = {}) => {
    try {
      const id = normalizeRoomId(roomId) || 'local-game';
      const state = discardCard(id, playerId, cardId);
      io.to(state.roomId).emit('state', state);
      const winner = getWinner(id);
      if (winner) io.to(state.roomId).emit('winner', winner);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('play', ({ roomId, playerId, cardId } = {}) => {
    try {
      const id = normalizeRoomId(roomId) || 'local-game';
      const state = playCard(id, playerId, cardId);
      io.to(state.roomId).emit('state', state);
      const winner = getWinner(id);
      if (winner) {
        io.to(state.roomId).emit('winner', winner);
      }
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('draw', ({ roomId, playerId } = {}) => {
    try {
      const id = normalizeRoomId(roomId) || 'local-game';
      const state = drawCard(id, playerId);
      io.to(state.roomId).emit('state', state);
      const winner = getWinner(id);
      if (winner) {
        io.to(state.roomId).emit('winner', winner);
      }
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('getState', ({ roomId } = {}) => {
    try {
      const id = normalizeRoomId(roomId) || 'local-game';
      socket.emit('state', getState(id));
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

server.listen(port, () => {
  console.log(`Game backend server listening at http://localhost:${port}`);
});
