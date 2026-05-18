import { store } from '../core/store.js';
import { battleState } from './battle/state.js';
import { BattleUI } from './battle/ui.js';
import { BattleInput } from './battle/input.js';
import { BattleNetwork } from './battle/network.js';

const COIN_TOSS_DURATION_MS = 7500;

// ==========================================
// ЛОКАЛЬНАЯ БИЗНЕС-ЛОГИКА (Таймеры и Монетка)
// ==========================================

function getMyPlayerId() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const entries = Object.entries(battleState.match?.players ?? {});
  const myEntry = entries.find(([id]) => String(id) === String(user.id));
  return myEntry ? myEntry[0] : null;
}

function syncHandVisibilityByPhase(phase) {
  const shouldHideHands = phase === 'coin_toss';
  ['opp-hand-zone', 'player-hand-zone'].forEach((zoneId) => {
    const handZone = document.getElementById(zoneId);
    if (handZone) handZone.classList.toggle('hand-hidden', shouldHideHands);
  });
}

function syncLocalTimer(state) {
  if (battleState.timers.turn) clearInterval(battleState.timers.turn);
  if (state.phase === 'loading') {
    BattleUI.updateBmoDisplay(0, false, battleState.elements, state.phase);
    return;
  }
  const localEndTime = Date.now() + (state.turnEndsInMs || 0);

  battleState.timers.turn = setInterval(() => {
    const remainingMs = Math.max(0, localEndTime - Date.now());
    const isMyTurn = String(state.activeTurn) === String(getMyPlayerId());

    if (remainingMs <= 0) {
      clearInterval(battleState.timers.turn);
      battleState.timers.turn = null;
    }

    BattleUI.updateBmoDisplay(remainingMs, isMyTurn, battleState.elements, state.phase);
  }, 100);
}

async function startMatch(state) {
  battleState.isMatchStarted = true;
  battleState.setMatch(state);
  store.setMatchState(state);

  if (state.phase !== 'loading') BattleUI.reveal(battleState.elements);
  else {
    const loaderTitle = battleState.elements.loader?.querySelector('h1');
    if (loaderTitle) loaderTitle.textContent = 'WAITING FOR OPPONENT...';
  }

  syncHandVisibilityByPhase(state.phase);
  BattleNetwork.sendReady();
  BattleUI.updateBoard(state, BattleNetwork.getSocketId(), battleState.drag, releaseLock);
  syncLocalTimer(state);
}

// --- СИСТЕМА ОЧЕРЕДЕЙ И БЛОКИРОВОК ---
function setAnimationLock() {
  battleState.ui.isAnimating = true;
  if (battleState.timers.animationSafety) clearTimeout(battleState.timers.animationSafety);
  // Защита от зависания: жесткий сброс через 2.5 сек, если onComplete не сработал
  battleState.timers.animationSafety = setTimeout(() => {
    releaseLock();
  }, 2500);
}

function releaseLock() {
  battleState.ui.isAnimating = false;
  if (battleState.timers.animationSafety) clearTimeout(battleState.timers.animationSafety);

  if (battleState.queue.pendingGameOverPayload) {
    const payload = battleState.queue.pendingGameOverPayload;
    battleState.queue.pendingGameOverPayload = null;
    payload.forceExecute = true;
    networkCallbacks.onGameOver(payload);
  } else if (battleState.queue.pendingGameState) {
    const state = battleState.queue.pendingGameState;
    battleState.queue.pendingGameState = null;
    networkCallbacks.onGameState(state);
  }
}

// ==========================================
// КОЛЛБЭКИ ДЛЯ СЕТИ (Реакция на сервер)
// ==========================================

