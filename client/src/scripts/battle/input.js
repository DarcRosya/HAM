import { battleState } from './state.js';
import { BattleUI } from './ui.js';

let boundHandlers = {};
let networkActions = {};

// ==========================================
// ЛОКАЛЬНЫЕ ОБРАБОТЧИКИ (Event Delegation)
// ==========================================

function handleEndTurn() {
  console.log(
    '%c[INPUT DEBUG] Функция handleEndTurn была успешно вызвана!',
    'background: #4ab367; color: #fff'
  );

  if (!battleState.match) {
    console.warn('[INPUT DEBUG] Нажатие проигнорировано: battleState.match отсутствует');
    return;
  }

  // Трясем BMO при клике (если функция добавлена в ui.js)
  if (BattleUI.triggerBmoVibration) {
    console.log('[INPUT DEBUG] Запуск анимации вибрации BMO');
    BattleUI.triggerBmoVibration(battleState.elements);
  }

  const myId = getMyPlayerId();
  const activeTurnId = battleState.match.activeTurn;
  console.log(
    `[INPUT DEBUG] Сверка ходов. Мой ID: ${myId}, Активный ход по серверу: ${activeTurnId}`
  );

  if (String(activeTurnId) === String(myId)) {
    console.log(
      '%c[INPUT DEBUG] Верификация пройдена, вызываем networkActions.endTurn()',
      'color: #4caf50'
    );
    networkActions.endTurn();
  } else {
    console.warn('%c[INPUT DEBUG] Попытка скипнуть чужой ход!', 'color: #f44336');
    BattleUI.showMessage('Not your turn!', battleState.elements);
  }
}

function handleSurrender() {
  if (!battleState.match) return;
  // Жесткий confirm, чтобы игрок не сдался случайно
  if (window.confirm('Are you sure you want to surrender? You will lose MMR!')) {
    networkActions.surrender(battleState.match.roomId);
  }
}
function handleMouseOver(e) {
  if (battleState.drag.playCardId || battleState.drag.attackCardId) return;

  const cardEl = e.target.closest('.card, .card-slot, .enemy-card');
  if (!cardEl) return;

  const instanceId = cardEl.dataset.instanceId;
  const isBoard = cardEl.classList.contains('card-slot') || cardEl.classList.contains('enemy-card');

  const cardData = findCardInState(instanceId);
  if (!cardData) return;

  // Если это наша карта в руке и сейчас наш ход — показываем предпросмотр маны
  if (!isBoard && isMyTurn() && getMyPlayer()?.mana >= cardData.cost) {
    battleState.ui.hoveredCardCost = cardData.cost;
    BattleUI.renderMana(
      'player-mana-zone',
      getMyPlayer().mana,
      getMyPlayer().maxMana,
      cardData.cost
    );
  }

  if (battleState.timers.tooltip) clearTimeout(battleState.timers.tooltip);

  battleState.timers.tooltip = setTimeout(() => {
    const rect = cardEl.getBoundingClientRect();
    const tooltip = BattleUI.renderTooltip(cardData, isBoard, rect);
    if (tooltip) battleState.ui.activeTooltip = tooltip;
  }, 500);
}

function handleMouseOut(e) {
  const cardEl = e.target.closest('.card, .card-slot, .enemy-card');
  if (!cardEl) return;

  // Сбрасываем предпросмотр маны
  if (battleState.ui.hoveredCardCost > 0) {
    battleState.ui.hoveredCardCost = 0;
    const me = getMyPlayer();
    if (me) BattleUI.renderMana('player-mana-zone', me.mana, me.maxMana, 0);
  }

  hideTooltip();
}

