import { battleState } from './state.js';
import { BattleUI } from './ui.js';

let boundHandlers = {};
let networkActions = {};
let attackReticle = null;
const TAUNT_FLASH_DURATION_MS = 280;

// ==========================================
// ЛОКАЛЬНЫЕ ОБРАБОТЧИКИ (Event Delegation)
// ==========================================

function handleEndTurn() {
  if (battleState.ui.isAnimating) return;
  if (!battleState.match) return;
  if (BattleUI.triggerBmoVibration) BattleUI.triggerBmoVibration(battleState.elements);
  const myId = getMyPlayerId();
  if (String(battleState.match.activeTurn) === String(myId)) networkActions.endTurn();
  else BattleUI.showMessage('Not your turn!', battleState.elements);
}

function handleSurrender() {
  if (!battleState.match) return;
  if (window.confirm('Are you sure you want to surrender? You will lose MMR!'))
    networkActions.surrender(battleState.match.roomId);
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

function triggerTauntFlash(cardEl) {
  cardEl.classList.remove('taunt-target-flash');
  void cardEl.offsetWidth;
  cardEl.classList.add('taunt-target-flash');
  setTimeout(() => {
    cardEl.classList.remove('taunt-target-flash');
  }, TAUNT_FLASH_DURATION_MS);
}

function handleMouseDown(e) {
  // if (battleState.ui.isAnimating) return;

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
    document.body.classList.add('is-dragging');

    // СЧИТЫВАЕМ КООРДИНАТЫ ДО ПЕРЕРИСОВКИ DOM!
    const board = document.querySelector('.game-board');
    const boardRect = board.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();
    const startX = cardRect.left - boardRect.left + cardRect.width / 2;
    const startY = cardRect.top - boardRect.top + cardRect.height / 2;

    const oppTableZone = document.getElementById('opp-table-zone');
    let hasTaunt = false;
    const tauntIds = new Set();
    const entries = Object.entries(battleState.match?.players ?? {});
    const opponentEntry = entries.find(([id]) => String(id) !== String(getMyPlayerId()));
    const opponent = opponentEntry ? opponentEntry[1] : null;

    if (oppTableZone && opponent && opponent.table) {
      opponent.table.forEach((oppCard) => {
        if (oppCard.traits?.includes('taunt')) {
          hasTaunt = true;
          tauntIds.add(String(oppCard.instanceId));
          const oppUI = oppTableZone.querySelector(`[data-instance-id="${oppCard.instanceId}"]`);
          if (oppUI) triggerTauntFlash(oppUI);
        }
      });
      if (hasTaunt) {
        oppTableZone.querySelectorAll('.enemy-card').forEach((enemyCardUI) => {
          if (!tauntIds.has(String(enemyCardUI.dataset.instanceId)))
            enemyCardUI.classList.add('forbidden-target');
        });
        document.getElementById('opp-avatar-zone')?.classList.add('forbidden-target');
        document.getElementById('opp-username-zone')?.classList.add('forbidden-target');
      }
    }

    const svg = document.getElementById('attack-arrow-svg');
    const line = document.getElementById('attack-line');
    if (svg && line && board) {
      svg.style.display = 'block';
      line.setAttribute(
        'd',
        `M ${startX} ${startY} Q ${(startX + e.clientX - boardRect.left) / 2} ${(startY + e.clientY - boardRect.top) / 2} ${e.clientX - boardRect.left} ${e.clientY - boardRect.top}`
      );
    }
    if (attackReticle) {
      attackReticle.classList.add('show');
      attackReticle.style.left = `${e.clientX}px`;
      attackReticle.style.top = `${e.clientY}px`;
    }
    return;
  }

  if (cardEl.closest('#player-hand-zone')) {
    if (!isMyTurn()) return BattleUI.showMessage('Wait for your turn!', battleState.elements);
    if (me.mana < cardData.cost)
      return BattleUI.showMessage('Not enough mana!', battleState.elements);
    if (me.table.length >= 7) return BattleUI.showMessage('Table is full!', battleState.elements);

    e.preventDefault();
    battleState.drag.playCardId = instanceId;
    document.body.classList.add('is-dragging');

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

    BattleUI.updateBoard(battleState.match, null, { playCardId: instanceId });
  }
}

