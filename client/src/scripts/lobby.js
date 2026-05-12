import { socketService } from '../services/socket.js';

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
  let tipInterval = null;

  socket.off('match_found');
  socket.off('waiting_for_opponent');

  if (playBtn && searchOverlay) {
    playBtn.addEventListener('click', () => {
      searchOverlay.classList.remove('hidden');
      let tipIndex = 0;
      tipElement.textContent = searchTips[tipIndex];

      tipInterval = setInterval(() => {
        if (searchOverlay.classList.contains('hidden')) {
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
      searchOverlay.classList.add('hidden');
      clearInterval(tipInterval);
      socket.emit('cancel_matchmaking');
    });
  }

  socket.on('match_found', (state) => {
    sessionStorage.setItem('pendingMatchState', JSON.stringify(state));
    window.location.hash = '#battle';
  });

  return true;
}

function createMatchCard(match) {
  const card = document.createElement('div');
  card.className = `match-card ${match.isWinner ? 'victory' : 'defeat'}`;

  const mmrSign = match.mmrChange > 0 ? '+' : '';
  const date = new Date(match.createdAt).toLocaleDateString('ru-RU');

  card.innerHTML = `
    <div class="vs-block">
      <img src="${match.myAvatar || '/avatar.png'}" class="mini-avatar">
      <span class="vs-text">VS</span>
      <img src="${match.opponent.avatar || '/enemy.png'}" class="mini-avatar">
      <span class="enemy-username">${match.opponent.username}</span>
    </div>

    <div class="result-status">
      ${match.isWinner ? 'Victory' : 'Defeat'}
    </div>

    <div class="stats">
      <div class="mmr">${mmrSign}${match.mmrChange}</div>
      <div class="date-time">${date} dur:${match.duration}</div>
    </div>
  `;

  return card;
}

async function loadMatchHistory(token) {
  const historyList = document.getElementById('history-list');
  if (!historyList) return;

  try {
    const res = await fetch('/api/users/history', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 404) {
      historyList.innerHTML = `<p class="no-matches">You haven't played yet.</p>`;
      return;
    }

    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const matches = await res.json();

    if (!Array.isArray(matches) || matches.length === 0) {
      historyList.innerHTML = `<p class="no-matches">You haven't played yet.</p>`;
      return;
    }

    historyList.innerHTML = '';
    matches.forEach((match) => {
      historyList.appendChild(createMatchCard(match));
    });
  } catch (e) {
    console.error('Critical error in history load:', e);
    historyList.innerHTML = `<p class="no-matches">History temporary unavailable.</p>`;
  }
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
