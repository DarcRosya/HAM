import { CARDS } from './cards.js';
import { updateRating, findById } from '../repositories/userRepository.js';
import { saveMatchResult } from '../repositories/matchRepository.js';

const STARTING_CARDS_COUNT = 4;

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
    this.startedAt = new Date();

    this.activeTurn = Math.random() > 0.5 ? player1.user.id : player2.user.id;
    this.turnDuration = 30000; // 30 seconds in ms
    this.turnStartTime = Date.now();
    this.turnExpiresAt = this.turnStartTime + this.turnDuration;

    this.sockets = {
      [player1.user.id]: player1,
      [player2.user.id]: player2,
    };

    this.players = {
      [player1.user.id]: this.createPlayerState(player1),
      [player2.user.id]: this.createPlayerState(player2),
    };

    setTimeout(() => {
      if (this.status === 'playing') {
        this.startTurnTimer();
      }
    }, 7500);
  }

  startTurnTimer() {
    this.clearTurnTimer();
    this.turnStartTime = Date.now();
    this.intervalId = setTimeout(() => {
      if (this.status === 'playing') {
        this.nextTurn();
        this.broadcastState();
      }
    }, this.turnDuration);
  }

  clearTurnTimer() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
  }

  createPlayerState(socket) {
    return {
      socketId: socket.id,
      username: socket.user.username,
      avatar: socket.user.avatar,
      displayedName: socket.user.displayedName,
      hp: 20,
      mana: 3,
      maxMana: 3,
      hand: [],
      table: [],
      deck: shuffleArray(CARDS).map((card) => ({
        ...card,
        instanceId: `card-${card.id}-${Math.random().toString(36).substring(2, 9)}`,
      })),
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
        socketId: player.socketId,
        username: player.username,
        avatar: player.avatar,
        displayedName: player.displayedName,
        hp: player.hp,
        mana: player.mana,
        maxMana: player.maxMana,
        table: player.table,
        handCount: player.hand.length,
        hand: isMe ? player.hand : [],
        fatigue: player.fatigue,
        deckCount: player.deck.length,
      };
    }

    const elapsed = Date.now() - this.turnStartTime;
    const turnTimerSeconds = Math.max(0, Math.ceil((this.turnDuration - elapsed) / 1000));

    return {
      roomId: this.roomId,
      activeTurn: this.activeTurn,
      turnTimer: turnTimerSeconds,
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

    this.startTurnTimer();
  }

  playCard(playerId, cardInstanceId) {
    if (this.status !== 'playing') return;
    if (String(this.activeTurn) !== String(playerId)) {
      this.sockets[playerId].emit('error', { message: 'It is not your turn!' });
      return;
    }

    if (Date.now() > this.turnExpiresAt) {
      this.sockets[playerId].emit('error', { message: 'Your turn time has expired!' });
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
    if (this.status !== 'playing') return;
    if (String(this.activeTurn) !== String(playerId)) return;

    if (Date.now() > this.turnExpiresAt) {
      this.sockets[playerId].emit('error', { message: 'Your turn time has expired!' });
      return;
    }

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

  surrender(playerId) {
    if (this.status !== 'playing') return;

    const winnerId = Object.keys(this.players).find((id) => String(id) !== String(playerId));

    this.endGame(winnerId);
  }

  handleEndTurn(requestingUserId) {
    if (this.status !== 'playing') return;

    if (String(this.activeTurn) !== String(requestingUserId)) {
      return;
    }

    this.nextTurn();
    this.broadcastState();
  }

  async endGame(winnerId) {
    if (this.status === 'finished') {
      return;
    }

    this.status = 'finished';
    this.clearTurnTimer();

    const playerIds = Object.keys(this.sockets);
    const p1Id = parseInt(playerIds[0]);
    const p2Id = parseInt(playerIds[1]);
    const winId = winnerId ? parseInt(winnerId) : null;

    let ratingChange = 0;

    try {
      const [p1, p2] = await Promise.all([findById(p1Id), findById(p2Id)]);

      if (p1 && p2 && winId) {
        const expectedP1 = 1 / (1 + Math.pow(10, (p2.rating - p1.rating) / 400));
        const expectedP2 = 1 / (1 + Math.pow(10, (p1.rating - p2.rating) / 400));

        const actualP1 = winId === p1.id ? 1 : 0;
        const actualP2 = winId === p2.id ? 1 : 0;

        const kValue = 32;
        const newRatingP1 = Math.round(p1.rating + kValue * (actualP1 - expectedP1));
        const newRatingP2 = Math.round(p2.rating + kValue * (actualP2 - expectedP2));

        const ratingChangeP1 = newRatingP1 - p1.rating;
        const ratingChangeP2 = newRatingP2 - p2.rating;
        ratingChange = Math.abs(winId === p1.id ? ratingChangeP1 : ratingChangeP2);

        await Promise.all([updateRating(p1.id, newRatingP1), updateRating(p2.id, newRatingP2)]);

        this.players[p1.id].rating = newRatingP1;
        this.players[p2.id].rating = newRatingP2;
      }

      await saveMatchResult(p1Id, p2Id, winId, this.startedAt, new Date(), ratingChange);
    } catch (e) {
      console.error('Failed to save match history or update rating:', e);
    }

    for (const playerId in this.sockets) {
      const playerSocket = this.sockets[playerId];
      playerSocket.emit('game_over', { winnerId });
    }
  }
}
