import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocketServer } from 'ws'
import { isValidStack } from '../src/gameRules.js'

const rooms = new Map()
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
    players: [],
  }
  rooms.set(id, room)
  return room
}

function getRoom(id) {
  const roomId = String(id || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24)
  return rooms.get(roomId) || newRoom(roomId || 'NOVA-4821')
}

function publish(room, payload) {
  const message = JSON.stringify(payload)
  room.clients.forEach((client) => { if (client.readyState === 1) client.send(message) })
}

function reject(socket, code, message) {
  socket.send(JSON.stringify({ type: 'error', code, message }))
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
    let message
    try { message = JSON.parse(raw.toString()) } catch { reject(socket, 'INVALID_MESSAGE', 'Invalid message format'); return }
    if (message.type === 'join') {
      if (message.playerId !== undefined && (typeof message.playerId !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(message.playerId))) {
        reject(socket, 'INVALID_PLAYER_ID', 'Player ID must contain only letters, numbers, and hyphens')
        return
      }
      room = getRoom(message.roomId)
      if (!room.clients.has(message.playerId) && room.clients.size >= 4) {
        socket.send(JSON.stringify({ type: 'error', code: 'ROOM_FULL', message: 'This table already has four players' }))
        socket.close()
        return
      }
      playerId = message.playerId || randomUUID()
      room.clients.set(playerId, socket)
      room.players = [...room.clients.keys()].map((clientId, index) => ({
        id: clientId,
        name: index === 0 ? 'You' : `Player ${index + 1}`,
        initials: index === 0 ? 'AL' : `P${index + 1}`,
        color: ['mint', 'violet', 'amber', 'rose'][index % 4],
      }))
      if (!room.activePlayerId) room.activePlayerId = playerId
      publish(room, { type: 'room_state', roomId: room.id, playerCount: room.clients.size, turn: room.turn, phase: room.phase, activePlayerId: room.activePlayerId, scores: room.scores, players: room.players })
      return
    }
    if (!room) { reject(socket, 'JOIN_REQUIRED', 'Join a room first'); return }
    if (message.type === 'draw' || message.type === 'discard' || message.type === 'play_stack') {
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
      if (message.type === 'play_stack') {
        const cardIds = message.payload?.cardIds
        const stackCards = Array.isArray(message.payload?.cards) ? message.payload.cards : []
        if (!Array.isArray(cardIds) || cardIds.length < 3 || new Set(cardIds).size !== cardIds.length) {
          reject(socket, 'INVALID_STACK', 'A stack needs at least 3 unique cards')
          return
        }
        if (!isValidStack(stackCards) || stackCards.length !== cardIds.length) {
          reject(socket, 'INVALID_STACK', 'That stack does not follow the FISS rules.')
          return
        }
      }
      if (message.type === 'discard' && typeof message.payload?.cardId !== 'string') {
        reject(socket, 'INVALID_DISCARD', 'Choose one card to discard')
        return
      }
      if (!room.scores[playerId]) room.scores[playerId] = 0
      if (message.type === 'play_stack') room.scores[playerId] += Math.max(message.payload?.cardIds?.length || 0, 3) * 10
      if (message.type === 'draw') {
        room.phase = 'play'
      } else {
        const playerIds = [...room.clients.keys()]
        room.turn = (room.turn + 1) % Math.max(playerIds.length, 1)
        room.activePlayerId = playerIds[room.turn] || playerId
        room.phase = 'draw'
      }
      room.players = [...room.clients.keys()].map((clientId, index) => ({
        id: clientId,
        name: index === 0 ? 'You' : `Player ${index + 1}`,
        initials: index === 0 ? 'AL' : `P${index + 1}`,
        color: ['mint', 'violet', 'amber', 'rose'][index % 4],
      }))
      publish(room, { type: 'game_action', action: message.type, playerId, payload: message.payload || null, turn: room.turn, phase: room.phase, activePlayerId: room.activePlayerId, scores: room.scores, players: room.players, roomId: room.id, playerCount: room.clients.size })
      return
    }
    reject(socket, 'UNKNOWN_ACTION', 'Unsupported game action')
  })
  socket.on('close', () => { clearInterval(rateWindow); if (room && playerId) { room.clients.delete(playerId); room.players = [...room.clients.keys()].map((clientId, index) => ({ id: clientId, name: index === 0 ? 'You' : `Player ${index + 1}`, initials: index === 0 ? 'AL' : `P${index + 1}`, color: ['mint', 'violet', 'amber', 'rose'][index % 4] })); if (room.activePlayerId === playerId) { room.activePlayerId = [...room.clients.keys()][0] || null; room.turn = 0; room.phase = 'draw' } if (room.clients.size === 0) rooms.delete(room.id); else publish(room, { type: 'room_state', roomId: room.id, playerCount: room.clients.size, turn: room.turn, phase: room.phase, activePlayerId: room.activePlayerId, scores: room.scores, players: room.players }) } })
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
