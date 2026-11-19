import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocketServer } from 'ws'
import { canExtendStack, getJokerLabel, isValidStack, ranks, suits } from '../src/gameRules.js'

const rooms = new Map()
const reconnectGraceMs = Math.max(1_000, Number(process.env.FISS_RECONNECT_MS || 30_000))
const port = Number(process.env.PORT || 3001)
const server = createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ service: 'fiss-realtime', rooms: rooms.size, status: 'ok' }))
})
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 })

function newRoom(id) {
  const room = {
    id,
    clients: new Map(),
    scores: {},
    turn: 0,
    activePlayerId: null,
    phase: 'draw',
    deck: [],
    discard: [],
    stacks: [],
    players: [],
    started: false,
    winner: null,
    hasDrawnThisTurn: false,
    maxPlayers: 4,
    jokerMode: 'seen',
    jokerLabel: null,
    disconnectTimers: new Map(),
  }
  rooms.set(id, room)
  return room
}

function getRoom(id) {
  const roomId = String(id || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24)
  return rooms.get(roomId) || newRoom(roomId || 'NOVA-4821')
}

function reject(socket, code, message) {
  socket.send(JSON.stringify({ type: 'error', code, message }))
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function rejectInvalidPayload(socket) {
  reject(socket, 'INVALID_PAYLOAD', 'The action payload is invalid')
}

function validatePlayerId(playerId) {
  return typeof playerId === 'string' && /^[a-z0-9-]{1,64}$/i.test(playerId)
}

function validateRoomId(roomId) {
  return typeof roomId === 'string'
    && roomId.trim().length > 0
    && roomId.trim().length <= 24
    && /^[A-Za-z0-9-]+$/.test(roomId.trim())
}

function buildDeck() {
  const deck = []
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({
        id: `${rank}-${suit}-${randomUUID()}`,
        rank,
        suit,
        color: suit === '♥' || suit === '♦' ? 'red' : 'black',
        isJoker: false,
      })
    }
  }
  for (let index = 0; index < 4; index += 1) {
    deck.push({
      id: `joker-${index}-${randomUUID()}`,
      rank: 'JOKER',
      suit: '★',
      color: 'joker',
      isJoker: true,
    })
  }
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[deck[index], deck[randomIndex]] = [deck[randomIndex], deck[index]]
  }
  return deck
}

function startRoom(room) {
  if (room.started) return
  room.deck = buildDeck()
  room.discard = []
  room.stacks = []
  room.scores = {}
  room.turn = 0
  room.activePlayerId = room.players[0]?.id ?? null
  room.phase = 'draw'
  room.hasDrawnThisTurn = false
  room.winner = null

  for (const player of room.players) {
    player.hand = []
  }
  for (let cardIndex = 0; cardIndex < 8; cardIndex += 1) {
    for (const player of room.players) {
      const card = room.deck.pop()
      if (card) player.hand.push(card)
    }
  }

  const starter = room.deck.pop()
  if (starter) room.discard.push(starter)
  room.jokerLabel = getJokerLabel(room.discard[0])
  room.started = true
}

function roomSnapshot(room, recipientId) {
  return {
    type: 'room_state',
    roomId: room.id,
    playerCount: room.clients.size,
    maxPlayers: room.maxPlayers,
    turn: room.turn,
    phase: room.phase,
    hasDrawnThisTurn: room.hasDrawnThisTurn,
    activePlayerId: room.activePlayerId,
    scores: room.scores,
    winner: room.winner,
    jokerMode: room.jokerMode,
    jokerLabel: room.jokerLabel,
    started: room.started,
    deckCount: room.deck.length,
    discard: room.discard,
    stacks: room.stacks,
    players: room.players.map((player) => ({
      ...player,
      connected: room.clients.has(player.id),
      handCount: player.hand?.length ?? 0,
      hand: player.id === recipientId ? player.hand ?? [] : [],
    })),
  }
}

function publishRoom(room) {
  room.clients.forEach((client, clientId) => {
    if (client.readyState === 1) client.send(JSON.stringify(roomSnapshot(room, clientId)))
  })
}

