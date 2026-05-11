export function initMainMenu() {
  const startBtn = document.getElementById('start-game-btn');
  const authModal = document.getElementById('auth-modal');
  const closeModalBtn = document.getElementById('close-modal');
  const bmoToggleBtn = document.getElementById('bmo-toggle');
  const bmoSpeech = document.getElementById('bmo-speech');
  const loginView = document.getElementById('login-view');
  const signupView = document.getElementById('signup-view');
  const woodenBoard = document.querySelector('.wooden-board');

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      const token = localStorage.getItem('token');

      if (!token) {
        if (authModal) authModal.classList.remove('hidden');
      } else {
        window.location.hash = '#homepage';
      }
    });
  }

  if (closeModalBtn && authModal) {
    closeModalBtn.addEventListener('click', () => {
      authModal.classList.add('hidden');
    });
  }

  let isLoginMode = true; 

  if (bmoToggleBtn) {
    bmoToggleBtn.addEventListener('click', () => {
      isLoginMode = !isLoginMode; 

      if (isLoginMode) {
        if (loginView) loginView.classList.remove('hidden');
        if (signupView) signupView.classList.add('hidden');
        if (bmoSpeech) bmoSpeech.innerHTML = 'No account yet?<br><span class="green-text">Click on me</span> to sign up!';
        
        if (woodenBoard) woodenBoard.classList.remove('signup-board'); 
        
      } else {
        if (loginView) loginView.classList.add('hidden');
        if (signupView) signupView.classList.remove('hidden');
        if (bmoSpeech) bmoSpeech.innerHTML = 'Have an account?<br><span class="green-text">Click on me</span> to log in!';
        
        if (woodenBoard) woodenBoard.classList.add('signup-board');
      }
    });
  }
}