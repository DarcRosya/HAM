import { socketService } from '../services/socket.js';
import { renderCard } from '../components/Card.js';
import { store } from '../core/store.js';

// --- Глобальное состояние компонента ---
let isMounted = false;
let isMatchStarted = false;
let draggingAttackId = null;
let latestState = null;
let battleSocket = null;
let turnInterval = null;
let opponentStatusTimeout = null;
let elements = {};

let watchdogTimer = null;

const COIN_TOSS_DURATION_MS = 7500;

// --- Жизненный цикл ---

export function mount() {
  if (isMounted) return;
  isMounted = true;
  console.log('%c[BATTLE] mount() вызван', 'background: #440000; color: #ffaaaa');

  elements = {
    loader: document.getElementById('battle-loader'),
    battleContainer: document.querySelector('.battle-container'),
    coinOverlay: document.getElementById('coin-toss-overlay'),
    coin: document.querySelector('.coin'),
    endTurnBtn: document.getElementById('end-turn-btn'),
    surrenderBtn: document.getElementById('surrender-btn'),
    opponentStatus: document.getElementById('opponent-connection-status'),
    opponentStatusText: document.getElementById('opponent-connection-text'),
    battleMessage: document.getElementById('battle-message'),
    timerDisplay: document.getElementById('info-timer'),
  };

  if (elements.loader) elements.loader.classList.remove('hidden');
  if (elements.coinOverlay) elements.coinOverlay.style.display = 'none';

  battleSocket = socketService.connect();
  attachSocketListeners();

  if (elements.endTurnBtn) elements.endTurnBtn.addEventListener('click', handleEndTurnClick);
  if (elements.surrenderBtn) elements.surrenderBtn.addEventListener('click', handleSurrenderClick);
  window.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('mousemove', handleMouseMove);

  const pendingStateStr = store.getPendingMatchState();
  if (pendingStateStr) {
    const cachedState = JSON.parse(pendingStateStr);

    startMatch(cachedState);

    watchdogTimer = setTimeout(() => {
      console.warn('Сервер не ответил. Бой мертв.');
      store.clearMatchState();
      window.location.replace('#lobby');
    }, 3000);

    if (battleSocket.connected) {
      battleSocket.emit('join-lobby');
    } else {
      battleSocket.once('connect', () => battleSocket.emit('join-lobby'));
    }
  }
}

