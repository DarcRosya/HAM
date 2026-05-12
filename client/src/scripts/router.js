import { initMainMenu } from './main_menu.js';
import { initBattle } from './battle.js';
import { initLobby } from './lobby.js';
import { checkAuth } from '../services/authGuard.js';

const mainContainer = document.getElementById('main-container');

const routes = {
  '': { path: 'src/pages/main_menu.html', init: initMainMenu, private: false },
  '#menu': { path: 'src/pages/main_menu.html', init: initMainMenu, private: false },
  '#login': { path: 'src/pages/main_menu.html', init: initMainMenu, private: false },
  '#register': { path: 'src/pages/main_menu.html', init: initMainMenu, private: false },
  '#reset-password': { path: 'src/pages/main_menu.html', init: initMainMenu, private: false },
  '#battle': { path: 'src/pages/battle.html', init: initBattle, private: true },
  '#lobby': { path: 'src/pages/lobby.html', init: initLobby, private: true },
};

async function router() {
  const hash = window.location.hash || '#menu';
  const route = routes[hash];

  if (!route) {
    mainContainer.innerHTML = '<h1>404 - Not Found</h1>';
    return;
  }

  if (route.private && !checkAuth()) {
    return;
  }

  try {
    const response = await fetch(route.path);
    if (!response.ok) throw new Error('Failed to fetch page');

    const html = await response.text();
    mainContainer.innerHTML = html;

    if (route.init) {
      route.init();
    }
  } catch (err) {
    console.error(err);
    mainContainer.innerHTML = '<h1>Load Error</h1>';
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('load', router);
