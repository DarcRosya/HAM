import { socketService } from '../services/socket.js';
import { API_BASE_URL } from '../services/api.js';
import { store } from '../core/store.js';

// --- Глобальное состояние компонента ---
let isMounted = false;
let socket = null;
let tipInterval = null;
let frameInterval = null;
let elements = {};

const frameIntervalMs = 320;
const matchFramePaths = Array.from(
  { length: 8 },
  (_, index) => `src/assets/images/find_match/${index + 1}.png`
);
const frameMotion = [
  { scale: 1.0, y: 0 },
  { scale: 1.03, y: -2 },
  { scale: 1.07, y: -4 },
  { scale: 1.04, y: -2 },
  { scale: 1.01, y: 0 },
  { scale: 0.99, y: 1 },
  { scale: 0.97, y: 2 },
  { scale: 1.03, y: -1 },
];

// --- Жизненный цикл ---

export function mount() {
  if (isMounted) return;
  isMounted = true;

  // 1. Кешируем элементы DOM
  elements = {
    editBtn: document.querySelector('.edit-btn'),
    playBtn: document.querySelector('.play-btn'),
    searchOverlay: document.getElementById('search-overlay'),
    tipElement: document.getElementById('search-tips'),
    cancelBtn: document.getElementById('cancel-search-btn'),
    matchFrame: document.getElementById('match-frame'),
    historyList: document.getElementById('history-list'),
  };

  // 2. Инициализация UI
  const token = store.getToken();
  renderUserProfile();
  loadMatchHistory(token);

  if (elements.matchFrame && typeof Image !== 'undefined') {
    preloadMatchFrames();
  }

  // 3. Привязка DOM событий
  if (elements.playBtn && elements.searchOverlay) {
    elements.playBtn.addEventListener('click', handlePlayClick);
  }
  if (elements.cancelBtn) {
    elements.cancelBtn.addEventListener('click', handleCancelClick);
  }

  // 4. Инициализация Сокетов
  socket = socketService.connect();

  // На всякий случай снимаем старые слушатели перед навешиванием новых
  detachSocketListeners();

  socket.on('match_found', handleMatchFound);
  socket.on('force-reconnect', handleForceReconnect);
  socket.on('server-shutdown', handleServerShutdown);

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

  // 1. Убиваем таймеры и анимации
  stopMatchAnimation();
  if (tipInterval) {
    clearInterval(tipInterval);
    tipInterval = null;
  }

  // 2. Отписываемся от сокет-событий лобби
  detachSocketListeners();
  socketService.disconnect();
  // 3. Зачищаем ссылки на DOM
  elements = {};
}

// --- Обработчики Сокетов ---

function detachSocketListeners() {
  if (!socket) return;
  socket.off('match_found', handleMatchFound);
  socket.off('force-reconnect', handleForceReconnect);
  socket.off('server-shutdown', handleServerShutdown);
}

function handleMatchFound(state) {
  stopMatchAnimation();
  store.setMatchState(state, true); // TRUE: Это новый матч, выдаем билет на монетку!
  window.location.hash = '#battle';
}

function handleForceReconnect(state) {
  store.setMatchState(state, false); // FALSE: Это старый матч, без монетки
  window.location.hash = '#battle';
}

function handleServerShutdown() {
  console.warn('Server is restarting! Clearing local states...');
  store.clearMatchState();
  window.location.replace('#lobby');
  window.location.reload();
}

// --- Обработчики UI ---

function handlePlayClick() {
  if (!elements.searchOverlay || !socket) return;

  elements.searchOverlay.classList.remove('is-hidden');
  startMatchAnimation();

  const searchTips = ['loading message', 'text2', 'text3'];
  let tipIndex = 0;
  elements.tipElement.textContent = searchTips[tipIndex];

  tipInterval = setInterval(() => {
    if (elements.searchOverlay.classList.contains('is-hidden')) {
      clearInterval(tipInterval);
      return;
    }
    tipIndex = (tipIndex + 1) % searchTips.length;
    elements.tipElement.textContent = searchTips[tipIndex];
  }, 3000);

  socket.emit('find_match');
}

function handleCancelClick() {
  if (!elements.searchOverlay || !socket) return;

  elements.searchOverlay.classList.add('is-hidden');
  if (tipInterval) clearInterval(tipInterval);
  stopMatchAnimation();

  socket.emit('cancel_matchmaking');
}

