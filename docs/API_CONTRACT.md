# API Contract

This document reflects the current REST endpoints and Socket.IO events used by the backend.

## Base URL and Auth

- REST base URL: `http://localhost:3001` (or `$VITE_API_URL`).
- Protected REST endpoints require `Authorization: Bearer <JWT>`.
- Socket.IO auth uses `auth: { token: "<JWT>" }` in the handshake.

## JWT Payload

```json
{
  "id": 1,
  "username": "player1",
  "displayedName": "Player One",
  "avatar": "/assets/avatars/finn.png"
}
```

## REST API

### Auth

#### POST `/api/auth/register`

Creates a new user account.

Request Body:

```json
{
  "username": "player1",
  "email": "player1@example.com",
  "displayedName": "Player One",
  "avatar": "/assets/avatars/finn.png",
  "password": "securepassword"
}
```

Success Response (201):

```json
{
  "message": "User registered successfully"
}
```

#### POST `/api/auth/login`

Authenticates a user and returns a JWT token.

Request Body:

```json
{
  "username": "player1",
  "password": "securepassword"
}
```

Success Response (200):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsIn...",
  "user": {
    "id": 1,
    "username": "player1",
    "email": "player1@example.com",
    "displayedName": "Player One",
    "avatar": "/assets/avatars/finn.png"
  }
}
```

#### POST `/api/auth/forgot-password`

Request Body:

```json
{
  "email": "player1@example.com"
}
```

Success Response (200):

```json
{
  "message": "Check your email for reset link"
}
```

#### POST `/api/auth/reset-password`

Request Body:

```json
{
  "token": "reset-token",
  "newPassword": "newpassword"
}
```

Success Response (200):

```json
{
  "message": "Password reset successful"
}
```

### Users

#### GET `/api/users/history`

Returns the last 25 matches for the authenticated user. `ratingChange` is positive for wins, negative for losses, and 0 for draws.

Headers:

```
Authorization: Bearer <JWT>
```

Success Response (200):

```json
[
  {
    "id": 12,
    "winnerId": 5,
    "endedAt": "2026-05-12T12:34:56.000Z",
    "ratingChange": 25,
    "username": "coolboy",
    "displayedName": "Opponent Name",
    "avatar": "/assets/avatars/finn.png"
  }
]
```

#### GET `/api/users/avatars`

Returns available avatar paths.

Success Response (200):

```json
["/assets/avatars/finn.png", "/assets/avatars/jake.jpg"]
```

#### PATCH `/api/users/profile`

Updates profile fields. Only provided fields are updated.

Headers:

```
Authorization: Bearer <JWT>
```

Request Body (any subset):

```json
{
  "username": "newname",
  "email": "newmail@example.com",
  "displayedName": "New Display",
  "avatar": "/assets/avatars/finn.png"
}
```

Success Response (200):

```json
{
  "message": "Profile updated",
  "token": "eyJhbGciOiJIUzI1NiIsIn...",
  "user": {
    "id": 1,
    "username": "newname",
    "email": "newmail@example.com",
    "displayedName": "New Display",
    "avatar": "/assets/avatars/finn.png"
  }
}
```

#### PATCH `/api/users/password`

Updates the user password.

Headers:

```
Authorization: Bearer <JWT>
```

Request Body:

```json
{
  "oldPassword": "oldpassword",
  "newPassword": "newpassword"
}
```

Success Response (200):

```json
{
  "message": "Password updated"
}
```

### Game

#### GET `/api/cards`

Returns the full card catalog.

Success Response (200):

```json
[
  {
    "id": 1,
    "name": "Card Name",
    "attack": 3,
    "defense": 2,
    "cost": 2,
    "traits": []
  }
]
```

## WebSockets (Socket.IO)

### Connect

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  auth: { token: '<JWT>' },
});
```

### Client -> Server Events

#### `find_match`

Start matchmaking. Payload: none.

#### `play_card`

```json
{ "roomId": "room-id", "cardInstanceId": "card-1-abc123" }
```

#### `attack_target`

```json
{
  "roomId": "room-id",
  "attackerInstanceId": "card-1-abc123",
  "targetId": "card-2-def456",
  "targetType": "card"
}
```

#### `end_turn`

End current turn. Payload: none.

#### `surrender`

```json
{ "roomId": "room-id" }
```

### Server -> Client Events

#### `waiting_for_opponent`

Emitted after joining the queue. Payload: none.

#### `match_found`

Emitted when a match starts. Payload: same shape as `game_state`.

#### `game_state`

Full snapshot for the requesting player.

```json
{
  "roomId": "room-id",
  "activeTurn": 1,
  "turnTimer": 27,
  "players": {
    "1": {
      "socketId": "socket-id",
      "username": "player1",
      "displayedName": "Player One",
      "avatar": "/assets/avatars/finn.png",
      "hp": 20,
      "mana": 3,
      "maxMana": 3,
      "table": [],
      "handCount": 4,
      "hand": [],
      "fatigue": 0,
      "deckCount": 20
    }
  }
}
```

#### `game_over`

```json
{ "winnerId": 1 }
```

#### `error`

```json
{ "message": "An internal error occurred" }
```
