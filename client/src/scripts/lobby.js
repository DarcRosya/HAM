import { socketService } from '../services/socket.js';
import { API_BASE_URL } from '../services/api.js';

export function initLobby() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.hash = '#login';
    return false;
  }

  renderUserProfile();
  loadMatchHistory(token);

  const socket = socketService.connect();

  const playBtn = document.querySelector('.play-btn');
  const searchOverlay = document.getElementById('search-overlay');
  const tipElement = document.getElementById('search-tips');
  const cancelBtn = document.getElementById('cancel-search-btn');
  const searchTips = ['loading message', 'text2', 'text3'];
  const matchFrame = document.getElementById('match-frame');
  const matchFramePaths = Array.from({ length: 8 }, (_, index) => {
    return `src/assets/images/find_match/${index + 1}.png`;
  });
  const frameIntervalMs = 320;
  const frameMotion = [
    { scale: 1.0, y: 0 },
    { scale: 1.03, y: -2 },
    { scale: 1.07, y: -4 },
    { scale: 1.04, y: -2 },
    { scale: 1.01, y: 0 },
    { scale: 0.99, y: 1 },
    { scale: 0.97, y: 2 },
    { scale: 1.03, y: -1 },
  ];
  let tipInterval = null;
  let frameInterval = null;

  const preloadMatchFrames = () => {
    matchFramePaths.forEach((path) => {
      const img = new Image();
      img.src = path;
    });
  };

  const applyFrameMotion = (index) => {
    if (!matchFrame) return;
    const motion = frameMotion[index % frameMotion.length];
    matchFrame.style.setProperty('--frame-scale', motion.scale);
    matchFrame.style.setProperty('--frame-y', `${motion.y}px`);
  };

  const resetMatchFrame = () => {
    if (!matchFrame) return;
    matchFrame.src = matchFramePaths[0];
    applyFrameMotion(0);
  };

  const startMatchAnimation = () => {
    if (!matchFrame) return;
    let frameIndex = 0;
    resetMatchFrame();

    if (frameInterval) {
      clearInterval(frameInterval);
    }

    frameInterval = setInterval(() => {
      frameIndex = (frameIndex + 1) % matchFramePaths.length;
      matchFrame.src = matchFramePaths[frameIndex];
      applyFrameMotion(frameIndex);
    }, frameIntervalMs);
  };

  const stopMatchAnimation = () => {
    if (!frameInterval) return;
    clearInterval(frameInterval);
    frameInterval = null;
    resetMatchFrame();
  };

  socket.off('match_found');
  socket.off('waiting_for_opponent');

  if (matchFrame && typeof Image !== 'undefined') {
    preloadMatchFrames();
  }

  if (playBtn && searchOverlay) {
    playBtn.addEventListener('click', () => {
      searchOverlay.classList.remove('is-hidden');
      startMatchAnimation();
      let tipIndex = 0;
      tipElement.textContent = searchTips[tipIndex];

      tipInterval = setInterval(() => {
        if (searchOverlay.classList.contains('is-hidden')) {
          clearInterval(tipInterval);
          return;
        }
        tipIndex = (tipIndex + 1) % searchTips.length;
        tipElement.textContent = searchTips[tipIndex];
      }, 3000);

      socket.emit('find_match');
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      searchOverlay.classList.add('is-hidden');
      clearInterval(tipInterval);
      stopMatchAnimation();
      socket.emit('cancel_matchmaking');
    });
  }

  initEditModal();
  initAvatarPicker();
  initPasswordChange();
  initPasswordToggles();
  initBackButtons();

  socket.on('match_found', (state) => {
    clearInterval(tipInterval);
    stopMatchAnimation();
    sessionStorage.setItem('pendingMatchState', JSON.stringify(state));
    window.location.hash = '#battle';
  });

  return true;
}

