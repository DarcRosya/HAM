import { API_BASE_URL } from './api.js';
import { store } from '../core/store.js';

const BASE_URL = `${API_BASE_URL}/api/auth`;

export const authService = {
  register: async (userData) => {
    const response = await fetch(`${BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
      throw new Error(data?.message || `Registration failed: ${response.status}`);
    }
    return data;
  },

  login: async (credentials) => {
    const response = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
      throw new Error(data?.message || `Login failed: ${response.status}`);
    }

    return data;
  },

  logout: (socket) => {
    store.performLogout(socket);
  },
};