function handleMouseMove(e) {
  if (battleState.drag.playCardId && battleState.drag.ghostElement) {
    battleState.drag.ghostElement.style.left = e.clientX + 'px';
    battleState.drag.ghostElement.style.top = e.clientY + 'px';
  }

  if (battleState.drag.attackCardId) {
    const board = document.querySelector('.game-board');
    const line = document.getElementById('attack-line');
    const attackerEl = document.querySelector(
      `[data-instance-id="${battleState.drag.attackCardId}"]`
    );

    if (board && line && attackerEl) {
      const boardRect = board.getBoundingClientRect();
      const aRect = attackerEl.getBoundingClientRect();
      const startX = aRect.left - boardRect.left + aRect.width / 2;
      const startY = aRect.top - boardRect.top + aRect.height / 2;
      const endX = e.clientX - boardRect.left;
      const endY = e.clientY - boardRect.top;

      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      const dx = endX - startX;
      const dy = endY - startY;
      const curve = 0.2;
      line.setAttribute(
        'd',
        `M ${startX} ${startY} Q ${midX - dy * curve} ${midY + dx * curve} ${endX} ${endY}`
      );
    }

    if (attackReticle) {
      const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
      const cardTarget = elementBelow?.closest('.enemy-card:not(.forbidden-target)');
      let avatarTarget = elementBelow?.closest(
        '#opp-avatar-zone, #opp-avatar, #opp-health-zone, #opp-username-zone'
      );
      if (avatarTarget && avatarTarget.closest('.forbidden-target')) avatarTarget = null;
      const selfTarget = elementBelow?.closest(
        '#player-avatar, #player-hp, #player-username-zone, #player-table-zone .card-slot, #player-mana-zone'
      );

      if ((cardTarget || avatarTarget) && !selfTarget) {
        const targetEl = cardTarget || document.getElementById('opp-avatar-zone');
        const tRect = targetEl.getBoundingClientRect();
        attackReticle.style.left = `${tRect.left + tRect.width / 2}px`;
        attackReticle.style.top = `${tRect.top + tRect.height / 2}px`;
        attackReticle.classList.add('snapped');

        let isLethal = false;
        if (attackerEl) {
          const atk = parseInt(attackerEl.querySelector('.token-attack')?.textContent || '0', 10);
          const targetHp = cardTarget
            ? parseInt(cardTarget.querySelector('.token-defense')?.textContent || '0', 10)
            : parseInt(document.getElementById('opp-hp')?.textContent || '0', 10);
          if (atk >= targetHp) isLethal = true;
        }
        if (isLethal) attackReticle.classList.add('lethal');
        else attackReticle.classList.remove('lethal');
      } else {
        attackReticle.style.left = `${e.clientX}px`;
        attackReticle.style.top = `${e.clientY}px`;
        attackReticle.classList.remove('snapped', 'lethal');
      }
    }
  }
}

