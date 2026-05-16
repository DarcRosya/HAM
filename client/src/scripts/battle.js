import { socketService } from '../services/socket.js';
import { renderCard } from '../components/Card.js';
import { store } from '../core/store.js';

// --- Глобальное состояние компонента ---
let isMounted = false;
let isMatchStarted = false;

let draggingAttackId = null;
let draggingPlayCardId = null;
let dragGhostElement = null;

let latestState = null;
let battleSocket = null;
let turnInterval = null;

let opponentStatusTimeout = null;
let battleMessageTimeout = null;
let tooltipTimeout = null;

let elements = {};

let activeTooltipElement = null;

let watchdogTimer = null;

let hoveredCardCost = 0;
let pendingGameState = null;
let isAnimationPlaying = false;
let attackReticle = null;
let lastDropCoords = null;

const COIN_TOSS_DURATION_MS = 7500;

const TRAITS_DESC = {
  taunt: { title: 'Taunt', desc: 'Enemies must attack this unit first.' },
  charge: { title: 'Charge', desc: 'Can attack the same turn it is played.' },
  // Сюда будешь добавлять новые механики по мере развития игры
};

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
  if (!document.getElementById('attack-reticle')) {
    attackReticle = document.createElement('div');
    attackReticle.id = 'attack-reticle';
    attackReticle.className = 'attack-reticle';
    document.body.appendChild(attackReticle);
  } else {
    attackReticle = document.getElementById('attack-reticle');
  }

  const svgArrow = document.getElementById('attack-arrow-svg');
  if (svgArrow && svgArrow.parentNode !== document.body) {
    document.body.appendChild(svgArrow);
    svgArrow.style.position = 'fixed';
  }
}

export function unmount() {
  if (!isMounted) return;
  isMounted = false;
  isMatchStarted = false;

  if (watchdogTimer) clearTimeout(watchdogTimer);
  if (turnInterval) clearInterval(turnInterval);
  if (opponentStatusTimeout) clearTimeout(opponentStatusTimeout);
  if (battleMessageTimeout) clearTimeout(battleMessageTimeout);
  if (attackReticle) {
    attackReticle.remove();
    attackReticle = null;
  }

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
    'player-table',
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
  pendingGameState = null;
  isAnimationPlaying = false;
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
  battleSocket.on('opponent_attack', handleOpponentAttack);
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
  battleSocket.off('opponent_attack', handleOpponentAttack);
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
  const overlay = document.getElementById('freeze-overlay');
  const freezeText = document.getElementById('freeze-text');

  if (isFrozen) {
    if (turnInterval) {
      clearInterval(turnInterval);
      turnInterval = null;
    }
    if (overlay && freezeText) {
      freezeText.innerHTML = message || 'Opponent disconnected...<br>Waiting for reconnect.';
      overlay.classList.remove('hidden');
    }
  } else {
    if (overlay) {
      overlay.classList.add('hidden');
    }
  }
}

