export const store = {
  getToken: () => localStorage.getItem('token'),
  getUser: () => JSON.parse(localStorage.getItem('user') || 'null'),

  isInBattle: () => localStorage.getItem('activeMatch') === 'true',
  getPendingMatchState: () => localStorage.getItem('pendingMatchState'),

  setMatchState: (state, isFresh = false) => {
    localStorage.setItem('activeMatch', 'true');
    if (state) {
      localStorage.setItem('pendingMatchState', JSON.stringify(state));
    }
    if (isFresh) {
      localStorage.setItem('matchIsFresh', 'true');
    }
  },

  clearMatchState: () => {
    localStorage.removeItem('activeMatch');
    localStorage.removeItem('pendingMatchState');
    localStorage.removeItem('pendingMatchSkipCoinToss');
    sessionStorage.removeItem('coinTossObserved');
  },

  markCoinTossObserved: (roomId) => {
    if (roomId) sessionStorage.setItem('coinTossObserved', String(roomId));
  },

  hasObservedCoinToss: (roomId) => {
    return sessionStorage.getItem('coinTossObserved') === String(roomId);
  },

  performLogout: (socket) => {
    if (store.isInBattle() && socket) {
      const stateStr = store.getPendingMatchState();
      if (stateStr) {
        const state = JSON.parse(stateStr);
        if (state.roomId) {
          socket.emit('surrender', { roomId: state.roomId });
        }
      }
    }

    store.clearMatchState();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.hash = '#login';
  },
};
