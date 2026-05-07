import { CARDS } from './cards.js';

const shuffleArray = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export class GameRoom {
  constructor(roomId, player1, player2) {
    this.roomId = roomId;
    this.status = 'playing';

    this.activeTurn = Math.random() > 0.5 ? player1.user.id : player2.user.id;
    this.turnTimer = 30;

    this.players = {
      [player1.user.id]: this.createPlayerState(player1),
      [player2.user.id]: this.createPlayerState(player2),
    };
  }

  createPlayerState(socket) {
    return {
      socketId: socket.id,
      username: socket.user.username,
      hp: 20,
      mana: 1,
      maxMana: 3,
      hand: [],
      table: [],
      deck: shuffleArray(CARDS),
    };
  }

  initGame() {
    const STARTING_CARDS_COUNT = 5;

    for (const playerId in this.players) {
      const player = this.players[playerId];
      player.hand = player.deck.splice(0, STARTING_CARDS_COUNT);
    }
  }

  getGameState(requestingUserId) {
    const sanitizedPlayers = {};

    for (const [id, player] of Object.entries(this.players)) {
      const isMe = String(id) === String(requestingUserId);

      sanitizedPlayers[id] = {
        username: player.username,
        hp: player.hp,
        mana: player.mana,
        maxMana: player.maxMana,
        table: player.table,
        handCount: player.hand.length,
        hand: isMe ? player.hand : [],
      };
    }

    return {
      roomId: this.roomId,
      activeTurn: this.activeTurn,
      turnTimer: this.turnTimer,
      players: sanitizedPlayers,
    };
  }
}
