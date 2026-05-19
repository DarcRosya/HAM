import { battleState } from './state.js';
import { BattleUI } from './ui.js';

let boundHandlers = {};
let networkActions = {};
let attackReticle = null;
const TAUNT_FLASH_DURATION_MS = 400;

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

  if (battleState.ui.hoveredCardCost > 0) {
    battleState.ui.hoveredCardCost = 0;
    const me = getMyPlayer();
    if (me) BattleUI.renderMana('player-mana-zone', me.mana, me.maxMana, 0);
  }

  hideTooltip();
}

function triggerTauntFlash(cardEl) {
  if (!cardEl) return;
  if (cardEl._tauntFlashTimer) {
    clearTimeout(cardEl._tauntFlashTimer);
    cardEl._tauntFlashTimer = null;
  }

  cardEl.classList.remove('taunt-target-flash');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cardEl.classList.add('taunt-target-flash');
      cardEl._tauntFlashTimer = setTimeout(() => {
        cardEl.classList.remove('taunt-target-flash');
        cardEl._tauntFlashTimer = null;
      }, TAUNT_FLASH_DURATION_MS);
    });
  });
}

function handleMouseDown(e) {
  if (battleState.ui.isAnimating) return;

  const cardEl = e.target.closest('.card, .card-slot');
  if (!cardEl) return;

  hideTooltip();

  const instanceId = cardEl.dataset.instanceId;
  const me = getMyPlayer();
  const cardData = findCardInState(instanceId);

  if (!me || !cardData) return;

  if (cardEl.classList.contains('can-attack')) {
    e.preventDefault();
    battleState.drag.attackCardId = instanceId;
    document.body.classList.add('is-dragging');

    cardEl.classList.add('is-attacking-active');

    const board = document.querySelector('.game-board');
    const boardRect = board.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();
    const startX = cardRect.left + cardRect.width / 2;
    const startY = cardRect.top + cardRect.height / 2;

    const oppTableZone = document.getElementById('opp-table-zone');
    let hasTaunt = false;
    const entries = Object.entries(battleState.match?.players ?? {});
    const opponentEntry = entries.find(([id]) => String(id) !== String(getMyPlayerId()));
    const opponent = opponentEntry ? opponentEntry[1] : null;

    if (oppTableZone && opponent && opponent.table) {
      opponent.table.forEach((oppCard) => {
        if (oppCard.traits?.includes('taunt')) hasTaunt = true;
      });

      if (hasTaunt) {
        oppTableZone.querySelectorAll('.enemy-card').forEach((enemyCardUI) => {
          const cardData = findCardInState(enemyCardUI.dataset.instanceId);
          if (!cardData?.traits?.includes('taunt')) {
            enemyCardUI.classList.add('forbidden-target');
          }
        });
        document.getElementById('opp-avatar-zone')?.classList.add('forbidden-target');
        document.getElementById('opp-username-zone')?.classList.add('forbidden-target');
      }
    }

    const svg = document.getElementById('attack-arrow-svg');
    const line = document.getElementById('attack-line');
    if (svg && line) {
      svg.style.display = 'block';
      line.setAttribute(
        'd',
        `M ${startX} ${startY} Q ${(startX + e.clientX) / 2} ${(startY + e.clientY) / 2} ${e.clientX} ${e.clientY}`
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
    const isSpell = String(cardData.type).toLowerCase() === 'spell';
    if (!isSpell && me.table.length >= 7)
      return BattleUI.showMessage('Table is full!', battleState.elements);

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

    BattleUI.updateBoard(
      battleState.match,
      null,
      { playCardId: instanceId },
      { allowAnimations: false }
    );
  }
}

function handleMouseMove(e) {
  if (battleState.drag.playCardId || battleState.drag.attackCardId) {
    hideTooltip();
  }

  if ((battleState.drag.playCardId || battleState.drag.attackCardId) && !isMyTurn()) {
    BattleUI.showMessage('Time is up!', battleState.elements);
    cancelDragInteraction();
    return;
  }

  if (battleState.drag.playCardId && battleState.drag.ghostElement) {
    const cardData = findCardInState(battleState.drag.playCardId);
    const isSpell = String(cardData?.type).toLowerCase() === 'spell';

    if (isSpell) {
      const barrierY = getSpellBarrierY();
      const targetInfo = resolveSpellTarget(cardData, e.clientX, e.clientY);
      const isAiming = e.clientY < barrierY || targetInfo.isValid;

      const ghostY = e.clientY < barrierY ? barrierY : e.clientY;

      battleState.drag.ghostElement.style.left = e.clientX + 'px';
      battleState.drag.ghostElement.style.top = ghostY + 'px';

      if (!isAiming || !targetInfo.needsTarget) {
        hideSpellArrow();
        clearSpellReticle();
      } else {
        updateSpellArrow(e.clientX, e.clientY);

        if (attackReticle && !battleState.drag.attackCardId) {
          const targetInfo = resolveSpellTarget(cardData, e.clientX, e.clientY);
          if (!targetInfo.needsTarget) {
            clearSpellReticle();
          } else if (targetInfo.isValid && targetInfo.targetEl) {
            const tRect = targetInfo.targetEl.getBoundingClientRect();
            attackReticle.style.left = `${tRect.left + tRect.width / 2}px`;
            attackReticle.style.top = `${tRect.top + tRect.height / 2}px`;
            setSpellReticleState(true, true, targetInfo.targetSide, cardData.spellEffect);
          } else {
            attackReticle.style.left = `${e.clientX}px`;
            attackReticle.style.top = `${e.clientY}px`;
            setSpellReticleState(true, false, null, cardData.spellEffect);
          }
        }
      }
    } else {
      battleState.drag.ghostElement.style.left = e.clientX + 'px';
      battleState.drag.ghostElement.style.top = e.clientY + 'px';
      hideSpellArrow();
      clearSpellReticle();
    }
  }

  if (battleState.drag.attackCardId) {
    if (attackReticle) {
      attackReticle.classList.remove('spell-heal', 'spell-buff', 'spell-mana', 'spell-damage');
    }

    const board = document.querySelector('.game-board');
    const line = document.getElementById('attack-line');
    const attackerEl = document.querySelector(
      `[data-instance-id="${battleState.drag.attackCardId}"]`
    );

    if (attackerEl) attackerEl.classList.add('is-attacking-active');

    if (!isMyTurn()) {
      BattleUI.showMessage('Time is up!', battleState.elements);
      if (attackerEl) attackerEl.classList.remove('is-attacking-active');
      document
        .querySelectorAll('.forbidden-target')
        .forEach((el) => el.classList.remove('forbidden-target'));
      battleState.drag.attackCardId = null;
      return;
    }

    if (line && attackerEl) {
      const aRect = attackerEl.getBoundingClientRect();
      const startX = aRect.left + aRect.width / 2;
      const startY = aRect.top + aRect.height / 2;
      const endX = e.clientX;
      const endY = e.clientY;
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      const dx = endX - startX;
      const dy = endY - startY;
      const curve = 0.2;
      line.setAttribute(
        'd',
        `M ${startX} ${startY} Q ${midX - dy * curve} ${midY + dx * curve} ${endX} ${endY}`
      );
      const svg = document.getElementById('attack-arrow-svg');
      if (svg) svg.style.display = 'block';
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
        const targetEl = cardTarget || document.getElementById('opp-avatar');
        const tRect = targetEl.getBoundingClientRect();
        attackReticle.style.left = `${tRect.left + tRect.width / 2}px`;
        attackReticle.style.top = `${tRect.top + tRect.height / 2}px`;
        attackReticle.classList.add('snapped');

        let isLethal = false;
        let isSuicide = false;

        if (attackerEl) {
          const attackerCardData = findCardInState(battleState.drag.attackCardId);
          const targetCardData = cardTarget ? findCardInState(cardTarget.dataset.instanceId) : null;

          const atk = parseInt(attackerEl.querySelector('.token-attack')?.textContent || '0', 10);
          const hp = parseInt(attackerEl.querySelector('.token-defense')?.textContent || '0', 10);

          const targetHp = cardTarget
            ? parseInt(cardTarget.querySelector('.token-defense')?.textContent || '0', 10)
            : parseInt(document.getElementById('opp-hp')?.textContent || '0', 10);

          const targetAtk = cardTarget
            ? parseInt(cardTarget.querySelector('.token-attack')?.textContent || '0', 10)
            : 0;

          const attackerHasPoison = attackerCardData?.traits?.includes('poison');
          const defenderHasPoison = targetCardData?.traits?.includes('poison');

          if (atk >= targetHp || (attackerHasPoison && atk > 0 && cardTarget)) {
            isLethal = true;
          }

          if (targetAtk >= hp || (defenderHasPoison && targetAtk > 0)) {
            isSuicide = true;
          }
        }

        if (isLethal) attackReticle.classList.add('lethal');
        else attackReticle.classList.remove('lethal');

        if (isSuicide) attackerEl.classList.add('lethal-suicide');
        else attackerEl.classList.remove('lethal-suicide');
      } else {
        attackReticle.style.left = `${e.clientX}px`;
        attackReticle.style.top = `${e.clientY}px`;
        attackReticle.classList.remove('snapped', 'lethal');
        if (attackerEl) attackerEl.classList.remove('lethal-suicide');
      }
    }
  }
}

function handleMouseUp(e) {
  document.body.classList.remove('is-dragging');

  if (battleState.ui.isAnimating) {
    cancelDragInteraction();
    return;
  }

  if (battleState.drag.playCardId) {
    const cardData = findCardInState(battleState.drag.playCardId);
    if (!cardData) {
      if (battleState.drag.ghostElement) {
        battleState.drag.ghostElement.remove();
        battleState.drag.ghostElement = null;
      }
      battleState.drag.playCardId = null;
      hideSpellArrow();
      clearSpellReticle();
      BattleUI.updateBoard(battleState.match, null, battleState.drag, { allowAnimations: false });
      return;
    }
    const isSpell = String(cardData?.type).toLowerCase() === 'spell';

    if (isSpell) {
      const targetInfo = resolveSpellTarget(cardData, e.clientX, e.clientY);
      const handZone = document.getElementById('player-hand-zone');
      const dropThreshold = handZone
        ? handZone.getBoundingClientRect().top
        : getSpellBarrierY() + 40;

      if (e.clientY > dropThreshold && (!targetInfo.isValid || !targetInfo.needsTarget)) {
        cancelDragInteraction();
        return;
      }
      const shouldCast = !targetInfo.needsTarget || targetInfo.isValid;

      if (!shouldCast) {
        BattleUI.showMessage('Select a valid target!', battleState.elements);
      } else {
        networkActions.playCard({
          roomId: battleState.match.roomId,
          cardInstanceId: battleState.drag.playCardId,
          targetIndex: null,
          targetId: targetInfo.targetId ?? null,
          targetType: targetInfo.targetType ?? null,
        });
      }

      if (battleState.drag.ghostElement) {
        if (shouldCast) dissolveSpellGhost();
        else {
          battleState.drag.ghostElement.remove();
          battleState.drag.ghostElement = null;
        }
      }
      battleState.drag.playCardId = null;
      hideSpellArrow();
      clearSpellReticle();
      BattleUI.updateBoard(battleState.match, null, battleState.drag, { allowAnimations: false });
      return;
    }

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
    BattleUI.updateBoard(battleState.match, null, battleState.drag, { allowAnimations: false });
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

      const oppTableZone = document.getElementById('opp-table-zone');
      if (oppTableZone) {
        oppTableZone.querySelectorAll('.enemy-card:not(.forbidden-target)').forEach((el) => {
          const cardData = findCardInState(el.dataset.instanceId);
          if (cardData && cardData.traits?.includes('taunt')) {
            triggerTauntFlash(el);
          }
        });
      }
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

        const runAttackAnimation = (cancelToken) =>
          new Promise((resolve) => {
            let finished = false;
            const originalStyles = {
              zIndex: attackerEl?.style.zIndex,
              transition: attackerEl?.style.transition,
              transform: attackerEl?.style.transform,
              filter: attackerEl?.style.filter,
            };

            const cleanup = () => {
              if (finished) return;
              finished = true;
              document.body.style.pointerEvents = 'auto';
              if (attackerEl) {
                attackerEl.classList.remove('anim-attacking', 'anim-attack-return');
                attackerEl.style.zIndex = originalStyles.zIndex || '';
                attackerEl.style.transition = originalStyles.transition || '';
                attackerEl.style.transform = originalStyles.transform || '';
                attackerEl.style.filter = originalStyles.filter || '';
              }
              if (targetEl) targetEl.classList.remove('anim-target-hit');
              resolve();
            };

            if (cancelToken?.onCancel) cancelToken.onCancel(cleanup);
            document.body.style.pointerEvents = 'none';
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
              cleanup
            );
          });

        if (networkActions.queueAction) networkActions.queueAction(runAttackAnimation);
        else runAttackAnimation();
      }
    }

    if (attackerEl)
      attackerEl.classList.remove('is-attacking-active', 'is-preparing-attack', 'lethal-suicide');
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

