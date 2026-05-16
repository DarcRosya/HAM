import { renderCard } from '../../components/Card.js';

let messageTimer = null;

// --- Константы ---
const TRAITS_DESC = {
  taunt: { title: 'Taunt', desc: 'Enemies must attack this unit first.' },
  charge: { title: 'Charge', desc: 'Can attack the same turn it is played.' },
};

// --- Вспомогательные функции ---

function safeSetText(element, text) {
  if (element) element.textContent = text;
}

function resolvePlayers(state, socketId) {
  const entries = Object.entries(state?.players ?? {});
  if (entries.length === 0) return { myPlayerId: null, me: null, opponentId: null, opponent: null };

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const normalizedLocalId = user?.id ? String(user.id) : null;

  const myEntry =
    (normalizedLocalId ? entries.find(([id]) => String(id) === normalizedLocalId) : null) ||
    entries.find(([, player]) => player.socketId === socketId) ||
    entries.find(([id]) => String(id) === String(socketId));

  if (!myEntry) return { myPlayerId: null, me: null, opponentId: null, opponent: null };

  const [myPlayerId, me] = myEntry;
  const opponentEntry = entries.find(([id]) => String(id) !== String(myPlayerId));
  const [opponentId, opponent] = opponentEntry ?? [];

  return { myPlayerId, me, opponentId, opponent };
}

function applyFanMath(cardUI, index, total, isMyHand, isMyTurn) {
  if (isMyHand && !isMyTurn) {
    cardUI.style.setProperty('--fan-rot', '0deg');
    cardUI.style.setProperty('--fan-y', '0px');
    cardUI.style.setProperty('--fan-x', '0px');
    return;
  }

  const mid = (total - 1) / 2;
  const offset = index - mid;

  if (isMyHand) {
    const angleStep = 4.5;
    const yStep = 4;
    const xStep = 2;
    cardUI.style.setProperty('--fan-rot', `${offset * angleStep}deg`);
    cardUI.style.setProperty('--fan-y', `${Math.pow(Math.abs(offset), 2) * yStep}px`);
    cardUI.style.setProperty('--fan-x', `${offset * xStep}px`);
  } else {
    const angleStep = -10.5;
    const yStep = -10;
    const xStep = -45;
    cardUI.style.setProperty('--fan-rot', `${offset * angleStep}deg`);
    cardUI.style.setProperty('--fan-y', `${Math.pow(Math.abs(offset), 2) * yStep}px`);
    cardUI.style.setProperty('--fan-x', `${offset * xStep}px`);
  }
}

// ==========================================
// ЭКСПОРТИРУЕМЫЙ API ДЛЯ ОРКЕСТРАТОРА
// ==========================================

