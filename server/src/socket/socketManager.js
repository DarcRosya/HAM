import { Server } from 'socket.io';
import { socketAuth } from '../middlewares/socketAuth.js';
import { registerMatchmakingHandlers, removeFromQueue } from './handlers/matchmakingHandler.js';
import { registerGameHandlers } from './handlers/gameHandler.js';
import { gameService } from '../services/gameService.js';

export function initSocketManager(httpServer, clientOrigin) {
  const io = new Server(httpServer, {
    cors: {
      origin: clientOrigin,
      credentials: true,
    },
  });

  io.use(socketAuth);

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}. User: ${socket.user.username}`);

    registerMatchmakingHandlers(io, socket);
    registerGameHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}. User: ${socket.user?.username}`);

      removeFromQueue(socket.id);

      const userId = socket.user?.id;
      if (!userId) return;

      const match = gameService.findGameByPlayer(userId);
      if (match) {
        match.game.surrender(userId);
        if (match.game.status === 'finished') {
          gameService.removeGame(match.roomId);
        }
      }
    });
  });

  return io;
}