function getSpellBarrierY() {
  const avatarZone =
    document.getElementById('player-avatar-zone') || document.getElementById('player-avatar');
  const handZone = document.getElementById('player-hand-zone');

  if (avatarZone && handZone) {
    const avatarRect = avatarZone.getBoundingClientRect();
    const handRect = handZone.getBoundingClientRect();
    return (avatarRect.bottom + handRect.top) / 2;
  }

  if (avatarZone) {
    return avatarZone.getBoundingClientRect().bottom + 20;
  }

  return window.innerHeight * 0.75;
}

function updateSpellArrow(cursorX, cursorY) {
  const svg = document.getElementById('attack-arrow-svg');
  const line = document.getElementById('attack-line');
  const ghost = battleState.drag.ghostElement;

  if (!svg || !line || !ghost) return;
  const ghostRect = ghost.getBoundingClientRect();
  const startX = ghostRect.left + ghostRect.width / 2;
  const startY = ghostRect.top + ghostRect.height / 2;
  const endX = cursorX;
  const endY = cursorY;

  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.hypot(dx, dy);
  const curve = Math.min(0.35, Math.max(0.15, distance / 900));

  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const controlX = midX - dy * curve;
  const controlY = midY + dx * curve;

  svg.style.display = 'block';
  line.setAttribute('d', `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`);
}