function handleMouseDown(e) {
  const cardEl = e.target.closest('.card, .card-slot');
  if (!cardEl) return;

  hideTooltip();

  const instanceId = cardEl.dataset.instanceId;
  const me = getMyPlayer();
  const cardData = findCardInState(instanceId);

  if (!me || !cardData) return;

  // 1. Атака со стола
  if (cardEl.classList.contains('can-attack')) {
    e.preventDefault();
    battleState.drag.attackCardId = instanceId;

    // СЧИТЫВАЕМ КООРДИНАТЫ ДО ПЕРЕРИСОВКИ DOM!
    const board = document.querySelector('.game-board');
    const boardRect = board.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();

    // Высчитываем строгий центр карты
    const startX = cardRect.left - boardRect.left + cardRect.width / 2;
    const startY = cardRect.top - boardRect.top + cardRect.height / 2;

    // Теперь перерисовываем стол (старый cardEl будет уничтожен)
    BattleUI.updateBoard(battleState.match, null, { isDraggingAttack: true });

    // Рисуем стрелку
    const svg = document.getElementById('attack-arrow-svg');
    const line = document.getElementById('attack-line');

    if (svg && line && board) {
      svg.style.display = 'block';
      line.setAttribute('x1', startX);
      line.setAttribute('y1', startY);
      line.setAttribute('x2', e.clientX - boardRect.left);
      line.setAttribute('y2', e.clientY - boardRect.top);
    }
    return;
  }

  // 2. Разыгрывание из руки
  if (cardEl.closest('#player-hand-zone')) {
    if (!isMyTurn()) return BattleUI.showMessage('Wait for your turn!', battleState.elements);
    if (me.mana < cardData.cost)
      return BattleUI.showMessage('Not enough mana!', battleState.elements);
    if (me.table.length >= 7) return BattleUI.showMessage('Table is full!', battleState.elements);

    e.preventDefault();
    battleState.drag.playCardId = instanceId;

    // Создаем призрака для перетаскивания
    const ghost = cardEl.cloneNode(true);
    ghost.style.position = 'fixed';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '10000';
    ghost.style.transform = 'translate(-50%, -50%) scale(0.85) rotate(2deg)';
    ghost.style.boxShadow = '0 15px 30px rgba(0,0,0,0.5)';
    ghost.style.transition = 'none';
    ghost.style.left = e.clientX + 'px';
    ghost.style.top = e.clientY + 'px';
    ghost.classList.remove('playable');

    document.body.appendChild(ghost);
    battleState.drag.ghostElement = ghost;

    // Прячем реальную карту в руке через UI
    BattleUI.updateBoard(battleState.match, null, { playCardId: instanceId });
  }
}

function handleMouseMove(e) {
  // Движение призрака (Карта)
  if (battleState.drag.playCardId && battleState.drag.ghostElement) {
    battleState.drag.ghostElement.style.left = e.clientX + 'px';
    battleState.drag.ghostElement.style.top = e.clientY + 'px';
  }

  // Движение стрелки (Атака)
  if (battleState.drag.attackCardId) {
    const board = document.querySelector('.game-board');
    const line = document.getElementById('attack-line');
    if (board && line) {
      const boardRect = board.getBoundingClientRect();
      line.setAttribute('x2', e.clientX - boardRect.left);
      line.setAttribute('y2', e.clientY - boardRect.top);
    }
  }
}

function handleMouseUp(e) {
  // 1. Отпускаем карту из руки
  if (battleState.drag.playCardId) {
    const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
    const tableZone = document.getElementById('player-table-zone');
    const isOverTable =
      dropTarget?.closest('#player-table-zone') || dropTarget?.closest('.player-table');

    if (isOverTable && tableZone) {
      const existingCards = Array.from(tableZone.querySelectorAll('.card-board'));
      let targetIndex = existingCards.length;

      // Вычисляем индекс вставки
      for (let i = 0; i < existingCards.length; i++) {
        const rect = existingCards[i].getBoundingClientRect();
        if (e.clientX < rect.left + rect.width / 2) {
          targetIndex = i;
          break;
        }
      }

      networkActions.playCard({
        roomId: battleState.match.roomId,
        cardInstanceId: battleState.drag.playCardId,
        targetIndex,
      });
    }

    // Жесткая зачистка Drag
    if (battleState.drag.ghostElement) {
      battleState.drag.ghostElement.remove();
      battleState.drag.ghostElement = null;
    }
    battleState.drag.playCardId = null;

    // Возвращаем UI в норму (если промахнулись, карта вернется в руку)
    BattleUI.updateBoard(battleState.match, null, {});
  }

  // 2. Отпускаем стрелку атаки
  if (battleState.drag.attackCardId) {
    const svg = document.getElementById('attack-arrow-svg');
    if (svg) svg.style.display = 'none';

    // Убираем подсветку таунтов
    document
      .querySelectorAll('.taunt-target-glow')
      .forEach((el) => el.classList.remove('taunt-target-glow'));

    const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
    const cardTarget = dropTarget?.closest('.enemy-card');
    const avatarTarget = dropTarget?.closest(
      '#opp-avatar-zone, #opp-avatar, #opp-health-zone, #opp-username-zone'
    );
    const selfTarget = dropTarget?.closest(
      '#player-avatar, #player-hp, #player-table-zone .card-slot, #player-mana-zone'
    );

    if (selfTarget) {
      BattleUI.showMessage("You can't attack yourself!", battleState.elements);
    } else if (cardTarget) {
      networkActions.attackTarget({
        roomId: battleState.match.roomId,
        attackerInstanceId: battleState.drag.attackCardId,
        targetId: cardTarget.dataset.instanceId,
        targetType: 'card',
      });
    } else if (avatarTarget) {
      networkActions.attackTarget({
        roomId: battleState.match.roomId,
        attackerInstanceId: battleState.drag.attackCardId,
        targetId: null,
        targetType: 'avatar',
      });
    }

    battleState.drag.attackCardId = null;
    // Возвращаем UI в норму
    BattleUI.updateBoard(battleState.match, null, {});
  }
}

