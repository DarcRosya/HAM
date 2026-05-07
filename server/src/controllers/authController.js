import { registerUser, loginUser } from '../services/authService.js';

export async function register(req, res) {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
        await registerUser({ username, password });
        return res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        const status = error.status || 500;
        return res.status(status).json({ message: error.message || 'Server error' });
    }
}

export async function login(req, res) {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
        const payload = await loginUser({ username, password });
        return res.status(200).json(payload);
    } catch (error) {
        const status = error.status || 500;
        return res.status(status).json({ message: error.message || 'Server error' });
    }
}


