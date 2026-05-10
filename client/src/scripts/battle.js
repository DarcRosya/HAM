import { socketService } from '../services/socket.js';
import { renderCard } from '../components/Card.js';

let draggingAttackId = null;
let latestState = null;

export function initBattle() {
  const socket = socketService.connect();
  
  socket.on('error', (data) => {
    alert(data.message);
    console.log('Socket error:', data);
  });

  const handleUpdate = (state) => {
    latestState = state;
    console.log('Update received:', state);
    updateBattleUI(state, socket);
  };

  socket.on('match_found', handleUpdate);
  socket.on('game_state', handleUpdate);

  const endTurnBtn = document.getElementById('end-turn-btn');
  endTurnBtn.addEventListener('click', () => {
    if (!latestState) {
      return;
    }

    if (latestState.activeTurn === socket.id) {
      socket.emit('end_turn');
    } else {
      alert('Not your turn!');
    }
  });

  const surrenderBtn = document.getElementById('surrender-btn');
  surrenderBtn.addEventListener('click', () => {
    if (!latestState) {
      return;
    }
    socket.emit('surrender', {
      roomId: latestState.roomId,
    });
  });

  window.addEventListener('mouseup', (e) => {
    if (!draggingAttackId || !latestState) {
      return;
    }

    const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
    const cardTarget = elementBelow?.closest('.enemy-card');
    const avatarTarget = elementBelow?.closest('#opp-avatar');

    if (cardTarget) {
      const targetId = cardTarget.dataset.instanceId;
      console.log(`Attacking card: ${targetId}`);
      
      socket.emit('attack_target', {
        roomId: latestState.roomId,
        attackerInstanceId: draggingAttackId,
        targetId: targetId,
        targetType: 'card'
      });
    } 
    else if (avatarTarget) {
      console.log('Attacking enemy avatar!');
      
      socket.emit('attack_target', {
        roomId: latestState.roomId,
        attackerInstanceId: draggingAttackId,
        targetId: null,
        targetType: 'avatar'
      });
    }

    draggingAttackId = null;
  });

  window.addEventListener('mousemove', (e) => {
    if (draggingAttackId) {
      //dragging
    }
  });

  socket.on('game_over', ({ winnerId }) => {
    console.log('Game over. Winner:', winnerId);
    document.body.style.pointerEvents = 'none';
    const myId = socket.id;
    const message = winnerId === myId ? 'You won!' : 'You lost!';

    alert(message);

    setTimeout(() => {
      window.location.hash = '#homepage';
    }, 8000);
  });
}

function updateBattleUI(state, socket) {
  const myId = socket.id;
  const playerIds = Object.keys(state.players);

  const me = state.players[myId];
  const opponentId = playerIds.find((id) => id !== myId);
  const opponent = state.players[opponentId];

  if (!me || !opponent) {
    return;
  }
   
  const turn = document.getElementById('info-turn');

  if (state.activeTurn === myId) {
    turn.textContent = "YOUR TURN";
  } else {
    turn.textContent = "OPPONENT'S TURN";
  }

  document.getElementById('opp-hp').textContent = opponent.hp;
  document.getElementById('player-hp').textContent = me.hp;
  document.getElementById('info-timer').textContent = state.turnTimer;

  const myTable = document.getElementById('my-table');
  const oppTable = document.getElementById('opp-table');

  myTable.innerHTML = '';
  oppTable.innerHTML = '';

  me.table.forEach((card) => {
    const div = document.createElement('div');
    div.className = 'card-slot';
    div.textContent = `${card.name} | attack ${card.attack} | defense ${card.defense} | cost ${card.cost}`;

    if (card.canAttack && state.activeTurn === myId) {
      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        draggingAttackId = card.instanceId;
        console.log('Dragging:', draggingAttackId);
      });
    }

    myTable.appendChild(div);
  });

  opponent.table.forEach((card) => {
    const div = document.createElement('div');
    div.className = 'card-slot enemy-card';
    div.dataset.instanceId = card.instanceId;
    div.textContent = `${card.name} | attack ${card.attack} | defense ${card.defense} | cost ${card.cost}`;
    oppTable.appendChild(div);
  });

  const oppHand = document.getElementById('opp-hand');
  oppHand.innerHTML = '';
  for (let i = 0; i < opponent.handCount; i++) {
    const back = document.createElement('div');
    back.className = 'card-back';
    back.textContent = 'Card back';
    oppHand.appendChild(back);
  }

  const handDisplay = document.getElementById('hand-display');
  handDisplay.innerHTML = '';

  me.hand.forEach((card) => {
    const cardUI = renderCard({ label: card.name });

    cardUI.addEventListener('click', () => {
      if (state.activeTurn === myId) {
        socket.emit('play_card', {
          roomId: state.roomId,
          cardInstanceId: card.instanceId,
        });
      } else {
        alert('Wait for your turn!');
      }
    });

    handDisplay.appendChild(cardUI);
  });
}
