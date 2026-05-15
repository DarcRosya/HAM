import dotenv from 'dotenv';
dotenv.config();

import cors from 'cors';
import express from 'express';
import http from 'http';

import { pool, verifyConnection } from './src/config/db.js';
import authRoutes from './src/routes/authRoutes.js';
import gameRoutes from './src/routes/gameRoutes.js';
import userRoutes from './src/routes/userRoutes.js';
import { initSocketManager } from './src/socket/socketManager.js';

const app = express();
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api', gameRoutes);
app.use('/api/users', userRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/health/db', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({ status: 'error' });
  }
});

const httpServer = http.createServer(app);

const io = initSocketManager(httpServer, clientOrigin);

const port = Number(process.env.PORT) || 3001;

process.on('SIGINT', () => {
  console.log('Server is shutting down... Sending cleanup signal to all clients.');
  if (io) {
    io.emit('server-shutdown');
  }

  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

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