const networkCallbacks = {
  onMatchFound: (state) => {
    if (!battleState.isMatchStarted) startMatch(state);
    else networkCallbacks.onGameState(state);
  },

  onForceReconnect: (state) => {
    if (!battleState.isMatchStarted) {
      startMatch(state);
    }

    if (state.phase === 'playing' || state.phase === 'coin_toss') {
      const loader = document.getElementById('battle-loader');
      if (loader) {
        loader.classList.add('hidden');
        loader.style.display = 'none';
      }
    }

    networkCallbacks.onGameState(state);
  },

  onGameState: (state) => {
    if (!store.isInBattle()) return;
    battleState.setMatch(state);
    store.setMatchState(state);

    if (state.phase !== 'loading') {
      BattleUI.reveal(battleState.elements);
      const board = document.querySelector('.game-board');
      if (board) board.classList.remove('hidden');
    }

    syncHandVisibilityByPhase(state.phase);

    const myId = getMyPlayerId();
    BattleUI.renderVsScreen(state, myId);
    syncLocalTimer(state);

    const entries = Object.entries(state.players || {});
    const opponentEntry = entries.find(([id]) => String(id) !== String(myId));
    const opponent = opponentEntry ? opponentEntry[1] : null;

    if (opponent && opponent.isConnected === false)
      BattleUI.setFrozen(
        true,
        'Opponent disconnected...<br>Waiting for reconnect.',
        battleState.elements
      );
    else BattleUI.setFrozen(false, '', battleState.elements);

    // Логика очередей: Если идет анимация - сохраняем стейт в очередь
    if (battleState.ui.isAnimating) {
      battleState.queue.pendingGameState = state;
    } else {
      BattleUI.updateBoard(state, BattleNetwork.getSocketId(), battleState.drag, releaseLock);
    }

    if (state.phase === 'coin_toss' || state.phase === 'playing') {
      const board = document.querySelector('.game-board');
      if (board) {
        board.classList.remove('hidden');
        board.style.pointerEvents = 'auto';
        requestAnimationFrame(() => {
          if (!board.classList.contains('board-visible')) board.classList.add('board-visible');
        });
      }
    }
    if (state.phase === 'coin_toss') {
      if (battleState.elements.coinOverlay && myId) {
        battleState.elements.coinOverlay.style.display = '';
        battleState.elements.coinOverlay.classList.add('is-active');
        battleState.elements.coin.classList.remove('coin--you', 'coin--opp');
        void battleState.elements.coin.offsetWidth;
        const isMyTurn = String(state.activeTurn) === String(myId);
        battleState.elements.coin.classList.add(isMyTurn ? 'coin--you' : 'coin--opp');
      }
    } else if (state.phase === 'playing') BattleUI.resetCoin(battleState.elements);
  },

  onOpponentAttack: (payload) => {
    if (!store.isInBattle()) return;
    const attackerEl = document.querySelector(`[data-instance-id="${payload.attackerInstanceId}"]`);
    let targetEl =
      payload.targetType === 'avatar'
        ? document.getElementById('player-avatar') || document.getElementById('player-hp')
        : document.querySelector(`[data-instance-id="${payload.targetId}"]`);

    if (!attackerEl || !targetEl) return;
    setAnimationLock();
    BattleUI.playAttackAnimation(attackerEl, targetEl, null, releaseLock);
  },

  onGameOver: (payload) => {
    if (battleState.ui.isAnimating && !payload.forceExecute) {
      battleState.queue.pendingGameOverPayload = payload;
      return;
    }

    if (battleState.timers.turn) {
      clearInterval(battleState.timers.turn);
      battleState.timers.turn = null;
    }

    if (battleState.elements.bmoTextTop) {
      battleState.elements.bmoTextTop.textContent = 'GAME';
    }
    if (battleState.elements.bmoTextBottom) {
      battleState.elements.bmoTextBottom.textContent = 'OVER';
      battleState.elements.bmoTextBottom.classList.remove('danger-tick');
    }

    BattleUI.hideStatus(battleState.elements);
    store.clearMatchState();

    const myId = getMyPlayerId();
    const isWinner = String(payload.winnerId) === String(myId);

    const targetAvatarZoneId = isWinner ? 'opp-avatar-zone' : 'player-avatar-zone';
    const avatarZone = document.getElementById(targetAvatarZoneId);
    if (avatarZone) {
      const hpBadge = avatarZone.querySelector('.health-badge');
      if (hpBadge) hpBadge.style.opacity = '0';
      avatarZone.classList.add('anim-avatar-death');
      const board = document.querySelector('.game-board');
      if (board) board.classList.add('board-shake-heavy');
    }

    setTimeout(() => {
      const overlay = document.getElementById('game-result-overlay');
      const banner = document.getElementById('result-banner');
      const mmrValue = document.getElementById('result-mmr-value');
      const durationText = document.getElementById('result-duration');
      const playAgainBtn = document.getElementById('play-again-btn');
      const backLobbyBtn = document.getElementById('back-lobby-btn');

      if (overlay && banner && mmrValue) {
        overlay.classList.remove('hidden');
        banner.className = `result-banner ${isWinner ? 'victory' : 'defeat'}`;
        const mmrChange = Number(payload.ratingChange ?? payload.mmrChange ?? 0);
        const displayMmr = isWinner ? Math.abs(mmrChange) : -Math.abs(mmrChange);
        mmrValue.textContent = displayMmr > 0 ? `+${displayMmr}` : `${displayMmr}`;

        if (durationText) {
          const durationSeconds = Number(payload.duration ?? payload.matchDuration ?? 0);
          if (!Number.isFinite(durationSeconds) || durationSeconds < 0)
            durationText.textContent = '0:00';
          else {
            const minutes = Math.floor(durationSeconds / 60);
            const seconds = Math.floor(durationSeconds % 60);
            durationText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
          }
        }

        const autoRedirectTimer = setTimeout(() => {
          window.location.hash = '#lobby';
        }, 10000);
        if (backLobbyBtn)
          backLobbyBtn.onclick = () => {
            clearTimeout(autoRedirectTimer);
            window.location.hash = '#lobby';
          };
        if (playAgainBtn)
          playAgainBtn.onclick = () => {
            clearTimeout(autoRedirectTimer);
            localStorage.setItem('autoQueue', 'true');
            window.location.hash = '#lobby';
          };
      } else {
        window.location.hash = '#lobby';
      }
    }, 1500);
  },

  onOpponentDisconnected: (payload) => {
    const attempts = payload.attemptsLeft ?? 0;
    const max = payload.maxAttempts ?? 3;
    const wait = payload.graceSeconds ?? 30;
    BattleUI.setFrozen(true, '', battleState.elements);
    BattleUI.showStatus(
      `Opponent disconnected. Waiting ${wait}s. Attempts left: ${attempts} / ${max}.`,
      battleState.elements
    );
  },

  onOpponentReconnected: (payload) => {
    const attempts = payload.attemptsLeft ?? 0;
    const max = payload.maxAttempts ?? 3;
    BattleUI.setFrozen(false, '', battleState.elements);
    BattleUI.showStatus(
      `Opponent reconnected. Attempts left: ${attempts} / ${max}.`,
      battleState.elements
    );

    if (battleState.timers.opponentStatus) clearTimeout(battleState.timers.opponentStatus);
    battleState.timers.opponentStatus = setTimeout(() => {
      BattleUI.hideStatus(battleState.elements);
    }, 2500);
  },

  onError: (msg) => {
    BattleUI.showMessage(msg, battleState.elements);
  },

  onFatalError: (msg) => {
    BattleUI.showMessage(msg, battleState.elements);
    store.clearMatchState();
    window.location.replace('#lobby');
  },
};