export const BattleUI = {
  reveal(elements) {
    if (elements.loader) elements.loader.classList.add('hidden');
    if (elements.battleContainer) {
      elements.battleContainer.classList.add('is-visible');
      elements.battleContainer.style.opacity = '1';
      elements.battleContainer.style.pointerEvents = 'auto';
    }
  },

  resetCoin(elements) {
    if (!elements.coinOverlay) return;
    elements.coinOverlay.classList.remove('is-active');
    elements.coinOverlay.setAttribute('aria-hidden', 'true');
    elements.coinOverlay.style.display = 'none';
    setTimeout(() => {
      if (elements.coin) elements.coin.classList.remove('coin--you', 'coin--opp');
    }, 300);
  },

  setFrozen(isFrozen, message, elements) {
    const overlay = document.getElementById('freeze-overlay');
    const freezeText = document.getElementById('freeze-text');

    if (isFrozen) {
      if (overlay && freezeText) {
        freezeText.innerHTML = message || 'Waiting...';
        overlay.classList.remove('hidden');
      }
    } else {
      if (overlay) overlay.classList.add('hidden');
    }
  },

  showStatus(message, elements) {
    if (!elements.opponentStatus || !elements.opponentStatusText) return;
    elements.opponentStatusText.textContent = message;
    elements.opponentStatus.classList.remove('hidden');
  },

  hideStatus(elements) {
    if (elements.opponentStatus) elements.opponentStatus.classList.add('hidden');
  },

  showMessage(text, elements) {
    const msgEl = elements.battleMessage;
    if (!msgEl) return;

    if (messageTimer) clearTimeout(messageTimer);

    if (msgEl.textContent === text && msgEl.classList.contains('show')) {
      msgEl.classList.remove('shake', 'strong-pop');
      void msgEl.offsetWidth;
      msgEl.classList.add('shake');
    } else {
      msgEl.classList.remove('shake', 'strong-pop');
      msgEl.textContent = text;
      void msgEl.offsetWidth;
      msgEl.classList.add('show', 'strong-pop');
    }

    messageTimer = setTimeout(() => {
      msgEl.classList.remove('show', 'strong-pop', 'shake');
    }, 2500);
  },

  renderMana(containerId, currentMana, maxMana, hoveredCost = 0) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let wrapper = container.querySelector('.flask-wrapper');
    if (!wrapper) {
      container.innerHTML = `
        <div class="flask-wrapper">
          <div class="flask-liquid-track">
            <div class="flask-liquid"></div>
            <div class="flask-preview"></div>
          </div>
          <img src="/assets/images/vertical-flask.png" class="flask-glass-overlay" alt="Mana Flask">
          <div class="mana-text-badge">0/0</div>
        </div>
      `;
    }

    const textEl = container.querySelector('.mana-text-badge');
    const liquidEl = container.querySelector('.flask-liquid');
    const previewEl = container.querySelector('.flask-preview');

    textEl.textContent = `${currentMana}/${maxMana}`;

    const MAX_SEGMENTS = 10;
    const fillPercent = (currentMana / MAX_SEGMENTS) * 100;
    let previewPercent = 0;

    const isMyMana = containerId === 'player-mana-zone';
    if (isMyMana && hoveredCost > 0 && currentMana >= hoveredCost) {
      previewPercent = (hoveredCost / MAX_SEGMENTS) * 100;
    }

    const currentWidth = parseFloat(liquidEl.style.width) || 0;
    liquidEl.style.transition =
      fillPercent > currentWidth
        ? 'width 1.2s cubic-bezier(0.22, 1, 0.36, 1)'
        : 'width 0.25s ease-out';

    liquidEl.style.width = `${fillPercent}%`;

    if (previewPercent > 0) {
      previewEl.style.width = `${previewPercent}%`;
      previewEl.style.left = `${fillPercent - previewPercent}%`;
      previewEl.style.display = 'block';
    } else {
      previewEl.style.display = 'none';
    }
  },

  updateBoard(state, socketId, dragState = {}) {
    const { myPlayerId, me, opponent } = resolvePlayers(state, socketId);
    if (!myPlayerId || !me || !opponent) return;

    const isMyTurn = String(state.activeTurn) === String(myPlayerId);

    // 1. Базовое инфо
    safeSetText(document.getElementById('info-turn'), isMyTurn ? 'YOUR TURN' : "OPPONENT'S TURN");
    safeSetText(
      document.getElementById('opp-username-zone'),
      opponent.displayedName || opponent.username || 'Opponent'
    );
    safeSetText(document.getElementById('opp-hp'), opponent.hp);
    safeSetText(
      document.getElementById('player-username-zone'),
      me.displayedName || me.username || 'You'
    );
    safeSetText(document.getElementById('player-hp'), me.hp);

    const oppAvatar = document.getElementById('opp-avatar');
    if (oppAvatar && opponent.avatar) oppAvatar.src = opponent.avatar;
    const playerAvatar = document.getElementById('player-avatar');
    if (playerAvatar && me.avatar) playerAvatar.src = me.avatar;

    // 2. Колоды и Усталость
    safeSetText(document.getElementById('opp-deck'), opponent.deckCount);
    const playerDeck = document.getElementById('player-deck');
    if (playerDeck) playerDeck.dataset.count = me.deckCount;

    const fatigueInfo = document.getElementById('fatigue-info');
    if (fatigueInfo) {
      if (me.fatigue > 0) {
        fatigueInfo.classList.remove('hidden');
        safeSetText(document.getElementById('fatigue-value'), me.fatigue);
        if (playerDeck) playerDeck.style.filter = 'sepia(1) hue-rotate(300deg)';
      } else {
        fatigueInfo.classList.add('hidden');
        if (playerDeck) playerDeck.style.filter = 'none';
      }
    }

    // 3. Мана
    this.renderMana('opp-mana-zone', opponent.mana, opponent.maxMana);
    this.renderMana('player-mana-zone', me.mana, me.maxMana, dragState.hoveredCardCost || 0);

    // 4. Стол (Рендерим заново, так как токены простые, но в будущем стоит добавить diffing)
    const myTable = document.getElementById('player-table-zone');
    const oppTable = document.getElementById('opp-table-zone');
    if (myTable) myTable.innerHTML = '';
    if (oppTable) oppTable.innerHTML = '';

    me.table.forEach((card) => {
      const cardUI = renderCard({ ...card, variant: 'board' });
      cardUI.classList.add('card-slot');
      cardUI.dataset.instanceId = card.instanceId;

      if (card.canAttack && isMyTurn) cardUI.classList.add('can-attack');
      else cardUI.classList.add('exhausted');

      myTable.appendChild(cardUI);
    });

    opponent.table.forEach((card) => {
      const cardUI = renderCard({ ...card, variant: 'board' });
      cardUI.classList.add('card-slot', 'enemy-card');
      cardUI.dataset.instanceId = card.instanceId;

      // Если мы тянем стрелку атаки, подсвечиваем таунты
      if (dragState.isDraggingAttack && card.traits?.includes('taunt')) {
        cardUI.classList.add('taunt-target-glow');
      }
      oppTable.appendChild(cardUI);
    });

    // 5. Рука противника
    const oppHand = document.getElementById('opp-hand-zone');
    if (oppHand) {
      const existingOpp = Array.from(oppHand.children);
      while (existingOpp.length > opponent.handCount) existingOpp.pop().remove();
      while (existingOpp.length < opponent.handCount) {
        const newCard = renderCard({ faceDown: true });
        oppHand.appendChild(newCard);
        existingOpp.push(newCard);
      }
      existingOpp.forEach((cardUI, index) =>
        applyFanMath(cardUI, index, opponent.handCount, false, !isMyTurn)
      );
    }

    // 6. Наша рука (с diffing'ом для сохранения призраков drag&drop)
    const handDisplay = document.getElementById('player-hand-zone');
    if (handDisplay) {
      const existingNodes = Array.from(handDisplay.children);
      const newIds = me.hand.map((c) => c.instanceId);

      existingNodes.forEach((node) => {
        if (!newIds.includes(node.dataset.instanceId)) node.remove();
      });

      me.hand.forEach((card, index) => {
        let cardUI = handDisplay.querySelector(`[data-instance-id="${card.instanceId}"]`);

        if (!cardUI) {
          cardUI = renderCard(card);
          cardUI.dataset.instanceId = card.instanceId;
          handDisplay.appendChild(cardUI);
        }

        // Отрабатываем UX перетаскивания: прячем реальную карту, если ее тащит Ghost
        if (card.instanceId === dragState.playCardId) {
          cardUI.style.opacity = '0';
          cardUI.style.pointerEvents = 'none';
        } else {
          cardUI.style.opacity = '1';
          cardUI.style.pointerEvents = 'auto';
        }

        if (isMyTurn && me.mana >= card.cost) cardUI.classList.add('playable');
        else cardUI.classList.remove('playable');

        applyFanMath(cardUI, index, me.hand.length, true, isMyTurn);
      });
    }
  },

  // Чисто визуальный рендер тултипа. Вызывать его будет input.js
  renderTooltip(cardData, isBoard, rect) {
    let activeElement = document.createElement('div');
    activeElement.className = 'card-tooltip-container';

    let hasContent = false;

    if (isBoard) {
      const fullCard = renderCard({ ...cardData, variant: 'hand' });
      fullCard.style.position = 'relative';
      fullCard.style.margin = '0';
      fullCard.style.transform = 'none';
      activeElement.appendChild(fullCard);
      hasContent = true;
    }

    if (cardData.traits && cardData.traits.length > 0) {
      const traitsPanel = document.createElement('div');
      traitsPanel.className = 'traits-panel';

      cardData.traits.forEach((trait) => {
        const traitInfo = TRAITS_DESC[trait.toLowerCase()];
        if (traitInfo) {
          traitsPanel.innerHTML += `
            <div class="trait-item">
              <div class="trait-title">${traitInfo.title}</div>
              <div class="trait-desc">${traitInfo.desc}</div>
            </div>
          `;
          hasContent = true;
        }
      });
      activeElement.appendChild(traitsPanel);
    }

    if (!hasContent) return null;

    document.body.appendChild(activeElement);

    const tooltipWidth = activeElement.offsetWidth;
    const tooltipHeight = activeElement.offsetHeight;

    if (isBoard) {
      const centerX = rect.left + rect.width / 2 - tooltipWidth / 2;
      const topY = rect.top - tooltipHeight - 15;
      activeElement.style.left = `${centerX}px`;
      activeElement.style.top = `${topY}px`;
    } else {
      const offsetX = 30;
      const offsetY = 10;
      const isTooFarRight = rect.right + tooltipWidth + offsetX > window.innerWidth;

      if (isTooFarRight) {
        activeElement.style.left = `${rect.left - tooltipWidth - offsetX}px`;
      } else {
        activeElement.style.left = `${rect.right + offsetX}px`;
      }
      activeElement.style.top = `${rect.top + offsetY}px`;
    }

    return activeElement;
  },
};
