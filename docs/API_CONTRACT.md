# API and WebSockets Contract

This document outlines the required routes, API endpoints, and WebSocket events for the Great Battle (Marvel) card game. Do not modify these names or structures without consulting the Team Lead.

## 1. Client Routes (React Router)

The frontend application must implement the following paths:

- `/` or `/login` - User login page.
- `/register` - User registration page.
- `/lobby` - Matchmaking screen (accessible only with a valid JWT).
- `/battle` - Main game board (accessible only with a valid JWT and active match).

## 2. REST API (Authentication)

Base URL: `http://localhost:3001` (or `$VITE_API_URL`).

### POST `/api/auth/register`

Creates a new user account.

- Request Body:

```json
{
  "username": "player1",
  "password": "securepassword"
}
```

- Success Response (201):

```json
{
  "message": "User registered successfully"
}
```

### POST `/api/auth/login`

Authenticates a user and returns a JWT token.

- Request Body:

```json
{
  "username": "player1",
  "password": "securepassword"
}
```

- Success Response (200):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsIn...",
  "user": {
    "id": 1,
    "username": "player1"
  }
}
```

## 3. Socket.io Events (Game Engine)

WebSockets are used strictly for real-time matchmaking and gameplay.

### Emits (Client -> Server)

Events triggered by the React frontend.

#### `find_match`

- Description: User clicks "Search Game" in the lobby.
- Payload: None (Server identifies the user via socket connection/token).

#### `play_card`

- Description: User attempts to place a card on the battlefield.
- Payload:

```json
{ "cardId": 4 }
```

#### `end_turn`

- Description: User manually ends their turn before the 30-second timer expires.
- Payload: None.

### Listens (Server -> Client)

Events the React frontend must listen for and update the state accordingly.

#### `match_found`

- Description: The server has paired two players. Triggers the redirect to `/battle`.
- Payload:

```json
{ "opponentName": "Thanos99", "firstTurn": true }
```

Note: `firstTurn` determines who wins the coin toss.

#### `game_state`

- Description: A complete snapshot of the current match. Dispatched every time an action occurs or a turn changes.
- Payload:

```json
{
  "turnTimer": 30,
  "isMyTurn": true,
  "player": {
    "hp": 20,
    "mana": 5,
    "hand": [{ "id": 1, "name": "Iron Man", "attack": 5, "defense": 4, "cost": 3 }],
    "activeCards": []
  },
  "opponent": {
    "hp": 20,
    "mana": 5,
    "handCount": 4,
    "activeCards": []
  }
}
```

Note: `opponent.hand` is hidden. The client only receives `handCount` to render the correct number of card backs.

#### `game_over`

- Description: The match has ended (Health reached 0).
- Payload:

```json
{ "winner": "player1", "reason": "Opponent Health depleted" }
```
