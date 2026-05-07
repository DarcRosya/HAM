import { v4 as uuidv4 } from 'uuid';
import { GameRoom } from './GameRoom.js';

let queue = [];
export const activeGames = new Map();

export const handleFindMatch = (socket, io) => {
  const user = socket.user;

  const isAlreadyInQueue = queue.find((s) => s.user.id === user.id);
  if (isAlreadyInQueue) {
    return socket.emit('error', { message: 'You are already in queue' });
  }

  for (const game of activeGames.values()) {
    if (game.players[user.id]) {
      return socket.emit('error', { message: 'You are already in a match' });
    }
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

    activeGames.set(roomId, game);

    const player1Id = socket.user.id;
    const player2Id = opponentSocket.user.id;

    socket.emit('match_found', game.getGameState(player1Id));
    opponentSocket.emit('match_found', game.getGameState(player2Id));

    console.log(`Match started in room ${roomId}`);
  }
};

export const removeFromQueue = (socketId) => {
  queue = queue.filter((socket) => socket.id !== socketId);
};
