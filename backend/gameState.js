import { randomUUID } from 'crypto';
import Redis from 'ioredis';

const rankOrder = {
  A: 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
};

function createEmptyState(roomId) {
  return {
    roomId: roomId || `room-${randomUUID()}`,
    status: 'waiting',
    players: [],
    activePlayerIndex: 0,
    turnCount: 0,
    deck: [],
    discardPile: [],
    melds: [],
    winner: null,
    // per-turn flags
    turnState: {
      drawn: false,
      meldsPlayed: 0,
    },
  };
}

const games = {}; // roomId -> state

let redisClient = null;
const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_URI || null;

async function initRedis() {
  if (!REDIS_URL) return;
  try {
    redisClient = new Redis(REDIS_URL);
    redisClient.on('error', (err) => console.error('Redis error', err));
    // load existing keys
    const keys = await redisClient.keys('fiss:room:*');
    for (const k of keys) {
      try {
        const raw = await redisClient.get(k);
        if (raw) {
          const roomId = k.split(':').slice(2).join(':');
          games[roomId] = JSON.parse(raw);
        }
      } catch (e) {
        console.error('Failed to load room', k, e.message);
      }
    }
    console.log('ioredis connected, loaded', Object.keys(games).length, 'rooms');
  } catch (e) {
    console.error('Failed to initialize ioredis:', e.message);
    redisClient = null;
  }
}

initRedis();

function ensureRoom(roomId) {
  if (!roomId) roomId = 'local-game';
  if (!games[roomId]) games[roomId] = createEmptyState(roomId);
  return games[roomId];
}

// player token mapping (token -> { roomId, playerId })
const playerTokens = {};

async function persistPlayerToken(token, roomId, playerId) {
  playerTokens[token] = { roomId, playerId };
  if (!redisClient) return;
  try {
    await redisClient.set(`fiss:player:${token}`, JSON.stringify({ roomId, playerId }));
  } catch (e) {
    console.error('ioredis set player token error', e.message);
  }
}

