import { store } from './store.js';

export const requireAuth = () => {
  if (!store.getToken()) return '#login';
  return true;
};

export const requireGuest = () => {
  if (store.getToken()) return '#lobby';
  return true;
};

export const blockLobbyIfInBattle = () => {
  if (store.isInBattle()) return '#battle';
  return true;
};

export const requireBattle = () => {
  if (!store.isInBattle()) return '#lobby';
  return true;
};
