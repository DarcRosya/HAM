import { socketService } from '../services/socket.js';
import { renderCard } from '../components/Card.js';

let draggingAttackId = null;
let latestState = null;
let battleSocket = null;
let battleHandlers = null;
let battleNodes = null;
let gameActive = false;
const COIN_TOSS_DURATION_MS = 7500;

const resolvePlayers = (state, socket) => {
  const entries = Object.entries(state?.players ?? {});
  if (entries.length === 0) {
    return { myPlayerId: null, me: null, opponentId: null, opponent: null };
  }

  const myEntry =
    entries.find(([, player]) => player.socketId === socket.id) ||
    entries.find(([id]) => String(id) === String(socket.id));

  if (!myEntry) {
    return { myPlayerId: null, me: null, opponentId: null, opponent: null };
  }

  const [myPlayerId, me] = myEntry;
  const opponentEntry = entries.find(([id]) => String(id) !== String(myPlayerId));
  const [opponentId, opponent] = opponentEntry ?? [];

  return { myPlayerId, me, opponentId, opponent };
};

const resetCoinOverlay = () => {
  if (!battleNodes?.coinOverlay || !battleNodes?.coin) {
    return;
  }

  battleNodes.coinOverlay.classList.remove('is-active');
  battleNodes.coinOverlay.setAttribute('aria-hidden', 'true');

  setTimeout(() => {
    if (battleNodes?.coin) {
      battleNodes.coin.classList.remove('coin--you', 'coin--opp');
    }
  }, 300);
};

const detachBattleListeners = () => {
  if (!battleSocket || !battleHandlers) {
    return;
  }

  const {
    handleMatchFound,
    handleGameState,
    handleGameOver,
    handleError,
    handleMouseUp,
    handleMouseMove,
    handleHashChange,
    handleEndTurnClick,
  } = battleHandlers;

  battleSocket.off('match_found', handleMatchFound);
  battleSocket.off('game_state', handleGameState);
  battleSocket.off('game_over', handleGameOver);
  battleSocket.off('error', handleError);

  window.removeEventListener('mouseup', handleMouseUp);
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('hashchange', handleHashChange);

  if (battleNodes?.endTurnBtn && handleEndTurnClick) {
    battleNodes.endTurnBtn.removeEventListener('click', handleEndTurnClick);
  }

  battleHandlers = null;
};

const teardownBattle = ({ emitSurrender = false } = {}) => {
  if (emitSurrender && gameActive && latestState?.roomId && battleSocket) {
    battleSocket.emit('surrender', { roomId: latestState.roomId });
  }

  gameActive = false;
  draggingAttackId = null;
  resetCoinOverlay();
  detachBattleListeners();
  latestState = null;
};

export function initBattle() {
  detachBattleListeners();

  const socket = socketService.connect();
  battleSocket = socket;
  const coinOverlay = document.getElementById('coin-toss-overlay');
  const coin = coinOverlay?.querySelector('.coin');
  const endTurnBtn = document.getElementById('end-turn-btn');

  battleNodes = {
    coinOverlay,
    coin,
    endTurnBtn,
  };

  socket.off('match_found');
  socket.off('game_state');
  socket.off('game_over');
  socket.off('error');

  const handleError = (data) => {
    alert(data.message);
    console.log('Socket error:', data);
  };

  const handleGameState = (state) => {
    latestState = state;
    gameActive = true;
    console.log('Update received:', state);
    updateBattleUI(state, socket);
  };

  const handleMatchFound = async (state) => {
    latestState = state;
    gameActive = true;
    console.log('Match found:', state);

    if (!coinOverlay || !coin) {
      updateBattleUI(state, socket);
      return;
    }

    const { myPlayerId, me, opponent } = resolvePlayers(state, socket);
    if (!myPlayerId || !me || !opponent) {
      updateBattleUI(state, socket);
      return;
    }

    const isMyTurn = String(state.activeTurn) === String(myPlayerId);

    coinOverlay.classList.add('is-active');
    coinOverlay.setAttribute('aria-hidden', 'false');

    coin.classList.remove('coin--you', 'coin--opp');
    void coin.offsetWidth;
    coin.classList.add(isMyTurn ? 'coin--you' : 'coin--opp');

    await new Promise((resolve) => setTimeout(resolve, COIN_TOSS_DURATION_MS));

    resetCoinOverlay();
    updateBattleUI(state, socket);
  };

  const handleEndTurnClick = () => {
    if (!latestState) {
      return;
    }

    const { myPlayerId } = resolvePlayers(latestState, socket);
    const myId = myPlayerId ?? socket.id;

    if (String(latestState.activeTurn) === String(myId)) {
      socket.emit('end_turn');
    } else {
      alert('Not your turn!');
    }
  };

  const handleMouseUp = (e) => {
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
        targetType: 'card',
      });
    } else if (avatarTarget) {
      console.log('Attacking enemy avatar!');

      socket.emit('attack_target', {
        roomId: latestState.roomId,
        attackerInstanceId: draggingAttackId,
        targetId: null,
        targetType: 'avatar',
      });
    }

    draggingAttackId = null;
  };

  const handleMouseMove = (e) => {
    if (draggingAttackId) {
      //dragging
    }
  };

  const handleGameOver = ({ winnerId }) => {
    console.log('Game over. Winner:', winnerId);
    document.body.style.pointerEvents = 'none';
    gameActive = false;

    const { myPlayerId } = resolvePlayers(latestState, socket);
    const myId = myPlayerId ?? socket.id;
    const message = String(winnerId) === String(myId) ? 'You won!' : 'You lost!';

    alert(message);

    teardownBattle({ emitSurrender: false });

    setTimeout(() => {
      window.location.replace('#homepage');
    }, 8000);
  };

  const handleHashChange = () => {
    if (window.location.hash !== '#battle') {
      teardownBattle({ emitSurrender: true });
    }
  };

  battleHandlers = {
    handleMatchFound,
    handleGameState,
    handleGameOver,
    handleError,
    handleMouseUp,
    handleMouseMove,
    handleHashChange,
    handleEndTurnClick,
  };

  socket.on('error', handleError);
  socket.on('match_found', handleMatchFound);
  socket.on('game_state', handleGameState);
  socket.on('game_over', handleGameOver);

  if (endTurnBtn) {
    endTurnBtn.addEventListener('click', handleEndTurnClick);
  }

  window.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('hashchange', handleHashChange);

  const pendingStateStr = sessionStorage.getItem('pendingMatchState');
  if (pendingStateStr) {
    sessionStorage.removeItem('pendingMatchState');
    const state = JSON.parse(pendingStateStr);

    if (socket.connected) {
      handleMatchFound(state);
    } else {
      socket.on('connect', () => {
        handleMatchFound(state);
      });
    }
  }
}

function updateBattleUI(state, socket) {
  const { myPlayerId, me, opponent } = resolvePlayers(state, socket);

  if (!myPlayerId || !me || !opponent) {
    return;
  }

  const isMyTurn = String(state.activeTurn) === String(myPlayerId);

  const turn = document.getElementById('info-turn');

  if (isMyTurn) {
    turn.textContent = 'YOUR TURN';
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

    if (card.canAttack && isMyTurn) {
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
      if (isMyTurn) {
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
