export const activeGames = new Map();

export const gameService = {
  addGame(roomId, game) {
    activeGames.set(roomId, game);
  },

  getGame(roomId) {
    return activeGames.get(roomId);
  },

  removeGame(roomId) {
    if (!activeGames.has(roomId)) {
      return;
    }
    activeGames.delete(roomId);
    console.log(`[GameService] Room ${roomId} removed. Active games: ${activeGames.size}`);
  },

  findGameByPlayer(playerId) {
    let finishedMatch = null;

    for (const [roomId, game] of activeGames.entries()) {
      if (game.players[playerId]) {
        if (game.status !== 'finished') {
          return { roomId, game };
        }
        finishedMatch = { roomId, game };
      }
    }

    return finishedMatch;
  },
};