const showBattleMessage = (text) => {
  if (!elements.battleMessage) return;

  const msgEl = elements.battleMessage;

  if (battleMessageTimeout) {
    clearTimeout(battleMessageTimeout);
  }

  // Если текст тот же самый и плашка УЖЕ висит -> слабая встряска
  if (msgEl.textContent === text && msgEl.classList.contains('show')) {
    msgEl.classList.remove('shake', 'strong-pop');
    void msgEl.offsetWidth; // Жесткий рефлоу для перезапуска анимации
    msgEl.classList.add('shake');
  } else {
    // Новая ошибка -> сильный вылет (pop)
    msgEl.classList.remove('shake', 'strong-pop');
    msgEl.textContent = text;
    void msgEl.offsetWidth;
    msgEl.classList.add('show', 'strong-pop');
  }

  battleMessageTimeout = setTimeout(() => {
    msgEl.classList.remove('show', 'shake', 'strong-pop');
    battleMessageTimeout = null;
  }, 2500);
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

  if (isAnimationPlaying) {
    pendingGameState = state;
  } else {
    updateBattleUI(state, battleSocket);
  }
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

function handleOpponentAttack({ attackerInstanceId, targetId, targetType }) {
  console.log('%c[BATTLE] ВНИМАНИЕ! Оппонент атакует!', 'color: #ff3333; font-weight: bold;', {
    attackerInstanceId,
    targetId,
    targetType,
  });

  if (!store.isInBattle()) return;

  const attackerEl = document.querySelector(`[data-instance-id="${attackerInstanceId}"]`);

  let targetEl = null;
  if (targetType === 'avatar') {
    targetEl = document.getElementById('player-avatar') || document.getElementById('player-hp');
  } else {
    targetEl = document.querySelector(`[data-instance-id="${targetId}"]`);
  }

  if (!attackerEl) {
    return;
  }
  if (!targetEl) {
    return;
  }

  isAnimationPlaying = true;

  playAttackAnimation(attackerEl, targetEl, null, () => {
    isAnimationPlaying = false;
    if (pendingGameState) {
      updateBattleUI(pendingGameState, battleSocket);
      pendingGameState = null;
    }
  });
}

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
  if (draggingAttackId) {
    const svg = document.getElementById('attack-arrow-svg');
    if (svg) {
      svg.style.display = 'none';
      svg.style.pointerEvents = 'none';
    }

    const attackerEl = document.querySelector(`[data-instance-id="${draggingAttackId}"]`);

    if (latestState) {
      const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
      const isForbidden = elementBelow?.closest('.forbidden-target');
      if (isForbidden) {
        showBattleMessage('You must attack a unit with Taunt!');
      } else {
        const cardTarget = elementBelow?.closest('.enemy-card:not(.forbidden-target)');
        let avatarTarget = elementBelow?.closest(
          '#opp-avatar-zone, #opp-avatar, #opp-health-zone, #opp-username-zone'
        );
        if (avatarTarget && avatarTarget.closest('.forbidden-target')) avatarTarget = null;

        const selfTarget = elementBelow?.closest(
          '#player-avatar, #player-hp, #player-username-zone, #player-table-zone .card-slot, #player-mana-zone'
        );

        if (selfTarget) {
          showBattleMessage("You can't attack yourself!");
        } else if (cardTarget || avatarTarget) {
          const targetId = cardTarget ? cardTarget.dataset.instanceId : null;
          const targetType = cardTarget ? 'card' : 'avatar';
          const targetEl = cardTarget || avatarTarget;
          const attackIdToSend = draggingAttackId;
          document.body.style.pointerEvents = 'none';
          playAttackAnimation(
            attackerEl,
            targetEl,
            () => {
              battleSocket.emit('attack_target', {
                roomId: latestState.roomId,
                attackerInstanceId: attackIdToSend,
                targetId: targetId,
                targetType: targetType,
              });
            },
            () => {
              document.body.style.pointerEvents = 'auto';
            }
          );
        }
      }
    }

    if (attackerEl) {
      attackerEl.classList.remove('is-attacking-active');
    }
    if (attackReticle) {
      attackReticle.classList.remove('show', 'snapped', 'lethal');
    }
    document.querySelectorAll('.taunt-target-glow').forEach((el) => {
      el.classList.remove('taunt-target-glow');
    });
    document.querySelectorAll('.forbidden-target').forEach((el) => {
      el.classList.remove('forbidden-target');
    });

    draggingAttackId = null;
  }

  if (draggingPlayCardId && latestState) {
    const tableZone = document.getElementById('player-table-zone');
    const dropTarget = document.elementFromPoint(e.clientX, e.clientY);

    const isOverTable =
      dropTarget?.closest('#player-table-zone') || dropTarget?.closest('.player-table');

    if (isOverTable && tableZone) {
      lastDropCoords = { x: e.clientX, y: e.clientY };
      const existingCards = Array.from(tableZone.querySelectorAll('.card-board'));
      let targetIndex = existingCards.length;

      for (let i = 0; i < existingCards.length; i++) {
        const rect = existingCards[i].getBoundingClientRect();
        const cardCenter = rect.left + rect.width / 2;
        if (e.clientX < cardCenter) {
          targetIndex = i;
          break;
        }
      }

      battleSocket.emit('play_card', {
        roomId: latestState.roomId,
        cardInstanceId: draggingPlayCardId,
        targetIndex: targetIndex,
      });
    }

    if (dragGhostElement) {
      dragGhostElement.remove();
      dragGhostElement = null;
    }

    draggingPlayCardId = null;
    updateBattleUI(latestState, battleSocket);
  }
};

