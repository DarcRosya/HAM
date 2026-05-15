import { store } from '../../core/store.js';
import { userService } from '../../services/userService.js';

export async function initHistory(historyListElement) {
  if (!historyListElement) {
    console.warn('[History] Контейнер для истории не найден');
    return;
  }

  const token = store.getToken();
  if (!token) return;

  const showEmptyMessage = (msg) => {
    historyListElement.classList.add('is-empty');
    historyListElement.innerHTML = `<p class="no-matches">${msg}</p>`;
  };

  try {
    const matches = await userService.getMatchHistory(token);

    if (!Array.isArray(matches) || matches.length === 0) {
      return showEmptyMessage("You haven't played yet.");
    }

    historyListElement.classList.remove('is-empty');
    historyListElement.innerHTML = '';

    matches.slice(0, 4).forEach((match) => {
      historyListElement.appendChild(createMatchCard(match));
    });
  } catch (e) {
    console.error('[History] Ошибка загрузки:', e);
    showEmptyMessage('History temporarily unavailable.');
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
  const opponentName = `@${match.username}` || 'Opponent';
  const opponentAvatar = match.avatar || '/assets/avatars/avatar.png';
  const myAvatar = user?.avatar || '/assets/avatars/avatar.png';
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
