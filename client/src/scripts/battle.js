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
  BattleUI.reveal(battleState.elements);

  // Отправляем серверу сигнал, что мы отрисовали UI и готовы к бою
  BattleNetwork.sendReady();

  // Рисуем стол
  BattleUI.updateBoard(state, BattleNetwork.socket?.id, battleState.drag);

  // Если мы только что подключились, а там уже идет игра (реконнект), запускаем таймер
  syncLocalTimer(state);
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
    if (!battleState.isMatchStarted) startMatch(state);
    else networkCallbacks.onGameState(state);
  },

  onGameState: (state) => {
    if (!store.isInBattle()) return;
    battleState.setMatch(state);
    store.setMatchState(state);
    BattleUI.reveal(battleState.elements);

    // Чистая синхронизация локального таймера на основе turnEndsInMs
    syncLocalTimer(state);

    // Проверка статуса оппонента
    const entries = Object.entries(state.players || {});
    const myId = getMyPlayerId();
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
    battleContainer: document.querySelector('.battle-container'),
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