// ==========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================

function hideTooltip() {
  if (battleState.timers.tooltip) {
    clearTimeout(battleState.timers.tooltip);
    battleState.timers.tooltip = null;
  }
  if (battleState.ui.activeTooltip) {
    battleState.ui.activeTooltip.remove();
    battleState.ui.activeTooltip = null;
  }
}

function getMyPlayerId() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const entries = Object.entries(battleState.match?.players ?? {});
  const myEntry = entries.find(([id]) => String(id) === String(user.id));
  return myEntry ? myEntry[0] : null;
}

function getMyPlayer() {
  const myId = getMyPlayerId();
  return myId ? battleState.match.players[myId] : null;
}

function isMyTurn() {
  return String(battleState.match?.activeTurn) === String(getMyPlayerId());
}

function findCardInState(instanceId) {
  if (!battleState.match) return null;

  for (const pId in battleState.match.players) {
    const player = battleState.match.players[pId];
    const inHand = player.hand?.find((c) => c.instanceId === instanceId);
    if (inHand) return inHand;
    const onBoard = player.table?.find((c) => c.instanceId === instanceId);
    if (onBoard) return onBoard;
  }
  return null;
}

// ==========================================
// ЭКСПОРТИРУЕМЫЙ API ДЛЯ ОРКЕСТРАТОРА
// ==========================================

export const BattleInput = {
  init(actions) {
    console.log(
      '%c[INPUT INIT] Регистрация слушателей событий ввода...',
      'background: #00796b; color: #fff'
    );
    networkActions = actions;

    // Кешируем биндинги для безопасного удаления
    boundHandlers.endTurn = handleEndTurn;
    boundHandlers.surrender = handleSurrender;
    boundHandlers.mouseDown = handleMouseDown;
    boundHandlers.mouseMove = handleMouseMove;
    boundHandlers.mouseUp = handleMouseUp;
    boundHandlers.mouseOver = handleMouseOver;
    boundHandlers.mouseOut = handleMouseOut;

    // Вешаем слушатели на кнопки
    if (battleState.elements.bmoHitbox) {
      console.log(
        '%c[INPUT INIT] Успешно привязан клик к bmoHitbox',
        'color: #4caf50',
        battleState.elements.bmoHitbox
      );
      battleState.elements.bmoHitbox.addEventListener('click', boundHandlers.endTurn);
    } else {
      console.error(
        '%c[INPUT CRITICAL] Невозможно повесить событие! battleState.elements.bmoHitbox равен null или undefined',
        'background: #ff0000; color: #fff'
      );
    }

    if (battleState.elements.surrenderBtn) {
      battleState.elements.surrenderBtn.addEventListener('click', boundHandlers.surrender);
    }

    // Глобальные события (Делегирование)
    document.addEventListener('mousedown', boundHandlers.mouseDown);
    document.addEventListener('mousemove', boundHandlers.mouseMove);
    document.addEventListener('mouseup', boundHandlers.mouseUp);
    document.addEventListener('mouseover', boundHandlers.mouseOver);
    document.addEventListener('mouseout', boundHandlers.mouseOut);
  },

  cleanup() {
    console.log(
      '%c[INPUT CLEANUP] Снятие всех слушателей событий...',
      'background: #5d4037; color: #fff'
    );
    // Жесткая зачистка обработчиков (защита от утечек)
    if (battleState.elements.bmoHitbox) {
      battleState.elements.bmoHitbox.removeEventListener('click', boundHandlers.endTurn);
    }
    if (battleState.elements.surrenderBtn) {
      battleState.elements.surrenderBtn.removeEventListener('click', boundHandlers.surrender);
    }

    document.removeEventListener('mousedown', boundHandlers.mouseDown);
    document.removeEventListener('mousemove', boundHandlers.mouseMove);
    document.removeEventListener('mouseup', boundHandlers.mouseUp);
    document.removeEventListener('mouseover', boundHandlers.mouseOver);
    document.removeEventListener('mouseout', boundHandlers.mouseOut);

    boundHandlers = {};
    networkActions = {};
    hideTooltip();
  },
};
