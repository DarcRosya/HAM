export function initLobby() {
  const token = localStorage.getItem('token');

  if (!token) {
    window.location.hash = '#login';
    return false;
  }
  return true;
}
