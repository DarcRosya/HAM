import { mount as mountMainMenu, unmount as unmountMainMenu } from '../scripts/main_menu.js';
import { mount as mountBattle, unmount as unmountBattle } from '../scripts/battle.js';
import { mount as mountLobby, unmount as unmountLobby } from '../scripts/lobby.js';
import { requireAuth, requireGuest, blockLobbyIfInBattle, requireBattle } from './guards.js';

const mainContainer = document.getElementById('main-container');

const routes = {
  '': {
    path: 'src/pages/main_menu.html',
    mount: mountMainMenu,
    unmount: unmountMainMenu,
    guards: [],
  },
  '#menu': {
    path: 'src/pages/main_menu.html',
    mount: mountMainMenu,
    unmount: unmountMainMenu,
    guards: [],
  },
  '#cards': {
    path: 'src/pages/main_menu.html',
    mount: mountMainMenu,
    unmount: unmountMainMenu,
    guards: [],
  },
  '#credits': {
    path: 'src/pages/main_menu.html',
    mount: mountMainMenu,
    unmount: unmountMainMenu,
    guards: [],
  },

  '#login': {
    path: 'src/pages/main_menu.html',
    mount: mountMainMenu,
    unmount: unmountMainMenu,
    guards: [requireGuest],
  },
  '#register': {
    path: 'src/pages/main_menu.html',
    mount: mountMainMenu,
    unmount: unmountMainMenu,
    guards: [requireGuest],
  },
  '#forgot-password': {
    path: 'src/pages/main_menu.html',
    mount: mountMainMenu,
    unmount: unmountMainMenu,
    guards: [requireGuest],
  },
  '#reset-password': {
    path: 'src/pages/main_menu.html',
    mount: mountMainMenu,
    unmount: unmountMainMenu,
    guards: [requireGuest],
  },

  '#lobby': {
    path: 'src/pages/lobby.html',
    mount: mountLobby,
    unmount: unmountLobby,
    guards: [requireAuth, blockLobbyIfInBattle],
  },
  '#battle': {
    path: 'src/pages/battle.html',
    mount: mountBattle,
    unmount: unmountBattle,
    guards: [requireAuth, requireBattle],
  },
};

let currentRoutePath = null;
let currentRouteObj = null;
const LOBBY_PATH = 'src/pages/lobby.html';
const routeFadeDuration = 240;

const waitForFade = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

async function router() {
  const fullHash = window.location.hash || '#menu';
  const hash = fullHash.split('?')[0];
  const route = routes[hash];

  console.log(`%c[ROUTER] Переход на хэш: ${hash}`, 'background: #222; color: #bada55');

  if (!route) {
    mainContainer.innerHTML = '<h1>404 - Not Found</h1>';
    return;
  }

  // Guards
  if (route.guards) {
    for (const guard of route.guards) {
      const result = guard();
      if (result !== true) {
        console.log(
          `%c[ROUTER] Guard заблокировал переход. Редирект на: ${result}`,
          'background: #222; color: #bada55'
        );
        window.location.replace(window.location.pathname + window.location.search + result);
        return;
      }
    }
  }

  if (currentRoutePath === route.path) {
    console.log(
      `%c[ROUTER] Путь не изменился, вызываем mount()`,
      'background: #222; color: #bada55'
    );
    if (route.mount) route.mount();
    return;
  }

  try {
    const shouldFade = route.path === LOBBY_PATH;
    if (shouldFade) {
      mainContainer.classList.add('route-fade-out');
      await waitForFade(routeFadeDuration);
    }

    if (currentRouteObj?.unmount) currentRouteObj.unmount();

    const response = await fetch(route.path);
    const html = await response.text();
    mainContainer.innerHTML = html;

    currentRoutePath = route.path;
    currentRouteObj = route;

    if (shouldFade) {
      mainContainer.classList.remove('route-fade-out');
      mainContainer.classList.add('route-fade-in');
    }

    if (route.mount) route.mount();
  } catch (err) {
    console.error('Routing error:', err);
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('load', router);
