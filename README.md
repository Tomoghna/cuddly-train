# FISS

FISS is a responsive multiplayer card-table client built with React, Vite, Tailwind, and a small authoritative WebSocket server.

## Run locally

Install dependencies, then start both processes:

```bash
npm install
npm run dev
```

The client runs at `http://localhost:5173` and the realtime server runs at `http://localhost:3001`.

Useful individual commands:

```bash
npm run dev:client
npm run dev:server
npm run lint
npm test
npm run build
```

## Rooms

Rooms are joined from the URL. Open a specific table with:

```text
http://localhost:5173/?room=ALPHA-1001
```

The lobby copy action shares this same deep link. A room accepts up to four players and is removed from memory after its final connection closes.

## Turn protocol

The server owns turn order, phase, room membership, and scores. Each active turn follows:

1. `draw`: the active player draws and enters the `play` phase.
2. `play_stack` or `discard`: the active player completes the turn and the next player enters `draw`.

Invalid actions return typed errors such as `NOT_YOUR_TURN`, `DRAW_REQUIRED`, `ALREADY_DREW`, `INVALID_STACK`, and `INVALID_DISCARD`. The server also validates player IDs, limits tables to four players, sends heartbeat pings, and cleans up stale sockets.

## Stack scoring

Playing a valid stack awards 10 points per card. The score is stored by the realtime server and broadcast with every game action.
