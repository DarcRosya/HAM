import { initLogin } from './login.js';
import { initRegister } from './register.js';
import { API_BASE_URL } from '../services/api.js';

let cachedModalAssetsReady = null;
let activeHashHandler = null;
let currentAuthView = 'login';
let switchTimeoutId = null;
let resetTimeoutId = null;
let bmoErrorTimeoutId = null;
let defaultSpeechHtml = null;

let isInstantLoadEnabled = true;
window.addEventListener('load', () => {
  setTimeout(() => {
    isInstantLoadEnabled = false;
  }, 100);
});

const BMO_ASSETS = {
  neutral: 'src/assets/images/happy-bmo.png',
  sad: 'src/assets/images/sad_bmo.png',
  happy: 'src/assets/images/happiest_bmo.png',
};

function setBmoState({ emotion = 'neutral', speech = null }) {
  const bmoBtn = document.getElementById('bmo-toggle');
  const bmoSpeech = document.getElementById('bmo-speech');
  if (!bmoBtn || !bmoSpeech) return;
  const image = BMO_ASSETS[emotion];
  bmoBtn.style.backgroundImage = `url('${image}')`;
  bmoBtn.classList.remove('bmo-neutral', 'bmo-sad', 'bmo-happy');
  bmoBtn.classList.add(`bmo-${emotion}`);
  if (speech !== null) {
    const speechText = ensureSpeechTextElement(bmoSpeech);
    speechText.innerHTML = speech;
  }
}

function showResetSuccessUI() {
  const resetInputsGroup = document.getElementById('reset-inputs-group');
  const confirmBtn = document.getElementById('confirm-reset-btn');
  const successMessage = document.getElementById('success-message');

  if (resetInputsGroup) resetInputsGroup.classList.add('is-hidden');
  if (confirmBtn) confirmBtn.classList.add('is-hidden');
  if (successMessage) successMessage.classList.remove('is-hidden');

  setBmoState({
    emotion: 'happy',
    speech: "Password changed!<br><span class='green-text'>Click on me</span> to log in.",
  });

  const bmoSpeech = document.getElementById('bmo-speech');
  if (bmoSpeech) {
    const speechText = bmoSpeech.querySelector('.speech-text') || bmoSpeech;
    speechText.style.fontFamily = "'Londrina Solid', sans-serif";
  }
}

export function showBmoError(message) {
  const bmoSpeech = document.getElementById('bmo-speech');
  if (!bmoSpeech) return;

  const speechText = ensureSpeechTextElement(bmoSpeech);
  const fallbackHtml = bmoSpeech.dataset.defaultHtml || speechText.innerHTML;
  defaultSpeechHtml = fallbackHtml;

  if (bmoErrorTimeoutId) {
    window.clearTimeout(bmoErrorTimeoutId);
    bmoErrorTimeoutId = null;
  }

  bmoSpeech.classList.add('error-state');
  setBmoState({
    emotion: 'sad',
    speech: message || 'Something went wrong',
  });

  bmoErrorTimeoutId = window.setTimeout(() => {
    bmoSpeech.classList.remove('error-state');
    setBmoState({
      emotion: 'neutral',
      speech: defaultSpeechHtml,
    });
  }, 4000);
}

function clearBmoError(options = {}) {
  const { resetText = true } = options;
  const bmoSpeech = document.getElementById('bmo-speech');
  if (!bmoSpeech) return;
  const speechText = ensureSpeechTextElement(bmoSpeech);

  if (bmoErrorTimeoutId) {
    window.clearTimeout(bmoErrorTimeoutId);
    bmoErrorTimeoutId = null;
  }

  bmoSpeech.classList.remove('error-state');
  setBmoState({ emotion: 'neutral' });

  if (resetText) {
    const fallbackHtml = bmoSpeech.dataset.defaultHtml || defaultSpeechHtml;
    if (fallbackHtml) {
      speechText.innerHTML = fallbackHtml;
      speechText.style.fontFamily = '';
    }
  }
}

