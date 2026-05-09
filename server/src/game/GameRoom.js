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

    this.sockets = {
      [player1.user.id]: player1,
      [player2.user.id]: player2,
    };

    this.players = {
      [player1.user.id]: this.createPlayerState(player1),
      [player2.user.id]: this.createPlayerState(player2),
    };

    this.intervalId = setInterval(() => {
      this.turnTimer -= 1;

      if (this.turnTimer <= 0) {
        this.nextTurn();
      }

      for (const playerId in this.sockets) {
        const playerSocket = this.sockets[playerId];

        const personalState = this.getGameState(playerId);

        playerSocket.emit('game_state', personalState);
      }
    }, 1000);
  }

  createPlayerState(socket) {
    return {
      socketId: socket.id,
      username: socket.user.username,
      hp: 20,
      mana: 3,
      maxMana: 3,
      hand: [],
      table: [],
      deck: shuffleArray(CARDS),
      fatigue: 0,
    };
  }

  broadcastState() {
    for (const playerId in this.sockets) {
      const playerSocket = this.sockets[playerId];
      const personalState = this.getGameState(playerId);
      playerSocket.emit('game_state', personalState);
    }
  }

  initGame() {
    const STARTING_CARDS_COUNT = 4;

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
        fatigue: 0,
      };
    }

    return {
      roomId: this.roomId,
      activeTurn: this.activeTurn,
      turnTimer: this.turnTimer,
      players: sanitizedPlayers,
    };
  }

  nextTurn() {
    const playerIds = Object.keys(this.players);

    this.activeTurn = playerIds.find((id) => id !== String(this.activeTurn));

    const currentPlayer = this.players[this.activeTurn];

    currentPlayer.maxMana = Math.min(currentPlayer.maxMana + 1, 10);
    currentPlayer.mana = currentPlayer.maxMana;

    const cardsNeeded = STARTING_CARDS_COUNT - currentPlayer.hand.length;

    while (cardsNeeded > 0) {
      if (currentPlayer.deck.length > 0) {
        const drawnCard = currentPlayer.deck.shift();
        currentPlayer.hand.push(drawnCard);
      } else {
        currentPlayer.fatigue += 1;
        currentPlayer.hp -= currentPlayer.fatigue;

        if (currentPlayer.hp <= 0) {
          const winnerId = playerIds.find((id) => id !== String(this.activeTurn));
          this.endGame(winnerId);
          return;
        }
      }
      cardsNeeded--;
    }

    currentPlayer.table.forEach((card) => (card.canAttack = true));

    this.turnTimer = 30;
  }

  playCard(playerId, cardInstanceId) {
    if (String(this.activeTurn) !== String(playerId)) {
      this.sockets[playerId].emit('error', { message: 'It is not your turn!' });
      return;
    }

    const activePlayer = this.players[playerId];

    const cardIndex = activePlayer.hand.findIndex((c) => c.instanceId === cardInstanceId);
    if (cardIndex === -1) {
      return;
    }
    const card = activePlayer.hand[cardIndex];

    if (activePlayer.mana < card.cost) {
      this.sockets[playerId].emit('error', { message: 'Not enough mana!' });
      return;
    }

    if (activePlayer.table.length >= 7) {
      this.sockets[playerId].emit('error', { message: 'There is no space on the table!' });
      return;
    }

    activePlayer.mana -= card.cost;
    activePlayer.hand.splice(cardIndex, 1);

    card.canAttack = false;

    activePlayer.table.push(card);

    this.broadcastState();
  }

  attackTarget(playerId, attackerInstanceId, targetId, targetType) {
    if (String(this.activeTurn) !== String(playerId)) return;

    const attackerPlayer = this.players[playerId];
    const opponentId = Object.keys(this.players).find((id) => String(id) !== String(playerId));
    const opponentPlayer = this.players[opponentId];

    const attackerCard = attackerPlayer.table.find((c) => c.instanceId === attackerInstanceId);
    if (!attackerCard) return;

    if (!attackerCard.canAttack) {
      this.sockets[playerId].emit('error', { message: 'This card cannot attack right now!' });
      return;
    }

    const hasTaunt = opponentPlayer.table.some((c) => c.traits.includes('taunt'));

    if (targetType === 'avatar') {
      if (hasTaunt) {
        this.sockets[playerId].emit('error', { message: 'You must attack a card with Taunt!' });
        return;
      }

      opponentPlayer.hp -= attackerCard.attack;
      attackerCard.canAttack = false;

      if (opponentPlayer.hp <= 0) {
        this.endGame(playerId);
        return;
      }
    } else if (targetType === 'card') {
      const targetCard = opponentPlayer.table.find((c) => c.instanceId === targetId);
      if (!targetCard) return;

      if (hasTaunt && !targetCard.traits.includes('taunt')) {
        this.sockets[playerId].emit('error', { message: 'You must attack a card with Taunt!' });
        return;
      }

      targetCard.defense -= attackerCard.attack;
      attackerCard.defense -= targetCard.attack;

      attackerCard.canAttack = false;

      attackerPlayer.table = attackerPlayer.table.filter((c) => c.defense > 0);
      opponentPlayer.table = opponentPlayer.table.filter((c) => c.defense > 0);
    }

    this.broadcastState();
  }

  handleEndTurn(requestingUserId) {
    if (this.status !== 'playing') return;

    if (String(this.activeTurn) !== String(requestingUserId)) {
      return;
    }

    this.nextTurn();
    this.broadcastState();
  }

  endGame(winnerId) {
    this.status = 'finished';

    clearInterval(this.intervalId);

    for (const playerId in this.sockets) {
      const playerSocket = this.sockets[playerId];
      playerSocket.emit('game_over', { winnerId });
    }
  }
}
