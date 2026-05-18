import { API_BASE_URL } from '../services/api.js';

const BASE_URL = `${API_BASE_URL}/api/users`;

export const userService = {
  getMatchHistory: async (token) => {
    const res = await fetch(`${BASE_URL}/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    return await res.json();
  },

  getAvatars: async () => {
    const res = await fetch(`${BASE_URL}/avatars`);
    if (!res.ok) throw new Error('Failed to fetch avatars');
    return await res.json();
  },

  getAvatarFrames: async () => {
    const res = await fetch(`${BASE_URL}/avatar-frames`);
    if (!res.ok) throw new Error('Failed to fetch avatar frames');
    return await res.json();
  },

  updateProfile: async (token, payload) => {
    const res = await fetch(`${BASE_URL}/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      const error = new Error(data.message || 'Profile update failed');
      error.status = res.status;
      error.field = data.field;
      throw error;
    }

    return data;
  },

  updatePassword: async (token, oldPassword, newPassword) => {
    const res = await fetch(`${BASE_URL}/password`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ oldPassword, newPassword }),
    });

    const data = await res.json();

    if (!res.ok) {
      const error = new Error(data.message || 'Password update failed');
      error.status = res.status;
      throw error;
    }

    return data;
  },
};
