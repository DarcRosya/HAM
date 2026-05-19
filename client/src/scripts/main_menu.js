import { initLogin } from './login.js';
import { initRegister } from './register.js';
import { API_BASE_URL } from '../services/api.js';

let isMounted = false;
let activeTimeouts = new Set();
let globalListeners = {};

const safeSetTimeout = (cb, delay) => {
  const id = window.setTimeout(() => {
    activeTimeouts.delete(id);
    cb();
  }, delay);
  activeTimeouts.add(id);
  return id;
};

const clearAllTimeouts = () => {
  activeTimeouts.forEach((id) => window.clearTimeout(id));
  activeTimeouts.clear();
};

const BMO = {
  defaultHtml: null,

  init() {
    this.btn = document.getElementById('bmo-toggle');
    this.speech = document.getElementById('bmo-speech');
    if (this.speech) {
      const textNode = this.speech.querySelector('.speech-text');
      this.defaultHtml = this.speech.dataset.defaultHtml || (textNode ? textNode.innerHTML : '');
    }
  },

  setState({ emotion = 'neutral', speech = null }) {
    if (!this.btn || !this.speech) return;

    const assets = {
      neutral: '/assets/images/happy-bmo.png',
      sad: '/assets/images/sad_bmo.png',
      happy: '/assets/images/happiest_bmo.png',
    };

    this.btn.style.backgroundImage = `url('${assets[emotion]}')`;
    this.btn.className = `bmo-btn bmo-${emotion}`;

    if (speech !== null) {
      let textNode = this.speech.querySelector('.speech-text');
      if (!textNode) {
        this.speech.innerHTML = '<span class="speech-text"></span>';
        textNode = this.speech.querySelector('.speech-text');
      }
      textNode.innerHTML = speech;
    }
  },

  showError(message) {
    if (!this.speech) return;

    this.speech.classList.add('error-state');
    this.setState({ emotion: 'sad', speech: message || 'Something went wrong' });

    safeSetTimeout(() => {
      if (!isMounted) return;
      this.speech.classList.remove('error-state');
      this.setState({ emotion: 'neutral', speech: this.defaultHtml });
    }, 4000);
  },

  clearError() {
    if (!this.speech) return;
    this.speech.classList.remove('error-state');
    this.setState({ emotion: 'neutral', speech: this.defaultHtml });
  },
};

window.showBmoError = (msg) => BMO.showError(msg);

const AuthUI = {
  views: {},

  init() {
    this.modal = document.getElementById('auth-modal');
    this.header = document.querySelector('.modal-header');
    this.board = document.querySelector('.wooden-board');
    this.bmoContainer = document.querySelector('.bmo-container');
    this.backBtn = document.getElementById('back-to-login-btn');

    this.views = {
      login: document.getElementById('login-view'),
      register: document.getElementById('signup-view'),
      forgot: document.getElementById('forgot-view'),
      reset: document.getElementById('reset-view'),
      logout: document.getElementById('logout-view'),
    };
  },

  applyView(viewName) {
    if (!this.modal) return;

    Object.values(this.views).forEach((v) => v?.classList.add('is-hidden'));
    this.backBtn?.classList.add('is-hidden');
    this.board?.classList.remove('signup-board', 'is-hidden');
    this.bmoContainer?.classList.remove('is-right');

    const speechMap = {
      login: 'No account yet?<br><span class="green-text">Click on me</span> to sign up!',
      register: 'Have an account?<br><span class="green-text">Click on me</span> to log in!',
      forgot: 'Forgot password?<br><span class="green-text">Click on me</span> to go back!',
      reset: 'Now come up with<br>new password!',
      logout: `Leaving already,<br>${JSON.parse(localStorage.getItem('user') || '{}').displayedName || 'user'}?`,
    };

    const headerMap = {
      login: 'LOG IN',
      register: 'SIGN UP',
      forgot: 'PASSWORD RECOVERY',
      reset: 'PASSWORD RECOVERY',
      logout: 'LOG OUT',
    };

    if (this.header) this.header.textContent = headerMap[viewName] || '';
    if (this.views[viewName]) this.views[viewName].classList.remove('is-hidden');

    if (viewName === 'register') {
      this.board?.classList.add('signup-board');
      this.bmoContainer?.classList.add('is-right');
    } else if (viewName === 'forgot') {
      this.board?.classList.add('is-hidden');
      this.backBtn?.classList.remove('is-hidden');
    } else if (viewName === 'reset') {
      this.board?.classList.add('is-hidden');
      this.bmoContainer?.classList.add('is-right');
    } else if (viewName === 'logout') {
      this.board?.classList.add('is-hidden');
    }

    BMO.setState({ emotion: 'neutral', speech: speechMap[viewName] });
    BMO.defaultHtml = speechMap[viewName];
  },

  showModal() {
    this.modal?.classList.remove('is-hidden');
  },

  hideModal() {
    this.modal?.classList.add('is-hidden');
  },
};

