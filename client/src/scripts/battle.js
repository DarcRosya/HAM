import { store } from '../core/store.js';
import { battleState } from './battle/state.js';
import { BattleUI } from './battle/ui.js';
import { BattleInput } from './battle/input.js';
import { BattleNetwork } from './battle/network.js';

const COIN_TOSS_DURATION_MS = 7500;

const TRAITS_DESC = {
  taunt: { title: 'Taunt', desc: 'Enemies must attack this unit first.' },
  charge: { title: 'Charge', desc: 'Can attack the same turn it is played.' },
  // Сюда будешь добавлять новые механики по мере развития игры
};

// ==========================================
// ЛОКАЛЬНАЯ БИЗНЕС-ЛОГИКА (Таймеры и Монетка)
// ==========================================

function startLocalTimer(seconds) {
  if (battleState.timers.turn) clearInterval(battleState.timers.turn);

  let remaining = seconds;
  const display = battleState.elements.timerDisplay;
  if (!display) return;

  display.textContent = remaining;
  battleState.timers.turn = setInterval(() => {
    remaining--;
    display.textContent = Math.max(0, remaining);
    if (remaining <= 0) {
      clearInterval(battleState.timers.turn);
      battleState.timers.turn = null;
    }
  }, 1000);
}

async function startMatch(state) {
  battleState.isMatchStarted = true;
  battleState.setMatch(state);
  store.setMatchState(state);

  BattleUI.reveal(battleState.elements);

  const isFresh = localStorage.getItem('matchIsFresh') === 'true';
  const alreadyTossed = store.hasObservedCoinToss(state.roomId);

  if (isFresh) localStorage.removeItem('matchIsFresh');

  if (
    !battleState.elements.coinOverlay ||
    !battleState.elements.coin ||
    alreadyTossed ||
    !isFresh
  ) {
    BattleUI.resetCoin(battleState.elements);
    startLocalTimer(state.turnTimer);
    BattleUI.updateBoard(state, BattleNetwork.socket?.id, battleState.drag);
    store.markCoinTossObserved(state.roomId);
    return;
  }

  // Анимация монетки
  const myId = getMyPlayerId();
  if (!myId) {
    BattleUI.updateBoard(state, BattleNetwork.socket?.id, battleState.drag);
    return;
  }

  battleState.elements.coinOverlay.style.display = '';
  battleState.elements.coinOverlay.classList.add('is-active');
  battleState.elements.coinOverlay.setAttribute('aria-hidden', 'false');
  battleState.elements.coin.classList.remove('coin--you', 'coin--opp');

  // Рефлоу для запуска CSS анимации
  void battleState.elements.coin.offsetWidth;

  const isMyTurn = String(state.activeTurn) === String(myId);
  battleState.elements.coin.classList.add(isMyTurn ? 'coin--you' : 'coin--opp');

  await new Promise((resolve) => setTimeout(resolve, COIN_TOSS_DURATION_MS));
  if (!battleState.isMounted) return;

  if (!store.isInBattle()) {
    BattleUI.resetCoin(battleState.elements);
    return;
  }

  store.markCoinTossObserved(state.roomId);
  BattleUI.resetCoin(battleState.elements);

  startLocalTimer(battleState.match.turnTimer);
  BattleUI.updateBoard(battleState.match, BattleNetwork.socket?.id, battleState.drag);
}

function getMyPlayerId() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const entries = Object.entries(battleState.match?.players ?? {});
  const myEntry = entries.find(([id]) => String(id) === String(user.id));
  return myEntry ? myEntry[0] : null;
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

    if (state.turnTimer !== undefined) startLocalTimer(state.turnTimer);

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
  console.log('%c[BATTLE MODULE] mount()', 'background: #440000; color: #ffaaaa');

  battleState.elements = {
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

  if (battleState.elements.loader) battleState.elements.loader.classList.remove('hidden');
  if (battleState.elements.coinOverlay) battleState.elements.coinOverlay.style.display = 'none';

  // Связываем модули
  BattleNetwork.init(networkCallbacks);

  BattleInput.init({
    endTurn: () => BattleNetwork.endTurn(),
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
