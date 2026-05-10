import { socketService } from '../services/socket.js';

export function initLobby() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.hash = '#login';
    return false;
  }

  const socket = socketService.connect();
  const findMatchBtn = document.getElementById('find-match-btn');
  const statusText = document.getElementById('lobby-status');

  if (findMatchBtn) {
    findMatchBtn.addEventListener('click', () => {
      // Отправляем сигнал серверу
      socket.emit('find_match');
      findMatchBtn.disabled = true;
      statusText.textContent = 'Searching for an opponent...';
    });
  }

  // Слушаем ответ от сервера, если встали в очередь
  socket.on('waiting_for_opponent', () => {
    statusText.textContent = 'Waiting for another player to join...';
  });

  // ЭТО САМОЕ ВАЖНОЕ: Переход в бой
  // Обрати внимание, у нас в battle.js тоже есть слушатель match_found,
  // но он отвечает за ОТРИСОВКУ. А этот слушатель в Лобби отвечает за ПЕРЕХОД.
  socket.on('match_found', (state) => {
    // Сохраняем стейт старта игры в память
    sessionStorage.setItem('pendingMatchState', JSON.stringify(state));
    window.location.hash = '#battle';
  });

  return true;
}