const handleHashChange = () => {
  const hash = window.location.hash.split('?')[0];
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');

  BMO.clearError();

  switch (hash) {
    case '#login':
      AuthUI.applyView('login');
      AuthUI.showModal();
      break;
    case '#register':
      AuthUI.applyView('register');
      AuthUI.showModal();
      break;
    case '#forgot-password':
      AuthUI.applyView('forgot');
      AuthUI.showModal();
      break;
    case '#reset-password':
      const token = params.get('token');
      if (!token) {
        window.location.hash = '#login';
        return;
      }
      AuthUI.applyView('reset');
      AuthUI.showModal();
      break;
    case '#logout':
      AuthUI.applyView('logout');
      AuthUI.showModal();
      break;
    case '#menu':
    case '#cards':
    case '#credits':
    case '':
      AuthUI.hideModal();
      break;
    default:
      AuthUI.hideModal();
  }
};

export function mount() {
  if (isMounted) {
    handleHashChange();
    return;
  }

  isMounted = true;

  BMO.init();
  AuthUI.init();

  initLogin();
  initRegister();
  initForgotPassword();
  initResetPassword();
  initPasswordToggles();

  const startBtn = document.getElementById('start-game-btn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      window.location.hash = localStorage.getItem('token') ? '#lobby' : '#login';
    });
  }

  const cardsBtn = document.getElementById('cards-btn');
  if (cardsBtn) {
    cardsBtn.addEventListener('click', () => {
      window.location.hash = '#gallery';
    });
  }

  const creditsBtn = document.getElementById('credits-btn');
  if (creditsBtn) {
    creditsBtn.addEventListener('click', () => {
      window.location.hash = '#credits';
    });
  }

  const closeModalBtn = document.getElementById('close-modal');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      window.location.hash = '#menu';
      AuthUI.hideModal();
    });
  }

  const backToLoginBtn = document.getElementById('back-to-login-btn');
  if (backToLoginBtn) {
    backToLoginBtn.addEventListener('click', () => (window.location.hash = '#login'));
  }

  const forgotBtn = document.querySelector('.forgot-password');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = '#forgot-password';
    });
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    if (localStorage.getItem('token')) {
      logoutBtn.classList.remove('is-hidden');
    } else {
      logoutBtn.classList.add('is-hidden');
    }
    logoutBtn.addEventListener('click', () => {
      AuthUI.applyView('logout');
      BMO.setState({
        emotion: 'sad',
        speech: BMO.defaultHtml,
      });
      AuthUI.showModal();
    });
  }

  const stayBtn = document.getElementById('stay-btn');
  if (stayBtn) {
    stayBtn.addEventListener('click', () => {
      AuthUI.hideModal();
      window.location.hash = '#menu';
    });
  }

  const confirmLogoutBtn = document.getElementById('confirm-logout-btn');
  if (confirmLogoutBtn) {
    confirmLogoutBtn.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.hash = '#menu';
      location.reload();
    });
  }

  const bmoToggleBtn = document.getElementById('bmo-toggle');
  if (bmoToggleBtn) {
    bmoToggleBtn.addEventListener('click', () => {
      const hash = window.location.hash.split('?')[0];
      if (hash === '#login') window.location.hash = '#register';
      else if (hash === '#register') window.location.hash = '#login';
      else if (hash === '#forgot-password') window.location.hash = '#login';
    });
  }

  globalListeners.storage = (e) => {
    if (e.key === 'passwordResetSuccess') {
      const data = JSON.parse(e.newValue || '{}');
      if (data?.redirect) {
        window.location.hash = '#login';
        localStorage.removeItem('passwordResetSuccess');
      }
    }
  };
  window.addEventListener('storage', globalListeners.storage);
  handleHashChange();
}

export function unmount() {
  if (!isMounted) return;
  isMounted = false;

  clearAllTimeouts();

  if (globalListeners.storage) {
    window.removeEventListener('storage', globalListeners.storage);
    globalListeners.storage = null;
  }
}

function initForgotPassword() {
  const form = document.getElementById('forgot-password-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.querySelector('input[name="email"]')?.value?.trim();

    if (!email) {
      BMO.showError('Please enter your email.');
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        BMO.setState({
          emotion: 'happy',
          speech: 'Link sent!<br><span class="green-text">Click on me</span> to go back.',
        });
        form.reset();
      } else {
        const data = await res.json();
        BMO.showError(data.message || 'Failed to send link.');
      }
    } catch (err) {
      BMO.showError('Network error occurred.');
    }
  });
}

function initResetPassword() {
  const confirmBtn = document.getElementById('confirm-reset-btn');
  if (!confirmBtn) return;

  confirmBtn.addEventListener('click', async () => {
    const password = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-new-password').value;
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const token = params.get('token');

    if (password !== confirm) {
      BMO.showError("Passwords don't match!");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });

      if (res.ok) {
        document.getElementById('reset-inputs-group')?.classList.add('is-hidden');
        confirmBtn.classList.add('is-hidden');
        document.getElementById('success-message')?.classList.remove('is-hidden');
        BMO.setState({
          emotion: 'happy',
          speech: "Password changed!<br><span class='green-text'>Click on me</span> to log in.",
        });
      } else {
        const data = await res.json();
        BMO.showError(data.message);
      }
    } catch (err) {
      BMO.showError('Server error!');
    }
  });
}

function initPasswordToggles() {
  document.querySelectorAll('.toggle-pass').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const wrapper = btn.closest('.pass-wrapper');
      const input = wrapper.querySelector('input');
      const isHidden = input.type === 'password';

      input.type = isHidden ? 'text' : 'password';
      btn.classList.toggle('visible-pass', isHidden);
      btn.classList.toggle('invisible-pass', !isHidden);
    });
  });
}
