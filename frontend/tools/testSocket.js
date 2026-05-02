import { io } from 'socket.io-client';

const URL = 'http://localhost:4000';
const socket = io(URL, { transports: ['websocket', 'polling'] });

socket.on('connect', () => {
  console.log('[testSocket] connected', socket.id);
  // request current state
  socket.emit('getState', { roomId: 'local-game' });
  // ask server to deal
  console.log('[testSocket] emitting deal');
  socket.emit('deal', { roomId: 'local-game', handSize: 8 });
  // after a short delay, request next turn
  setTimeout(() => {
    console.log('[testSocket] emitting next');
    socket.emit('next', { roomId: 'local-game' });
  }, 500);
});

socket.on('state', (s) => console.log('[testSocket] state', JSON.stringify(s, null, 2)));
socket.on('error', (e) => console.error('[testSocket] error', e));
socket.on('winner', (w) => console.log('[testSocket] winner', w));

setTimeout(() => {
  console.log('[testSocket] closing');
  socket.close();
}, 3000);
