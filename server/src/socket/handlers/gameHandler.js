import { gameService } from '../../services/gameService.js';

export function registerGameHandlers(io, socket) {
  socket.on('end_turn', () => {
    const match = gameService.findGameByPlayer(socket.user.id);
    if (!match) return;

    match.game.handleEndTurn(socket.user.id);

    if (match.game.status === 'finished') {
      gameService.removeGame(match.roomId);
    }
  });

  socket.on('play_card', ({ roomId, cardInstanceId }) => {
    const game = gameService.getGame(roomId);
    if (game) {
      game.playCard(socket.user.id, cardInstanceId);
    }
  });

  socket.on('attack_target', ({ roomId, attackerInstanceId, targetId, targetType }) => {
    const game = gameService.getGame(roomId);
    if (game) {
      game.attackTarget(socket.user.id, attackerInstanceId, targetId, targetType);

      if (game.status === 'finished') {
        gameService.removeGame(roomId);
      }
    }
  });

  socket.on('surrender', ({ roomId }) => {
    const game = gameService.getGame(roomId);
    if (game && game.players[socket.user.id]) {
      game.surrender(socket.user.id);
      gameService.removeGame(roomId);
    }
  });
}