const handleMouseMove = (e) => {
  if (draggingAttackId) {
    const line = document.getElementById('attack-line');

    if (line) {
      const attackerEl = document.querySelector(`[data-instance-id="${draggingAttackId}"]`);
      if (attackerEl) {
        const aRect = attackerEl.getBoundingClientRect();
        const startX = aRect.left + aRect.width / 2;
        const startY = aRect.top + aRect.height / 2;
        const endX = e.clientX;
        const endY = e.clientY;

        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        const dx = endX - startX;
        const dy = endY - startY;
        const curveAmount = 0.2;
        const ctrlX = midX - dy * curveAmount;
        const ctrlY = midY + dx * curveAmount;

        line.setAttribute('d', `M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`);
      }
    }

    if (attackReticle) {
      const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
      const cardTarget = elementBelow?.closest('.enemy-card:not(.forbidden-target)');
      let avatarTarget = elementBelow?.closest(
        '#opp-avatar-zone, #opp-avatar, #opp-health-zone, #opp-username-zone'
      );
      if (avatarTarget && avatarTarget.closest('.forbidden-target')) avatarTarget = null;
      const selfTarget = elementBelow?.closest(
        '#player-avatar, #player-hp, #player-username-zone, #player-table-zone .card-slot, #player-mana-zone'
      );

      if ((cardTarget || avatarTarget) && !selfTarget) {
        const targetEl = cardTarget || document.getElementById('opp-avatar-zone');
        const targetRect = targetEl.getBoundingClientRect();
        attackReticle.style.left = `${targetRect.left + targetRect.width / 2}px`;
        attackReticle.style.top = `${targetRect.top + targetRect.height / 2}px`;
        attackReticle.classList.add('snapped');
        let isLethal = false;
        const attackerEl = document.querySelector(`[data-instance-id="${draggingAttackId}"]`);
        if (attackerEl) {
          const atkDamage = parseInt(
            attackerEl.querySelector('.token-attack')?.textContent || '0',
            10
          );
          let targetHp = 999;
          if (cardTarget) {
            targetHp = parseInt(cardTarget.querySelector('.token-defense')?.textContent || '0', 10);
          } else {
            targetHp = parseInt(document.getElementById('opp-hp')?.textContent || '0', 10);
          }
          if (atkDamage >= targetHp) isLethal = true;
        }

        if (isLethal) {
          attackReticle.classList.add('lethal');
        } else {
          attackReticle.classList.remove('lethal');
        }
      } else {
        attackReticle.style.left = `${e.clientX}px`;
        attackReticle.style.top = `${e.clientY}px`;
        attackReticle.classList.remove('snapped', 'lethal');
      }
    }
  }

  if (draggingPlayCardId && dragGhostElement) {
    dragGhostElement.style.left = e.clientX + 'px';
    dragGhostElement.style.top = e.clientY + 'px';
  }
};

function renderMana(containerId, currentMana, maxMana) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const isMyMana = containerId === 'player-mana-zone';
  const MAX_SEGMENTS = 10;

  // 1. Создаем универсальную колбу 1 раз
  let wrapper = container.querySelector('.flask-wrapper');
  if (!wrapper) {
    container.innerHTML = `
      <div class="flask-wrapper">
        <div class="flask-liquid-track">
          <div class="flask-liquid"></div>
          <div class="flask-preview"></div>
        </div>
        <img src="/assets/images/vertical-flask.png" class="flask-glass-overlay" alt="Mana Flask">
        <div class="mana-text-badge">0/0</div>
      </div>
    `;
    wrapper = container.querySelector('.flask-wrapper');
  }

  const textEl = container.querySelector('.mana-text-badge');
  const liquidEl = container.querySelector('.flask-liquid');
  const previewEl = container.querySelector('.flask-preview');

  textEl.textContent = `${currentMana}/${maxMana}`;

  // Высчитываем ширину
  const fillPercent = (currentMana / MAX_SEGMENTS) * 100;
  let previewPercent = 0;

  if (isMyMana && hoveredCardCost > 0 && currentMana >= hoveredCardCost) {
    previewPercent = (hoveredCardCost / MAX_SEGMENTS) * 100;
  }

  // Анимация налива и траты
  const currentWidth = parseFloat(liquidEl.style.width) || 0;
  if (fillPercent > currentWidth) {
    liquidEl.style.transition = 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)';
  } else {
    liquidEl.style.transition = 'width 0.25s ease-out';
  }

  liquidEl.style.width = `${fillPercent}%`;

  // Позиционируем красную зону сгорания над синей жидкостью
  if (previewPercent > 0) {
    previewEl.style.width = `${previewPercent}%`;
    // Отступ слева = (текущая мана - сгораемая мана) в процентах
    previewEl.style.left = `${fillPercent - previewPercent}%`;
    previewEl.style.display = 'block';
  } else {
    previewEl.style.display = 'none';
  }
}

function hideTooltip() {
  if (tooltipTimeout) {
    clearTimeout(tooltipTimeout);
    tooltipTimeout = null;
  }
  if (activeTooltipElement) {
    activeTooltipElement.remove();
    activeTooltipElement = null;
  }
}

