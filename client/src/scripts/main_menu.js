import { initLogin } from './login.js';
import { initRegister } from './register.js';

let cachedModalAssetsReady = null;
let activeHashHandler = null;
let currentAuthView = 'login';
let switchTimeoutId = null;
let resetTimeoutId = null;

export function initMainMenu() {
  const startBtn = document.getElementById('start-game-btn');
  const authModal = document.getElementById('auth-modal');
  const loginView = document.getElementById('login-view');
  const signupView = document.getElementById('signup-view');
  const bmoSpeech = document.getElementById('bmo-speech');
  const bmoContainer = document.querySelector('.bmo-container');
  const woodenBoard = document.querySelector('.wooden-board');
  const resetView = document.getElementById('reset-view');
  const forgotView = document.getElementById('forgot-view');

  const fullHash = window.location.hash;
  const cleanHash = fullHash.split('?')[0];

  const loginSpeechHtml =
    'No account yet?<br><span class="green-text">Click on me</span> to sign up!';
  const registerSpeechHtml =
    'Already have an account?<br><span class="green-text">Click on me</span> to log in!';
  const formSwitchDelay = 160;
  const modalFadeDuration = 300;

  if (!cachedModalAssetsReady) {
    cachedModalAssetsReady = preloadImages([
      'src/assets/images/board-login.png',
      'src/assets/images/board-signup.png',
      'src/assets/images/metal-frame.png',
      'src/assets/images/speech-bubble1.png',
      'src/assets/images/happy-bmo.png',
    ]);
  }

  const modalAssetsReady = cachedModalAssetsReady;

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      const token = localStorage.getItem('token');
      window.location.hash = token ? '#lobby' : '#login';
    });
  }

  const setSpeechText = (isLoginView) => {
    if (!bmoSpeech) return;
    const speechText = bmoSpeech.querySelector('.speech-text');
    const nextHtml = isLoginView ? loginSpeechHtml : registerSpeechHtml;

    if (speechText) {
      speechText.innerHTML = nextHtml;
    } else {
      bmoSpeech.innerHTML = `<span class="speech-text">${nextHtml}</span>`;
    }
  };

  const applyAuthView = (view) => {
    const isLoginView = view === 'login';

    if (loginView) loginView.classList.toggle('is-hidden', !isLoginView);
    if (signupView) signupView.classList.toggle('is-hidden', isLoginView);
    if (woodenBoard) woodenBoard.classList.toggle('signup-board', !isLoginView);
    if (bmoContainer) bmoContainer.classList.toggle('is-right', !isLoginView);
    setSpeechText(isLoginView);
    currentAuthView = view;
  };

  const switchAuthView = (view, options = {}) => {
    if (view === currentAuthView) return;
    if (switchTimeoutId) {
      window.clearTimeout(switchTimeoutId);
      switchTimeoutId = null;
    }

    const { instant = false } = options;
    const modalHidden = authModal?.classList.contains('is-hidden');

    if (instant || modalHidden) {
      applyAuthView(view);
      return;
    }

    const currentForm = currentAuthView === 'login' ? loginView : signupView;
    if (currentForm) {
      currentForm.classList.add('is-hidden');
    }

    switchTimeoutId = window.setTimeout(() => {
      applyAuthView(view);
      switchTimeoutId = null;
    }, formSwitchDelay);
  };

  const showAuthModal = () => {
    if (!authModal) return;
    if (resetTimeoutId) {
      window.clearTimeout(resetTimeoutId);
      resetTimeoutId = null;
    }
    modalAssetsReady.then(() => {
      requestAnimationFrame(() => authModal.classList.remove('is-hidden'));
    });
  };

  const hideAuthModal = () => {
    if (authModal) authModal.classList.add('is-hidden');
    if (switchTimeoutId) {
      window.clearTimeout(switchTimeoutId);
      switchTimeoutId = null;
    }
    if (resetTimeoutId) {
      window.clearTimeout(resetTimeoutId);
    }

    resetTimeoutId = window.setTimeout(() => {
      applyAuthView('login');
      resetTimeoutId = null;
    }, modalFadeDuration);
  };

  const handleHashChange = () => {
    const hash = window.location.hash;

    if (
      hash === '#login' ||
      hash === '#register' ||
      hash === '#reset-password' ||
      hash === '#forgot-password'
    ) {
      if (hash === '#login' || hash === '#register') {
        const nextView = hash === '#login' ? 'login' : 'register';
        switchAuthView(nextView);
      }
      showAuthModal();
    } else {
      hideAuthModal();
    }
  };

  if (activeHashHandler) {
    window.removeEventListener('hashchange', activeHashHandler);
  }

  activeHashHandler = handleHashChange;
  window.addEventListener('hashchange', handleHashChange);
  currentAuthView = loginView?.classList.contains('is-hidden') ? 'register' : 'login';
  handleHashChange();

  //add logout button to interface
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.hash = '#login';
    });
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

function preloadImages(paths) {
  return Promise.all(
    paths.map(
      (path) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = resolve;
          img.src = path;
        })
    )
  );
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
