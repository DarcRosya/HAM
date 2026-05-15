import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';
import { API_BASE_URL } from './api.js';

let socket = null;

export const socketService = {
  connect() {
    console.log('%c[SOCKET] Запрос на connect()', 'background: #222; color: #00ffff');
    const token = localStorage.getItem('token');
    if (!socket) {
      console.log('%c[SOCKET] Создаем новый экземпляр сокета', 'background: #222; color: #00ffff');
      socket = io(API_BASE_URL, { auth: { token } });
    } else if (!socket.connected) {
      console.log(
        '%c[SOCKET] Переподключаем существующий сокет',
        'background: #222; color: #00ffff'
      );
      socket.connect();
    } else {
      console.log('%c[SOCKET] Сокет уже подключен', 'background: #222; color: #00ffff');
    }
    return socket;
  },

  disconnect() {
    console.log('%c[SOCKET] Запрос на disconnect()', 'background: #222; color: #ff4444');
    if (socket && socket.connected) {
      console.log('%c[SOCKET] Разрываем соединение физически!', 'background: #222; color: #ff4444');
      socket.disconnect();
    } else {
      console.log(
        '%c[SOCKET] Сокет уже разорван или не существует',
        'background: #222; color: #ff4444'
      );
    }
  },
};