function hideSpellArrow() {
  const svg = document.getElementById('attack-arrow-svg');
  if (svg) svg.style.display = 'none';
}

function setSpellReticleState(show, snapped, targetSide, spellEffect) {
  if (!attackReticle) return;
  attackReticle.classList.toggle('show', Boolean(show));
  attackReticle.classList.toggle('snapped', Boolean(snapped));

  attackReticle.classList.remove(
    'lethal',
    'target-friendly',
    'target-enemy',
    'spell-heal',
    'spell-buff',
    'spell-mana',
    'spell-damage'
  );

  if (targetSide) attackReticle.classList.add(`target-${targetSide}`);

  if (spellEffect) {
    if (spellEffect.includes('heal')) attackReticle.classList.add('spell-heal');
    else if (spellEffect.includes('buff')) attackReticle.classList.add('spell-buff');
    else if (spellEffect === 'damage') attackReticle.classList.add('spell-damage');
    else if (spellEffect === 'add_mana') attackReticle.classList.add('spell-mana');
  }
}

function clearSpellReticle() {
  if (!attackReticle) return;
  attackReticle.classList.remove('show', 'snapped', 'lethal', 'target-friendly', 'target-enemy');
}

function dissolveSpellGhost() {
  const ghost = battleState.drag.ghostElement;
  if (!ghost) return;
  ghost.classList.add('anim-spell-dissolve');
  const ghostRef = ghost;
  setTimeout(() => {
    if (ghostRef.parentNode) ghostRef.remove();
  }, 300);
  battleState.drag.ghostElement = null;
}