export function unmount() {
  if (!isMounted) return;
  isMounted = false;
  isMatchStarted = false;

  if (watchdogTimer) clearTimeout(watchdogTimer);
  if (turnInterval) clearInterval(turnInterval);
  if (opponentStatusTimeout) clearTimeout(opponentStatusTimeout);

  window.removeEventListener('mouseup', handleMouseUp);
  window.removeEventListener('mousemove', handleMouseMove);
  if (elements.endTurnBtn) elements.endTurnBtn.removeEventListener('click', handleEndTurnClick);
  if (elements.surrenderBtn)
    elements.surrenderBtn.removeEventListener('click', handleSurrenderClick);

  // 3. Отписываемся от сокет-событий боя
  detachSocketListeners();
  socketService.disconnect();

  [
    'opp-hp',
    'player-hp',
    'opp-mana',
    'player-mana',
    'opp-field-count',
    'player-field-count',
    'player-hand-count',
    'player-deck',
    'opp-deck',
    'my-table',
    'opp-table',
    'opp-hand',
    'hand-display',
    'info-turn',
    'info-round',
    'info-timer',
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  // 4. Зачищаем ссылки
  watchdogTimer = null;
  turnInterval = null;
  opponentStatusTimeout = null;
  draggingAttackId = null;
  latestState = null;
  elements = {};
}

// --- Обработчики Сокетов ---

function attachSocketListeners() {
  detachSocketListeners(); // Защита от дублей
  battleSocket.on('error', handleError);
  battleSocket.on('match_found', handleMatchFound);
  battleSocket.on('force-reconnect', handleForceReconnect);
  battleSocket.on('game_state', handleGameState);
  battleSocket.on('game_over', handleGameOver);
  battleSocket.on('opponent-disconnected', handleOpponentDisconnected);
  battleSocket.on('opponent-reconnected', handleOpponentReconnected);
  battleSocket.on('match_not_found', handleMatchNotFound);
}

function detachSocketListeners() {
  if (!battleSocket) return;
  battleSocket.off('error', handleError);
  battleSocket.off('match_found', handleMatchFound);
  battleSocket.off('force-reconnect', handleForceReconnect);
  battleSocket.off('game_state', handleGameState);
  battleSocket.off('game_over', handleGameOver);
  battleSocket.off('opponent-disconnected', handleOpponentDisconnected);
  battleSocket.off('opponent-reconnected', handleOpponentReconnected);
  battleSocket.off('match_not_found', handleMatchNotFound);
}

// --- Логика Боя ---

const resolvePlayers = (state, socket) => {
  const entries = Object.entries(state?.players ?? {});
  if (entries.length === 0) return { myPlayerId: null, me: null, opponentId: null, opponent: null };

  const user = store.getUser();
  const normalizedLocalId = user?.id ? String(user.id) : null;

  const myEntry =
    (normalizedLocalId ? entries.find(([id]) => String(id) === normalizedLocalId) : null) ||
    entries.find(([, player]) => player.socketId === socket.id) ||
    entries.find(([id]) => String(id) === String(socket.id));

  if (!myEntry) return { myPlayerId: null, me: null, opponentId: null, opponent: null };

  const [myPlayerId, me] = myEntry;
  const opponentEntry = entries.find(([id]) => String(id) !== String(myPlayerId));
  const [opponentId, opponent] = opponentEntry ?? [];

  return { myPlayerId, me, opponentId, opponent };
};

const startLocalTimer = (seconds) => {
  if (turnInterval) clearInterval(turnInterval);
  let remaining = seconds;
  if (!elements.timerDisplay) return;

  elements.timerDisplay.textContent = remaining;
  turnInterval = setInterval(() => {
    remaining--;
    elements.timerDisplay.textContent = Math.max(0, remaining);
    if (remaining <= 0) {
      clearInterval(turnInterval);
      turnInterval = null;
    }
  }, 1000);
};

function revealBattleUI() {
  if (elements.loader) {
    elements.loader.classList.add('hidden');
  }
  if (elements.battleContainer) {
    elements.battleContainer.classList.add('is-visible');
    elements.battleContainer.style.opacity = '1';
    elements.battleContainer.style.pointerEvents = 'auto';
  }
}

const resetCoinOverlay = () => {
  if (!elements.coinOverlay) return;
  elements.coinOverlay.classList.remove('is-active');
  elements.coinOverlay.setAttribute('aria-hidden', 'true');
  elements.coinOverlay.style.display = 'none';
  setTimeout(() => {
    if (elements.coin) elements.coin.classList.remove('coin--you', 'coin--opp');
  }, 300);
};

function setBattleFrozenState(isFrozen, message) {
  const playerSection = document.getElementById('player-section');
  let overlay = document.getElementById('freeze-overlay');

  if (isFrozen) {
    if (playerSection) {
      playerSection.style.pointerEvents = 'none';
      playerSection.style.opacity = '0.5';
    }
    if (turnInterval) {
      clearInterval(turnInterval);
      turnInterval = null;
    }
    if (overlay) {
      overlay.innerHTML = message || 'Opponent disconnected...<br>Waiting for reconnect.';
      overlay.style.display = 'block';
    }
  } else {
    if (playerSection) {
      playerSection.style.pointerEvents = 'auto';
      playerSection.style.opacity = '1';
    }
    if (overlay) overlay.style.display = 'none';
  }
}

const showBattleMessage = (text) => {
  if (!elements.battleMessage) return;
  elements.battleMessage.textContent = text;
  elements.battleMessage.classList.remove('hidden');
  setTimeout(() => elements.battleMessage.classList.add('hidden'), 2000);
};

const showOpponentStatus = (message, { autoHideMs = 0 } = {}) => {
  if (!elements.opponentStatus || !elements.opponentStatusText) return;
  if (opponentStatusTimeout) clearTimeout(opponentStatusTimeout);

  elements.opponentStatusText.textContent = message;
  elements.opponentStatus.classList.remove('hidden');

  if (autoHideMs > 0) {
    opponentStatusTimeout = setTimeout(() => {
      elements.opponentStatus?.classList.add('hidden');
    }, autoHideMs);
  }
};

const hideOpponentStatus = () => {
  if (opponentStatusTimeout) clearTimeout(opponentStatusTimeout);
  elements.opponentStatus?.classList.add('hidden');
};

// --- Обработчики игровых событий ---

const startMatch = async (state, { skipCoinToss = false } = {}) => {
  isMatchStarted = true;
  latestState = state;
  store.setMatchState(state);

  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }

  revealBattleUI();

  const isFresh = localStorage.getItem('matchIsFresh') === 'true';
  const alreadyTossed = store.hasObservedCoinToss(state.roomId);

  if (isFresh) {
    localStorage.removeItem('matchIsFresh'); // Сжигаем билет, вторая вкладка его уже не получит
  }

  const shouldSkip = alreadyTossed || !isFresh;

  console.log('%c[BATTLE] Старт матча:', 'color: yellow', { alreadyTossed, isFresh, shouldSkip });

  if (!elements.coinOverlay || !elements.coin || shouldSkip) {
    console.log('%c[BATTLE] Пропуск анимации монетки!', 'color: yellow');
    resetCoinOverlay();
    startLocalTimer(state.turnTimer);
    updateBattleUI(state, battleSocket);
    store.markCoinTossObserved(state.roomId);
    return;
  }

  console.log('%c[BATTLE] Запуск честной анимации монетки!', 'color: yellow');

  const { myPlayerId, me, opponent } = resolvePlayers(state, battleSocket);
  if (!myPlayerId || !me || !opponent) {
    updateBattleUI(state, battleSocket);
    return;
  }

  // Возвращаем видимость по CSS (убираем инлайн display: none) и стартуем
  elements.coinOverlay.style.display = '';
  elements.coinOverlay.classList.add('is-active');
  elements.coinOverlay.setAttribute('aria-hidden', 'false');
  elements.coin.classList.remove('coin--you', 'coin--opp');
  void elements.coin.offsetWidth;

  const isMyTurn = String(state.activeTurn) === String(myPlayerId);
  elements.coin.classList.add(isMyTurn ? 'coin--you' : 'coin--opp');

  await new Promise((resolve) => setTimeout(resolve, COIN_TOSS_DURATION_MS));
  if (!isMounted) return;

  if (!store.isInBattle()) {
    console.warn(
      '%c[BATTLE] Матч отменен во время анимации монетки. Остановка рендера.',
      'color: #ffaa00'
    );
    resetCoinOverlay();
    return;
  }

  store.markCoinTossObserved(state.roomId);
  resetCoinOverlay();

  startLocalTimer(latestState.turnTimer);
  updateBattleUI(latestState, battleSocket);
};

