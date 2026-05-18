import { socketService } from '../services/socket.js';
import { store } from '../core/store.js';
import { initHistory } from '../scripts/lobby/history.js';
import { renderUserProfile, initProfileUI } from '../scripts/lobby/profile.js';
import { initMatchmaking, stopMatchmaking } from '../scripts/lobby/matchmaking.js';

let isMounted = false;
let socket = null;
let elements = {};

export function mount() {
  if (isMounted) return;
  isMounted = true;

  // 1. Кешируем элементы DOM
  elements = {
    playBtn: document.querySelector('.play-btn'),
    searchOverlay: document.getElementById('search-overlay'),
    tipElement: document.getElementById('search-tips'),
    cancelBtn: document.getElementById('cancel-search-btn'),
    matchFrame: document.getElementById('match-frame'),
    historyList: document.getElementById('history-list'),
    returnBtn: document.getElementById('return-btn'),
  };

  if (elements.returnBtn) {
    elements.returnBtn.addEventListener('click', () => {
      window.location.hash = '#menu';
    });
  }

  if (localStorage.getItem('autoQueue') === 'true') {
    if (elements.searchOverlay) {
      elements.searchOverlay.classList.remove('is-hidden');
      elements.searchOverlay.classList.remove('hidden');
    }
  }

  renderUserProfile();
  initHistory(elements.historyList);

  initProfileUI(() => {
    const updatedUserData = JSON.parse(localStorage.getItem('user') || '{}');
    if (typeof store.setUser === 'function') {
      store.setUser(updatedUserData);
    }

    initHistory(elements.historyList);
  });

  socket = socketService.connect();
  initMatchmaking(elements, socket);

  if (localStorage.getItem('autoQueue') === 'true') {
    localStorage.removeItem('autoQueue');
    setTimeout(() => {
      if (elements.playBtn) elements.playBtn.click();
    }, 50);
  }

  socket.on('match_found', handleMatchFound);
  socket.on('force-reconnect', handleForceReconnect);
  socket.on('server-shutdown', handleServerShutdown);
  socket.on('profile_sync', (userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    renderUserProfile();
  });

  if (socket.connected) {
    socket.emit('join-lobby');
  } else {
    socket.once('connect', () => {
      if (isMounted) socket.emit('join-lobby');
    });
  }
}

export function unmount() {
  if (!isMounted) return;
  isMounted = false;

  stopMatchmaking();

  if (socket) {
    socket.off('match_found', handleMatchFound);
    socket.off('force-reconnect', handleForceReconnect);
    socket.off('server-shutdown', handleServerShutdown);
  }

  elements = {};
}

// --- Обработчики событий ---

function handleMatchFound(state) {
  if (elements.tipElement) {
    elements.tipElement.textContent = 'MATCH FOUND!';
    elements.tipElement.style.color = '#33ff33';
  }
  if (elements.cancelBtn) {
    elements.cancelBtn.classList.add('hidden');
  }

  stopMatchmaking(elements);
  store.setMatchState(state, true);
  window.location.hash = '#battle';
}

function handleForceReconnect(state) {
  store.setMatchState(state, false);
  window.location.hash = '#battle';
}

function handleServerShutdown() {
  store.clearMatchState();
  window.location.reload();
}
