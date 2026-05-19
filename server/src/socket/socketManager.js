import { Server } from 'socket.io';
import { socketAuth } from '../middlewares/socketAuth.js';
import { registerMatchmakingHandlers, removeFromQueue } from './handlers/matchmakingHandler.js';
import { registerGameHandlers } from './handlers/gameHandler.js';
import { gameService } from '../services/gameService.js';
import { addUserSocket, getUserSocketCount, removeUserSocket } from './socketRegistry.js';
import { findById } from '../repositories/userRepository.js';

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

    const userId = socket.user?.id;
    const wasOnline = userId ? getUserSocketCount(userId) > 0 : false;

    if (userId) {
      addUserSocket(userId, socket.id);
      socket.join(String(userId));
    }

    if (userId) {
      const match = gameService.findGameByPlayer(userId);
      if (match) {
        match.game.updatePlayerSocket(userId, socket.id);
        if (!wasOnline) {
          match.game.handleReconnect(userId, socket);
        }
      }
    }

    registerMatchmakingHandlers(io, socket);
    registerGameHandlers(io, socket);

    socket.on('join-lobby', async () => {
      const lobbyUserId = socket.user?.id;
      if (!lobbyUserId) return;

      try {
        const updatedUser = await findById(lobbyUserId);
        if (updatedUser) {
          socket.user.username = updatedUser.username;
          socket.user.displayedName = updatedUser.displayedName;
          socket.user.avatar = updatedUser.avatar;
          socket.user.avatarFrame = updatedUser.avatarFrame;
          socket.user.avatar_frame = updatedUser.avatarFrame;
          socket.user.rating = updatedUser.rating;
          socket.emit('profile_sync', updatedUser);
        }
      } catch (err) {
        console.error('Failed to sync profile on join-lobby:', err);
      }

      const match = gameService.findGameByPlayer(lobbyUserId);
      if (match && match.game && match.game.status !== 'finished') {
        socket.emit('force-reconnect', match.game.getGameState(lobbyUserId));
      } else {
        socket.emit('match_not_found');
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}. User: ${socket.user?.username}`);

      const disconnectedUserId = socket.user?.id;
      if (!disconnectedUserId) return;

      const remainingSockets = removeUserSocket(disconnectedUserId, socket.id);
      if (remainingSockets > 0) {
        return;
      }

      removeFromQueue(disconnectedUserId);

      const match = gameService.findGameByPlayer(disconnectedUserId);
      if (match) {
        match.game.handleFullDisconnect(disconnectedUserId);
        if (match.game.status === 'finished') {
          gameService.removeGame(match.roomId);
        }
      }
    });
  });

  return io;
}