function getSpellTargetConfig(cardData) {
  const effect = String(cardData?.spellEffect || '').toLowerCase();
  switch (effect) {
    case 'add_mana':
      return {
        needsTarget: false,
        allowCard: false,
        allowAvatar: false,
        allowFriendly: false,
        allowEnemy: false,
      };
    case 'damage':
      return {
        needsTarget: true,
        allowCard: true,
        allowAvatar: true,
        allowFriendly: true,
        allowEnemy: true,
      };
    case 'heal_card':
    case 'buff_card':
      return {
        needsTarget: true,
        allowCard: true,
        allowAvatar: false,
        allowFriendly: true,
        allowEnemy: false,
      };
    case 'heal_avatar':
      return {
        needsTarget: true,
        allowCard: false,
        allowAvatar: true,
        allowFriendly: true,
        allowEnemy: false,
      };
    default:
      return {
        needsTarget: true,
        allowCard: true,
        allowAvatar: true,
        allowFriendly: true,
        allowEnemy: true,
      };
  }
}

function getElementUnderCursor(x, y) {
  const ghost = battleState.drag.ghostElement;
  let previousDisplay = null;
  if (ghost) {
    previousDisplay = ghost.style.display;
    ghost.style.display = 'none';
  }
  const element = document.elementFromPoint(x, y);
  if (ghost) ghost.style.display = previousDisplay;
  return element;
}