function createMatchCard(match) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const winnerId = match.winnerId ?? null;
  const isDraw = winnerId == null;
  const isWinner = !isDraw && String(winnerId) === String(user?.id);
  const resultClass = isDraw ? 'draw' : isWinner ? 'victory' : 'defeat';
  const card = document.createElement('div');
  card.className = `match-card ${resultClass}`;

  const mmrChange = Number(match.ratingChange ?? 0);
  const mmrSign = mmrChange > 0 ? '+' : '';
  const dateValue = match.endedAt || match.createdAt || match.startedAt;
  const date = dateValue ? new Date(dateValue).toLocaleDateString('ru-RU') : '—';
  const durationText = formatDuration(match.duration);
  const opponentName = `@${match.username}` || 'Opponent';
  const opponentAvatar = match.avatar || '/assets/avatars/avatar.png';
  const myAvatar = user?.avatar || '/assets/avatars/avatar.png';
  const resultText = isDraw ? 'Draw' : isWinner ? 'Victory' : 'Defeat';

  card.innerHTML = `
    <div class="vs-block">
      <img src="${myAvatar}" class="mini-avatar">
      <span class="vs-text">VS</span>
      <img src="${opponentAvatar}" class="mini-avatar">
      <span class="enemy-username">${opponentName}</span>
    </div>

    <div class="result-status">
      ${resultText}
    </div>

    <div class="stats">
      <div class="mmr">${mmrSign}${mmrChange}</div>
      <div class="date-time">${date}${durationText ? ` dur:${durationText}` : ''}</div>
    </div>
  `;

  return card;
}

