import { io } from 'socket.io-client';

const URL = 'http://localhost:4000';

function createClient(name) {
  const sock = io(URL, { transports: ['websocket', 'polling'] });
  sock.on('connect', () => console.log(`[${name}] connected ${sock.id}`));
  sock.on('state', (s) => console.log(`[${name}] state`, JSON.stringify(s && { roomId: s.roomId, status: s.status, players: (s.players||[]).map(p=>p.id), active: s.activePlayerIndex, turn: s.turnCount }, null, 2)));
  sock.on('created', (d) => console.log(`[${name}] created`, d));
  sock.on('joined', (d) => console.log(`[${name}] joined`, d));
  sock.on('winner', (w) => console.log(`[${name}] winner`, w));
  sock.on('error', (e) => console.error(`[${name}] error`, e));
  return sock;
}

(async function run() {
  const a = createClient('A');
  // wait for connect
  await new Promise(r => a.once('connect', r));

  // choose a short room id
  const roomId = `R${Math.random().toString(36).slice(2,8).toUpperCase()}`;
  console.log('[Test] Using roomId', roomId);

  // A creates room
  a.emit('create', { roomId, playerCount: 4, playerNames: ['Alice'], maxPlayers: 4 });

  // wait until server confirms state or created
  await new Promise(r => a.once('created', r));

  // create client B and join
  const b = createClient('B');
  await new Promise(r => b.once('connect', r));
  b.emit('join', { roomId, playerName: 'Bob', maxPlayers: 4 });

  // wait a bit for server to update
  await new Promise(r => setTimeout(r, 500));

  // Start game from A
  console.log('[Test] A starting game');
  a.emit('start', { roomId });
  await new Promise(r => setTimeout(r, 300));

  // Deal hands
  console.log('[Test] A dealing hands');
  a.emit('deal', { roomId, handSize: 8 });
  await new Promise(r => setTimeout(r, 500));

  // Advance turn
  console.log('[Test] A advancing turn');
  a.emit('next', { roomId });
  await new Promise(r => setTimeout(r, 300));

  // Request final state
  a.emit('getState', { roomId });
  await new Promise(r => setTimeout(r, 300));

  console.log('[Test] Closing sockets');
  a.close();
  b.close();
})().catch(e => console.error(e));
