import { authService } from '../services/auth.js';

export function initLogin() {
  const loginForm = document.getElementById('loginForm');

  if (!loginForm) {
    return;
  }

  const usernameInput = document.getElementById('username');

  function validateInput(event) {
    let value = event.target.value;
    if (value.length > 255) {
      value = value.substring(0, 255);
    }
    event.target.value = value;
  }

  usernameInput.addEventListener('input', validateInput);

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const password = document.getElementById('password').value;

    if (!username || username.length > 255) {
      return alert('Invalid login');
    }

    const credentials = {
      username,
      password,
    };

    try {
      const res = await authService.login(credentials);
      if (res && res.token) {
        localStorage.setItem('token', res.token);
        window.location.hash = '#homepage';
      } else {
        alert('Token not received from server');
      }
    } catch (err) {
      alert('Login failed: ' + err.message);
    }
  });
}
