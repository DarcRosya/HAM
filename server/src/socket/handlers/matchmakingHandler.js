import { v4 as uuidv4 } from 'uuid';
import { GameRoom } from '../../game/GameRoom.js';
import { gameService } from '../../services/gameService.js';

let queue = [];

export function registerMatchmakingHandlers(io, socket) {
  socket.on('find_match', () => {
    try {
      const user = socket.user;

      if (queue.find((s) => s.user.id === user.id)) {
        return socket.emit('error', { message: 'You are already in queue' });
      }

      if (gameService.findGameByPlayer(user.id)) {
        return socket.emit('error', { message: 'You are already in a match' });
      }

      console.log(`User ${user.username} is looking for a match`);

      if (queue.length === 0) {
        queue.push(socket);
        socket.emit('waiting_for_opponent');
      } else {
        const opponentSocket = queue.shift();
        const roomId = uuidv4();

        socket.join(roomId);
        opponentSocket.join(roomId);

        const game = new GameRoom(roomId, socket, opponentSocket);
        game.initGame();

        gameService.addGame(roomId, game);

        socket.emit('match_found', game.getGameState(socket.user.id));
        opponentSocket.emit('match_found', game.getGameState(opponentSocket.user.id));

        console.log(`Match started in room ${roomId}`);
      }
    } catch (e) {
      console.error('Error in find_match:', e);
      socket.emit('error', { message: 'An internal error occurred' });
    }
  });

  socket.on('cancel_matchmaking', () => {
    try {
      const user = socket.user;

      removeFromQueue(socket.id);
      console.log(`User ${user.username} canceled matchmaking`);

      socket.emit('matchmaking_canceled');
    } catch (e) {
      console.error('Error in cancel_matchmaking:', e);
      socket.emit('error', { message: 'An internal error occurred' });
    }
  });
}

export function removeFromQueue(socketId) {
  queue = queue.filter((socket) => socket.id !== socketId);
}