const handleMatchFound = (state) => {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  if (!isMatchStarted) {
    startMatch(state);
  } else {
    handleGameState(state);
  }
};

function handleMatchNotFound() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  store.clearMatchState();
  window.location.replace('#lobby');
}

const handleForceReconnect = (state) => {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  if (!isMatchStarted) {
    startMatch(state);
  } else {
    handleGameState(state);
  }
};

const handleError = (data) => {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  showBattleMessage(data.message);
  if (
    typeof data.message === 'string' &&
    (data.message.toLowerCase().includes('not found') ||
      data.message.toLowerCase().includes('over'))
  ) {
    store.clearMatchState();
    window.location.replace('#lobby');
  }
};

const handleGameState = (state) => {
  if (!store.isInBattle()) return;

  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  latestState = state;
  store.setMatchState(state);
  revealBattleUI();

  if (state.turnTimer !== undefined) startLocalTimer(state.turnTimer);

  const { opponent } = resolvePlayers(state, battleSocket);
  if (opponent && opponent.isConnected === false) {
    setBattleFrozenState(true, 'Opponent disconnected...<br>Waiting for reconnect.');
  } else {
    setBattleFrozenState(false);
  }

  updateBattleUI(state, battleSocket);
};

const handleOpponentDisconnected = (payload = {}) => {
  const remainingAttempts = Number(payload.remainingAttempts ?? payload.attemptsLeft ?? 0);
  const maxAttempts = Number(payload.maxAttempts ?? 3);
  const waitText = Number.isFinite(payload.graceSeconds) ? payload.graceSeconds : 30;

  setBattleFrozenState(true);
  showOpponentStatus(
    `Opponent disconnected. Waiting ${waitText}s. Attempts left: ${remainingAttempts} / ${maxAttempts}.`
  );
};

const handleOpponentReconnected = (payload = {}) => {
  const remainingAttempts = Number(payload.remainingAttempts ?? payload.attemptsLeft ?? 0);
  const maxAttempts = Number(payload.maxAttempts ?? 3);

  setBattleFrozenState(false);
  showOpponentStatus(
    `Opponent reconnected. Attempts left: ${remainingAttempts} / ${maxAttempts}.`,
    { autoHideMs: 2500 }
  );
};

const handleGameOver = ({ winnerId }) => {
  hideOpponentStatus();
  store.clearMatchState();

  const { myPlayerId } = resolvePlayers(latestState, battleSocket);
  const myId = myPlayerId ?? battleSocket.id;
  const message = String(winnerId) === String(myId) ? 'You won!' : 'You lost!';

  const overlay = document.getElementById('game-result-overlay');
  const text = document.getElementById('result-text');
  const btn = document.getElementById('return-lobby-btn');

  if (overlay && text && btn) {
    overlay.classList.remove('hidden');
    text.textContent = message;
    btn.disabled = true;

    setTimeout(() => {
      btn.disabled = false;
    }, 2000);
    const redirectTimeout = setTimeout(() => {
      window.location.hash = '#lobby';
    }, 10000);

    btn.onclick = () => {
      clearTimeout(redirectTimeout);
      window.location.hash = '#lobby';
    };
  } else {
    // Резервный переход, если DOM не загружен
    window.location.hash = '#lobby';
  }
};

// --- Взаимодействие игрока (Кнопки и мышь) ---

