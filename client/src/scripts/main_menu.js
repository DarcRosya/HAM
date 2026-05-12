import { initLogin } from './login.js';
import { initRegister } from './register.js';

export function initMainMenu() {
  const startBtn = document.getElementById('start-game-btn');
  const authModal = document.getElementById('auth-modal');
  const loginView = document.getElementById('login-view');
  const signupView = document.getElementById('signup-view');
  const bmoSpeech = document.getElementById('bmo-speech');
  const woodenBoard = document.querySelector('.wooden-board');
  const resetView = document.getElementById('reset-view');
  const forgotView = document.getElementById('forgot-view');

  const fullHash = window.location.hash;
  const cleanHash = fullHash.split('?')[0];

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      const token = localStorage.getItem('token');
      window.location.hash = token ? '#lobby' : '#login';
    });
  }

  //add logout button to interface
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.hash = '#login';
    });
  }

  if (['#login', '#register', '#reset-password', '#forgot-password'].includes(cleanHash)) {
    authModal?.classList.remove('hidden');
    [loginView, signupView, resetView, forgotView].forEach((v) => v?.classList.add('hidden'));

    if (cleanHash === '#login') {
      loginView?.classList.remove('hidden');
      woodenBoard?.classList.remove('signup-board');
    } else if (cleanHash === '#register') {
      signupView?.classList.remove('hidden');
      woodenBoard?.classList.add('signup-board');
    } else if (cleanHash === '#reset-password') {
      resetView?.classList.remove('hidden');
    } else if (cleanHash === '#forgot-password') {
      forgotView?.classList.remove('hidden');
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

  initForgotPassword();
  initResetPassword();

  initLogin();
  initRegister();
}

function initForgotPassword() {
  const form = document.getElementById('forgot-password-form');
  const bmoSpeech = document.getElementById('bmo-speech');
  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const email = form.querySelector('input[name="email"]').value;

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (res.ok) {
        if (bmoSpeech) {
          bmoSpeech.textContent = data.message || 'Check email.';
        }
        form.reset();
      } else {
        if (bmoSpeech) {
          bmoSpeech.textContent = data.message || 'Failed to send reset link.';
        }
      }
    } catch (err) {
      if (bmoSpeech) {
        bmoSpeech.textContent = 'A network error occurred.';
      }
    }
  };
}

function initResetPassword() {
  const form = document.getElementById('reset-password-form');
  const bmoSpeech = document.getElementById('bmo-speech');
  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const password = form.querySelector('input[name="password"]').value;
    const confirmPassword = form.querySelector('input[name="confirmPassword"]').value;

    if (password !== confirmPassword) {
      if (bmoSpeech) {
        bmoSpeech.textContent = "Passwords don't match.";
      }
      return;
    }

    const hashParts = window.location.hash.split('?');
    const params = new URLSearchParams(hashParts[1] || '');
    const token = params.get('token');

    if (!token) {
      if (bmoSpeech) bmoSpeech.textContent = 'Reset token is missing or invalid.';
      return;
    }

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      if (res.ok) {
        if (bmoSpeech) {
          bmoSpeech.textContent = 'Password has been reset successfully.';
        }
        form.reset();
        setTimeout(() => {
          window.location.hash = '#login';
        }, 2000);
      } else {
        if (bmoSpeech) {
          bmoSpeech.textContent = data.message || 'Unable to reset password.';
        }
      }
    } catch (err) {
      if (bmoSpeech) {
        bmoSpeech.textContent = 'Server error occurred.';
      }
    }
  };
}
