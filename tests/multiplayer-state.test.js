import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import WebSocket from 'ws'
import { getJokerLabel } from '../src/gameRules.js'

function waitForOpen(socket) {
  return new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
}

function waitForRoomState(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage)
      reject(new Error('Timed out waiting for room state'))
    }, 2000)
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString())
      if (message.type === 'room_state' && predicate(message)) {
        clearTimeout(timeout)
        socket.off('message', onMessage)
        resolve(message)
      }
    }
    socket.on('message', onMessage)
  })
}

function sendAndWait(socket, message, predicate) {
  const statePromise = waitForRoomState(socket, predicate)
  socket.send(JSON.stringify(message))
  return statePromise
}

function waitForError(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage)
      reject(new Error('Timed out waiting for server error'))
    }, 2000)
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString())
      if (message.type === 'error') {
        clearTimeout(timeout)
        socket.off('message', onMessage)
        resolve(message)
      }
    }
    socket.on('message', onMessage)
  })
}

test('server owns hands and advances turns after an authoritative discard', async () => {
  const port = 3217
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  })

  try {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}`)
        if (response.ok) break
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    const host = new WebSocket(`ws://127.0.0.1:${port}`)
    await waitForOpen(host)
    let hostStatePromise = waitForRoomState(host)
    host.send(JSON.stringify({ type: 'join', roomId: 'TEST-ROOM', playerId: 'host', name: 'Alice Adams' }))
    const hostJoined = await hostStatePromise
    assert.equal(hostJoined.players.find((player) => player.id === 'host').name, 'Alice Adams')
    assert.equal(hostJoined.players.find((player) => player.id === 'host').initials, 'AA')

    const guest = new WebSocket(`ws://127.0.0.1:${port}`)
    await waitForOpen(guest)
    let guestStatePromise = waitForRoomState(guest)
    guest.send(JSON.stringify({ type: 'join', roomId: 'TEST-ROOM', playerId: 'guest', name: 'Bob' }))
    const guestJoined = await guestStatePromise
    assert.equal(guestJoined.players.find((player) => player.id === 'guest').name, 'Bob')
    assert.equal(guestJoined.players.find((player) => player.id === 'guest').initials, 'BO')

    const renamed = await sendAndWait(host, {
      type: 'set_player_name',
      payload: { name: 'Alice Archer' },
    }, (state) => state.players.find((player) => player.id === 'host')?.name === 'Alice Archer')
    assert.equal(renamed.players.find((player) => player.id === 'host').initials, 'AA')

    await sendAndWait(host, { type: 'configure_room', payload: { playerCount: 2, jokerMode: 'seen' } })
    const guestStartedPromise = waitForRoomState(guest, (state) => state.started)
    const started = await sendAndWait(host, { type: 'start_game' }, (state) => state.started)
    const guestStarted = await guestStartedPromise

    assert.equal(started.started, true)
    assert.equal(started.deckCount, 36)
    assert.equal(started.discard.length, 0)
    assert.equal(started.jokerLabel, getJokerLabel(started.jokerReference))
    assert.equal(started.jokerVisible, true)
    assert.equal(guestStarted.jokerLabel, started.jokerLabel)
    assert.equal(guestStarted.jokerVisible, true)
    assert.deepEqual(guestStarted.jokerReference, started.jokerReference)
    assert.equal(started.activePlayerId, 'host')
    assert.equal(started.players.find((player) => player.id === 'host').hand.length, 8)
    assert.equal(started.players.find((player) => player.id === 'guest').hand.length, 0)
    assert.equal(started.deckCount + started.players.find((player) => player.id === 'host').hand.length + 8 + started.discard.length, 52)

    const invalidStackTargetErrorPromise = waitForError(host)
    host.send(JSON.stringify({
      type: 'play_stack',
      payload: {
        cardIds: [started.players.find((player) => player.id === 'host').hand[0].id],
        stackIndex: 0,
        side: 'right',
      },
    }))
    assert.equal((await invalidStackTargetErrorPromise).code, 'INVALID_STACK')

    const stackBeforeDrawErrorPromise = waitForError(host)
    host.send(JSON.stringify({
      type: 'play_stack',
      payload: { cardIds: ['not-a-card', 'not-a-card-2', 'also-not-a-card'] },
    }))
    assert.equal((await stackBeforeDrawErrorPromise).code, 'INVALID_STACK')

    const drawn = await sendAndWait(
      host,
      { type: 'draw', payload: { source: 'deck' } },
      (state) => state.phase === 'play' && state.hasDrawnThisTurn,
    )
    assert.equal(drawn.phase, 'play')
    assert.equal(drawn.hasDrawnThisTurn, true)
    assert.equal(drawn.players.find((player) => player.id === 'host').hand.length, 9)

    const hostHand = drawn.players.find((player) => player.id === 'host').hand

    const duplicateJoinErrorPromise = waitForError(host)
    host.send(JSON.stringify({ type: 'join', roomId: 'TEST-ROOM', playerId: 'host' }))
    assert.equal((await duplicateJoinErrorPromise).code, 'ALREADY_JOINED')

    const forgedDiscardErrorPromise = waitForError(host)
    host.send(JSON.stringify({
      type: 'discard',
      payload: { cardId: 'card-that-is-not-in-the-host-hand' },
    }))
    assert.equal((await forgedDiscardErrorPromise).code, 'INVALID_DISCARD')

    const malformedDrawErrorPromise = waitForError(host)
    host.send(JSON.stringify({ type: 'draw', payload: { source: 'forged-source' } }))
    assert.equal((await malformedDrawErrorPromise).code, 'ALREADY_DREW')

    const discarded = await sendAndWait(
      host,
      {
        type: 'discard',
        payload: { cardId: hostHand[0].id },
      },
      (state) => state.activePlayerId === 'guest',
    )

    assert.equal(discarded.phase, 'draw')
    assert.equal(discarded.hasDrawnThisTurn, false)
    assert.equal(discarded.activePlayerId, 'guest')
    assert.equal(discarded.players.find((player) => player.id === 'host').hand.length, 8)

    const invalidDrawErrorPromise = waitForError(guest)
    guest.send(JSON.stringify({ type: 'draw', payload: { source: 'forged-source' } }))
    assert.equal((await invalidDrawErrorPromise).code, 'INVALID_DRAW')

    await sendAndWait(
      guest,
      { type: 'draw', payload: { source: 'deck' } },
      (state) => state.phase === 'play' && state.activePlayerId === 'guest',
    )

    const invalidStackErrorPromise = waitForError(guest)
    guest.send(JSON.stringify({
      type: 'play_stack',
      payload: { cardIds: ['not-a-card', 'not-a-card', 'also-not-a-card'] },
    }))
    assert.equal((await invalidStackErrorPromise).code, 'STACK_AFTER_DRAW')

    const beforeDisconnectHandCount = discarded.players.find((player) => player.id === 'host').hand.length
    host.close()

    const disconnected = await waitForRoomState(
      guest,
      (state) => state.players.find((player) => player.id === 'host')?.connected === false,
    )
    assert.equal(disconnected.players.find((player) => player.id === 'host').handCount, beforeDisconnectHandCount)

    const reconnected = new WebSocket(`ws://127.0.0.1:${port}`)
    await waitForOpen(reconnected)
    const reconnectedStatePromise = waitForRoomState(
      reconnected,
      (state) => state.players.find((player) => player.id === 'host')?.connected === true,
    )
    reconnected.send(JSON.stringify({ type: 'join', roomId: 'TEST-ROOM', playerId: 'host' }))
    const restored = await reconnectedStatePromise
    assert.equal(restored.players.find((player) => player.id === 'host').hand.length, beforeDisconnectHandCount)
    assert.equal(restored.players.find((player) => player.id === 'host').connected, true)

    guest.close()
    reconnected.close()
  } finally {
    server.kill('SIGTERM')
  }
})