const handleEndTurnClick = () => {
  if (!latestState) return;
  const { myPlayerId } = resolvePlayers(latestState, battleSocket);
  const myId = myPlayerId ?? battleSocket.id;

  if (String(latestState.activeTurn) === String(myId)) {
    battleSocket.emit('end_turn');
  } else {
    showBattleMessage('Not your turn!');
  }
};

const handleSurrenderClick = () => {
  if (!latestState) return;
  battleSocket.emit('surrender', { roomId: latestState.roomId });
};

const handleMouseUp = (e) => {
  if (!draggingAttackId || !latestState) return;

  const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
  const cardTarget = elementBelow?.closest('.enemy-card');
  const avatarTarget = elementBelow?.closest('#opp-avatar');

  if (cardTarget) {
    battleSocket.emit('attack_target', {
      roomId: latestState.roomId,
      attackerInstanceId: draggingAttackId,
      targetId: cardTarget.dataset.instanceId,
      targetType: 'card',
    });
  } else if (avatarTarget) {
    battleSocket.emit('attack_target', {
      roomId: latestState.roomId,
      attackerInstanceId: draggingAttackId,
      targetId: null,
      targetType: 'avatar',
    });
  }

  draggingAttackId = null;
};

const handleMouseMove = (e) => {
  if (draggingAttackId) {
    // В будущем здесь можно добавить визуальную линию атаки
  }
};

// --- Рендер UI ---

function updateBattleUI(state, socket) {
  const { myPlayerId, me, opponent } = resolvePlayers(state, socket);
  if (!myPlayerId || !me || !opponent) return;

  const isMyTurn = String(state.activeTurn) === String(myPlayerId);

  document.getElementById('info-turn').textContent = isMyTurn ? 'YOUR TURN' : "OPPONENT'S TURN";
  document.getElementById('info-round').textContent = state.round ?? 1;

  document.getElementById('opp-hp').textContent = opponent.hp;
  document.getElementById('player-hp').textContent = me.hp;
  document.getElementById('opp-mana').textContent = `${opponent.mana} / ${opponent.maxMana}`;
  document.getElementById('player-mana').textContent = `${me.mana} / ${me.maxMana}`;
  document.getElementById('opp-field-count').textContent = opponent.table.length;
  document.getElementById('player-field-count').textContent = me.table.length;
  document.getElementById('player-hand-count').textContent = me.hand.length;

  const playerDeck = document.getElementById('player-deck');
  const oppDeck = document.getElementById('opp-deck');
  playerDeck.textContent = me.deckCount;
  oppDeck.textContent = opponent.deckCount;

  const fatigueInfo = document.getElementById('fatigue-info');
  const fatigueValue = document.getElementById('fatigue-value');

  if (me.fatigue > 0) {
    fatigueInfo.classList.remove('hidden');
    fatigueValue.textContent = me.fatigue;
    playerDeck.classList.add('deck-fatigue');
  } else {
    fatigueInfo.classList.add('hidden');
    playerDeck.classList.remove('deck-fatigue');
  }

  opponent.fatigue > 0
    ? oppDeck.classList.add('deck-fatigue')
    : oppDeck.classList.remove('deck-fatigue');

  const myTable = document.getElementById('my-table');
  const oppTable = document.getElementById('opp-table');
  myTable.innerHTML = '';
  oppTable.innerHTML = '';

  me.table.forEach((card) => {
    const div = document.createElement('div');
    div.className = 'card-slot';
    div.textContent = `${card.name} | atk ${card.attack} | def ${card.defense} | cost ${card.cost}`;

    if (card.canAttack && isMyTurn) {
      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        draggingAttackId = card.instanceId;
      });
    }
    myTable.appendChild(div);
  });

  opponent.table.forEach((card) => {
    const div = document.createElement('div');
    div.className = 'card-slot enemy-card';
    div.dataset.instanceId = card.instanceId;
    div.textContent = `${card.name} | atk ${card.attack} | def ${card.defense} | cost ${card.cost}`;
    oppTable.appendChild(div);
  });

  const oppHand = document.getElementById('opp-hand');
  oppHand.innerHTML = '';
  for (let i = 0; i < opponent.handCount; i++) {
    const back = document.createElement('div');
    back.className = 'card-back';
    back.textContent = 'Card back';
    oppHand.appendChild(back);
  }

  const handDisplay = document.getElementById('hand-display');
  handDisplay.innerHTML = '';
  me.hand.forEach((card) => {
    const cardUI = renderCard({ label: card.name });
    cardUI.addEventListener('click', () => {
      if (isMyTurn) {
        socket.emit('play_card', { roomId: state.roomId, cardInstanceId: card.instanceId });
      } else {
        showBattleMessage('Wait for your turn!');
      }
    });
    handDisplay.appendChild(cardUI);
  });
}
