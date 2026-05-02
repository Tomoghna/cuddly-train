import { io } from 'socket.io-client';

const URL = 'http://localhost:4000';
const socket = io(URL, { transports: ['websocket', 'polling'] });

socket.on('connect', () => {
  console.log('[checkDealHands] connected', socket.id);
  // create a room with two named players so create uses playerNames
  socket.emit('create', { playerCount: 4, playerNames: ['Alice', 'Bob'] });
});

socket.on('created', (data) => {
  console.log('[checkDealHands] created', data);
  if (!data || !data.roomId) return socket.close();
  const roomId = data.roomId;
  // start the game to trigger dealing
  socket.emit('start', { roomId });
  // request state after a short delay to allow deal to complete
  setTimeout(() => socket.emit('getState', { roomId }), 250);
});

socket.on('state', (s) => {
  // Wait until the game is in `playing` state (after dealing)
  if (!s || s.status !== 'playing') {
    console.log('[checkDealHands] ignoring non-playing state');
    return;
  }
  console.log('[checkDealHands] playing state received');
  if (!s.players) {
    console.error('No players in state');
    socket.close();
    process.exit(2);
  }
  let ok = true;
  for (const p of s.players) {
    const len = (p.hand && p.hand.length) || 0;
    console.log(`player ${p.id} (${p.name}) hand length: ${len}`);
    if (len !== 8) ok = false;
  }
  if (ok) console.log('OK: all players have 8 cards');
  else console.error('FAIL: one or more players do not have 8 cards');
  socket.close();
  process.exit(ok ? 0 : 3);
});

socket.on('error', (e) => console.error('[checkDealHands] error', e));

setTimeout(() => {
  console.log('[checkDealHands] timeout, closing');
  socket.close();
  process.exit(4);
}, 5000);