function resolveSpellTarget(cardData, x, y) {
  const config = getSpellTargetConfig(cardData);
  if (!config.needsTarget) {
    return {
      needsTarget: false,
      isValid: true,
      targetId: null,
      targetType: null,
      targetEl: null,
      targetSide: null,
    };
  }

  const elementBelow = getElementUnderCursor(x, y);
  if (!elementBelow)
    return {
      needsTarget: true,
      isValid: false,
      targetId: null,
      targetType: null,
      targetEl: null,
      targetSide: null,
    };

  const cardTarget = elementBelow.closest('.card-slot, .enemy-card');
  if (cardTarget && config.allowCard) {
    const isEnemy = cardTarget.classList.contains('enemy-card');
    const targetId = cardTarget.dataset.instanceId;
    if (targetId && ((isEnemy && config.allowEnemy) || (!isEnemy && config.allowFriendly))) {
      return {
        needsTarget: true,
        isValid: true,
        targetId,
        targetType: 'card',
        targetEl: cardTarget,
        targetSide: isEnemy ? 'enemy' : 'friendly',
      };
    }
  }

  if (config.allowAvatar) {
    const selfAvatar = elementBelow.closest(
      '#player-avatar-zone, #player-avatar, #player-hp, #player-username-zone'
    );
    const oppAvatar = elementBelow.closest(
      '#opp-avatar-zone, #opp-avatar, #opp-health-zone, #opp-username-zone'
    );

    if (selfAvatar && config.allowFriendly) {
      const selfEl = document.getElementById('player-avatar') || selfAvatar;
      return {
        needsTarget: true,
        isValid: Boolean(getMyPlayerId()),
        targetId: getMyPlayerId(),
        targetType: 'avatar',
        targetEl: selfEl,
        targetSide: 'friendly',
      };
    }

    if (oppAvatar && config.allowEnemy) {
      const opponentId = getOpponentId();
      const oppEl = document.getElementById('opp-avatar') || oppAvatar;
      return {
        needsTarget: true,
        isValid: Boolean(opponentId),
        targetId: opponentId,
        targetType: 'avatar',
        targetEl: oppEl,
        targetSide: 'enemy',
      };
    }
  }

  return {
    needsTarget: true,
    isValid: false,
    targetId: null,
    targetType: null,
    targetEl: null,
    targetSide: null,
  };
}

function cancelDragInteraction() {
  document.body.classList.remove('is-dragging');

  if (battleState.drag.playCardId) {
    if (battleState.drag.ghostElement) {
      battleState.drag.ghostElement.remove();
      battleState.drag.ghostElement = null;
    }
    battleState.drag.playCardId = null;
    hideSpellArrow();
    clearSpellReticle();
    BattleUI.updateBoard(battleState.match, null, battleState.drag, { allowAnimations: false });
  }

  if (battleState.drag.attackCardId) {
    const svg = document.getElementById('attack-arrow-svg');
    if (svg) svg.style.display = 'none';
    if (attackReticle)
      attackReticle.classList.remove(
        'show',
        'snapped',
        'lethal',
        'target-friendly',
        'target-enemy'
      );

    const attackerEl = document.querySelector(
      `[data-instance-id="${battleState.drag.attackCardId}"]`
    );
    if (attackerEl)
      attackerEl.classList.remove('is-attacking-active', 'is-preparing-attack', 'lethal-suicide');

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

function getMyPlayerId() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const entries = Object.entries(battleState.match?.players ?? {});
  const myEntry = entries.find(([id]) => String(id) === String(user.id));
  return myEntry ? myEntry[0] : null;
}

function getOpponentId() {
  const myId = getMyPlayerId();
  const entries = Object.entries(battleState.match?.players ?? {});
  const opponentEntry = entries.find(([id]) => String(id) !== String(myId));
  return opponentEntry ? opponentEntry[0] : null;
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
    attackReticle.style.zIndex = '99990';
    const svgArrow = document.getElementById('attack-arrow-svg');
    if (svgArrow) {
      document.body.appendChild(svgArrow);
      svgArrow.style.position = 'fixed';
      svgArrow.style.zIndex = '99999';
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
