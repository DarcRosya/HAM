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

function syncLocalTimer(state) {
  if (battleState.timers.turn) {
    clearInterval(battleState.timers.turn);
  }

  // Если фаза загрузки - таймера еще нет
  if (state.phase === 'loading') {
    BattleUI.updateBmoDisplay(0, false, battleState.elements, state.phase);
    return;
  }

  // Фиксируем конец времени по локальным часам (Никаких рассинхронов)
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

  // ЕСЛИ ФАЗА LOADING - НЕ УБИВАЕМ ЛОАДЕР! Ожидаем оппонента.
  if (state.phase !== 'loading') {
    BattleUI.reveal(battleState.elements);
  } else {
    const loaderTitle = battleState.elements.loader?.querySelector('h1');
    if (loaderTitle) loaderTitle.textContent = 'WAITING FOR OPPONENT...';
  }

  // Отправляем серверу сигнал, что мы отрисовали UI и готовы к бою
  BattleNetwork.sendReady();

  // Рисуем стол
  BattleUI.updateBoard(state, BattleNetwork.socket?.id, battleState.drag);
  syncLocalTimer(state);
}

function debugDOMState(triggerPoint, phase) {
  const vs = document.getElementById('vs-screen');
  const board = document.querySelector('.game-board');
  const coin = document.getElementById('coin-toss-overlay');

  console.log(`\n--- [DEBUG DOM: ${triggerPoint} | Фаза сервера: ${phase}] ---`);

  if (vs) {
    const vsComp = window.getComputedStyle(vs);
    console.log(
      `[VS-Screen] display: ${vsComp.display}, opacity: ${vsComp.opacity}, pointer-events: ${vsComp.pointerEvents}, z-index: ${vsComp.zIndex}, classes: [${vs.className}]`
    );
  }

  if (board) {
    const boardComp = window.getComputedStyle(board);
    console.log(
      `[Game-Board] display: ${boardComp.display}, opacity: ${boardComp.opacity}, pointer-events: ${boardComp.pointerEvents}, z-index: ${boardComp.zIndex}, height: ${boardComp.height}, classes: [${board.className}]`
    );
  }

  if (coin) {
    const coinComp = window.getComputedStyle(coin);
    console.log(
      `[Coin-Overlay] display: ${coinComp.display}, opacity: ${coinComp.opacity}, pointer-events: ${coinComp.pointerEvents}, z-index: ${coinComp.zIndex}, classes: [${coin.className}]`
    );
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

    // КАСКАД: Направляем стейт в общую воронку отрисовки UI
    networkCallbacks.onGameState(state);
  },
  onGameState: (state) => {
    debugDOMState('onGameState START', state.phase);

    if (!store.isInBattle()) return;
    battleState.setMatch(state);
    store.setMatchState(state);

    // Прячем лоадер только когда загрузились оба
    if (state.phase !== 'loading') {
      BattleUI.reveal(battleState.elements);

      // СРАЗУ снимаем display: none со стола, чтобы он дал высоту странице.
      // Он останется невидимым, так как у него еще нет класса 'board-visible' (opacity: 0).
      const board = document.querySelector('.game-board');
      if (board) {
        board.classList.remove('hidden');
      }
    }

    const myId = getMyPlayerId();
    BattleUI.renderVsScreen(state, myId);

    // Чистая синхронизация локального таймера на основе turnEndsInMs
    syncLocalTimer(state);

    // Проверка статуса оппонента
    const entries = Object.entries(state.players || {});
    const opponentEntry = entries.find(([id]) => String(id) !== String(myId));
    const opponent = opponentEntry ? opponentEntry[1] : null;

    if (opponent && opponent.isConnected === false) {
      BattleUI.setFrozen(
        true,
        'Opponent disconnected...<br>Waiting for reconnect.',
        battleState.elements
      );
    } else {
      BattleUI.setFrozen(false, '', battleState.elements);
    }

    BattleUI.updateBoard(state, BattleNetwork.socket?.id, battleState.drag);

    if (state.phase === 'coin_toss' || state.phase === 'playing') {
      const board = document.querySelector('.game-board');
      if (board) {
        board.classList.remove('hidden');

        board.style.pointerEvents = 'auto';

        requestAnimationFrame(() => {
          if (!board.classList.contains('board-visible')) {
            board.classList.add('board-visible');
          }
        });
      }
    }

    // Синхронизация отображения 3D монетки на основе фазы сервера
    if (state.phase === 'coin_toss') {
      const myId = getMyPlayerId();
      if (battleState.elements.coinOverlay && myId) {
        battleState.elements.coinOverlay.style.display = '';
        battleState.elements.coinOverlay.classList.add('is-active');
        battleState.elements.coin.classList.remove('coin--you', 'coin--opp');

        void battleState.elements.coin.offsetWidth;
        const isMyTurn = String(state.activeTurn) === String(myId);
        battleState.elements.coin.classList.add(isMyTurn ? 'coin--you' : 'coin--opp');
      }
    } else if (state.phase === 'playing') {
      BattleUI.resetCoin(battleState.elements);
    }

    debugDOMState('onGameState END', state.phase);
  },

  onGameOver: ({ winnerId }) => {
    BattleUI.hideStatus(battleState.elements);
    store.clearMatchState();

    const myId = getMyPlayerId();
    const isWinner = String(winnerId) === String(myId);

    const overlay = document.getElementById('game-result-overlay');
    const text = document.getElementById('result-text');
    const btn = document.getElementById('return-lobby-btn');

    if (overlay && text && btn) {
      overlay.classList.remove('hidden');
      text.textContent = isWinner ? 'You won!' : 'You lost!';
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
      window.location.hash = '#lobby';
    }
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
  console.log(
    '%c[MAIN MOUNT] Инициализация боевого экрана...',
    'background: #330033; color: #ffaaee'
  );

  battleState.elements = {
    loader: document.getElementById('battle-loader'),
    battleContainer: document.querySelector('.game-board'),
    coinOverlay: document.getElementById('coin-toss-overlay'),
    coin: document.querySelector('.coin'),
    surrenderBtn: document.getElementById('surrender-btn'),
    opponentStatus: document.getElementById('opponent-connection-status'),
    opponentStatusText: document.getElementById('opponent-connection-text'),
    battleMessage: document.getElementById('battle-message'),

    // Новые элементы BMO
    bmoBody: document.querySelector('.bmo-body'),
    bmoHitbox: document.querySelector('.bmo-hitbox'),
    bmoTextTop: document.getElementById('bmo-text-top'),
    bmoTextBottom: document.getElementById('bmo-text-bottom'),
  };

  console.log(
    '%c[DOM CACHE] Результаты сканирования элементов BMO:',
    'font-weight: bold; color: #ff9800'
  );
  console.log('bmoBody:', battleState.elements.bmoBody);
  console.log('bmoHitbox (Зона клика):', battleState.elements.bmoHitbox);
  console.log('bmoTextTop:', battleState.elements.bmoTextTop);
  console.log('bmoTextBottom:', battleState.elements.bmoTextBottom);

  if (battleState.elements.loader) battleState.elements.loader.classList.remove('hidden');
  if (battleState.elements.coinOverlay) battleState.elements.coinOverlay.style.display = 'none';

  // Связываем модули
  BattleNetwork.init(networkCallbacks);

  BattleInput.init({
    endTurn: () => {
      console.log(
        '%c[ACTION LOG] Сигнал отправки конца хода на сервер через сокет',
        'color: #9c27b0'
      );
      BattleNetwork.endTurn();
    },
    surrender: (roomId) => BattleNetwork.surrender(roomId),
    attackTarget: (payload) => BattleNetwork.attackTarget(payload),
    playCard: (payload) => BattleNetwork.playCard(payload),
  });
}

export function unmount() {
  if (!battleState.isMounted) return;
  battleState.setMounted(false);
  console.log('%c[BATTLE MODULE] unmount()', 'background: #440000; color: #ffaaaa');

  BattleInput.cleanup();
  BattleNetwork.cleanup();

  // Очистка DOM (чтобы не было призраков при следующем заходе)
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
