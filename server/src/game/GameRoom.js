import { CARDS } from './cards.js';
import { updateRating, findById } from '../repositories/userRepository.js';
import { saveMatchResult } from '../repositories/matchRepository.js';
import { getUserSocketCount } from '../socket/socketRegistry.js';

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
  constructor(roomId, player1, player2, io, onGameEnd) {
    this.roomId = roomId;
    this.status = 'playing';
    this.phase = 'loading';
    this.startedAt = new Date();
    this.io = io;
    this.onGameEnd = onGameEnd;

    this.activeTurn = Math.random() > 0.5 ? player1.user.id : player2.user.id;

    this.turnDuration = 30000;
    this.coinTossDuration = 7500;
    this.vsScreenDuration = 15500;
    this.animationCompensation = 2000;

    this.players = {
      [player1.user.id]: this.createPlayerState(player1),
      [player2.user.id]: this.createPlayerState(player2),
    };

    this.readyPlayers = new Set();
    this.turnExpiresAt = 0;

    this.disconnectCounts = { [player1.user.id]: 0, [player2.user.id]: 0 };
    this.disconnectGraceTimers = {};
    this.disconnectGraceMs = 30000;
    this.maxDisconnectStrikes = 3;
    this.lastDisconnectTime = {};

    this.loadingWatchdog = setTimeout(() => this.handleLoadingTimeout(), 15000);
  }

  setPlayerReady(playerId) {
    if (this.phase !== 'loading' || this.status !== 'playing') return;

    this.readyPlayers.add(String(playerId));

    if (this.readyPlayers.size === 2) {
      clearTimeout(this.loadingWatchdog);
      this.phase = 'vs_screen';
      this.turnExpiresAt = Date.now() + this.vsScreenDuration;

      this.broadcastState();
      this.startPhaseTimer(this.vsScreenDuration, 'coin_toss');
    }
  }

  handleLoadingTimeout() {
    if (this.phase !== 'loading') return;
    console.log(`[ROOM ${this.roomId}] Match aborted: Players failed to load UI in time.`);
    this.endGame(null);
  }

  startPhaseTimer(durationMs, nextPhase) {
    this.clearTurnTimer();
    this.intervalId = setTimeout(() => {
      if (this.status !== 'playing') return;

      if (this.phase === 'vs_screen' && nextPhase === 'coin_toss') {
        this.phase = 'coin_toss';
        this.turnExpiresAt = Date.now() + this.coinTossDuration;
        this.startPhaseTimer(this.coinTossDuration, 'playing');
        this.broadcastState();
      } else if (this.phase === 'coin_toss' && nextPhase === 'playing') {
        this.phase = 'playing';
        this.turnExpiresAt = Date.now() + this.turnDuration;
        this.startPhaseTimer(this.turnDuration, 'next_turn');
        this.broadcastState();
      } else if (this.phase === 'playing' && nextPhase === 'next_turn') {
        this.nextTurn();
        this.broadcastState();
      }
    }, durationMs);
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
      rating: socket.user.rating || 500,
      swordId: Math.floor(Math.random()) + 1,
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

  emitToPlayer(playerId, event, payload) {
    if (!this.io) {
      return;
    }
    this.io.to(String(playerId)).emit(event, payload);
  }

  getOpponentId(playerId) {
    const normalizedId = String(playerId);
    return Object.keys(this.players).find((id) => String(id) !== normalizedId) ?? null;
  }

  updatePlayerSocket(userId, socketId) {
    const normalizedId = String(userId);
    if (!this.players[normalizedId]) {
      return;
    }
    this.players[normalizedId].socketId = socketId;
  }

  clearDisconnectTimer(userId) {
    const normalizedId = String(userId);
    const timer = this.disconnectGraceTimers[normalizedId];
    if (timer) {
      clearTimeout(timer);
      delete this.disconnectGraceTimers[normalizedId];
    }
  }

  clearAllDisconnectTimers() {
    Object.keys(this.disconnectGraceTimers).forEach((key) => {
      clearTimeout(this.disconnectGraceTimers[key]);
    });
    this.disconnectGraceTimers = {};
  }

  notifyOpponentDisconnected(userId) {
    const opponentId = this.getOpponentId(userId);
    if (!opponentId) {
      return;
    }
    const strikes = this.disconnectCounts[String(userId)] ?? 0;
    const remainingAttempts = Math.max(0, this.maxDisconnectStrikes - strikes);
    this.emitToPlayer(opponentId, 'opponent-disconnected', {
      remainingAttempts,
      maxAttempts: this.maxDisconnectStrikes,
      graceSeconds: Math.ceil(this.disconnectGraceMs / 1000),
    });
  }

  notifyOpponentReconnected(userId) {
    const opponentId = this.getOpponentId(userId);
    if (!opponentId) {
      return;
    }
    const strikes = this.disconnectCounts[String(userId)] ?? 0;
    const remainingAttempts = Math.max(0, this.maxDisconnectStrikes - strikes);
    this.emitToPlayer(opponentId, 'opponent-reconnected', {
      remainingAttempts,
      maxAttempts: this.maxDisconnectStrikes,
    });
  }

  startDisconnectTimer(userId) {
    const normalizedId = String(userId);
    this.clearDisconnectTimer(normalizedId);

    this.disconnectGraceTimers[normalizedId] = setTimeout(() => {
      if (this.status !== 'playing') {
        return;
      }
      if (getUserSocketCount(normalizedId) > 0) {
        return;
      }
      const opponentId = this.getOpponentId(normalizedId);
      if (opponentId) {
        this.endGame(opponentId);
      }
    }, this.disconnectGraceMs);
  }

  handleFullDisconnect(userId) {
    if (this.status !== 'playing') {
      return;
    }

    const normalizedId = String(userId);
    if (!this.players[normalizedId]) {
      return;
    }

    const now = Date.now();
    if (
      this.lastDisconnectTime[normalizedId] &&
      now - this.lastDisconnectTime[normalizedId] < 2000
    ) {
      console.log(`[ROOM ${this.roomId}] Игнорируем двойной дисконнект для ${normalizedId}`);
      return;
    }
    this.lastDisconnectTime[normalizedId] = now;

    this.disconnectCounts[normalizedId] = (this.disconnectCounts[normalizedId] ?? 0) + 1;
    const strikes = this.disconnectCounts[normalizedId];

    if (strikes >= this.maxDisconnectStrikes) {
      this.clearDisconnectTimer(normalizedId);
      const opponentId = this.getOpponentId(normalizedId);
      if (opponentId) {
        this.endGame(opponentId);
      }
      return;
    }

    if (this.phase === 'playing') {
      this.clearTurnTimer();
      this.pausedAt = Date.now(); // Запоминаем точное время паузы
      console.log(`[ROOM ${this.roomId}] Игра поставлена на паузу в фазе playing.`);
    } else {
      console.log(
        `[ROOM ${this.roomId}] Дисконнект в фазе ${this.phase}. Таймер НЕ остановлен (идет интро).`
      );
    }

    this.startDisconnectTimer(normalizedId);
    this.notifyOpponentDisconnected(normalizedId);
  }

  handleReconnect(userId, socket) {
    const normalizedId = String(userId);
    if (!this.players[normalizedId]) {
      return;
    }

    if (socket?.id) {
      this.players[normalizedId].socketId = socket.id;
    }

    if (this.disconnectGraceTimers[normalizedId]) {
      this.clearDisconnectTimer(normalizedId);
      this.notifyOpponentReconnected(normalizedId);

      if (this.phase === 'playing' && this.pausedAt) {
        const pausedDuration = Date.now() - this.pausedAt;
        this.turnExpiresAt += pausedDuration; // Компенсируем время простоя
        this.pausedAt = null;

        const remainingMs = Math.max(0, this.turnExpiresAt - Date.now());
        console.log(`[ROOM ${this.roomId}] Таймер возобновлен. Осталось: ${remainingMs}мс`);
        this.startPhaseTimer(remainingMs, 'next_turn');
      } else {
        console.log(
          `[ROOM ${this.roomId}] Реконнект в фазе ${this.phase}. Таймер продолжает идти синхронно.`
        );
      }
    }

    this.broadcastState();
  }

  broadcastState() {
    for (const playerId of Object.keys(this.players)) {
      const personalState = this.getGameState(playerId);
      this.emitToPlayer(playerId, 'game_state', personalState);
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
        rating: player.rating,
        swordId: player.swordId,
        hp: player.hp,
        mana: player.mana,
        maxMana: player.maxMana,
        table: player.table,
        handCount: player.hand.length,
        hand: isMe ? player.hand : [],
        fatigue: player.fatigue,
        deckCount: player.deck.length,
        isConnected: getUserSocketCount(id) > 0,
      };
    }

    return {
      roomId: this.roomId,
      activeTurn: this.activeTurn,
      phase: this.phase,
      turnEndsInMs: this.turnExpiresAt > 0 ? Math.max(0, this.turnExpiresAt - Date.now()) : 0,
      players: sanitizedPlayers,
    };
  }

  nextTurn() {
    try {
      const playerIds = Object.keys(this.players);
      this.activeTurn = playerIds.find((id) => id !== String(this.activeTurn));
      const currentPlayer = this.players[this.activeTurn];

      currentPlayer.maxMana = Math.min(currentPlayer.maxMana + 1, 10);
      currentPlayer.mana = currentPlayer.maxMana;

      let cardsNeeded = STARTING_CARDS_COUNT - currentPlayer.hand.length;

      while (cardsNeeded > 0) {
        if (currentPlayer.deck.length > 0) {
          currentPlayer.hand.push(currentPlayer.deck.shift());
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

      this.turnExpiresAt = Date.now() + this.animationCompensation + this.turnDuration;
      this.startPhaseTimer(this.animationCompensation + this.turnDuration, 'next_turn');
    } catch (error) {
      console.error(`[CRITICAL] Error in nextTurn for room ${this.roomId}:`, error);
      this.status = 'error';
      this.broadcastState();
    }
  }

  playCard(playerId, cardInstanceId, targetIndex) {
    const player = this.players[String(playerId)];
    if (!player) {
      console.warn(`Action ignored: Player ${playerId} not found in room ${this.roomId}`);
      return;
    }

    if (this.status !== 'playing') return;
    if (String(this.activeTurn) !== String(playerId)) {
      this.emitToPlayer(playerId, 'error', { message: 'It is not your turn!' });
      return;
    }

    if (Date.now() > this.turnExpiresAt) {
      this.emitToPlayer(playerId, 'error', { message: 'Your turn time has expired!' });
      return;
    }

    const activePlayer = this.players[playerId];

    const cardIndex = activePlayer.hand.findIndex((c) => c.instanceId === cardInstanceId);
    if (cardIndex === -1) {
      return;
    }
    const card = activePlayer.hand[cardIndex];

    if (activePlayer.mana < card.cost) {
      this.emitToPlayer(playerId, 'error', { message: 'Not enough mana!' });
      return;
    }

    if (activePlayer.table.length >= 7) {
      this.emitToPlayer(playerId, 'error', { message: 'There is no space on the table!' });
      return;
    }

    activePlayer.mana -= card.cost;
    activePlayer.hand.splice(cardIndex, 1);

    card.canAttack = false;

    let insertIndex = activePlayer.table.length;
    if (
      typeof targetIndex === 'number' &&
      targetIndex >= 0 &&
      targetIndex <= activePlayer.table.length
    ) {
      insertIndex = targetIndex;
    }

    activePlayer.table.splice(insertIndex, 0, card);

    this.broadcastState();
  }

  attackTarget(playerId, attackerInstanceId, targetId, targetType) {
    const player = this.players[String(playerId)];
    if (!player) {
      console.warn(`Action ignored: Player ${playerId} not found in room ${this.roomId}`);
      return;
    }

    if (this.status !== 'playing') return;
    if (String(this.activeTurn) !== String(playerId)) return;

    if (Date.now() > this.turnExpiresAt) {
      this.emitToPlayer(playerId, 'error', { message: 'Your turn time has expired!' });
      return;
    }

    const attackerPlayer = this.players[playerId];
    const opponentId = Object.keys(this.players).find((id) => String(id) !== String(playerId));
    const opponentPlayer = this.players[opponentId];

    const attackerCard = attackerPlayer.table.find((c) => c.instanceId === attackerInstanceId);
    if (!attackerCard) return;

    if (!attackerCard.canAttack) {
      this.emitToPlayer(playerId, 'error', { message: 'This card cannot attack right now!' });
      return;
    }

    const hasTaunt = opponentPlayer.table.some((c) => c.traits.includes('taunt'));

    if (targetType === 'avatar') {
      if (hasTaunt) {
        this.emitToPlayer(playerId, 'error', { message: 'You must attack a card with Taunt!' });
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
        this.emitToPlayer(playerId, 'error', { message: 'You must attack a card with Taunt!' });
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
    const player = this.players[String(requestingUserId)];
    if (!player) {
      console.warn(`Action ignored: Player ${requestingUserId} not found in room ${this.roomId}`);
      return;
    }

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
    clearTimeout(this.loadingWatchdog);

    const playerIds = Object.keys(this.players);
    this.clearDisconnectTimer(playerIds[0]);
    this.clearDisconnectTimer(playerIds[1]);

    if (typeof this.onGameEnd === 'function') {
      setTimeout(() => this.onGameEnd(this.roomId), 10000);
    }

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

    const durationSeconds = Math.floor((Date.now() - this.startedAt.getTime()) / 1000);
    for (const playerId of Object.keys(this.players)) {
      this.emitToPlayer(playerId, 'game_over', {
        winnerId: winnerId,
        ratingChange: ratingChange,
        duration: durationSeconds,
      });
    }
  }
}
