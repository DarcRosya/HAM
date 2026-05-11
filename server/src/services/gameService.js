export const activeGames = new Map();

export const gameService = {
  addGame(roomId, game) {
    activeGames.set(roomId, game);
  },

  getGame(roomId) {
    return activeGames.get(roomId);
  },

  removeGame(roomId) {
    activeGames.delete(roomId);
    console.log(`[GameService] Room ${roomId} removed. Active games: ${activeGames.size}`);
  },

  findGameByPlayer(playerId) {
    for (const [roomId, game] of activeGames.entries()) {
      if (game.players[playerId]) {
        return { roomId, game };
      }
    }
    return null;
  },
};
