import { socketService } from '../services/socket.js';
import { renderCard } from '../components/Card.js'; 

export function initBattle() {
    const socket = socketService.connect();

    const handleUpdate = (state) => {
        console.log('Update received:', state);
        updateBattleUI(state, socket);
    };

    socket.on('match_found', handleUpdate);
    socket.on('game_state', handleUpdate);
}

function updateBattleUI(state, socket) {
    const myId = socket.id;
    const playerIds = Object.keys(state.players);

    const myIdInState = playerIds.find(id => state.players[id].hand.length > 0);
    const me = state.players[myIdInState];
    const opponent = state.players[playerIds.find(id => id !== myIdInState)];

    document.getElementById('opp-hp').textContent = opponent.hp;
    document.getElementById('player-hp').textContent = me.hp;
    document.getElementById('info-timer').textContent = state.turnTimer;
    document.getElementById('info-turn').textContent = state.activeTurn === myIdInState ? "Your Turn" : "Opponent's Turn";

    const handDisplay = document.getElementById('hand-display');
    handDisplay.innerHTML = '';

    me.hand.forEach(card => {
        const cardUI = renderCard({ label: card.name });
    
        cardUI.addEventListener('click', () => {
            if (state.activeTurn === myIdInState) {
                socket.emit('play_card', { 
                    roomId: state.roomId, 
                    cardId: card.id 
                });
            } else {
                alert("Wait for your turn!");
            }
        });

        handDisplay.appendChild(cardUI);
    });
}