function handleMouseUp(e) {
  document.body.classList.remove('is-dragging');

  if (battleState.drag.playCardId) {
    const tableZone = document.getElementById('player-table-zone');
    let isOverTable = false;
    if (tableZone) {
      const rect = tableZone.getBoundingClientRect();
      if (
        e.clientX >= rect.left + 50 &&
        e.clientX <= rect.right - 50 &&
        e.clientY >= rect.top + 30 &&
        e.clientY <= rect.bottom - 30
      )
        isOverTable = true;
    }
    if (isOverTable) {
      battleState.drag.lastDropCoords = { x: e.clientX, y: e.clientY };
      const existingCards = Array.from(tableZone.querySelectorAll('.card-board'));
      let targetIndex = existingCards.length;
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
    if (battleState.drag.ghostElement) {
      battleState.drag.ghostElement.remove();
      battleState.drag.ghostElement = null;
    }
    battleState.drag.playCardId = null;
    BattleUI.updateBoard(battleState.match, null, battleState.drag);
  }

  if (battleState.drag.attackCardId) {
    const svg = document.getElementById('attack-arrow-svg');
    if (svg) svg.style.display = 'none';
    if (attackReticle) attackReticle.classList.remove('show', 'snapped', 'lethal');

    const attackerEl = document.querySelector(
      `[data-instance-id="${battleState.drag.attackCardId}"]`
    );
    const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
    const isForbidden = dropTarget?.closest('.forbidden-target');

    if (isForbidden) {
      BattleUI.showMessage('You must attack a unit with Taunt!', battleState.elements);
    } else {
      const cardTarget = dropTarget?.closest('.enemy-card:not(.forbidden-target)');
      let avatarTarget = dropTarget?.closest(
        '#opp-avatar-zone, #opp-avatar, #opp-health-zone, #opp-username-zone'
      );
      if (avatarTarget && avatarTarget.closest('.forbidden-target')) avatarTarget = null;

      const selfAvatarTarget = dropTarget?.closest(
        '#player-avatar, #player-hp, #player-username-zone, #player-mana-zone'
      );

      if (selfAvatarTarget) {
        BattleUI.showMessage("You can't attack yourself!", battleState.elements);
      } else if (cardTarget || avatarTarget) {
        const targetId = cardTarget ? cardTarget.dataset.instanceId : null;
        const targetType = cardTarget ? 'card' : 'avatar';
        const attackId = battleState.drag.attackCardId;
        const targetEl = cardTarget || avatarTarget;

        document.body.style.pointerEvents = 'none'; // Блокируем клики на время самой атаки
        if (networkActions.setAnimationLock) networkActions.setAnimationLock();

        BattleUI.playAttackAnimation(
          attackerEl,
          targetEl,
          () => {
            networkActions.attackTarget({
              roomId: battleState.match.roomId,
              attackerInstanceId: attackId,
              targetId,
              targetType,
            });
          },
          () => {
            document.body.style.pointerEvents = 'auto';
            if (networkActions.releaseLock) networkActions.releaseLock();
          }
        );
      }
    }

    if (attackerEl) attackerEl.classList.remove('is-attacking-active');
    document
      .querySelectorAll('.taunt-target-glow')
      .forEach((el) => el.classList.remove('taunt-target-glow'));
    document
      .querySelectorAll('.taunt-target-flash')
      .forEach((el) => el.classList.remove('taunt-target-flash'));
    document
      .querySelectorAll('.forbidden-target')
      .forEach((el) => el.classList.remove('forbidden-target'));

    battleState.drag.attackCardId = null;
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
    networkActions = actions;
    boundHandlers.endTurn = handleEndTurn;
    boundHandlers.surrender = handleSurrender;
    boundHandlers.mouseDown = handleMouseDown;
    boundHandlers.mouseMove = handleMouseMove;
    boundHandlers.mouseUp = handleMouseUp;
    boundHandlers.mouseOver = handleMouseOver;
    boundHandlers.mouseOut = handleMouseOut;

    if (battleState.elements.bmoHitbox)
      battleState.elements.bmoHitbox.addEventListener('click', boundHandlers.endTurn);
    if (battleState.elements.surrenderBtn)
      battleState.elements.surrenderBtn.addEventListener('click', boundHandlers.surrender);

    document.addEventListener('mousedown', boundHandlers.mouseDown);
    document.addEventListener('mousemove', boundHandlers.mouseMove);
    document.addEventListener('mouseup', boundHandlers.mouseUp);
    document.addEventListener('mouseover', boundHandlers.mouseOver);
    document.addEventListener('mouseout', boundHandlers.mouseOut);

    if (!document.getElementById('attack-reticle')) {
      attackReticle = document.createElement('div');
      attackReticle.id = 'attack-reticle';
      attackReticle.className = 'attack-reticle';
      document.body.appendChild(attackReticle);
    } else {
      attackReticle = document.getElementById('attack-reticle');
    }
  },

  cleanup() {
    if (battleState.elements.bmoHitbox)
      battleState.elements.bmoHitbox.removeEventListener('click', boundHandlers.endTurn);
    if (battleState.elements.surrenderBtn)
      battleState.elements.surrenderBtn.removeEventListener('click', boundHandlers.surrender);

    document.removeEventListener('mousedown', boundHandlers.mouseDown);
    document.removeEventListener('mousemove', boundHandlers.mouseMove);
    document.removeEventListener('mouseup', boundHandlers.mouseUp);
    document.removeEventListener('mouseover', boundHandlers.mouseOver);
    document.removeEventListener('mouseout', boundHandlers.mouseOut);

    boundHandlers = {};
    networkActions = {};

    hideTooltip();
    if (attackReticle) {
      attackReticle.remove();
      attackReticle = null;
    }
  },
};
