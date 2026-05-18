import { store } from '../core/store.js';
import { battleState } from './battle/state.js';
import { BattleUI } from './battle/ui.js';
import { BattleInput } from './battle/input.js';
import { BattleNetwork } from './battle/network.js';
import { ActionQueue } from './battle/actionQueue.js';

const COIN_TOSS_DURATION_MS = 7500;

const actionQueue = new ActionQueue({
  onChange: (isActive) => {
    battleState.ui.isAnimating = isActive;
  },
});

battleState.queue.actionQueue = actionQueue;

function delay(ms, cancelToken) {
  return new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };

    const timer = setTimeout(done, ms);
    if (cancelToken?.onCancel) {
      cancelToken.onCancel(() => {
        clearTimeout(timer);
        done();
      });
    }
  });
}

function runAttackAnimation(attackerEl, targetEl, onImpact, cancelToken) {
  return new Promise((resolve) => {
    if (!attackerEl || !targetEl) {
      if (onImpact) onImpact();
      resolve();
      return;
    }

    let finished = false;
    const originalStyles = {
      zIndex: attackerEl.style.zIndex,
      transition: attackerEl.style.transition,
      transform: attackerEl.style.transform,
      filter: attackerEl.style.filter,
    };

    const cleanup = () => {
      if (finished) return;
      finished = true;
      attackerEl.classList.remove('anim-attacking', 'anim-attack-return');
      attackerEl.style.zIndex = originalStyles.zIndex;
      attackerEl.style.transition = originalStyles.transition;
      attackerEl.style.transform = originalStyles.transform;
      attackerEl.style.filter = originalStyles.filter;
      targetEl.classList.remove('anim-target-hit');
      resolve();
    };

    if (cancelToken?.onCancel) cancelToken.onCancel(cleanup);
    BattleUI.playAttackAnimation(attackerEl, targetEl, onImpact, cleanup);
  });
}

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
  actionQueue.add((ctx) =>
    BattleUI.updateBoard(state, BattleNetwork.getSocketId(), battleState.drag, {
      cancelToken: ctx,
    })
  );
  syncLocalTimer(state);
}

async function applyGameState(state, cancelToken) {
  if (!store.isInBattle()) return;
  if (cancelToken?.signal?.aborted) return;

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

  if (opponent && opponent.isConnected === false) {
    BattleUI.setFrozen(
      true,
      "Opponent left. Waiting for reconnect...<br>You will win automatically if they don't return.",
      battleState.elements
    );
  } else {
    BattleUI.setFrozen(false, '', battleState.elements);
  }

  const boardPromise = BattleUI.updateBoard(state, BattleNetwork.getSocketId(), battleState.drag, {
    cancelToken,
  });

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

  await boardPromise;
}

async function applyGameOver(payload, cancelToken) {
  BattleUI.setFrozen(false, '', battleState.elements);
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

  await delay(1500, cancelToken);
  if (cancelToken?.signal?.aborted) return;

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
    actionQueue.add((ctx) => applyGameState(state, ctx));
  },

  onOpponentAttack: (payload) => {
    actionQueue.add((ctx) => {
      if (!store.isInBattle()) return Promise.resolve();
      const attackerEl = document.querySelector(
        `[data-instance-id="${payload.attackerInstanceId}"]`
      );
      const targetEl =
        payload.targetType === 'avatar'
          ? document.getElementById('player-avatar') || document.getElementById('player-hp')
          : document.querySelector(`[data-instance-id="${payload.targetId}"]`);

      if (!attackerEl || !targetEl) return Promise.resolve();
      return runAttackAnimation(attackerEl, targetEl, null, ctx);
    });
  },

  onSpellCast: (payload) => {
    actionQueue.add((ctx) => {
      if (!store.isInBattle()) return Promise.resolve();

      return new Promise((resolve) => {
        let targetEl = null;
        const myId = getMyPlayerId();

        if (payload.targetType === 'avatar') {
          targetEl =
            String(payload.targetId) === String(myId)
              ? document.getElementById('player-avatar-zone') ||
                document.getElementById('player-avatar')
              : document.getElementById('opp-avatar-zone') || document.getElementById('opp-avatar');
        } else if (payload.targetType === 'card') {
          targetEl = document.querySelector(`[data-instance-id="${payload.targetId}"]`);
        } else if (!payload.targetType) {
          targetEl =
            String(payload.casterId) === String(myId)
              ? document.getElementById('player-avatar-zone') ||
                document.getElementById('player-avatar')
              : document.getElementById('opp-avatar-zone') || document.getElementById('opp-avatar');
        }

        BattleUI.playSpellAnimation(payload.card.spellEffect, targetEl, resolve);
      });
    });
  },

  onGameOver: (payload) => {
    actionQueue.clear();
    actionQueue.add((ctx) => applyGameOver(payload, ctx));
  },

  onOpponentDisconnected: (payload) => {
    BattleUI.setFrozen(
      true,
      "Opponent left. Waiting for reconnect...<br>You will win automatically if they don't return in 30 seconds.",
      battleState.elements
    );
  },

  onOpponentReconnected: (payload) => {
    const attempts = payload.attemptsLeft ?? 0;
    const max = payload.maxAttempts ?? 3;
    BattleUI.setFrozen(false, '', battleState.elements);

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
    surrenderBtn: document.getElementById('surrender-btn'),
    opponentStatus: document.getElementById('opponent-connection-status'),
    opponentStatusText: document.getElementById('opponent-connection-text'),
    battleMessage: document.getElementById('battle-message'),
    bmoBody: document.querySelector('.bmo-body'),
    bmoHitbox: document.querySelector('.bmo-hitbox'),
    bmoTextTop: document.getElementById('bmo-text-top'),
    bmoTextBottom: document.getElementById('bmo-text-bottom'),
  };

  if (battleState.elements.loader) battleState.elements.loader.classList.remove('hidden');
  if (battleState.elements.coinOverlay) battleState.elements.coinOverlay.style.display = 'none';

  BattleNetwork.init(networkCallbacks);

  BattleInput.init({
    endTurn: () => BattleNetwork.endTurn(),
    surrender: (roomId) => BattleNetwork.surrender(roomId),
    attackTarget: (payload) => BattleNetwork.attackTarget(payload),
    playCard: (payload) => BattleNetwork.playCard(payload),
    queueAction: (action) => actionQueue.add(action),
  });
}

export function unmount() {
  if (!battleState.isMounted) return;
  battleState.setMounted(false);
  actionQueue.clear();
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
