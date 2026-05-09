import { authService } from '../services/auth.js';

export function initLogin() {
    const loginForm = document.getElementById('loginForm');

    if (!loginForm) {
        return;
    }

    const usernameInput = document.getElementById('username');

    function validateInput(event) {
        let value = event.target.value.toLowerCase();
        value = value.replace(/\s/g, '');
        value = value.replace(/[^a-z0-9@._-]/g, '');
        event.target.value = value;
    }

    usernameInput.addEventListener('input', validateInput);

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = usernameInput.value;
        const password = document.getElementById('password').value;

        if (username.length < 4 || username.length > 16) {
            return alert('Username must contain 4-16 characters');
        }

        if (!username.includes('@') && !/^[a-z0-9_-]+$/.test(username)) {
            return alert('Username can contain only letters, numbers, _ and -');
        }

        const credentials = {
            username,
            password
        };

        try {
            const res = await authService.login(credentials);
            if (res && res.token) {
                localStorage.setItem('token', res.token);
                window.location.hash = "#homepage";
            } else {
                alert("Token not received from server");
            }

        } catch (err) {
            console.error(err);
            alert("Login failed: " + err.message);
        }
    });
}
