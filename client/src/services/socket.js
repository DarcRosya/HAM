import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';
import { API_BASE_URL } from './api.js';

let socket = null;

export const socketService = {
  connect() {
    const token = localStorage.getItem('token');
    if (!socket) {
      socket = io(API_BASE_URL, { auth: { token } });
    } else if (!socket.connected) {
      socket.connect();
    }
    return socket;
  },

  disconnect() {
    if (socket && socket.connected) {
      socket.disconnect();
    }
  },
};
