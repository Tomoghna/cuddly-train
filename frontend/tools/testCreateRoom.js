import { io } from 'socket.io-client';

const URL = 'http://localhost:4000';
const socket = io(URL, { transports: ['websocket', 'polling'] });

socket.on('connect', () => {
  console.log('[testCreateRoom] connected', socket.id);
  // emit create without a roomId to let client generate one normally; here pass none
  console.log('[testCreateRoom] emitting create (no roomId)');
  socket.emit('create', { playerCount: 4, playerNames: ['Tester'] });
});

socket.on('created', (data) => {
  console.log('[testCreateRoom] created', data);
  // request state for that room
  if (data && data.roomId) socket.emit('getState', { roomId: data.roomId });
});

socket.on('state', (s) => console.log('[testCreateRoom] state', JSON.stringify(s, null, 2)));
socket.on('error', (e) => console.error('[testCreateRoom] error', e));

setTimeout(() => {
  console.log('[testCreateRoom] closing');
  socket.close();
}, 5000);
