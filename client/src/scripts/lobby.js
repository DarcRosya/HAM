import { socketService } from '../services/socket.js';
import { API_BASE_URL } from '../services/api.js';

export function initLobby() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.hash = '#login';
    return false;
  }

  renderUserProfile();
  loadMatchHistory(token);

  const socket = socketService.connect();

  const playBtn = document.querySelector('.play-btn');
  const searchOverlay = document.getElementById('search-overlay');
  const tipElement = document.getElementById('search-tips');
  const cancelBtn = document.getElementById('cancel-search-btn');
  const searchTips = ['loading message', 'text2', 'text3'];
  const matchFrame = document.getElementById('match-frame');
  const matchFramePaths = Array.from({ length: 8 }, (_, index) => {
    return `src/assets/images/find_match/${index + 1}.png`;
  });
  const frameIntervalMs = 320;
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
  let tipInterval = null;
  let frameInterval = null;

  const preloadMatchFrames = () => {
    matchFramePaths.forEach((path) => {
      const img = new Image();
      img.src = path;
    });
  };

  const applyFrameMotion = (index) => {
    if (!matchFrame) return;
    const motion = frameMotion[index % frameMotion.length];
    matchFrame.style.setProperty('--frame-scale', motion.scale);
    matchFrame.style.setProperty('--frame-y', `${motion.y}px`);
  };

  const resetMatchFrame = () => {
    if (!matchFrame) return;
    matchFrame.src = matchFramePaths[0];
    applyFrameMotion(0);
  };

  const startMatchAnimation = () => {
    if (!matchFrame) return;
    let frameIndex = 0;
    resetMatchFrame();

    if (frameInterval) {
      clearInterval(frameInterval);
    }

    frameInterval = setInterval(() => {
      frameIndex = (frameIndex + 1) % matchFramePaths.length;
      matchFrame.src = matchFramePaths[frameIndex];
      applyFrameMotion(frameIndex);
    }, frameIntervalMs);
  };

  const stopMatchAnimation = () => {
    if (!frameInterval) return;
    clearInterval(frameInterval);
    frameInterval = null;
    resetMatchFrame();
  };

  socket.off('match_found');
  socket.off('waiting_for_opponent');

  if (matchFrame && typeof Image !== 'undefined') {
    preloadMatchFrames();
  }

  if (playBtn && searchOverlay) {
    playBtn.addEventListener('click', () => {
      searchOverlay.classList.remove('is-hidden');
      startMatchAnimation();
      let tipIndex = 0;
      tipElement.textContent = searchTips[tipIndex];

      tipInterval = setInterval(() => {
        if (searchOverlay.classList.contains('is-hidden')) {
          clearInterval(tipInterval);
          return;
        }
        tipIndex = (tipIndex + 1) % searchTips.length;
        tipElement.textContent = searchTips[tipIndex];
      }, 3000);

      socket.emit('find_match');
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      searchOverlay.classList.add('is-hidden');
      clearInterval(tipInterval);
      stopMatchAnimation();
      socket.emit('cancel_matchmaking');
    });
  }

  socket.on('match_found', (state) => {
    clearInterval(tipInterval);
    stopMatchAnimation();
    sessionStorage.setItem('pendingMatchState', JSON.stringify(state));
    window.location.hash = '#battle';
  });

  return true;
}

function createMatchCard(match) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
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

    <div class="result-status">
      ${resultText}
    </div>

    <div class="stats">
      <div class="mmr">${mmrSign}${mmrChange}</div>
      <div class="date-time">${date}${durationText ? ` dur:${durationText}` : ''}</div>
    </div>
  `;

  return card;
}

async function loadMatchHistory(token) {
  const historyList = document.getElementById('history-list');
  if (!historyList) return;

  const showEmptyMessage = (message) => {
    historyList.classList.add('is-empty');
    historyList.innerHTML = `<p class="no-matches">${message}</p>`;
  };

  const clearEmptyMessage = () => {
    historyList.classList.remove('is-empty');
    historyList.innerHTML = '';
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/users/history`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 404) {
      showEmptyMessage("You haven't played yet.");
      return;
    }

    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const matches = await res.json();

    if (!Array.isArray(matches) || matches.length === 0) {
      showEmptyMessage("You haven't played yet.");
      return;
    }

    clearEmptyMessage();
    matches.slice(0, 4).forEach((match) => {
      historyList.appendChild(createMatchCard(match));
    });
  } catch (e) {
    console.error('Critical error in history load:', e);
    showEmptyMessage('History temporary unavailable.');
  }
}

function formatDuration(durationSeconds) {
  const total = Number(durationSeconds);
  if (!Number.isFinite(total) || total < 0) {
    return '';
  }
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function renderUserProfile() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (!user) return;

  const avatar = document.querySelector('.player-info .avatar');
  const name = document.querySelector('.display-name');
  const username = document.querySelector('.username');

  if (avatar) avatar.src = user.avatar || '/default-avatar.png';
  if (name) name.textContent = user.displayedName || 'Unknown';
  if (username) username.textContent = user.username ? `@${user.username}` : '@user';
}