test('blind joker is hidden from every player before a stack is played', async () => {
  const port = 3219
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  })
  const players = []

  try {
    let ready = false
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}`)
        if (response.ok) {
          ready = true
          break
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(ready, true, 'server should start before the blind-joker check')

    const host = new WebSocket(`ws://127.0.0.1:${port}`)
    players.push(host)
    await waitForOpen(host)
    const hostJoined = waitForRoomState(host)
    host.send(JSON.stringify({ type: 'join', roomId: 'BLIND-ROOM', playerId: 'blind-host' }))
    await hostJoined

    const guest = new WebSocket(`ws://127.0.0.1:${port}`)
    players.push(guest)
    await waitForOpen(guest)
    const guestJoined = waitForRoomState(guest)
    guest.send(JSON.stringify({ type: 'join', roomId: 'BLIND-ROOM', playerId: 'blind-guest' }))
    await guestJoined

    await sendAndWait(host, { type: 'configure_room', payload: { playerCount: 2, jokerMode: 'blind' } })
    const guestStartedPromise = waitForRoomState(guest, (state) => state.started)
    const started = await sendAndWait(host, { type: 'start_game' }, (state) => state.started)
    const guestStarted = await guestStartedPromise

    assert.equal(started.jokerLabel, null)
    assert.equal(started.jokerReference, null)
    assert.equal(started.jokerVisible, false)
    assert.equal(guestStarted.jokerLabel, null)
    assert.equal(guestStarted.jokerReference, null)
    assert.equal(guestStarted.jokerVisible, false)
    assert.ok(started.players.find((player) => player.id === 'blind-host').hand.every((card) => !('isJoker' in card)))
  } finally {
    players.forEach((socket) => socket.close())
    server.kill('SIGTERM')
  }
})

test('room rejects a fifth player when at capacity', async () => {
  const port = 3218
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  })
  const players = []

  try {
    let ready = false
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}`)
        if (response.ok) {
          ready = true
          break
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(ready, true, 'server should start before the capacity check')

    for (let index = 1; index <= 4; index += 1) {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`)
      players.push(socket)
      await waitForOpen(socket)
      const statePromise = waitForRoomState(socket)
      socket.send(JSON.stringify({
        type: 'join',
        roomId: 'CAPACITY-ROOM',
        playerId: `player-${index}`,
      }))
      const state = await statePromise
      assert.equal(state.playerCount, index)
      assert.equal(state.players.length, index)
    }

    const fifthPlayer = new WebSocket(`ws://127.0.0.1:${port}`)
    players.push(fifthPlayer)
    await waitForOpen(fifthPlayer)
    const fullErrorPromise = waitForError(fifthPlayer)
    fifthPlayer.send(JSON.stringify({
      type: 'join',
      roomId: 'CAPACITY-ROOM',
      playerId: 'player-5',
    }))
    const error = await fullErrorPromise
    assert.equal(error.code, 'ROOM_FULL')
  } finally {
    players.forEach((socket) => socket.close())
    server.kill('SIGTERM')
  }
})
