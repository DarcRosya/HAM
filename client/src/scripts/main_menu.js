export function initMainMenu() {
  const startBtn = document.getElementById('start-game-btn');

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      const token = localStorage.getItem('token');

      if (!token) {
        window.location.hash = '#login';
      } else {
        window.location.hash = '#homepage';
      }
    });
  }
}