// ==========================================
// ЖИЗНЕННЫЙ ЦИКЛ (Экспорт для Router)
// ==========================================

export function mount() {
  if (battleState.isMounted) return;
  battleState.setMounted(true);

  battleState.elements = {
    loader: document.getElementById('battle-loader'),
    battleContainer: document.querySelector('.game-board'),
    coinOverlay: document.getElementById('coin-toss-overlay'),
    coin: document.querySelector('.coin'),
    surrenderBtn: document.getElementById('surrender-confirm-yes'),
    opponentStatus: document.getElementById('opponent-connection-status'),
    opponentStatusText: document.getElementById('opponent-connection-text'),
    battleMessage: document.getElementById('battle-message'),
    bmoBody: document.querySelector('.bmo-body'),
    bmoHitbox: document.querySelector('.bmo-hitbox'),
    bmoTextTop: document.getElementById('bmo-text-top'),
    bmoTextBottom: document.getElementById('bmo-text-bottom'),
  };

  const triggerBtn = document.getElementById('surrender-trigger-btn');
  const confirmOverlay = document.getElementById('surrender-confirm-overlay');
  const noBtn = document.getElementById('surrender-confirm-no');
  const yesBtn = document.getElementById('surrender-confirm-yes');
  const closeBtn = document.getElementById('close-surrender-btn');
  if (triggerBtn && confirmOverlay) {
    triggerBtn.onclick = () => confirmOverlay.classList.remove('hidden');
  }
  const closeModal = () => confirmOverlay.classList.add('hidden');
  if (noBtn) {
    noBtn.onclick = closeModal;
  }
  if (closeBtn) {
    closeBtn.onclick = closeModal;
  }
  if (yesBtn) {
    yesBtn.addEventListener('click', closeModal);
  }

  if (battleState.elements.loader) battleState.elements.loader.classList.remove('hidden');
  if (battleState.elements.coinOverlay) battleState.elements.coinOverlay.style.display = 'none';

  BattleNetwork.init(networkCallbacks);

  BattleInput.init({
    endTurn: () => BattleNetwork.endTurn(),
    surrender: (roomId) => BattleNetwork.surrender(roomId),
    attackTarget: (payload) => BattleNetwork.attackTarget(payload),
    playCard: (payload) => BattleNetwork.playCard(payload),
    releaseLock: releaseLock,
    setAnimationLock: setAnimationLock,
  });
}

export function unmount() {
  if (!battleState.isMounted) return;
  battleState.setMounted(false);
  BattleInput.cleanup();
  BattleNetwork.cleanup();

  [
    'opp-hp',
    'player-hp',
    'opp-mana-zone',
    'player-mana-zone',
    'player-table-zone',
    'opp-table-zone',
    'opp-hand-zone',
    'player-hand-zone',
    'info-turn',
    'info-timer',
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  battleState.reset();
}
