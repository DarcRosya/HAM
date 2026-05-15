import { store } from '../../core/store.js';
import { userService } from '../../services/userService.js';

export function renderUserProfile() {
  const user = store.getUser();
  if (!user) return;

  const avatar = document.querySelector('.player-info .avatar');
  const name = document.querySelector('.display-name');
  const username = document.querySelector('.username');

  if (avatar) avatar.src = user.avatar || '/assets/avatars/avatar.png';
  if (name) name.textContent = user.displayedName || 'Unknown';
  if (username) username.textContent = user.username ? `@${user.username}` : '@user';
}

export function initProfileUI(onProfileUpdated) {
  initEditModal(onProfileUpdated);
  initAvatarPicker();
  initPasswordChange();
  initPasswordToggles();
  initBackButtons();
}

// --- Private functions of the module ---

function initEditModal(onProfileUpdated) {
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
      const user = store.getUser() || {};
      if (avatarPreview) avatarPreview.src = user.avatar || '/assets/avatars/avatar.png';
      if (displayNameInput) displayNameInput.value = user.displayedName || '';
      if (usernameInput) usernameInput.value = user.username || '';
      if (emailInput) emailInput.value = user.email || '';
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

      const token = store.getToken();
      const currentUser = store.getUser() || {};

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
        return;
      }
      if (!/^[a-zA-Z0-9_()\-]+(?: [a-zA-Z0-9_()\-]+)*$/.test(newDisplayName)) {
        setFieldError(
          'edit-display-name',
          'display-name-error',
          false,
          'Displayed name contains invalid characters'
        );
        return;
      }
      if (newUsername.length < 4 || newUsername.length > 16) {
        setFieldError(
          'edit-username',
          'username-error',
          false,
          'Username must contain 4-16 characters'
        );
        return;
      }
      if (!/^[a-z0-9_-]+$/.test(newUsername)) {
        setFieldError(
          'edit-username',
          'username-error',
          false,
          'Username can contain only letters, numbers, _ and -'
        );
        return;
      }

      const payload = {
        displayedName: newDisplayName,
        username: newUsername,
        email: newEmail,
      };

      if (avatarPreview?.src && avatarPreview.src !== currentUser.avatar) {
        payload.avatar = avatarPreview.src;
      }

      isSubmitting = true;
      if (applyBtn) applyBtn.disabled = true;

      try {
        const data = await userService.updateProfile(token, payload);

        // Успех
        localStorage.setItem('user', JSON.stringify(data.user));
        renderUserProfile();
        editModal.classList.add('hidden');
        resetEditModalState();

        if (typeof onProfileUpdated === 'function') {
          onProfileUpdated();
        }
      } catch (err) {
        if (err.status === 409 && err.field) {
          if (err.field === 'username')
            setFieldError('edit-username', 'username-error', false, err.message);
          else if (err.field === 'email')
            setFieldError('edit-email', 'email-error', false, err.message);
        } else {
          console.error('[PROFILE UPDATE ERROR]', err.message);
        }
      } finally {
        isSubmitting = false;
        if (applyBtn) applyBtn.disabled = false;
      }
    };
  }
}

function initAvatarPicker() {
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
      const avatars = await userService.getAvatars();
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

  if (submitBtn) {
    submitBtn.onclick = async () => {
      const passwordForm = document.querySelector('#password-change-view');
      if (!passwordForm.checkValidity()) {
        passwordForm.reportValidity();
        return;
      }

      const token = store.getToken();
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
        await userService.updatePassword(token, oldPassword, newPassword);

        [oldInput, newInput, confirmInput].forEach((i) => (i.value = ''));
        pwView.classList.add('hidden');
        mainContent.classList.remove('hidden');
        frame.classList.remove('password-mode');
        if (backPwBtn) backPwBtn.classList.add('is-hidden');
      } catch (err) {
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('old') || msg.includes('incorrect')) {
          setFieldError('old-password', 'old-pass-error', false, err.message);
        } else if (msg.includes('new') || msg.includes('characters') || msg.includes('digit')) {
          setFieldError('new-password-input', 'new-pass-error', false, err.message);
        } else {
          setFieldError('old-password', 'old-pass-error', false, err.message);
        }
      }
    };
  }
}

function initPasswordToggles() {
  document.querySelectorAll('.toggle-pass').forEach((btn) => {
    btn.onclick = () => {
      const wrapper = btn.closest('.pass-wrapper');
      const input = wrapper.querySelector('input');
      const isHidden = input.type === 'password';

      input.type = isHidden ? 'text' : 'password';
      btn.classList.toggle('visible-pass', isHidden);
      btn.classList.toggle('invisible-pass', !isHidden);
    };
  });
}

function initBackButtons() {
  const pfpView = document.getElementById('pfp-selection-view');
  const pwView = document.getElementById('password-change-view');
  const mainContent = document.getElementById('edit-main-content');
  const frame = document.querySelector('.edit-frame');
  const inputs = ['old-password', 'new-password-input', 'confirm-new-password-input'].map((id) =>
    document.getElementById(id)
  );

  document.querySelectorAll('.back-btn').forEach((btn) => {
    btn.onclick = () => {
      pfpView?.classList.add('hidden');
      pwView?.classList.add('hidden');
      mainContent?.classList.remove('hidden');
      frame?.classList.remove('pfp-mode', 'password-mode');
      clearFieldErrors();

      inputs.forEach((input) => {
        if (input) {
          input.value = '';
          input.type = 'password';
        }
      });

      document.querySelectorAll('.toggle-pass').forEach((tBtn) => {
        tBtn.classList.remove('visible-pass');
        tBtn.classList.add('invisible-pass');
      });

      document.querySelectorAll('.back-btn').forEach((bBtn) => bBtn.classList.add('is-hidden'));
    };
  });
}

// --- Verification and Cleaning Tools ---

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

  input.classList.toggle('invalid', !isValid);
  errorSpan.classList.toggle('hidden', isValid);
  if (!isValid) errorSpan.textContent = message;
}

function clearFieldErrors() {
  document.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
  document.querySelectorAll('.error-msg').forEach((el) => {
    el.classList.add('hidden');
    el.textContent = '';
  });
}

function resetEditModalState() {
  document.getElementById('edit-main-content')?.classList.remove('hidden');
  document.getElementById('pfp-selection-view')?.classList.add('hidden');
  document.getElementById('password-change-view')?.classList.add('hidden');
  document.querySelector('.edit-frame')?.classList.remove('pfp-mode', 'password-mode');
  document.querySelectorAll('.back-btn').forEach((btn) => btn.classList.add('is-hidden'));

  clearFieldErrors();

  const applyBtn = document.getElementById('apply-profile-btn');
  if (applyBtn) {
    applyBtn.disabled = false;
    applyBtn.style.opacity = '1';
  }
}
