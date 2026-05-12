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
      window.location.hash = token ? '#homepage' : '#login';
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

    if (hash === '#login' || hash === '#register') {
      const nextView = hash === '#login' ? 'login' : 'register';
      switchAuthView(nextView);
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
