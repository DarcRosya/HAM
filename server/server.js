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

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}. User: ${socket.user.username}`);

    removeFromQueue(socket.id);

    // TODO: COUNT +lose to statisic if player left the game
  });
});

const port = Number(process.env.PORT) || 3001;

async function startServer() {
  try {
    await verifyConnection();
    console.log('DB connected');
    console.log(`DB sync ${shouldAlter ? 'altered' : 'completed'}`);
  } catch (error) {
    console.error('DB connection failed:', error.message);
    return;
  }

  httpServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();
