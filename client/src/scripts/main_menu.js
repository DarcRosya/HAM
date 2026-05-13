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

  const setSpeechText = (isLoginView) => {
    if (!bmoSpeech) return;
    const speechText = bmoSpeech.querySelector('.speech-text');
    const nextHtml = isLoginView ? loginSpeechHtml : registerSpeechHtml;

    defaultSpeechHtml = nextHtml;
    bmoSpeech.dataset.defaultHtml = nextHtml;

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
    if (view === currentAuthView && !authModal?.classList.contains('is-hidden')) {
      return;
    }
    if (switchTimeoutId) {
      window.clearTimeout(switchTimeoutId);
      switchTimeoutId = null;
    }

    const { instant = false } = options;
    const modalHidden = authModal?.classList.contains('is-hidden');
    const bmoContainer = document.querySelector('.bmo-container');

    if (instant || modalHidden) {
      clearBmoError({ resetText: false });
      applyAuthView(view);
      return;
    }

    const currentForm = currentAuthView === 'login' ? loginView : signupView;
    if (currentForm) {
      currentForm.classList.add('is-hidden');
    }

    if (bmoContainer) {
      bmoContainer.classList.add('is-hidden');
    }

    switchTimeoutId = window.setTimeout(() => {
      clearBmoError({ resetText: true });
      applyAuthView(view);

      setTimeout(() => {
        if (bmoContainer) bmoContainer.classList.remove('is-hidden');
      }, 50);

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
    clearBmoError({ resetText: false });
    if (resetTimeoutId) {
      window.clearTimeout(resetTimeoutId);
    }

    resetTimeoutId = window.setTimeout(() => {
      applyAuthView('login');
      resetTimeoutId = null;
    }, modalFadeDuration);
  };

  const handleHashChange = () => {
    const [route, query] = window.location.hash.split('?');
    const params = new URLSearchParams(query || '');
    const header = document.querySelector('.modal-header');
    const backBtn = document.getElementById('back-to-login-btn');
    const bmoContainer = document.querySelector('.bmo-container');

    clearBmoError({ resetText: false });

    [loginView, signupView, forgotView, resetView].forEach((v) => v?.classList.add('is-hidden'));
    backBtn?.classList.add('is-hidden');
    bmoContainer?.classList.remove('is-right');
    woodenBoard?.classList.remove('signup-board');

    if (route === '#login') {
      if (header) header.textContent = 'LOG IN';
      currentAuthView = null;
      switchAuthView('login', { instant: true });
      showAuthModal();
    } else if (route === '#register') {
      if (header) header.textContent = 'SIGN UP';
      woodenBoard?.classList.add('signup-board');
      switchAuthView('register', { instant: true });
      showAuthModal();
    } else if (route === '#forgot-password') {
      if (header) header.textContent = 'PASSWORD RECOVERY';
      backBtn?.classList.remove('is-hidden');
      forgotView?.classList.remove('is-hidden');
      if (bmoSpeech) {
        bmoSpeech.innerHTML =
          '<span class="speech-text">I\'ll send you instructions<br> to reset your password.</span>';
      }
      showAuthModal();
    } else if (route === '#reset-password') {
      if (!params.get('token')) {
        showBmoError('Invalid or missing token');
        return;
      }
      if (header) header.textContent = 'PASSWORD RECOVERY';
      resetView?.classList.remove('is-hidden');
      bmoContainer?.classList.add('is-right');
      setBmoState({ emotion: 'neutral' });
      ensureSpeechTextElement(bmoSpeech).innerHTML = 'Now come up with<br>new password!';
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

  //add logout button to interface
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
      const isCurrentlyLogin = window.location.hash === '#login';
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

function ensureSpeechTextElement(bmoSpeech) {
  let speechText = bmoSpeech.querySelector('.speech-text');
  if (!speechText) {
    bmoSpeech.innerHTML = '<span class="speech-text"></span>';
    speechText = bmoSpeech.querySelector('.speech-text');
  }
  return speechText;
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
    }
  }
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const emailInput = form.querySelector('input[name="email"]');
    const email = emailInput?.value?.trim();

    if (!email) {
      if (bmoSpeech) {
        showBmoError('Please enter your email.');
      }
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (res.ok) {
        if (bmoSpeech) {
          bmoSpeech.textContent = data.message || 'Check your email for reset link.';
        }
        form.reset();
      } else {
        if (bmoSpeech) {
          bmoSpeech.textContent = data.message || 'Failed to send reset link.';
        }
      }
    } catch (err) {
      if (bmoSpeech) {
        bmoSpeech.textContent = 'Network error occurred.';
      }
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
        localStorage.setItem(
          'passwordResetSuccess',
          JSON.stringify({
            redirect: true,

            ts: Date.now(),
          })
        );
        resetInputsGroup.classList.add('is-hidden');
        confirmBtn.classList.add('is-hidden');
        successMessage.classList.remove('is-hidden');
        setBmoState({ emotion: 'happy' });
        ensureSpeechTextElement(bmoSpeech).innerHTML =
          "Password changed!<span class='green-text'> Close<br>this tab</span> and return to login.";
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