function showTooltip(e, cardData, isBoard) {
  hideTooltip(); // На всякий случай чистим старый

  activeTooltipElement = document.createElement('div');
  activeTooltipElement.className = 'card-tooltip-container';

  let hasContent = false;

  // 1. Если мы на столе -> рисуем полноразмерную карту
  if (isBoard) {
    // Используем твой же renderCard, но просим вариант 'hand', чтобы нарисовало карту целиком
    const fullCard = renderCard({ ...cardData, variant: 'hand' });
    fullCard.style.position = 'relative';
    fullCard.style.margin = '0';
    fullCard.style.transform = 'none'; // Отключаем веерные стили
    activeTooltipElement.appendChild(fullCard);
    hasContent = true;
  }

  // 2. Если у карты есть traits -> рисуем плашки сбоку
  if (cardData.traits && cardData.traits.length > 0) {
    const traitsPanel = document.createElement('div');
    traitsPanel.className = 'traits-panel';

    cardData.traits.forEach((trait) => {
      const traitInfo = TRAITS_DESC[trait.toLowerCase()];
      if (traitInfo) {
        traitsPanel.innerHTML += `
          <div class="trait-item">
            <div class="trait-title">${traitInfo.title}</div>
            <div class="trait-desc">${traitInfo.desc}</div>
          </div>
        `;
        hasContent = true;
      }
    });
    activeTooltipElement.appendChild(traitsPanel);
  }

  // Если нечего показывать (например, в руке карта без трейтов) - отмена
  if (!hasContent) return;

  document.body.appendChild(activeTooltipElement); // Рендерим в DOM, чтобы получить реальные размеры окна

  const rect = e.target.closest('.card').getBoundingClientRect();
  const tooltipWidth = activeTooltipElement.offsetWidth;
  const tooltipHeight = activeTooltipElement.offsetHeight;

  if (isBoard) {
    // ДЛЯ СТОЛА: Строго по центру НАД картой
    const centerX = rect.left + rect.width / 2 - tooltipWidth / 2;
    const topY = rect.top - tooltipHeight - 15; // 15px зазор
    activeTooltipElement.style.left = `${centerX}px`;
    activeTooltipElement.style.top = `${topY}px`;
  } else {
    // ДЛЯ РУКИ: Сбоку, с защитой от вылета за экран
    const offsetX = 30;
    const offsetY = 10;
    const isTooFarRight = rect.right + tooltipWidth + offsetX > window.innerWidth;

    if (isTooFarRight) {
      activeTooltipElement.style.left = `${rect.left - tooltipWidth - offsetX}px`;
    } else {
      activeTooltipElement.style.left = `${rect.right + offsetX}px`;
    }
    activeTooltipElement.style.top = `${rect.top + offsetY}px`;
  }
}

// Функция-биндилка, которую мы будем вешать на карты
function bindTooltipEvents(cardUI, cardData, isBoard) {
  cardUI.addEventListener('mouseenter', (e) => {
    // Защита: если мы сейчас тащим карту или натягиваем стрелку атаки — тултипы не показываем!
    if (draggingPlayCardId || draggingAttackId) return;

    tooltipTimeout = setTimeout(() => {
      showTooltip(e, cardData, isBoard);
    }, 500); // 500мс задержка
  });

  cardUI.addEventListener('mouseleave', () => {
    hideTooltip();
  });

  cardUI.addEventListener('mousedown', () => {
    hideTooltip(); // Мгновенно прячем, если игрок решил схватить карту
  });
}

function applyFanMath(cardUI, index, total, isMyHand, isMyTurn) {
  // Карты по струнке не в наш ход
  if (isMyHand && !isMyTurn) {
    cardUI.style.setProperty('--fan-rot', '0deg');
    cardUI.style.setProperty('--fan-y', '0px');
    cardUI.style.setProperty('--fan-x', '0px');
    return;
  }

  // Симметричная математика для обеих рук
  const mid = (total - 1) / 2;
  const offset = index - mid;

  if (isMyHand) {
    // НАША РУКА (Крутим от низа, провисание вниз)
    const angleStep = 4.5; // Угол наклона каждой карты от центра
    const yStep = 4; // Провисание (насколько края ниже/выше центра)
    const xStep = 2; // Насколько сильно карты раздвигаются влево-вправо от центра
    // ==================================

    cardUI.style.setProperty('--fan-rot', `${offset * angleStep}deg`);
    cardUI.style.setProperty('--fan-y', `${Math.pow(Math.abs(offset), 2) * yStep}px`);
    cardUI.style.setProperty('--fan-x', `${offset * xStep}px`);
  } else {
    // РУКА ВРАГА (Крутим от верха, провисание вверх - отрицательный Y)
    const angleStep = -10.5;
    const yStep = -10; // Края уходят ВВЕРХ, создавая дугу
    const xStep = -45;

    cardUI.style.setProperty('--fan-rot', `${offset * angleStep}deg`);
    cardUI.style.setProperty('--fan-y', `${Math.pow(Math.abs(offset), 2) * yStep}px`);
    cardUI.style.setProperty('--fan-x', `${offset * xStep}px`);
  }
}

