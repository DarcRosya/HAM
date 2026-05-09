export function checkAuth() {
  const token = localStorage.getItem('token');
  const hash = window.location.hash;

  const isAuthPage = hash === '#menu' || hash === '#login' || hash === '#register' || hash === '';

  if (!token && !isAuthPage) {
    window.history.back();
    return false;
  }

  if (token && isAuthPage) {
    window.location.hash = '#homepage';
    return false;
  }

  return true;
}
