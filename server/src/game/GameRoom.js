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
    this.initialPlayer = this.activeTurn;
    this.round = 1;

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

    this.syncProfiles(player1.user.id, player2.user.id);
  }

  async syncProfiles(id1, id2) {
    try {
      const [u1, u2] = await Promise.all([findById(id1), findById(id2)]);

      if (u1 && this.players[id1]) {
        this.players[id1].avatarFrame = u1.avatarFrame;
        this.players[id1].avatar = u1.avatar;
        this.players[id1].username = u1.username;
        this.players[id1].displayedName = u1.displayedName;
        if (u1.rating !== undefined && u1.rating !== null) {
          this.players[id1].rating = u1.rating;
        }
      }
      if (u2 && this.players[id2]) {
        this.players[id2].avatarFrame = u2.avatarFrame;
        this.players[id2].avatar = u2.avatar;
        this.players[id2].username = u2.username;
        this.players[id2].displayedName = u2.displayedName;
        if (u2.rating !== undefined && u2.rating !== null) {
          this.players[id2].rating = u2.rating;
        }
      }

      this.broadcastState();
    } catch (e) {
      console.error(`[ROOM ${this.roomId}] Failed to sync profiles:`, e);
    }
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
      avatarFrame: socket.user.avatarFrame || socket.user.avatar_frame || null,
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
        traits: Array.isArray(card.traits) ? [...card.traits] : [],
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
      this.pausedAt = Date.now();
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

    if (this.status === 'finished' && this.gameOverResult) {
      this.emitToPlayer(userId, 'game_over', this.gameOverResult);
      return;
    }

    if (this.disconnectGraceTimers[normalizedId]) {
      this.clearDisconnectTimer(normalizedId);
      this.notifyOpponentReconnected(normalizedId);

      if (this.phase === 'playing' && this.pausedAt) {
        const pausedDuration = Date.now() - this.pausedAt;
        this.turnExpiresAt += pausedDuration;
        this.pausedAt = null;

        const remainingMs = Math.max(0, this.turnExpiresAt - Date.now());
        console.log(`[ROOM ${this.roomId}] Таймер возобновлен. Осталось: ${remainingMs}мс`);
        this.startPhaseTimer(remainingMs, 'next_turn');
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
        avatarFrame: player.avatarFrame,
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
      round: this.round,
      turnEndsInMs: this.turnExpiresAt > 0 ? Math.max(0, this.turnExpiresAt - Date.now()) : 0,
      players: sanitizedPlayers,
    };
  }

  nextTurn() {
    try {
      const playerIds = Object.keys(this.players);
      this.activeTurn = playerIds.find((id) => id !== String(this.activeTurn));
      if (String(this.activeTurn) === String(this.initialPlayer)) {
        this.round++;
      }
      const currentPlayer = this.players[this.activeTurn];

      currentPlayer.maxMana = Math.min(currentPlayer.maxMana + 1, 10);
      currentPlayer.mana = currentPlayer.maxMana;

      let cardsNeeded = STARTING_CARDS_COUNT - currentPlayer.hand.length;
      let fatigueAppliedThisTurn = false;

      while (cardsNeeded > 0) {
        if (currentPlayer.deck.length > 0) {
          currentPlayer.hand.push(currentPlayer.deck.shift());
        } else {
          if (!fatigueAppliedThisTurn) {
            currentPlayer.fatigue += 1;
            currentPlayer.hp -= currentPlayer.fatigue;
            fatigueAppliedThisTurn = true;

            for (const pId of Object.keys(this.players)) {
              this.emitToPlayer(pId, 'fatigue_damage', {
                playerId: this.activeTurn,
                damage: currentPlayer.fatigue,
                hpAfter: currentPlayer.hp,
              });
            }

            if (currentPlayer.hp <= 0) {
              const winnerId = playerIds.find((id) => id !== String(this.activeTurn));
              this.endGame(winnerId);
              return;
            }
          }
          break;
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

  _hasTrait(card, trait) {
    return Array.isArray(card?.traits) && card.traits.includes(trait);
  }

  _consumeTrait(card, trait) {
    if (!Array.isArray(card?.traits)) return;
    const index = card.traits.indexOf(trait);
    if (index !== -1) card.traits.splice(index, 1);
  }

  _removeDeadCards(player) {
    player.table = player.table.filter((c) => c.defense > 0);
  }

  _resolveAvatarTarget(targetId, casterId, opponentId) {
    if (!targetId) return null;
    if (String(targetId) === String(casterId)) return this.players[String(casterId)];
    if (String(targetId) === String(opponentId)) return this.players[String(opponentId)];
    return null;
  }

  _resolveCardTarget(targetId, caster, opponent) {
    if (!targetId) return null;

    const friendly = caster.table.find((c) => c.instanceId === targetId);
    if (friendly) return { owner: caster, card: friendly };

    const enemy = opponent.table.find((c) => c.instanceId === targetId);
    if (enemy) return { owner: opponent, card: enemy };

    return null;
  }

  _applySpellEffect(casterId, opponentId, caster, opponent, card, targetData = {}) {
    const effect = card?.spellEffect;
    const spellValue = Number(card?.spellValue ?? 0);
    const spellStats = card?.spellStats || {};
    const targetType = targetData?.targetType;
    const targetId = targetData?.targetId;

    switch (effect) {
      case 'add_mana': {
        caster.mana = Math.min(10, caster.mana + spellValue);
        return { ok: true };
      }
      case 'damage': {
        if (targetType !== 'card' && targetType !== 'avatar') {
          return { ok: false, message: 'Invalid spell target.' };
        }

        if (targetType === 'avatar') {
          const targetPlayer = this._resolveAvatarTarget(targetId, casterId, opponentId);
          if (!targetPlayer) return { ok: false, message: 'Invalid spell target.' };

          targetPlayer.hp -= spellValue;
          if (targetPlayer.hp <= 0) {
            const winnerId =
              String(targetPlayer === caster ? opponentId : casterId) || String(casterId);
            this.endGame(winnerId);
            return { ok: true, gameOver: true };
          }
          return { ok: true };
        }

        const resolved = this._resolveCardTarget(targetId, caster, opponent);
        if (!resolved) return { ok: false, message: 'Invalid spell target.' };

        resolved.card.defense -= spellValue;
        if (resolved.card.defense <= 0) this._removeDeadCards(resolved.owner);
        return { ok: true };
      }
      case 'heal_card': {
        if (targetType !== 'card') return { ok: false, message: 'Invalid spell target.' };
        const targetCard = caster.table.find((c) => c.instanceId === targetId);
        if (!targetCard) return { ok: false, message: 'Invalid spell target.' };

        targetCard.defense += spellValue;
        return { ok: true };
      }
      case 'buff_card': {
        if (targetType !== 'card') return { ok: false, message: 'Invalid spell target.' };
        const targetCard = caster.table.find((c) => c.instanceId === targetId);
        if (!targetCard) return { ok: false, message: 'Invalid spell target.' };

        const attackBuff = Number(spellStats.attack ?? 0);
        const defenseBuff = Number(spellStats.defense ?? 0);
        targetCard.attack += attackBuff;
        targetCard.defense += defenseBuff;
        return { ok: true };
      }
      case 'heal_avatar': {
        caster.hp += spellValue;
        return { ok: true };
      }
      default:
        return { ok: false, message: 'Unknown spell effect.' };
    }
  }

  playCard(playerId, cardInstanceId, targetIndex, targetId, targetType) {
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

    if (card.type !== 'unit' && card.type !== 'spell') {
      this.emitToPlayer(playerId, 'error', { message: 'Unknown card type.' });
      return;
    }

    if (card.type === 'spell') {
      const opponentId = this.getOpponentId(playerId);
      const opponent = opponentId ? this.players[opponentId] : null;
      if (!opponent) return;

      const effectResult = this._applySpellEffect(
        playerId,
        opponentId,
        activePlayer,
        opponent,
        card,
        { targetId, targetType }
      );

      if (!effectResult.ok) {
        this.emitToPlayer(playerId, 'error', {
          message: effectResult.message || 'Invalid spell target.',
        });
        return;
      }

      activePlayer.mana -= card.cost;
      activePlayer.hand.splice(cardIndex, 1);

      for (const targetPlayerId of Object.keys(this.players)) {
        this.emitToPlayer(targetPlayerId, 'spell_cast', {
          casterId: playerId,
          card,
          targetId,
          targetType,
        });
      }

      if (this.status === 'finished' || effectResult.gameOver) return;
      this.broadcastState();
      return;
    }

    if (activePlayer.table.length >= 7) {
      this.emitToPlayer(playerId, 'error', { message: 'There is no space on the table!' });
      return;
    }

    activePlayer.mana -= card.cost;
    activePlayer.hand.splice(cardIndex, 1);

    card.canAttack = this._hasTrait(card, 'charge');

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

    const hasTaunt = opponentPlayer.table.some((c) => this._hasTrait(c, 'taunt'));

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

      if (hasTaunt && !this._hasTrait(targetCard, 'taunt')) {
        this.emitToPlayer(playerId, 'error', { message: 'You must attack a card with Taunt!' });
        return;
      }

      targetCard.defense -= attackerCard.attack;
      attackerCard.defense -= targetCard.attack;

      let attackerUsedPoison = false;
      let defenderUsedPoison = false;

      if (this._hasTrait(attackerCard, 'poison') && attackerCard.attack > 0) {
        targetCard.defense = 0;
        attackerUsedPoison = true;
      }
      if (this._hasTrait(targetCard, 'poison') && targetCard.attack > 0) {
        attackerCard.defense = 0;
        defenderUsedPoison = true;
      }

      attackerCard.canAttack = false;

      if (attackerUsedPoison) this._consumeTrait(attackerCard, 'poison');
      if (defenderUsedPoison) this._consumeTrait(targetCard, 'poison');

      this._removeDeadCards(attackerPlayer);
      this._removeDeadCards(opponentPlayer);
    } else {
      this.emitToPlayer(playerId, 'error', { message: 'Invalid attack target.' });
      return;
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

    this.broadcastState();

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

    this.gameOverResult = {
      winnerId: winnerId,
      ratingChange: ratingChange,
      duration: durationSeconds,
    };

    for (const playerId of Object.keys(this.players)) {
      this.emitToPlayer(playerId, 'game_over', this.gameOverResult);
    }
  }
}
