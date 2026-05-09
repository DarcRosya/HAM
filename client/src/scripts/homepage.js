import { renderAvatar } from '../components/Avatar.js';
import { renderTable } from '../components/Table.js';
import { renderHand } from '../components/Hand.js';

export function initHomepage() {
    if (!localStorage.getItem('token')) {
        window.location.hash = '#login';
        return;
    }

    const tableRoot = document.getElementById('table-root');
    const avatarRoot = document.getElementById('avatar-root');
    const handRoot = document.getElementById('hand-root');

    if (tableRoot) {
        tableRoot.innerHTML = '';
        tableRoot.appendChild(renderTable());
    }

    if (avatarRoot) {
        avatarRoot.innerHTML = '';
        avatarRoot.appendChild(renderAvatar({ name: "Player 1", status: "Ready" }));
    }

    if (handRoot) {
        handRoot.innerHTML = '';
        handRoot.appendChild(renderHand());
    }
}
