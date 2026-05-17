import { socketService } from '../../services/socket.js';
import { store } from '../../core/store.js';

let socket = null;
let callbacks = {};
let watchdogTimer = null;

// ==========================================
// ЛОКАЛЬНЫЕ ОБРАБОТЧИКИ СОКЕТОВ
// ==========================================

function handleMatchFound(state) {
  clearWatchdog();
  if (callbacks.onMatchFound) callbacks.onMatchFound(state);
}
function handleForceReconnect(state) {
  clearWatchdog();
  if (callbacks.onForceReconnect) callbacks.onForceReconnect(state);
}
function handleGameState(state) {
  clearWatchdog();
  if (callbacks.onGameState) callbacks.onGameState(state);
}
function handleGameOver(payload) {
  clearWatchdog();
  if (callbacks.onGameOver) callbacks.onGameOver(payload);
}
function handleOpponentDisconnected(payload) {
  if (callbacks.onOpponentDisconnected) callbacks.onOpponentDisconnected(payload);
}
function handleOpponentReconnected(payload) {
  if (callbacks.onOpponentReconnected) callbacks.onOpponentReconnected(payload);
}
function handleError(data) {
  clearWatchdog();
  if (callbacks.onError) callbacks.onError(data.message);
}
function handleMatchNotFound() {
  clearWatchdog();
  if (callbacks.onFatalError) callbacks.onFatalError('Match not found');
}
function handleOpponentAttack(payload) {
  if (callbacks.onOpponentAttack) callbacks.onOpponentAttack(payload);
}

function clearWatchdog() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

function startWatchdog() {
  clearWatchdog();
  watchdogTimer = setTimeout(() => {
    if (callbacks.onFatalError) callbacks.onFatalError('Server timeout');
  }, 4000);
}
// ==========================================
// ЭКСПОРТИРУЕМЫЙ API ДЛЯ ОРКЕСТРАТОРА
// ==========================================

export const BattleNetwork = {
  init(injectedCallbacks) {
    callbacks = injectedCallbacks || {};
    socket = socketService.connect();

    if (!socket) return;

    socket.off('error', handleError);
    socket.off('match_found', handleMatchFound);
    socket.off('force-reconnect', handleForceReconnect);
    socket.off('game_state', handleGameState);
    socket.off('game_over', handleGameOver);
    socket.off('opponent-disconnected', handleOpponentDisconnected);
    socket.off('opponent-reconnected', handleOpponentReconnected);
    socket.off('match_not_found', handleMatchNotFound);
    socket.off('opponent_attack', handleOpponentAttack);

    socket.on('error', handleError);
    socket.on('match_found', handleMatchFound);
    socket.on('force-reconnect', handleForceReconnect);
    socket.on('game_state', handleGameState);
    socket.on('game_over', handleGameOver);
    socket.on('opponent-disconnected', handleOpponentDisconnected);
    socket.on('opponent-reconnected', handleOpponentReconnected);
    socket.on('match_not_found', handleMatchNotFound);
    socket.on('opponent_attack', handleOpponentAttack);

    // Логика переподключения
    const pendingStateStr = store.getPendingMatchState();
    if (pendingStateStr) {
      startWatchdog();
      if (socket.connected) socket.emit('join-lobby');
      else socket.once('connect', () => socket.emit('join-lobby'));
    }
  },

  cleanup() {
    clearWatchdog();
    if (!socket) return;

    socket.off('error', handleError);
    socket.off('match_found', handleMatchFound);
    socket.off('force-reconnect', handleForceReconnect);
    socket.off('game_state', handleGameState);
    socket.off('game_over', handleGameOver);
    socket.off('opponent-disconnected', handleOpponentDisconnected);
    socket.off('opponent-reconnected', handleOpponentReconnected);
    socket.off('match_not_found', handleMatchNotFound);
    socket.off('opponent_attack', handleOpponentAttack);

    callbacks = {};
    socketService.disconnect();
    socket = null;
  },

  // --- Команды отправки на сервер ---

  getSocketId() {
    return socket?.id;
  },
  sendReady() {
    if (socket) socket.emit('player_ready_for_battle');
  },
  endTurn() {
    if (socket) socket.emit('end_turn');
  },
  surrender(roomId) {
    if (socket) socket.emit('surrender', { roomId });
  },
  attackTarget(payload) {
    if (socket) socket.emit('attack_target', payload);
  },
  playCard(payload) {
    if (socket) socket.emit('play_card', payload);
  },
};
