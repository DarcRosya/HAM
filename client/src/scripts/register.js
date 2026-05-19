import { authService } from '../services/auth.js';

const showBmoError = (message) => {
  if (typeof window !== 'undefined' && typeof window.showBmoError === 'function') {
    window.showBmoError(message);
  }
};

export function initRegister() {
  const registerForm = document.getElementById('registerForm');

  if (!registerForm) {
    return;
  }

  const displayedNameInput = document.getElementById('nickname');
  const usernameInput = document.getElementById('username');
  const emailInput = document.getElementById('email');

  function validateDisplayedNameInput(event) {
    let value = event.target.value;
    value = value.replace(/[^a-zA-Z0-9_()\- ]/g, '');
    if (value.startsWith(' ')) {
      value = value.trim();
    }
    value = value.replace(/\s{2,}/g, ' ');
    event.target.value = value;
  }

  function validateUsername(event) {
    let value = event.target.value.toLowerCase();
    value = value.replace(/\s/g, '');
    value = value.replace(/[^a-z0-9_-]/g, '');
    event.target.value = value;
  }

  function validateEmail(event) {
    let value = event.target.value.toLowerCase();
    value = value.replace(/\s/g, '');
    value = value.replace(/[^a-z0-9@._-]/g, '');
    event.target.value = value;
  }

  usernameInput.addEventListener('input', validateUsername);
  emailInput.addEventListener('input', validateEmail);
  displayedNameInput.addEventListener('input', validateDisplayedNameInput);

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const displayedName = displayedNameInput.value.trim();
    const username = usernameInput.value;
    const email = emailInput.value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (displayedName.length < 3 || displayedName.length > 20) {
      showBmoError('Displayed name must contain 3-20 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_()\-]+(?: [a-zA-Z0-9_()\-]+)*$/.test(displayedName)) {
      showBmoError('Displayed name contains invalid characters');
      return;
    }

    if (username.length < 4 || username.length > 16) {
      showBmoError('Username must contain 4-16 characters');
      return;
    }

    if (!/^[a-z0-9_-]+$/.test(username)) {
      showBmoError('Username can contain only letters, numbers, _ and -');
      return;
    }

    const digitMatches = password.match(/\d/g) || [];
    if (password.length < 5 || digitMatches.length < 3) {
      showBmoError('Password must be at least 5 characters and include at least 3 digits');
      return;
    }

    if (password !== confirmPassword) {
      showBmoError('Passwords do not match');
      return;
    }

    const userData = {
      displayedName,
      username,
      email,
      password,
    };

    try {
      await authService.register(userData);
      registerForm.reset();
      window.location.hash = '#login';
    } catch (err) {
      showBmoError(err.message || 'Server error');
    }
  });
}