function ensureSpeechTextElement(bmoSpeech) {
  let speechText = bmoSpeech.querySelector('.speech-text');
  if (!speechText) {
    bmoSpeech.innerHTML = '<span class="speech-text"></span>';
    speechText = bmoSpeech.querySelector('.speech-text');
  }
  return speechText;
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

export function initMainMenu() {
  const startBtn = document.getElementById('start-game-btn');
  const cardsBtn = document.getElementById('cards-btn');
  const creditsBtn = document.getElementById('credits-btn');
  const authModal = document.getElementById('auth-modal');
  const loginView = document.getElementById('login-view');
  const signupView = document.getElementById('signup-view');
  const bmoSpeech = document.getElementById('bmo-speech');
  const bmoContainer = document.querySelector('.bmo-container');
  const woodenBoard = document.querySelector('.wooden-board');
  const resetView = document.getElementById('reset-view');
  const forgotView = document.getElementById('forgot-view');

  const loginSpeechHtml =
    'No account yet?<br><span class="green-text">Click on me</span> to sign up!';
  const registerSpeechHtml =
    'Have an account?<br><span class="green-text">Click on me</span> to log in!';
  const formSwitchDelay = 160;
  const modalFadeDuration = 300;

  if (!cachedModalAssetsReady) {
    cachedModalAssetsReady = preloadImages([
      'src/assets/images/board-login.png',
      'src/assets/images/board-signup.png',
      'src/assets/images/metal-frame.png',
      'src/assets/images/speech-bubble1.png',
      'src/assets/images/happy-bmo.png',
      'src/assets/images/sad_bmo.png',
      'src/assets/images/happiest_bmo.png',
    ]);
  }

  const modalAssetsReady = cachedModalAssetsReady;

  if (typeof window !== 'undefined') {
    window.showBmoError = showBmoError;
  }

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      const token = localStorage.getItem('token');
      window.location.hash = token ? '#lobby' : '#login';
    });
  }

  if (cardsBtn) {
    cardsBtn.addEventListener('click', () => {
        window.location.hash = '#gallery';
    });
  }

  if (creditsBtn) {
    creditsBtn.addEventListener('click', () => {
        window.location.hash = '#credits';
    });
  }

  if (cardsBtn) {
    cardsBtn.addEventListener('click', () => {
        window.location.hash = '#gallery';
    });
  }

  if (creditsBtn) {
    creditsBtn.addEventListener('click', () => {
        window.location.hash = '#credits';
    });
  }

  const applyAuthView = (view) => {
    const views = { login: loginView, register: signupView, forgot: forgotView, reset: resetView };

    Object.values(views).forEach((v) => v?.classList.add('is-hidden'));

    const backBtn = document.getElementById('back-to-login-btn');
    backBtn?.classList.add('is-hidden');

    if (woodenBoard) {
      woodenBoard.classList.remove('signup-board');
      woodenBoard.classList.remove('is-hidden');
    }
    if (bmoContainer) bmoContainer.classList.remove('is-right');

    if (view === 'login') {
      views['login']?.classList.remove('is-hidden');
      setBmoState({ emotion: 'neutral', speech: loginSpeechHtml });
    } else if (view === 'register') {
      views['register']?.classList.remove('is-hidden');
      if (woodenBoard) woodenBoard.classList.add('signup-board');
      if (bmoContainer) bmoContainer.classList.add('is-right');
      setBmoState({ emotion: 'neutral', speech: registerSpeechHtml });
    } else if (view === 'forgot') {
      views['forgot']?.classList.remove('is-hidden');
      if (woodenBoard) woodenBoard.classList.add('is-hidden');
      backBtn?.classList.remove('is-hidden');
      setBmoState({
        emotion: 'neutral',
        speech: 'Forgot password?<br><span class="green-text">Click on me</span> to go back!',
      });
    } else if (view === 'reset') {
      views['reset']?.classList.remove('is-hidden');
      if (woodenBoard) woodenBoard.classList.add('is-hidden');
      if (bmoContainer) bmoContainer.classList.add('is-right');
    }

    currentAuthView = view;
  };

  const switchAuthView = (view, options = {}) => {
    if (view === currentAuthView && !authModal?.classList.contains('is-hidden')) return;

    if (switchTimeoutId) {
      window.clearTimeout(switchTimeoutId);
      switchTimeoutId = null;
    }

    const { instant = false } = options;
    const modalHidden = authModal?.classList.contains('is-hidden');

    if (instant || modalHidden) {
      clearBmoError({ resetText: false });
      applyAuthView(view);
      return;
    }

    const views = [loginView, signupView, forgotView, resetView];
    const currentForm = views.find((v) => !v?.classList.contains('is-hidden'));
    if (currentForm) currentForm.classList.add('is-hidden');

    if (bmoContainer) bmoContainer.classList.add('is-hidden');

    switchTimeoutId = window.setTimeout(() => {
      clearBmoError({ resetText: false });
      applyAuthView(view);

      setTimeout(() => {
        if (bmoContainer) bmoContainer.classList.remove('is-hidden');
      }, 50);

      switchTimeoutId = null;
    }, formSwitchDelay);
  };

  const showAuthModal = (instant = false) => {
    if (!authModal) return;
    if (resetTimeoutId) {
      window.clearTimeout(resetTimeoutId);
      resetTimeoutId = null;
    }

    modalAssetsReady.then(() => {
      if (instant) {
        const frame = authModal.querySelector('.modal-frame');
        authModal.style.transition = 'none';
        if (frame) frame.style.transition = 'none';

        authModal.classList.remove('is-hidden');
        void authModal.offsetWidth;

        authModal.style.transition = '';
        if (frame) frame.style.transition = '';
      } else {
        requestAnimationFrame(() => authModal.classList.remove('is-hidden'));
      }
    });
  };

  const hideAuthModal = () => {
    if (authModal) authModal.classList.add('is-hidden');
    if (switchTimeoutId) {
      window.clearTimeout(switchTimeoutId);
      switchTimeoutId = null;
    }
    clearBmoError({ resetText: false });
    if (resetTimeoutId) window.clearTimeout(resetTimeoutId);

    resetTimeoutId = window.setTimeout(() => {
      applyAuthView('login');
      resetTimeoutId = null;
    }, modalFadeDuration);
  };

  const handleHashChange = () => {
    const [route, query] = window.location.hash.split('?');
    const params = new URLSearchParams(query || '');
    const header = document.querySelector('.modal-header');

    let targetView = null;

    if (route === '#login') {
      if (header) header.textContent = 'LOG IN';
      targetView = 'login';
    } else if (route === '#register') {
      if (header) header.textContent = 'SIGN UP';
      targetView = 'register';
    } else if (route === '#forgot-password') {
      if (header) header.textContent = 'PASSWORD RECOVERY';
      targetView = 'forgot';
    } else if (route === '#reset-password') {
      const token = params.get('token');

      if (token && localStorage.getItem(`reset_success_${token}`)) {
        switchAuthView('reset', { instant: isInstantLoadEnabled });
        showResetSuccessUI();
        showAuthModal(isInstantLoadEnabled);
        return;
      }

      if (!token) {
        showBmoError('Invalid or missing token');
        return;
      }

      header.textContent = 'PASSWORD RECOVERY';
      targetView = 'reset';
    } else {
      hideAuthModal();
      return;
    }

    const isInstant =
      isInstantLoadEnabled && window.location.hash !== '' && window.location.hash !== '#menu';

    switchAuthView(targetView, { instant: isInstant });

    if (targetView === 'reset') {
      setBmoState({ emotion: 'neutral', speech: 'Now come up with<br>new password!' });
    }

    if (authModal) {
      cachedModalAssetsReady.then(() => {
        if (isInstant) {
          authModal.style.opacity = '0';
          authModal.classList.remove('is-hidden');

          requestAnimationFrame(() => {
            authModal.style.transition = 'opacity 0.4s ease';
            authModal.style.opacity = '1';
          });
        } else {
          authModal.classList.remove('is-hidden');
        }
      });
    }
  };

  activeHashHandler = handleHashChange;
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('storage', (e) => {
    if (e.key !== 'passwordResetSuccess') return;
    const data = JSON.parse(e.newValue || '{}');
    if (data?.redirect) {
      window.location.hash = '#login';
      localStorage.removeItem('passwordResetSuccess');
    }
  });

  currentAuthView = loginView?.classList.contains('is-hidden') ? 'register' : 'login';
  handleHashChange();

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.hash = '#login';
    });
  }

  const backToLoginBtn = document.getElementById('back-to-login-btn');
  if (backToLoginBtn) {
    backToLoginBtn.addEventListener('click', () => {
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
      const hash = window.location.hash.split('?')[0];

      if (hash === '#forgot-password') {
        window.location.hash = '#login';
        return;
      }

      if (hash === '#reset-password') {
        const successMsg = document.getElementById('success-message');
        if (successMsg && !successMsg.classList.contains('is-hidden')) {
          window.location.hash = '#login';
        }
        return;
      }

      const isCurrentlyLogin = hash === '#login';
      window.location.hash = isCurrentlyLogin ? '#register' : '#login';
    });
  }

  const forgotBtn = document.querySelector('.forgot-password');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', () => {
      window.location.hash = '#forgot-password';
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const emailInput = form.querySelector('input[name="email"]');
    const email = emailInput?.value?.trim();

    if (!email) {
      showBmoError('Please enter your email.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (res.ok) {
        setBmoState({
          emotion: 'happy',
          speech: 'Link sent!<br><span class="green-text">Click on me</span> to go back.',
        });
        form.reset();
      } else {
        showBmoError(data.message || 'Failed to send reset link.');
      }
    } catch (err) {
      showBmoError('Network error occurred.');
    }
  });
}

function initResetPassword() {
  const confirmBtn = document.getElementById('confirm-reset-btn');
  const resetInputsGroup = document.getElementById('reset-inputs-group');
  const successMessage = document.getElementById('success-message');
  const bmoSpeech = document.getElementById('bmo-speech');

  if (!confirmBtn) return;

  confirmBtn.onclick = async () => {
    const password = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-new-password').value;
    const inputs = resetInputsGroup.querySelectorAll('input');

    inputs.forEach((i) => (i.disabled = true));

    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const token = params.get('token');

    if (password !== confirm) {
      showBmoError("Passwords don't match!");
      inputs.forEach((i) => (i.disabled = false));
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });

      if (res.ok) {
        localStorage.setItem(`reset_success_${token}`, 'true');

        clearBmoError({ resetText: false });

        showResetSuccessUI();
      } else {
        const data = await res.json();
        showBmoError(data.message);
        inputs.forEach((i) => (i.disabled = false));
      }
    } catch (err) {
      showBmoError('Server error!');
      inputs.forEach((i) => (i.disabled = false));
    }
  };
}