async function loadMatchHistory(token) {
  const historyList = document.getElementById('history-list');
  if (!historyList) return;

  const showEmptyMessage = (message) => {
    historyList.classList.add('is-empty');
    historyList.innerHTML = `<p class="no-matches">${message}</p>`;
  };

  const clearEmptyMessage = () => {
    historyList.classList.remove('is-empty');
    historyList.innerHTML = '';
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/users/history`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 404) {
      showEmptyMessage("You haven't played yet.");
      return;
    }

    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const matches = await res.json();

    if (!Array.isArray(matches) || matches.length === 0) {
      showEmptyMessage("You haven't played yet.");
      return;
    }

    clearEmptyMessage();
    matches.slice(0, 4).forEach((match) => {
      historyList.appendChild(createMatchCard(match));
    });
  } catch (e) {
    console.error('Critical error in history load:', e);
    showEmptyMessage('History temporary unavailable.');
  }
}

function formatDuration(durationSeconds) {
  const total = Number(durationSeconds);
  if (!Number.isFinite(total) || total < 0) {
    return '';
  }
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function renderUserProfile() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (!user) return;

  const avatar = document.querySelector('.player-info .avatar');
  const name = document.querySelector('.display-name');
  const username = document.querySelector('.username');

  if (avatar) avatar.src = user.avatar || '/assets/avatars/avatar.png';
  if (name) name.textContent = user.displayedName || 'Unknown';
  if (username) username.textContent = user.username ? `@${user.username}` : '@user';
}

function initEditModal() {
  const editBtn = document.querySelector('.edit-btn');
  const editModal = document.getElementById('edit-modal');
  const closeBtn = document.getElementById('close-edit-modal');
  const editForm = document.getElementById('edit-profile-form');
  const usernameInput = document.getElementById('edit-username');
  const emailInput = document.getElementById('edit-email');
  const displayNameInput = document.getElementById('edit-display-name');
  const avatarPreview = document.getElementById('edit-avatar-preview');
  const applyBtn = document.getElementById('apply-profile-btn');

  let isSubmitting = false;
  attachLiveClear('edit-display-name', 'display-name-error');
  attachLiveClear('edit-username', 'username-error');
  attachLiveClear('edit-email', 'email-error');

  if (editBtn && editModal) {
    editBtn.onclick = () => {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      avatarPreview.src = user.avatar || '/assets/avatars/avatar.png';
      displayNameInput.value = user.displayedName || '';
      usernameInput.value = user.username || '';
      emailInput.value = user.email || '';
      resetEditModalState();
      editModal.classList.remove('hidden');
    };
  }

  if (closeBtn && editModal) {
    closeBtn.onclick = () => {
      resetEditModalState();
      editModal.classList.add('hidden');
    };
  }

  if (editForm) {
    editForm.onsubmit = async (e) => {
      e.preventDefault();
      if (isSubmitting) return;

      const token = localStorage.getItem('token');
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      const payload = {};
      const newDisplayName = displayNameInput.value.trim();
      const newUsername = usernameInput.value.trim();
      const newEmail = emailInput.value.trim().toLowerCase();

      if (newDisplayName.length < 3 || newDisplayName.length > 20) {
        setFieldError(
          'edit-display-name',
          'display-name-error',
          false,
          'Displayed name must contain 3-20 characters'
        );
        isSubmitting = false;
        applyBtn.disabled = false;
        return;
      }

      if (!/^[a-zA-Z0-9_()\-]+(?: [a-zA-Z0-9_()\-]+)*$/.test(newDisplayName)) {
        setFieldError(
          'edit-display-name',
          'display-name-error',
          false,
          'Displayed name contains invalid characters'
        );
        isSubmitting = false;
        applyBtn.disabled = false;
        return;
      }

      if (newUsername.length < 4 || newUsername.length > 16) {
        setFieldError(
          'edit-username',
          'username-error',
          false,
          'Username must contain 4-16 characters'
        );
        isSubmitting = false;
        applyBtn.disabled = false;
        return;
      }

      if (!/^[a-z0-9_-]+$/.test(newUsername)) {
        setFieldError(
          'edit-username',
          'username-error',
          false,
          'Username can contain only letters, numbers, _ and -'
        );
        isSubmitting = false;
        applyBtn.disabled = false;
        return;
      }

      if (newDisplayName !== currentUser.displayedName) {
        payload.displayedName = newDisplayName;
      }

      if (newUsername !== currentUser.username) {
        payload.username = newUsername;
      }

      if (newEmail !== (currentUser.email || '').toLowerCase()) {
        payload.email = newEmail;
      }

      if (avatarPreview?.src && avatarPreview.src !== currentUser.avatar) {
        payload.avatar = avatarPreview.src;
      }

      if (Object.keys(payload).length === 0) {
        editModal.classList.add('hidden');
        return;
      }

      isSubmitting = true;
      applyBtn.disabled = true;

      try {
        const res = await fetch(`${API_BASE_URL}/api/users/profile`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (res.ok) {
          localStorage.setItem('user', JSON.stringify(data.user));
          renderUserProfile();
          editModal.classList.add('hidden');
          resetEditModalState();
          loadMatchHistory(token);
        }

        if (res.status === 409) {
          if (payload.username) {
            setFieldError('edit-username', 'username-error', false, 'Username is already taken');
          }
          if (payload.email) {
            setFieldError('edit-email', 'email-error', false, 'Email is already taken');
          }
        }
      } catch (err) {
        console.error('Update profile error:', err);
      } finally {
        isSubmitting = false;
        applyBtn.disabled = false;
      }
    };
  }
}

function clearFieldErrors() {
  document.querySelectorAll('.invalid').forEach((el) => {
    el.classList.remove('invalid');
  });
  document.querySelectorAll('.error-msg').forEach((el) => {
    el.classList.add('hidden');
    el.textContent = '';
  });
}

function resetEditModalState() {
  const mainContent = document.getElementById('edit-main-content');
  const pfpView = document.getElementById('pfp-selection-view');
  const pwView = document.getElementById('password-change-view');
  const frame = document.querySelector('.edit-frame');
  mainContent?.classList.remove('hidden');
  pfpView?.classList.add('hidden');
  pwView?.classList.add('hidden');
  frame?.classList.remove('pfp-mode');
  frame?.classList.remove('password-mode');
  document.querySelectorAll('.back-btn').forEach((btn) => btn.classList.add('is-hidden'));
  clearFieldErrors();
  const applyBtn = document.getElementById('apply-profile-btn');
  if (applyBtn) {
    applyBtn.disabled = false;
    applyBtn.style.opacity = '1';
  }
}

async function initAvatarPicker() {
  const avatarPreview = document.getElementById('edit-avatar-preview');
  const mainContent = document.getElementById('edit-main-content');
  const pfpView = document.getElementById('pfp-selection-view');
  const grid = document.querySelector('.pfp-grid');
  const confirmBtn = document.getElementById('confirm-pfp-btn');
  const frame = document.querySelector('.edit-frame');
  const backPfpBtn = document.querySelector('.back-pfp-btn');
  let selectedAvatarUrl = '';

  async function loadAndRenderAvatars() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/avatars`);
      if (!res.ok) throw new Error('Failed to fetch');
      const avatars = await res.json();

      grid.innerHTML = '';
      avatars.forEach((src) => {
        const img = document.createElement('img');
        img.src = src;
        img.className = 'pfp-item';

        if (avatarPreview.src.includes(src)) {
          img.classList.add('selected');
          selectedAvatarUrl = src;
        }

        img.onclick = () => {
          document.querySelectorAll('.pfp-item').forEach((i) => i.classList.remove('selected'));
          img.classList.add('selected');
          selectedAvatarUrl = src;
          avatarPreview.src = src;
        };
        grid.appendChild(img);
      });
    } catch (err) {
      console.error('Load avatars error:', err);
      grid.innerHTML = '<p class="error-msg">Server error</p>';
    }
  }

  if (avatarPreview) {
    avatarPreview.onclick = async () => {
      mainContent.classList.add('hidden');
      pfpView.classList.remove('hidden');
      frame.classList.add('pfp-mode');
      backPfpBtn?.classList.remove('is-hidden');
      await loadAndRenderAvatars();
    };
  }

  if (confirmBtn) {
    confirmBtn.onclick = () => {
      if (selectedAvatarUrl) avatarPreview.src = selectedAvatarUrl;
      pfpView.classList.add('hidden');
      mainContent.classList.remove('hidden');
      frame.classList.remove('pfp-mode');
    };
  }
}