// --- Рендер UI ---

function updateBattleUI(state, socket) {
  const { myPlayerId, me, opponent } = resolvePlayers(state, socket);
  if (!myPlayerId || !me || !opponent) return;

  const isMyTurn = String(state.activeTurn) === String(myPlayerId);

  const safeSetText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  safeSetText('info-turn', isMyTurn ? 'YOUR TURN' : "OPPONENT'S TURN");

  // === ИМЕНА И ХП ===
  // Изменено: opp-username -> opp-username-zone
  safeSetText('opp-username-zone', opponent.displayedName || opponent.username || 'Opponent');
  safeSetText('opp-hp', opponent.hp);

  // Изменено: player-username -> player-username-zone
  safeSetText('player-username-zone', me.displayedName || me.username || 'You');
  safeSetText('player-hp', me.hp);

  // === МАНА ===
  // Изменено на новые контейнеры
  renderMana('opp-mana-zone', opponent.mana, opponent.maxMana);
  renderMana('player-mana-zone', me.mana, me.maxMana);

  // === КОЛОДЫ И АВАТАРЫ (Оставлена твоя логика) ===
  safeSetText('opp-deck', opponent.deckCount);
  const oppAvatar = document.getElementById('opp-avatar');
  if (oppAvatar && opponent.avatar) oppAvatar.src = opponent.avatar;

  const playerDeck = document.getElementById('player-deck');
  if (playerDeck) playerDeck.dataset.count = me.deckCount;

  const playerAvatar = document.getElementById('player-avatar');
  if (playerAvatar && me.avatar) playerAvatar.src = me.avatar;

  // === УСТАЛОСТЬ (Оставлена твоя логика) ===
  const fatigueInfo = document.getElementById('fatigue-info');
  if (fatigueInfo) {
    if (me.fatigue > 0) {
      fatigueInfo.classList.remove('hidden');
      safeSetText('fatigue-value', me.fatigue);
      if (playerDeck) playerDeck.style.filter = 'sepia(1) hue-rotate(300deg)';
    } else {
      fatigueInfo.classList.add('hidden');
      if (playerDeck) playerDeck.style.filter = 'none';
    }
  }

  // === РЕНДЕР СТОЛА ===
  // Изменено на новые контейнеры стола
  const myTable = document.getElementById('player-table-zone');
  const oppTable = document.getElementById('opp-table-zone');
  const oldMyCardIds = myTable
    ? Array.from(myTable.querySelectorAll('.card-slot')).map((el) => el.dataset.instanceId)
    : [];
  const oldOppCardIds = oppTable
    ? Array.from(oppTable.querySelectorAll('.card-slot')).map((el) => el.dataset.instanceId)
    : [];
  if (myTable) myTable.innerHTML = '';
  if (oppTable) oppTable.innerHTML = '';

  // Мои карты на столе
  me.table.forEach((card) => {
    if (!myTable) return;
    const isNewCard = !oldMyCardIds.includes(String(card.instanceId));
    const cardUI = renderCard({ ...card, variant: 'board' });
    cardUI.classList.add('card-slot');
    cardUI.dataset.instanceId = card.instanceId;

    bindTooltipEvents(cardUI, card, true);

    if (isNewCard) {
      playEpicSpawn(cardUI, card);
    }

    if (card.canAttack && isMyTurn) {
      cardUI.classList.add('can-attack');
      cardUI.addEventListener('mousedown', (e) => {
        e.preventDefault();
        draggingAttackId = card.instanceId;
        cardUI.classList.add('is-attacking-active');
        const board = document.querySelector('.game-board');
        const svg = document.getElementById('attack-arrow-svg');
        const line = document.getElementById('attack-line');

        const oppTableZone = document.getElementById('opp-table-zone');
        let hasTaunt = false;
        if (oppTableZone && opponent && opponent.table) {
          opponent.table.forEach((oppCard) => {
            if (oppCard.traits?.includes('taunt')) {
              hasTaunt = true;
              const oppUI = oppTableZone.querySelector(
                `[data-instance-id="${oppCard.instanceId}"]`
              );
              if (oppUI) oppUI.classList.add('taunt-target-glow');
            }
          });

          if (hasTaunt) {
            const allEnemyCards = oppTableZone.querySelectorAll('.enemy-card');
            allEnemyCards.forEach((enemyCardUI) => {
              if (!enemyCardUI.classList.contains('taunt-target-glow')) {
                enemyCardUI.classList.add('forbidden-target');
              }
            });

            if (svg && line) {
              const cardRect = cardUI.getBoundingClientRect();
              const startX = cardRect.left + cardRect.width / 2;
              const startY = cardRect.top + cardRect.height / 2;
              const endX = e.clientX;
              const endY = e.clientY;

              svg.style.display = 'block';
              line.setAttribute(
                'd',
                `M ${startX} ${startY} Q ${(startX + endX) / 2} ${(startY + endY) / 2} ${endX} ${endY}`
              );
            }

            if (attackReticle) {
              attackReticle.classList.add('show');
              attackReticle.style.left = `${e.clientX}px`;
              attackReticle.style.top = `${e.clientY}px`;
            }

            document.getElementById('opp-avatar-zone')?.classList.add('forbidden-target');
            document.getElementById('opp-username-zone')?.classList.add('forbidden-target');
          }
        }

        if (board && svg && line) {
          const boardRect = board.getBoundingClientRect();
          const cardRect = cardUI.getBoundingClientRect();

          const startX = cardRect.left - boardRect.left + cardRect.width / 2;
          const startY = cardRect.top - boardRect.top + cardRect.height / 2;
          const endX = e.clientX - boardRect.left;
          const endY = e.clientY - boardRect.top;

          svg.style.display = 'block';
          line.setAttribute(
            'd',
            `M ${startX} ${startY} Q ${(startX + endX) / 2} ${(startY + endY) / 2} ${endX} ${endY}`
          );
        }

        if (attackReticle) {
          attackReticle.classList.add('show');
          attackReticle.style.left = `${e.clientX - boardRect.left}px`;
          attackReticle.style.top = `${e.clientY - boardRect.top}px`;
        }
      });
    } else {
      cardUI.classList.add('exhausted'); // Болезнь призыва или уже била
    }
    myTable.appendChild(cardUI);
  });

  // Карты противника на столе
  opponent.table.forEach((card) => {
    if (!oppTable) return;
    const isNewCard = !oldOppCardIds.includes(String(card.instanceId));
    const cardUI = renderCard({ ...card, variant: 'board' });
    cardUI.classList.add('card-slot', 'enemy-card');
    cardUI.dataset.instanceId = card.instanceId;

    bindTooltipEvents(cardUI, card, true);
    if (isNewCard) {
      playEpicSpawn(cardUI, card);
    }

    oppTable.appendChild(cardUI);
  });

  // === РУКИ ===
  // Изменено на новые контейнеры рук
  const oppHand = document.getElementById('opp-hand-zone');
  if (oppHand) {
    const existingOpp = Array.from(oppHand.children);
    while (existingOpp.length > opponent.handCount) existingOpp.pop().remove();
    while (existingOpp.length < opponent.handCount) {
      // Строго добавляем рубашкой вверх
      const newCard = renderCard({ faceDown: true });
      oppHand.appendChild(newCard);
      existingOpp.push(newCard);
    }
    existingOpp.forEach((cardUI, index) => {
      applyFanMath(cardUI, index, opponent.handCount, false, !isMyTurn);
    });
  }

  const handDisplay = document.getElementById('player-hand-zone');
  if (handDisplay) {
    const existingNodes = Array.from(handDisplay.children);
    const newIds = me.hand.map((c) => c.instanceId);

    existingNodes.forEach((node) => {
      if (!newIds.includes(node.dataset.instanceId)) node.remove();
    });

    me.hand.forEach((card, index) => {
      let cardUI = handDisplay.querySelector(`[data-instance-id="${card.instanceId}"]`);

      if (!cardUI) {
        cardUI = renderCard(card);
        cardUI.dataset.instanceId = card.instanceId;
        handDisplay.appendChild(cardUI);
        bindTooltipEvents(cardUI, card, false);
      }

      // БИНДИНГ СОБЫТИЙ С АКТУАЛЬНЫМ STATE
      cardUI.onmouseenter = () => {
        if (isMyTurn && me.mana >= card.cost) {
          hoveredCardCost = card.cost;
          renderMana('player-mana-zone', me.mana, me.maxMana);
        }
      };

      cardUI.onmouseleave = () => {
        hoveredCardCost = 0;
        renderMana('player-mana-zone', me.mana, me.maxMana);
      };

      cardUI.onmousedown = (e) => {
        e.preventDefault();

        if (!isMyTurn) {
          showBattleMessage('Wait for your turn!');
          return;
        }
        if (me.mana < card.cost) {
          showBattleMessage('Not enough mana!');
          return;
        }
        if (me.table.length >= 7) {
          showBattleMessage('Table is full!');
          return;
        }

        e.preventDefault();
        draggingPlayCardId = card.instanceId;
        hoveredCardCost = 0;
        renderMana('player-mana-zone', me.mana, me.maxMana);

        // Создаем призрака для переноса
        dragGhostElement = cardUI.cloneNode(true);
        dragGhostElement.style.position = 'fixed';
        dragGhostElement.style.pointerEvents = 'none';
        dragGhostElement.style.zIndex = 10000;

        // Сбрасываем эффекты ховера руки, центрируем карту строго по курсору
        // Добавляем легкий наклон (rotate(2deg)), как будто карту несут рукой
        dragGhostElement.style.transform = 'translate(-50%, -50%) scale(0.85) rotate(2deg)';
        dragGhostElement.style.boxShadow = '0 15px 30px rgba(0,0,0,0.5)';
        dragGhostElement.style.transition = 'none';
        dragGhostElement.style.left = e.clientX + 'px';
        dragGhostElement.style.top = e.clientY + 'px';

        // Убираем зеленую ауру с призрака во время таскания, чтобы не мешала
        dragGhostElement.classList.remove('playable');

        document.body.appendChild(dragGhostElement);

        // ЖЕСТКИЙ UX: Полностью скрываем карту в руке, имитируя, что мы её "взяли"
        cardUI.style.opacity = '0';
        cardUI.style.pointerEvents = 'none';
      };
      const isWaitingForServer =
        dragGhostElement && dragGhostElement.dataset.instanceId === String(card.instanceId);
      // Проверка при отрисовке: если карту сейчас тащат, она должна оставаться невидимой в руке
      if (card.instanceId === draggingPlayCardId || isWaitingForServer) {
        cardUI.style.opacity = '0';
        cardUI.style.pointerEvents = 'none';
      } else {
        cardUI.style.opacity = '1';
        cardUI.style.pointerEvents = 'auto';
      }

      // Аура играбельности
      if (isMyTurn && me.mana >= card.cost) {
        cardUI.classList.add('playable');
      } else {
        cardUI.classList.remove('playable');
      }

      applyFanMath(cardUI, index, me.hand.length, true, isMyTurn);
    });
  }
}

