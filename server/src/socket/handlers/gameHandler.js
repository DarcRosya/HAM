import { gameService } from '../../services/gameService.js';

export function registerGameHandlers(io, socket) {
  socket.on('end_turn', () => {
    try {
      const match = gameService.findGameByPlayer(socket.user.id);
      if (!match) return;

      match.game.handleEndTurn(socket.user.id);

      if (match.game.status === 'finished') {
        gameService.removeGame(match.roomId);
      }
    } catch (e) {
      console.error('Error in end_turn:', e);
      socket.emit('error', { message: 'An internal error occurred' });
    }
  });

  socket.on('play_card', ({ roomId, cardInstanceId }) => {
    try {
      const game = gameService.getGame(roomId);
      if (game) {
        game.playCard(socket.user.id, cardInstanceId);
      }
    } catch (e) {
      console.error('Error in play_card:', e);
      socket.emit('error', { message: 'An internal error occurred' });
    }
  });

  socket.on('attack_target', ({ roomId, attackerInstanceId, targetId, targetType }) => {
    try {
      const game = gameService.getGame(roomId);
      if (game) {
        game.attackTarget(socket.user.id, attackerInstanceId, targetId, targetType);

        if (game.status === 'finished') {
          gameService.removeGame(roomId);
        }
      }
    } catch (e) {
      console.error('Error in attack_target:', e);
      socket.emit('error', { message: 'An internal error occurred' });
    }
  });

  socket.on('surrender', ({ roomId }) => {
    try {
      const game = gameService.getGame(roomId);
      if (game && game.players[socket.user.id]) {
        game.surrender(socket.user.id);
        gameService.removeGame(roomId);
      }
    } catch (e) {
      console.error('Error in surrender:', e);
      socket.emit('error', { message: 'An internal error occurred' });
    }
  });
}