async function getPlayerMapping(token) {
  if (!token) return null;
  if (playerTokens[token]) return playerTokens[token];
  if (!redisClient) return null;
  try {
    const raw = await redisClient.get(`fiss:player:${token}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    playerTokens[token] = parsed;
    return parsed;
  } catch (e) {
    console.error('ioredis get player token error', e.message);
    return null;
  }
}

async function removePlayerMapping(token) {
  delete playerTokens[token];
  if (!redisClient) return;
  try {
    await redisClient.del(`fiss:player:${token}`);
  } catch (e) {
    console.error('ioredis del player token error', e.message);
  }
}

function persistState(roomId) {
  if (!redisClient) return;
  try {
    const state = games[roomId];
    if (!state) return;
    redisClient.set(`fiss:room:${roomId}`, JSON.stringify(state)).catch((e) => console.error('ioredis set error', e.message));
  } catch (e) {
    console.error('persistState error', e.message);
  }
}

export function getState(roomId = 'local-game') {
  const state = ensureRoom(roomId);
  return JSON.parse(JSON.stringify(state));
}

export function resetGame(roomId = 'local-game') {
  games[roomId] = createEmptyState(roomId);
  persistState(roomId);
}

export function createGame(roomId = 'local-game', { playerCount = 4, playerNames = [] } = {}) {
  const state = createEmptyState(roomId);
  // Only create real players for provided names. Do not prefill with bot/placeholder players.
  if (Array.isArray(playerNames) && playerNames.length > 0) {
    for (let i = 0; i < playerNames.length; i += 1) {
      state.players.push({
        id: `${i + 1}`,
        name: playerNames[i] || `Player ${i + 1}`,
        score: 0,
        status: 'active',
        avatar: '👤',
        hand: [],
        uuid: randomUUID(),
      });
    }
  }
  games[state.roomId] = state;
  persistState(state.roomId);
  return getState(state.roomId);
}

export function addPlayer(roomId = 'local-game', playerName = 'Player', maxPlayers = 4) {
  const state = ensureRoom(roomId);
  // Check if max players reached
  const activePlayers = state.players.filter(p => p.status !== 'eliminated');
  if (activePlayers.length >= maxPlayers) {
    throw new Error('Room is full');
  }
  const id = `${state.players.length + 1}`;
  const player = {
    id,
    name: playerName,
    score: 0,
    status: 'active',
    avatar: '👤',
    hand: [],
    uuid: randomUUID(),
  };
  state.players.push(player);
  persistState(roomId);
  return getState(roomId);
}

export function startGame(roomId = 'local-game') {
  const state = ensureRoom(roomId);
  const activePlayers = state.players.filter((p) => p.status === 'active');
  console.log(`[gameState] startGame: room=${roomId} activePlayers=${activePlayers.length}`);
  if (activePlayers.length < 2) throw new Error('Need at least 2 players to start the game');
  state.status = 'playing';
  state.turnCount = 0;
  state.activePlayerIndex = 0;
  // reset per-game structures
  state.discardPile = [];
  state.melds = [];
  state.winner = null;
  state.turnState = { drawn: false, meldsPlayed: 0 };
  for (const p of state.players) {
    p.hand = p.hand || [];
    p.meldsCount = p.meldsCount || 0;
  }
  // ensure deck/hands are dealt when starting if none exist
  if (!state.deck || state.deck.length === 0 || state.players.every(p => !p.hand || p.hand.length === 0)) {
    console.log(`[gameState] startGame: dealing due to empty deck/hands`);
    dealHands(roomId);
  }
  console.log(`[gameState] startGame: room=${roomId} activeIndex=${state.activePlayerIndex} players=${state.players.map(p=>p.id).join(',')}`);
  persistState(roomId);
  return getState(roomId);
}

export function finishGame(roomId = 'local-game') {
  const state = ensureRoom(roomId);
  state.status = 'finished';
  persistState(roomId);
  return getState(roomId);
}

export function advanceTurn(roomId = 'local-game') {
  const state = ensureRoom(roomId);
  if (state.status !== 'playing') throw new Error('Game is not playing');
  state.turnCount += 1;
  const start = state.activePlayerIndex;
  let next = (start + 1) % state.players.length;
  for (let i = 0; i < state.players.length; i += 1) {
    if (state.players[next].status === 'active') break;
    next = (next + 1) % state.players.length;
  }
  state.activePlayerIndex = next;
  // reset per-turn flags for the new active player
  state.turnState = { drawn: false, meldsPlayed: 0 };
  console.log(`[gameState] advanceTurn: room=${roomId} -> activeIndex=${state.activePlayerIndex} (player=${state.players[state.activePlayerIndex]?.id}) turnCount=${state.turnCount}`);
  const activePlayers = state.players.filter((p) => p.status === 'active');
  if (activePlayers.length <= 1) state.status = 'finished';
  persistState(roomId);
  return getState(roomId);
}

export function scorePlayer(roomId = 'local-game', playerId, amount = 1) {
  const state = ensureRoom(roomId);
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error('Player not found');
  player.score += amount;
  persistState(roomId);
  return getState(roomId);
}

export function eliminatePlayer(roomId = 'local-game', playerId) {
  const state = ensureRoom(roomId);
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error('Player not found');
  player.status = 'eliminated';
  const activePlayers = state.players.filter((p) => p.status === 'active');
  if (activePlayers.length <= 1) state.status = 'finished';
  persistState(roomId);
  return getState(roomId);
}

export function getWinner(roomId = 'local-game') {
  const state = ensureRoom(roomId);
  if (state.winner) return state.winner;
  const activePlayers = state.players.filter((p) => p.status === 'active');
  return activePlayers.length === 1 ? activePlayers[0] : null;
}

// Simple deck and dealing logic
function createDeck(size = 52) {
  const suits = ['♥', '♦', '♣', '♠'];
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const deck = [];
  // Determine how many 52-card decks we need to satisfy `size` (allow multiple decks)
  const baseDeckSize = suits.length * ranks.length; // 52
  const decksNeeded = Math.max(1, Math.ceil(size / baseDeckSize));
  for (let d = 0; d < decksNeeded; d += 1) {
    for (let s = 0; s < suits.length; s += 1) {
      for (let r = 0; r < ranks.length; r += 1) {
        // include deck index in id to avoid collisions when combining multiple decks
        deck.push({ id: `${d}-${s}-${r}-${Math.random().toString(36).slice(2,7)}`, suit: suits[s], rank: ranks[r] });
      }
    }
  }
  // If we generated more cards than requested, trim to `size`.
  while (deck.length > size) deck.pop();
  return deck.sort(() => Math.random() - 0.5);
}

export function dealHands(roomId = 'local-game', handSize = 8) {
  const state = ensureRoom(roomId);
  // ensure deck has enough cards so every player can receive `handSize` cards
  const playersCount = state.players.length || 0;
  const minNeeded = Math.max(52, playersCount * handSize + 10);
  state.deck = createDeck(minNeeded);
  console.log(`[gameState] dealHands: room=${roomId} players=${playersCount} handSize=${handSize} deckSize=${state.deck.length}`);
  // reset hands for all players
  for (const p of state.players) p.hand = [];
  // only deal to active players (avoid dealing to placeholders or eliminated players)
  const recipients = state.players.filter((p) => p.status === 'active');
  for (let i = 0; i < handSize; i += 1) {
    for (const p of recipients) {
      const card = state.deck.pop();
      if (card) p.hand.push(card);
    }
  }
  // set joker rule: bottom card of remaining deck determines joker rank (bottom + 1 rank)
  const bottom = state.deck.length ? state.deck[state.deck.length - 1] : null;
  state.jokerRank = null;
  if (bottom) {
    const rankKeys = Object.keys(rankOrder);
    const idx = rankKeys.indexOf(String(bottom.rank));
    if (idx >= 0) {
      const next = rankKeys[(idx + 1) % rankKeys.length];
      state.jokerRank = next;
    }
  }
  // initialize discard and melds
  state.discardPile = [];
  state.melds = [];
  state.turnState = { drawn: false, meldsPlayed: 0 };
  persistState(roomId);
  return getState(roomId);
}

export function playCard(roomId = 'local-game', playerId, cardId) {
  const state = ensureRoom(roomId);
  if (state.status !== 'playing') throw new Error('Game is not playing');
  const currentPlayer = state.players[state.activePlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) throw new Error('Not your turn');
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error('Player not found');
  const idx = player.hand.findIndex((c) => c.id === cardId);
  if (idx === -1) throw new Error('Card not in hand');
  const [card] = player.hand.splice(idx, 1);
  // validate play against top of discard pile
  const top = state.discardPile.length ? state.discardPile[state.discardPile.length - 1] : null;
  if (top) {
    if (!(card.suit === top.suit || card.rank === top.rank)) {
      // invalid play
      throw new Error('Invalid play: card must match rank or suit of top pile');
    }
  }

  state.discardPile.push(card);
  console.log(`[gameState] playCard: room=${roomId} player=${playerId} card=${card.id} activeIndex=${state.activePlayerIndex}`);

  // check for winner
  if (player.hand.length === 0) {
    state.status = 'finished';
    state.winner = { id: player.id, name: player.name };
    persistState(roomId);
    return getState(roomId);
  }

  // advance turn
  advanceTurn(roomId);
  persistState(roomId);
  return getState(roomId);
}

export function drawCard(roomId = 'local-game', playerId) {
  const state = ensureRoom(roomId);
  if (state.status !== 'playing') throw new Error('Game is not playing');
  const currentPlayer = state.players[state.activePlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) throw new Error('Not your turn');
  if (state.turnState && state.turnState.drawn) throw new Error('Already drawn this turn');
  // if deck is empty, try reshuffling discard pile (leave top card)
  if (!state.deck || state.deck.length === 0) {
    if (state.discardPile && state.discardPile.length > 1) {
      const top = state.discardPile.pop();
      // shuffle remaining discard into new deck
      state.deck = state.discardPile.sort(() => Math.random() - 0.5);
      // reset discardPile to only have the top card
      state.discardPile = [top];
    } else {
      throw new Error('Deck is empty');
    }
  }
  const card = state.deck.pop();
  if (!card) throw new Error('No card to draw');
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error('Player not found');
  player.hand.push(card);
  state.turnState.drawn = true;
  console.log(`[gameState] drawCard: room=${roomId} player=${playerId} drew=${card.id} deckRemaining=${state.deck.length} discardRemaining=${state.discardPile.length}`);
  persistState(roomId);
  return getState(roomId);
}

// helper utils for melds and jokers
function findPlayer(state, playerId) {
  return state.players.find((p) => p.id === playerId);
}

function isJoker(card, jokerRank) {
  return jokerRank && String(card.rank) === String(jokerRank);
}

function validateSet(cards, jokerRank) {
  if (!cards || cards.length < 3) return false;
  const jokers = cards.filter(c => isJoker(c, jokerRank));
  const nonJ = cards.filter(c => !isJoker(c, jokerRank));
  if (nonJ.length === 0) return false;
  const rank = nonJ[0].rank;
  for (const c of nonJ) if (c.rank !== rank) return false;
  const suits = new Set(nonJ.map(c => c.suit));
  if (suits.size !== nonJ.length) return false;
  return true;
}

function validateSequence(cards, jokerRank) {
  if (!cards || cards.length < 3) return false;
  const jokers = cards.filter(c => isJoker(c, jokerRank));
  const nonJ = cards.filter(c => !isJoker(c, jokerRank));
  if (nonJ.length === 0) return false;
  const suit = nonJ[0].suit;
  for (const c of nonJ) if (c.suit !== suit) return false;
  const nums = nonJ.map(c => rankOrder[c.rank]).sort((a,b)=>a-b);
  for (let i=1;i<nums.length;i++) if (nums[i] === nums[i-1]) return false;
  let gaps = 0;
  for (let i=1;i<nums.length;i++) gaps += (nums[i] - nums[i-1] - 1);
  return gaps <= jokers.length;
}

export function playMeld(roomId = 'local-game', playerId, cardIds = []) {
  const state = ensureRoom(roomId);
  if (state.status !== 'playing') throw new Error('Game is not playing');
  const currentPlayer = state.players[state.activePlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) throw new Error('Not your turn');
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found');
  const cards = [];
  for (const id of cardIds) {
    const idx = player.hand.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('Card not in hand');
    cards.push(player.hand[idx]);
  }
  const jokerRank = state.jokerRank || null;
  const okSet = validateSet(cards, jokerRank);
  const okSeq = validateSequence(cards, jokerRank);
  if (!okSet && !okSeq) throw new Error('Invalid meld: must be a set or sequence of length >= 3 (jokers allowed)');
  // remove cards from hand
  for (const id of cardIds) {
    const idx = player.hand.findIndex(c => c.id === id);
    player.hand.splice(idx,1);
  }
  const meldId = `meld-${Math.random().toString(36).slice(2,9)}`;
  state.melds.push({ id: meldId, owner: playerId, cards });
  player.meldsCount = (player.meldsCount || 0) + 1;
  state.turnState.meldsPlayed = (state.turnState.meldsPlayed || 0) + 1;
  persistState(roomId);
  return getState(roomId);
}

export function attachToMeld(roomId = 'local-game', playerId, meldId, cardIds = []) {
  const state = ensureRoom(roomId);
  if (state.status !== 'playing') throw new Error('Game is not playing');
  const currentPlayer = state.players[state.activePlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) throw new Error('Not your turn');
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found');
  const meld = state.melds.find(m => m.id === meldId);
  if (!meld) throw new Error('Meld not found');
  const jokerRank = state.jokerRank || null;
  for (const id of cardIds) {
    const idx = player.hand.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('Card not in hand');
    const card = player.hand[idx];
    const isSetMeld = validateSet(meld.cards, jokerRank);
    const isSeqMeld = validateSequence(meld.cards, jokerRank);
    if (isSetMeld) {
      if (!(card.rank === meld.cards[0].rank || isJoker(card,jokerRank))) throw new Error('Cannot attach to set meld: rank mismatch');
    } else if (isSeqMeld) {
      const suit = meld.cards.find(c => !isJoker(c,jokerRank))?.suit;
      if (card.suit !== suit && !isJoker(card,jokerRank)) throw new Error('Cannot attach to sequence: suit mismatch');
    } else {
      throw new Error('Target meld is invalid');
    }
    player.hand.splice(idx,1);
    meld.cards.push(card);
  }
  persistState(roomId);
  return getState(roomId);
}

export function pickDiscard(roomId = 'local-game', playerId) {
  const state = ensureRoom(roomId);
  if (state.status !== 'playing') throw new Error('Game is not playing');
  if (state.turnState && state.turnState.drawn) throw new Error('Already drawn this turn');
  const currentPlayer = state.players[state.activePlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) throw new Error('Not your turn');
  if (!state.discardPile || state.discardPile.length === 0) throw new Error('Discard pile empty');
  const card = state.discardPile.pop();
  if (!card) throw new Error('No discard to pick');
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found');
  player.hand.push(card);
  state.turnState.drawn = true;
  persistState(roomId);
  return getState(roomId);
}

export function discardCard(roomId = 'local-game', playerId, cardId) {
  const state = ensureRoom(roomId);
  if (state.status !== 'playing') throw new Error('Game is not playing');
  const currentPlayer = state.players[state.activePlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) throw new Error('Not your turn');
  if (!state.turnState || !state.turnState.drawn) throw new Error('Must draw before discarding');
  const player = findPlayer(state, playerId);
  if (!player) throw new Error('Player not found');
  const idx = player.hand.findIndex(c => c.id === cardId);
  if (idx === -1) throw new Error('Card not in hand');
  const [card] = player.hand.splice(idx,1);
  state.discardPile.push(card);

  // check for winner
  if (player.hand.length === 0) {
    state.status = 'finished';
    state.winner = { id: player.id, name: player.name };
    persistState(roomId);
    return getState(roomId);
  }

  // enforce rule: if player has >=2 melds total, remaining cards must be attachable
  if ((player.meldsCount || 0) >= 2) {
    const unattached = player.hand.filter(h => {
      for (const m of state.melds) {
        try {
          const isSetMeld = validateSet(m.cards, state.jokerRank);
          const isSeqMeld = validateSequence(m.cards, state.jokerRank);
          if (isSetMeld) {
            if (h.rank === m.cards[0].rank || isJoker(h, state.jokerRank)) return false;
          } else if (isSeqMeld) {
            if (h.suit === (m.cards.find(c=>!isJoker(c,state.jokerRank))||{}).suit || isJoker(h,state.jokerRank)) return false;
          }
        } catch (e) {}
      }
      return true;
    });
    if (unattached.length > 0) {
      // revert discard
      player.hand.push(card);
      state.discardPile.pop();
      throw new Error('Must attach remaining cards to existing melds before discarding (you have unattachable cards)');
    }
  }

  // advance turn
  advanceTurn(roomId);
  persistState(roomId);
  return getState(roomId);
}

export async function assignTokenForPlayer(roomId = 'local-game', playerId) {
  const state = ensureRoom(roomId);
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error('Player not found');
  const token = randomUUID();
  await persistPlayerToken(token, roomId, playerId);
  // store token on player for convenience
  player.token = token;
  persistState(roomId);
  return token;
}

export { persistPlayerToken as persistToken, getPlayerMapping as getTokenMapping, removePlayerMapping as removeTokenMapping };
