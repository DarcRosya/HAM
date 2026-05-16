import { v4 as uuidv4 } from 'uuid';
import { GameRoom } from '../../game/GameRoom.js';
import { gameService } from '../../services/gameService.js';
import { getUserSocketIds } from '../socketRegistry.js';

let queue = [];

const normalizeUserId = (userId) => String(userId);

const getActiveSocketForUser = (io, userId) => {
  const socketIds = getUserSocketIds(userId);
  for (const socketId of socketIds) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket?.connected) {
      return socket;
    }
  }
  return null;
};

export function registerMatchmakingHandlers(io, socket) {
  socket.on('find_match', () => {
    try {
      const user = socket.user;
      const userId = normalizeUserId(user.id);

      if (queue.includes(userId)) {
        return socket.emit('error', { message: 'You are already in queue' });
      }

      if (gameService.findGameByPlayer(userId)) {
        return socket.emit('error', { message: 'ALREADY_IN_GAME' });
      }

      console.log(`User ${user.username} is looking for a match`);

      if (queue.length === 0) {
        queue.push(userId);
        socket.emit('waiting_for_opponent');
        return;
      }

      let opponentId = null;
      let opponentSocket = null;

      while (queue.length > 0) {
        const candidateId = normalizeUserId(queue.shift());

        if (candidateId === userId) {
          continue;
        }

        if (gameService.findGameByPlayer(candidateId)) {
          continue;
        }

        opponentSocket = getActiveSocketForUser(io, candidateId);
        if (opponentSocket) {
          opponentId = candidateId;
          break;
        }
      }

      if (!opponentSocket || !opponentId) {
        queue.push(userId);
        socket.emit('waiting_for_opponent');
        return;
      }

      const roomId = uuidv4();

      socket.join(roomId);
      opponentSocket.join(roomId);

      const game = new GameRoom(roomId, socket, opponentSocket, io, () => {
        gameService.removeGame(roomId);
      });
      game.initGame();

      gameService.addGame(roomId, game);

      io.to(userId).emit('match_found', game.getGameState(userId));
      io.to(opponentId).emit('match_found', game.getGameState(opponentId));

      console.log(`Match started in room ${roomId}`);
    } catch (e) {
      console.error('Error in find_match:', e);
      socket.emit('error', { message: 'An internal error occurred' });
    }
  });

  socket.on('cancel_matchmaking', () => {
    try {
      const user = socket.user;

      removeFromQueue(user.id);
      console.log(`User ${user.username} canceled matchmaking`);

      socket.emit('matchmaking_canceled');
    } catch (e) {
      console.error('Error in cancel_matchmaking:', e);
      socket.emit('error', { message: 'An internal error occurred' });
    }
  });
}

export function removeFromQueue(userId) {
  const normalizedId = normalizeUserId(userId);
  queue = queue.filter((queuedId) => normalizeUserId(queuedId) !== normalizedId);
}
