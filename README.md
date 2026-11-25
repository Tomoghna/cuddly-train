# FISS

FISS is a responsive multiplayer card-table client built with React, Vite, Tailwind, and a small authoritative WebSocket server.

## Run locally

Install dependencies, then start both processes:

```bash
npm install
npm run dev
```

The client runs at `http://localhost:5173` and the realtime server runs at `http://localhost:3001`.
Locally, the client connects to the current hostname on port `3001` by default. When the realtime server uses another address, set `VITE_WS_URL` to its WebSocket URL (for example, `wss://realtime.example.com`).

## Deploy to Vercel

Vercel can host the Vite frontend, but this project's multiplayer server (`server/index.js`) is a long-running WebSocket server and must run separately as a Node web service. Deploy the repository's server on a host that supports persistent WebSocket connections, using `npm install` as the build command and `npm run dev:server` as the start command. The service must expose its assigned `PORT`; its `/` endpoint is a health check.

Then add `VITE_WS_URL` to the Vercel project's environment variables, set it to the realtime service's secure WebSocket URL (for example, `wss://fiss-realtime.example.com`), and redeploy the frontend so Vite includes the value in the build. Do not use the Vercel frontend URL or append port `3001` unless your realtime service is actually reachable there. Production builds without `VITE_WS_URL` show “Server URL not set” instead of retrying an invalid endpoint.

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

The server owns turn order, phase, room membership, and scores. Each active turn follows one of two paths:

1. The active player may play one or more stacks from the `draw` phase, then end the turn. They may also insert or extend compatible stacks after playing a stack of their own.
2. Otherwise, they draw a card and discard one card from their hand; the next player then enters `draw`.

A player who has played a stack cannot draw during that turn. After their last stack action, they must choose **End turn** to pass play to the next player.

Invalid actions return typed errors such as `NOT_YOUR_TURN`, `DRAW_REQUIRED`, `ALREADY_DREW`, `INVALID_STACK`, and `INVALID_DISCARD`. The server also validates player IDs, limits tables to four players, sends heartbeat pings, and cleans up stale sockets.

## Stack scoring

Playing a valid stack awards 10 points per card. The score is stored by the realtime server and broadcast with every game action.