function getActivePlayer(room) {
  return room.players.find((player) => player.id === room.activePlayerId)
}

function getNextPlayerId(room) {
  const currentIndex = room.players.findIndex((player) => player.id === room.activePlayerId)
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % room.players.length : 0
  return room.players[nextIndex]?.id ?? null
}

function finishTurn(room) {
  room.activePlayerId = getNextPlayerId(room)
  room.turn = room.players.findIndex((player) => player.id === room.activePlayerId)
  room.phase = 'draw'
  room.hasDrawnThisTurn = false
}

wss.on('connection', (socket) => {
  socket.isAlive = true
  let messageCount = 0
  const rateWindow = setInterval(() => { messageCount = 0 }, 1000)
  socket.on('pong', () => { socket.isAlive = true })
  let room
  let playerId
  socket.send(JSON.stringify({ type: 'connected', serverTime: new Date().toISOString() }))
  socket.on('message', (raw) => {
    messageCount += 1
    if (messageCount > 30) { reject(socket, 'RATE_LIMITED', 'Too many messages; slow down'); return }
    if (raw.length > 64 * 1024) { reject(socket, 'INVALID_MESSAGE', 'Message payload is too large'); return }
    let message
    try { message = JSON.parse(raw.toString()) } catch { reject(socket, 'INVALID_MESSAGE', 'Invalid message format'); return }
    if (!isPlainObject(message) || typeof message.type !== 'string') {
      reject(socket, 'INVALID_MESSAGE', 'Invalid message format')
      return
    }
    if (message.type === 'join') {
      if (room) { reject(socket, 'ALREADY_JOINED', 'This connection has already joined a room'); return }
      if (!validateRoomId(message.roomId)) {
        reject(socket, 'INVALID_ROOM_ID', 'Room ID must contain 1-24 letters, numbers, or hyphens')
        return
      }
      if (message.playerId !== undefined && !validatePlayerId(message.playerId)) {
        reject(socket, 'INVALID_PLAYER_ID', 'Player ID must contain only letters, numbers, and hyphens')
        return
      }
      room = getRoom(message.roomId)
      const existingPlayer = message.playerId
        ? room.players.find((candidate) => candidate.id === message.playerId)
        : null
      if (existingPlayer && room.clients.has(existingPlayer.id)) {
        reject(socket, 'PLAYER_ALREADY_CONNECTED', 'That player is already connected')
        return
      }
      if (!existingPlayer && room.players.length >= room.maxPlayers) {
        socket.send(JSON.stringify({ type: 'error', code: 'ROOM_FULL', message: 'This table already has four players' }))
        socket.close()
        return
      }
      playerId = message.playerId || randomUUID()
      if (!validatePlayerId(playerId)) {
        reject(socket, 'INVALID_PLAYER_ID', 'Player ID must contain only letters, numbers, and hyphens')
        return
      }
      if (room.disconnectTimers.has(playerId)) {
        clearTimeout(room.disconnectTimers.get(playerId))
        room.disconnectTimers.delete(playerId)
      }
      room.clients.set(playerId, socket)
      if (!existingPlayer) {
        const index = room.players.length
        room.players.push({
          id: playerId,
          name: index === 0 ? 'You' : `Player ${index + 1}`,
          initials: index === 0 ? 'AL' : `P${index + 1}`,
          color: ['mint', 'violet', 'amber', 'rose'][index % 4],
          hand: [],
        })
      }
      if (!room.activePlayerId) room.activePlayerId = playerId
      publishRoom(room)
      return
    }
    if (!room) { reject(socket, 'JOIN_REQUIRED', 'Join a room first'); return }
    if (message.type === 'configure_room') {
      if (room.started) { reject(socket, 'GAME_ALREADY_STARTED', 'The game has already started'); return }
      if (playerId !== room.players[0]?.id) { reject(socket, 'NOT_ROOM_HOST', 'Only the host can configure the table before start'); return }
      if (!isPlainObject(message.payload)) { rejectInvalidPayload(socket); return }
      const maxPlayers = message.payload.playerCount
      const jokerMode = message.payload.jokerMode
      if (maxPlayers !== undefined && (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 4)) {
        reject(socket, 'INVALID_PLAYER_COUNT', 'Player count must be between 2 and 4')
        return
      }
      if (jokerMode !== undefined && jokerMode !== 'blind' && jokerMode !== 'seen') {
        reject(socket, 'INVALID_JOKER_MODE', 'Joker mode must be seen or blind')
        return
      }
      if (Number.isInteger(maxPlayers) && room.clients.size > maxPlayers) {
        reject(socket, 'ROOM_TOO_SMALL', 'The selected player count is below the current player count')
        return
      }
      if (Number.isInteger(maxPlayers)) room.maxPlayers = maxPlayers
      if (jokerMode !== undefined) room.jokerMode = jokerMode
      publishRoom(room)
      return
    }
    if (message.type === 'start_game') {
      if (message.payload !== undefined && !isPlainObject(message.payload)) { rejectInvalidPayload(socket); return }
      if (room.started) { publishRoom(room); return }
      if (playerId !== room.players[0]?.id) { reject(socket, 'NOT_ROOM_HOST', 'Only the host can start the game'); return }
      if (room.clients.size < 2) { reject(socket, 'NOT_ENOUGH_PLAYERS', 'A multiplayer table needs at least two players'); return }
      if (room.clients.size > room.maxPlayers) { reject(socket, 'ROOM_FULL', 'This table exceeds its configured player limit'); return }
      startRoom(room)
      publishRoom(room)
      return
    }
    if (message.type === 'draw' || message.type === 'discard' || message.type === 'play_stack') {
      if (!isPlainObject(message.payload)) { rejectInvalidPayload(socket); return }
      if (!room.started) { reject(socket, 'GAME_NOT_STARTED', 'Start the game before making moves'); return }
      if (room.winner) { reject(socket, 'ROUND_COMPLETE', 'The round is complete'); return }
      if (room.activePlayerId !== playerId) {
        reject(socket, 'NOT_YOUR_TURN', 'Wait for the active player to finish')
        return
      }
      if (room.phase === 'draw' && message.type !== 'draw') {
        reject(socket, 'DRAW_REQUIRED', 'Draw a card before playing your move')
        return
      }
      if (room.phase === 'play' && message.type === 'draw') {
        reject(socket, 'ALREADY_DREW', 'You already drew a card this turn')
        return
      }
      if (message.type === 'play_stack' && !room.hasDrawnThisTurn) {
        reject(socket, 'DRAW_REQUIRED', 'Draw a card before playing a stack')
        return
      }
      if (message.type === 'discard' && !room.hasDrawnThisTurn) {
        reject(socket, 'DRAW_REQUIRED', 'Draw a card before discarding')
        return
      }
      if (message.type === 'play_stack') {
        const cardIds = message.payload?.cardIds
        if (!Array.isArray(cardIds) || cardIds.length < 3 || new Set(cardIds).size !== cardIds.length) {
          reject(socket, 'INVALID_STACK', 'A stack needs at least 3 unique cards')
          return
        }
        if (cardIds.some((cardId) => typeof cardId !== 'string' || cardId.length > 128)) {
          reject(socket, 'INVALID_STACK', 'Card IDs are invalid')
          return
        }
        const active = getActivePlayer(room)
        if (!active) { reject(socket, 'INVALID_PLAYER', 'There is no active player'); return }
        const stackCards = cardIds.map((cardId) => active.hand.find((card) => card.id === cardId)).filter(Boolean)
        if (stackCards.length !== cardIds.length || !isValidStack(stackCards)) {
          reject(socket, 'INVALID_STACK', 'That stack does not follow the FISS rules.')
          return
        }
        const existingStack = room.stacks.find((stack) => canExtendStack(stack.cards, stackCards))
        const ownedStackCount = room.stacks.filter((stack) => stack.ownerId === playerId).length
        if (!existingStack && ownedStackCount >= 2) {
          reject(socket, 'MAX_STACKS', 'You can only open up to 2 stacks.')
          return
        }
        if (existingStack) {
          existingStack.cards.push(...stackCards)
        } else {
          room.stacks.push({ ownerId: playerId, cards: stackCards })
        }
        active.hand = active.hand.filter((card) => !cardIds.includes(card.id))
        room.scores[playerId] = (room.scores[playerId] || 0) + cardIds.length * 10
        if (active.hand.length === 0) room.winner = active.name
        if (room.winner) {
          room.phase = 'draw'
          room.hasDrawnThisTurn = false
        } else {
          finishTurn(room)
        }
        publishRoom(room)
        return
      }
      if (message.type === 'discard') {
        if (typeof message.payload.cardId !== 'string' || message.payload.cardId.length > 128) {
          reject(socket, 'INVALID_DISCARD', 'Choose one valid card to discard')
          return
        }
        const active = getActivePlayer(room)
        const discarded = active?.hand.find((card) => card.id === message.payload.cardId)
        if (!active || !discarded) {
          reject(socket, 'INVALID_DISCARD', 'That card is not in your hand')
          return
        }
        active.hand = active.hand.filter((card) => card.id !== discarded.id)
        room.discard.unshift(discarded)
        room.jokerLabel = getJokerLabel(room.discard[0])
        if (active.hand.length === 0) room.winner = active.name
        if (room.winner) {
          room.phase = 'draw'
          room.hasDrawnThisTurn = false
        } else {
          finishTurn(room)
        }
        publishRoom(room)
        return
      }
      if (message.type === 'draw') {
        if (typeof message.payload.source !== 'string' || !['deck', 'discard'].includes(message.payload.source)) {
          reject(socket, 'INVALID_DRAW', 'Draw source must be deck or discard')
          return
        }
        const source = message.payload.source
        let picked
        if (source === 'discard') {
          picked = room.discard.shift()
          if (!picked) { reject(socket, 'EMPTY_DISCARD', 'The discard pile is empty'); return }
        } else {
          picked = room.deck.pop()
          if (!picked) { reject(socket, 'EMPTY_DECK', 'The deck is empty'); return }
        }
        const active = getActivePlayer(room)
        if (!active) { reject(socket, 'INVALID_PLAYER', 'There is no active player'); return }
        active.hand.push(picked)
        room.phase = 'play'
        room.hasDrawnThisTurn = true
        publishRoom(room)
        return
      }
      reject(socket, 'UNKNOWN_ACTION', 'Unsupported game action')
    }
    reject(socket, 'UNKNOWN_ACTION', 'Unsupported game action')
  })
  socket.on('close', () => {
    clearInterval(rateWindow)
    if (!room || !playerId || room.clients.get(playerId) !== socket) return
    room.clients.delete(playerId)
    publishRoom(room)

    if (room.disconnectTimers.has(playerId)) {
      clearTimeout(room.disconnectTimers.get(playerId))
    }
    const timer = setTimeout(() => {
      room.disconnectTimers.delete(playerId)
      room.players = room.players.filter((player) => player.id !== playerId)
      room.scores = Object.fromEntries(
        Object.entries(room.scores).filter(([id]) => id !== playerId),
      )
      room.stacks = room.stacks.filter((stack) => stack.ownerId !== playerId)

      if (room.activePlayerId === playerId) {
        room.activePlayerId = room.players[0]?.id ?? null
        room.turn = room.players.length > 0 ? 0 : 0
        room.phase = 'draw'
        room.hasDrawnThisTurn = false
      }

      if (room.clients.size === 0 && room.players.length === 0) {
        rooms.delete(room.id)
      } else {
        publishRoom(room)
      }
    }, reconnectGraceMs)
    room.disconnectTimers.set(playerId, timer)
  })
})

server.listen(port, () => console.log(`FISS realtime server listening on http://localhost:${port}`))

const heartbeat = setInterval(() => {
  wss.clients.forEach((socket) => {
    if (!socket.isAlive) { socket.terminate(); return }
    socket.isAlive = false
    socket.ping()
  })
}, 30_000)

function shutdown() {
  clearInterval(heartbeat)
  wss.close(() => server.close(() => process.exit(0)))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
