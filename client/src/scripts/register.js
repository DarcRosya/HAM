import { authService } from '../services/auth.js';

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
      return alert('Displayed name must contain 3-20 characters');
    }

    if (!/^[a-zA-Z0-9_()\-]+(?: [a-zA-Z0-9_()\-]+)*$/.test(displayedName)) {
      return alert('Displayed name contains invalid characters');
    }

    if (username.length < 4 || username.length > 16) {
      return alert('Username must contain 4-16 characters');
    }

    if (!/^[a-z0-9_-]+$/.test(username)) {
      return alert('Username can contain only letters, numbers, _ and -');
    }

    if (password !== confirmPassword) {
      return alert('Passwords do not match');
    }

    const userData = {
      displayedName,
      username,
      email,
      password,
    };

    try {
      await authService.register(userData);
      window.location.hash = '#login';
    } catch (err) {
      console.error(err);
      alert('Server error: ' + err.message);
    }
  });
}
