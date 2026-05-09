import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';

let socket = null;

export const socketService = {
  connect() {
    const token = localStorage.getItem('token');
    if (!socket) {
      socket = io('http://localhost:3001', {
        auth: { token },
      });
    }
    return socket;
  },
};
