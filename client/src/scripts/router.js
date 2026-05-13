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
  '#forgot-password': { path: 'src/pages/main_menu.html', init: initMainMenu, private: false },
  '#reset-password': { path: 'src/pages/main_menu.html', init: initMainMenu, private: false },
  '#battle': { path: 'src/pages/battle.html', init: initBattle, private: true },
  '#lobby': { path: 'src/pages/lobby.html', init: initLobby, private: true },
};

let currentRoutePath = null;
const LOBBY_PATH = 'src/pages/lobby.html';
const routeFadeDuration = 240;

const waitForFade = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

async function router() {
  const fullHash = window.location.hash || '#menu';
  const hash = fullHash.split('?')[0];

  const route = routes[hash];

  if (!route) {
    mainContainer.innerHTML = '<h1>404 - Not Found</h1>';
    return;
  }

  if (route.private && !checkAuth()) {
    return;
  }

  if (currentRoutePath === route.path) {
    return;
  }

  try {
    const shouldFade = route.path === LOBBY_PATH;

    if (shouldFade) {
      mainContainer.classList.remove('route-fade-in');
      mainContainer.classList.add('route-fade-out');
      await waitForFade(routeFadeDuration);
    } else {
      mainContainer.classList.remove('route-fade-out', 'route-fade-in');
    }

    const response = await fetch(route.path);
    if (!response.ok) throw new Error('Failed to fetch page');

    const html = await response.text();
    mainContainer.innerHTML = html;
    currentRoutePath = route.path;

    if (shouldFade) {
      requestAnimationFrame(() => {
        mainContainer.classList.remove('route-fade-out');
        mainContainer.classList.add('route-fade-in');
        window.setTimeout(() => {
          mainContainer.classList.remove('route-fade-in');
        }, routeFadeDuration);
      });
    }

    if (route.init) {
      route.init();
    }
  } catch (err) {
    console.error(err);
    mainContainer.classList.remove('route-fade-out', 'route-fade-in');
    mainContainer.innerHTML = '<h1>Load Error</h1>';
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('load', router);
