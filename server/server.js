import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { pool, verifyConnection } from './src/config/db';

import authRoutes from './src/routes/authRoutes.js';

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

io.on('connection', (socket) => {
  console.log('socket connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('socket disconnected:', socket.id);
  });
});

const port = Number(process.env.PORT) || 3001;

async function startServer() {
  try {
    await verifyConnection();
    console.log('DB connected');
  } catch (error) {
    console.error('DB connection failed:', error.message);
  }

  httpServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();
