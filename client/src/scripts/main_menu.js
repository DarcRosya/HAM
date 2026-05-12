import { initLogin } from './login.js';
import { initRegister } from './register.js';

export function initMainMenu() {
  const startBtn = document.getElementById('start-game-btn');
  const authModal = document.getElementById('auth-modal');
  const loginView = document.getElementById('login-view');
  const signupView = document.getElementById('signup-view');
  const bmoSpeech = document.getElementById('bmo-speech');
  const woodenBoard = document.querySelector('.wooden-board');
  const hash = window.location.hash;

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      const token = localStorage.getItem('token');
      window.location.hash = token ? '#homepage' : '#login';
    });
  }

  if (hash === '#login' || hash === '#register') {
    if (authModal) authModal.classList.remove('hidden');
    
    if (hash === '#login') {
      if (loginView) loginView.classList.remove('hidden');
      if (signupView) signupView.classList.add('hidden');
      if (woodenBoard) woodenBoard.classList.remove('signup-board');
    } else {
      if (loginView) loginView.classList.add('hidden');
      if (signupView) signupView.classList.remove('hidden');
      if (woodenBoard) woodenBoard.classList.add('signup-board');
    }
  }

  const closeModalBtn = document.getElementById('close-modal');
  if (closeModalBtn && authModal) {
    closeModalBtn.addEventListener('click', () => {
      window.location.hash = '#menu'; 
    });
  }

  const bmoToggleBtn = document.getElementById('bmo-toggle');
  if (bmoToggleBtn) {
    bmoToggleBtn.addEventListener('click', () => {
      const isCurrentlyLogin = window.location.hash === '#login';
      window.location.hash = isCurrentlyLogin ? '#register' : '#login';
    });
  }

  initLogin();
  initRegister();
}
