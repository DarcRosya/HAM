import { authService } from '../services/auth.js';

export function initLogin() {
  const loginBtn = document.getElementById('login-btn');
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');

  if (!loginBtn || !usernameInput || !passwordInput) {
    return;
  }

  usernameInput.addEventListener('input', (event) => {
    let value = event.target.value;
    if (value.length > 255) {
      event.target.value = value.slice(0, 255);
    }
  });

  loginBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

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
        localStorage.setItem('user', JSON.stringify(res.user));
        window.location.hash = '#homepage';
      } else {
        alert('Token not received from server');
      }
    } catch (err) {
      alert('Login failed: ' + err.message);
    }
  });
}
