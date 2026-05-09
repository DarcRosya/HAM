import dotenv from 'dotenv';
dotenv.config();

import cors from 'cors';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

import { pool, verifyConnection } from './src/config/db.js';
import { socketAuth } from './src/middlewares/socketAuth.js';
import authRoutes from './src/routes/authRoutes.js';

import { handleFindMatch, removeFromQueue } from './src/game/matchmaker.js';

const app = express();
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/health/db', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({ status: 'error' });
  }
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: clientOrigin,
    credentials: true,
  },
});

io.use(socketAuth);

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}. User: ${socket.user.username}`);

  socket.on('find_match', () => {
    handleFindMatch(socket, io);
  });

  socket.on('end_turn', () => {
    let currentRoom = null;
    let currentRoomId = null;

    for (const [roomId, game] of activeGames.entries()) {
      if (game.players[socket.user.id]) {
        currentRoom = game;
        currentRoomId = roomId;
        break;
      }
    }

    if (!currentRoom) return;

    currentRoom.handleEndTurn(socket.user.id);

    if (currentRoom.status === 'finished') {
      activeGames.delete(currentRoomId);
      console.log(`Room ${currentRoomId} deleted from memory.`);
    }
  });

  socket.on('play_card', ({ roomId, cardInstanceId }) => {
    const game = activeGames.get(roomId);
    if (game) {
      game.playCard(socket.user.id, cardInstanceId);
    }
  });

  socket.on('attack_target', ({ roomId, attackerInstanceId, targetId, targetType }) => {
    const game = activeGames.get(roomId);
    if (game) {
      game.attackTarget(socket.user.id, attackerInstanceId, targetId, targetType);

      if (game.status === 'finished') {
        activeGames.delete(roomId);
        console.log(`Room ${roomId} deleted after final blow.`);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}. User: ${socket.user.username}`);

    removeFromQueue(socket.id);

    let currentRoomId = null;
    let currentRoom = null;

    for (const [roomId, game] of activeGames.entries()) {
      if (game.players[socket.user.id]) {
        currentRoom = game;
        currentRoomId = roomId;
        break;
      }
    }

    if (currentRoom) {
      const winnerId = Object.keys(currentRoom.players).find(
        (id) => String(id) !== String(socket.user.id)
      );

      currentRoom.endGame(winnerId);

      activeGames.delete(currentRoomId);
      console.log(`Room ${currentRoomId} deleted because player left the game.`);
    }
  });
});

const port = Number(process.env.PORT) || 3001;

async function startServer() {
  try {
    await verifyConnection();
    console.log('DB connected');
  } catch (error) {
    console.error('DB connection failed:', error.message);
    return;
  }

  httpServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();