function playEpicSpawn(cardUI, cardData) {
  cardUI.style.opacity = '0';
  requestAnimationFrame(() => {
    let startX = window.innerWidth / 2;
    let startY = window.innerHeight;
    if (lastDropCoords) {
      startX = lastDropCoords.x;
      startY = lastDropCoords.y;
      lastDropCoords = null;
    } else if (typeof dragGhostElement !== 'undefined' && dragGhostElement) {
      const ghostRect = dragGhostElement.getBoundingClientRect();
      startX = ghostRect.left + ghostRect.width / 2;
      startY = ghostRect.top + ghostRect.height / 2;
      dragGhostElement.remove();
      dragGhostElement = null;
    }

    const boardContainer = document.querySelector('.battle-center-column');
    if (!boardContainer) return;

    const boardRect = boardContainer.getBoundingClientRect();
    const rect = cardUI.getBoundingClientRect();

    const targetX = rect.left - boardRect.left + rect.width / 2;
    const targetY = rect.top - boardRect.top + rect.height / 2;
    const startRelX = startX - boardRect.left;
    const startRelY = startY - boardRect.top;

    const ghostCard = renderCard({ ...cardData, variant: 'hand' });
    ghostCard.classList.add('epic-spawn-glowing');

    ghostCard.style.left = `${startRelX}px`;
    ghostCard.style.top = `${startRelY}px`;
    boardContainer.appendChild(ghostCard);

    void ghostCard.offsetWidth;
    ghostCard.style.left = `${targetX}px`;
    ghostCard.style.top = `${targetY}px`;
    setTimeout(() => {
      if (ghostCard && ghostCard.parentNode) ghostCard.remove();

      cardUI.style.opacity = '1';
      cardUI.classList.add('epic-spawn-token');

      const board = document.querySelector('.game-board');
      if (board) {
        board.classList.add('board-shake');
        setTimeout(() => board.classList.remove('board-shake'), 300);
      }

      const shockwave = document.createElement('div');
      shockwave.className = 'epic-spawn-shockwave';
      shockwave.style.left = `${targetX}px`;
      shockwave.style.top = `${targetY}px`;
      boardContainer.appendChild(shockwave);

      setTimeout(() => {
        if (shockwave.parentNode) shockwave.remove();
      }, 400);

      setTimeout(() => {
        cardUI.classList.remove('epic-spawn-token');
      }, 400);
    }, 350);
  });
}

