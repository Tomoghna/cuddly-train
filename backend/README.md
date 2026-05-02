# Fiss Backend Server

This is the backend server for the Fiss game.

## Setup

1. Open a terminal in `backend/`
2. Run `npm install`
3. Start the server:
   - `npm start`
   - or `npm run dev` if you install `nodemon`

The backend server runs on `http://localhost:4000` by default.

## Available API endpoints

- `GET /api/status`
- `POST /api/game` - create a new game
- `GET /api/game` - fetch current game state
- `POST /api/game/start` - start the loaded game
- `POST /api/game/end` - end the current game
- `POST /api/game/next` - advance to the next turn
- `POST /api/game/score` - add score to a player
- `POST /api/game/eliminate` - eliminate a player
- `POST /api/game/reset` - reset the game state
- `GET /api/game/winner` - get the current winner