function initPasswordChange() {
  const pwView = document.getElementById('password-change-view');
  const mainContent = document.getElementById('edit-main-content');
  const submitBtn = document.getElementById('submit-password-btn');
  const oldInput = document.getElementById('old-password');
  const newInput = document.getElementById('new-password-input');
  const confirmInput = document.getElementById('confirm-new-password-input');
  const changeBtn = document.querySelector('.change-pw-btn');
  const frame = document.querySelector('.edit-frame');
  const backPwBtn = document.querySelector('.back-pw-btn');

  if (changeBtn) {
    changeBtn.onclick = () => {
      mainContent.classList.add('hidden');
      pwView.classList.remove('hidden');
      frame.classList.add('password-mode');
      backPwBtn?.classList.remove('is-hidden');
    };
  }

  const setupClearOnInput = (input, errorId) => {
    input?.addEventListener('input', () => {
      input.classList.remove('invalid');
      const errorSpan = document.getElementById(errorId);
      if (errorSpan) {
        errorSpan.classList.add('hidden');
        errorSpan.textContent = '';
      }
    });
  };

  setupClearOnInput(oldInput, 'old-pass-error');
  setupClearOnInput(newInput, 'new-pass-error');
  setupClearOnInput(confirmInput, 'pass-match-error');

  if (submitBtn) {
    submitBtn.onclick = async () => {
      const passwordForm = document.querySelector('#password-change-view');

      if (!passwordForm.checkValidity()) {
        passwordForm.reportValidity();

        return;
      }
      const token = localStorage.getItem('token');
      const oldPassword = oldInput.value.trim();
      const newPassword = newInput.value.trim();
      const confirm = confirmInput.value.trim();

      clearFieldErrors();

      if (newPassword !== confirm) {
        setFieldError(
          'confirm-new-password-input',
          'pass-match-error',
          false,
          'Passwords do not match'
        );
        return;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/users/password`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ oldPassword, newPassword }),
        });

        const data = await res.json();

        if (res.ok) {
          [oldInput, newInput, confirmInput].forEach((i) => (i.value = ''));

          pwView.classList.add('hidden');
          mainContent.classList.remove('hidden');
          frame.classList.remove('password-mode');
          if (backPwBtn) backPwBtn.classList.add('is-hidden');
          const user = JSON.parse(localStorage.getItem('user') || '{}');
          const modalAvatar = document.getElementById('edit-avatar-preview');
          if (modalAvatar) modalAvatar.src = user.avatar;
        } else {
          const msg = (data.message || '').toLowerCase();
          if (msg.includes('old') || msg.includes('incorrect')) {
            setFieldError('old-password', 'old-pass-error', false, data.message);
          } else if (msg.includes('new') || msg.includes('characters') || msg.includes('digit')) {
            setFieldError('new-password-input', 'new-pass-error', false, data.message);
          } else {
            setFieldError('old-password', 'old-pass-error', false, data.message);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
  }
}

function initPasswordToggles() {
  const toggleButtons = document.querySelectorAll('.toggle-pass');

  toggleButtons.forEach((btn) => {
    btn.onclick = () => {
      const wrapper = btn.closest('.pass-wrapper');
      const input = wrapper.querySelector('input');

      const isHidden = input.type === 'password';

      if (isHidden) {
        input.type = 'text';
        btn.classList.remove('invisible-pass');
        btn.classList.add('visible-pass');
      } else {
        input.type = 'password';
        btn.classList.remove('visible-pass');
        btn.classList.add('invisible-pass');
      }
    };
  });
}

function initBackButtons() {
  const backBtns = document.querySelectorAll('.back-btn');
  const pfpView = document.getElementById('pfp-selection-view');
  const pwView = document.getElementById('password-change-view');
  const mainContent = document.getElementById('edit-main-content');
  const frame = document.querySelector('.edit-frame');
  const oldInput = document.getElementById('old-password');
  const newInput = document.getElementById('new-password-input');
  const confirmInput = document.getElementById('confirm-new-password-input');

  backBtns.forEach((btn) => {
    btn.onclick = () => {
      pfpView.classList.add('hidden');
      pwView.classList.add('hidden');
      mainContent.classList.remove('hidden');
      frame.classList.remove('pfp-mode');
      frame.classList.remove('password-mode');
      clearFieldErrors();

      [oldInput, newInput, confirmInput].forEach((input) => {
        if (input) {
          input.value = '';
          input.type = 'password';
        }
      });

      document.querySelectorAll('.toggle-pass').forEach((btn) => {
        btn.classList.remove('visible-pass');
        btn.classList.add('invisible-pass');
      });

      document.querySelectorAll('.back-btn').forEach((btn) => btn.classList.add('is-hidden'));
    };
  });
}

function attachLiveClear(inputId, errorId) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);

  if (!input || !error) return;

  input.addEventListener('input', () => {
    input.classList.remove('invalid');
    error.classList.add('hidden');
    error.textContent = '';
  });
}

function setFieldError(fieldId, errorId, isValid, message) {
  const input = document.getElementById(fieldId);
  const errorSpan = document.getElementById(errorId);

  if (!input || !errorSpan) return;

  if (isValid) {
    input.classList.remove('invalid');
    errorSpan.classList.add('hidden');
  } else {
    input.classList.add('invalid');
    errorSpan.textContent = message;
    errorSpan.classList.remove('hidden');
  }
}