function playAttackAnimation(attackerEl, targetEl, onImpact, onComplete) {
  if (!attackerEl || !targetEl) {
    if (onImpact) onImpact();
    if (onComplete) onComplete();
    return;
  }
  isAnimationPlaying = true;
  if (onImpact) {
    onImpact();
  }

  const attackerAtk = parseInt(attackerEl.querySelector('.token-attack')?.textContent || '0', 10);
  let targetAtk = 0;
  if (targetEl.classList.contains('card-slot') || targetEl.classList.contains('enemy-card')) {
    targetAtk = parseInt(targetEl.querySelector('.token-attack')?.textContent || '0', 10);
  }
  const aRect = attackerEl.getBoundingClientRect();
  const tRect = targetEl.getBoundingClientRect();

  const deltaX = tRect.left + tRect.width / 2 - (aRect.left + aRect.width / 2);
  const deltaY = tRect.top + tRect.height / 2 - (aRect.top + aRect.height / 2);
  const tilt = Math.max(-20, Math.min(20, deltaX * 0.04));

  const originalZ = attackerEl.style.zIndex;
  const originalTransition = attackerEl.style.transition;

  attackerEl.style.zIndex = '10000';
  attackerEl.style.transition = 'transform 0.2s cubic-bezier(0.42, 0, 0.58, 1)';
  attackerEl.style.transform = `translate(${-deltaX * 0.08}px, ${-deltaY * 0.08}px) scale(0.95) rotate(${-tilt * 0.2}deg)`;

  setTimeout(() => {
    attackerEl.classList.add('anim-attacking');
    attackerEl.style.transition = 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    attackerEl.style.transform = `translate(${deltaX * 0.85}px, ${deltaY * 0.85}px) scale(1.15) rotate(${tilt}deg)`;
    setTimeout(() => {
      attackerEl.style.transition = 'all 0.05s ease-out';
      attackerEl.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.3)`;
      attackerEl.style.filter = 'brightness(2) drop-shadow(0 0 30px #ff3333)';
      targetEl.classList.add('anim-target-hit');
      showFloatingDamage(targetEl, attackerAtk);
      if (targetAtk > 0) {
        showFloatingDamage(attackerEl, targetAtk);
      }

      const boardContainer = document.querySelector('.battle-center-column');
      if (boardContainer) {
        const shockwave = document.createElement('div');
        shockwave.className = 'epic-spawn-shockwave';
        shockwave.style.borderColor = 'rgba(255, 50, 50, 0.9)';
        const boardRect = boardContainer.getBoundingClientRect();
        shockwave.style.left = `${tRect.left + tRect.width / 2 - boardRect.left}px`;
        shockwave.style.top = `${tRect.top + tRect.height / 2 - boardRect.top}px`;
        boardContainer.appendChild(shockwave);
        setTimeout(() => {
          if (shockwave.parentNode) shockwave.remove();
        }, 400);
      }

      const board = document.querySelector('.game-board');
      if (board) {
        board.classList.add('board-shake');
        setTimeout(() => board.classList.remove('board-shake'), 300);
      }

      setTimeout(() => {
        attackerEl.classList.remove('anim-attacking');
        attackerEl.classList.add('anim-attack-return');
        attackerEl.style.filter = '';
        attackerEl.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        attackerEl.style.transform = 'translate(0px, 0px) scale(1) rotate(0deg)';

        setTimeout(() => {
          if (attackerEl) {
            attackerEl.classList.remove('anim-attack-return');
            attackerEl.style.zIndex = originalZ;
            attackerEl.style.transition = originalTransition;
            attackerEl.style.transform = '';
          }
          if (targetEl) targetEl.classList.remove('anim-target-hit');

          if (onComplete) onComplete();

          isAnimationPlaying = false;

          if (pendingGameState) {
            updateBattleUI(pendingGameState, battleSocket);
            pendingGameState = null;
          }
        }, 400);
      }, 70);
    }, 250);
  }, 200);
}

function showFloatingDamage(element, damageAmount) {
  if (!element || damageAmount <= 0) return;
  const targetContainer = element.closest('.avatar-container') || element;
  const dmgEl = document.createElement('div');
  dmgEl.className = 'damage-number';
  dmgEl.textContent = `-${damageAmount}`;
  targetContainer.appendChild(dmgEl);

  setTimeout(() => {
    if (dmgEl.parentNode) dmgEl.remove();
  }, 1000);
}