// --- Визуальная логика и API (остается почти без изменений) ---

function preloadMatchFrames() {
  matchFramePaths.forEach((path) => {
    const img = new Image();
    img.src = path;
  });
}

function applyFrameMotion(index) {
  if (!elements.matchFrame) return;
  const motion = frameMotion[index % frameMotion.length];
  elements.matchFrame.style.setProperty('--frame-scale', motion.scale);
  elements.matchFrame.style.setProperty('--frame-y', `${motion.y}px`);
}

function resetMatchFrame() {
  if (!elements.matchFrame) return;
  elements.matchFrame.src = matchFramePaths[0];
  applyFrameMotion(0);
}

function startMatchAnimation() {
  if (!elements.matchFrame) return;
  let frameIndex = 0;
  resetMatchFrame();

  if (frameInterval) clearInterval(frameInterval);

  frameInterval = setInterval(() => {
    frameIndex = (frameIndex + 1) % matchFramePaths.length;
    elements.matchFrame.src = matchFramePaths[frameIndex];
    applyFrameMotion(frameIndex);
  }, frameIntervalMs);
}

function stopMatchAnimation() {
  if (!frameInterval) return;
  clearInterval(frameInterval);
  frameInterval = null;
  resetMatchFrame();
}

function renderUserProfile() {
  const user = store.getUser();
  if (!user) return;

  const avatar = document.querySelector('.player-info .avatar');
  const name = document.querySelector('.display-name');
  const username = document.querySelector('.username');

  if (avatar) avatar.src = user.avatar || '/default-avatar.png';
  if (name) name.textContent = user.displayedName || 'Unknown';
  if (username) username.textContent = user.username ? `@${user.username}` : '@user';
}

async function loadMatchHistory(token) {
  if (!elements.historyList) return;

  const showEmptyMessage = (msg) => {
    elements.historyList.classList.add('is-empty');
    elements.historyList.innerHTML = `<p class="no-matches">${msg}</p>`;
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/users/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 404) return showEmptyMessage("You haven't played yet.");
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const matches = await res.json();
    if (!Array.isArray(matches) || matches.length === 0) {
      return showEmptyMessage("You haven't played yet.");
    }

    elements.historyList.classList.remove('is-empty');
    elements.historyList.innerHTML = '';

    matches.slice(0, 4).forEach((match) => {
      elements.historyList.appendChild(createMatchCard(match));
    });
  } catch (e) {
    console.error('Critical error in history load:', e);
    showEmptyMessage('History temporary unavailable.');
  }
}

function createMatchCard(match) {
  const user = store.getUser();
  const winnerId = match.winnerId ?? null;
  const isDraw = winnerId == null;
  const isWinner = !isDraw && String(winnerId) === String(user?.id);
  const resultClass = isDraw ? 'draw' : isWinner ? 'victory' : 'defeat';
  const card = document.createElement('div');
  card.className = `match-card ${resultClass}`;

  const mmrChange = Number(match.ratingChange ?? 0);
  const mmrSign = mmrChange > 0 ? '+' : '';
  const dateValue = match.endedAt || match.createdAt || match.startedAt;
  const date = dateValue ? new Date(dateValue).toLocaleDateString('ru-RU') : '—';
  const durationText = formatDuration(match.duration);
  const opponentName = match.displayedName || match.username || 'Opponent';
  const opponentAvatar = match.avatar || '/enemy.png';
  const myAvatar = user?.avatar || '/avatar.png';
  const resultText = isDraw ? 'Draw' : isWinner ? 'Victory' : 'Defeat';

  card.innerHTML = `
    <div class="vs-block">
      <img src="${myAvatar}" class="mini-avatar">
      <span class="vs-text">VS</span>
      <img src="${opponentAvatar}" class="mini-avatar">
      <span class="enemy-username">${opponentName}</span>
    </div>
    <div class="result-status">${resultText}</div>
    <div class="stats">
      <div class="mmr">${mmrSign}${mmrChange}</div>
      <div class="date-time">${date}${durationText ? ` dur:${durationText}` : ''}</div>
    </div>
  `;
  return card;
}

function formatDuration(durationSeconds) {
  const total = Number(durationSeconds);
  if (!Number.isFinite(total) || total < 0) return '';
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
