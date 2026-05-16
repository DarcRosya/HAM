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
    if (elements.loader && !elements.loader.classList.contains('hidden')) {
      elements.loader.style.transition = 'opacity 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      elements.loader.style.opacity = '0';
      setTimeout(() => {
        elements.loader.classList.add('hidden');
        elements.loader.style.display = 'none';
      }, 400);
    }
  },

  renderVsScreen(state, myId) {
    const vsOverlay = document.getElementById('vs-screen');
    if (!vsOverlay) return;

    if (state.phase === 'loading') return;

    if (state.phase === 'coin_toss' || state.phase === 'playing' || state.phase === 'finished') {
      vsOverlay.classList.add('hidden');
      vsOverlay.classList.remove('vs-active');
      vsOverlay.style.display = 'none';

      // ВОТ ЭТО ВАЖНО: Снимаем блокировку мыши со стола
      const gameBoard = document.querySelector('.game-board');
      if (gameBoard) {
        gameBoard.style.pointerEvents = '';
      }
      return;
    }

    // 2. ОТРИСОВКА ЭКРАНА (СТРОГО ОДИН РАЗ)
    if (state.phase === 'vs_screen') {
      if (!vsOverlay.classList.contains('vs-active')) {
        const playerIds = Object.keys(state.players);
        const oppId = playerIds.find((id) => String(id) !== String(myId));

        const me = state.players[myId];
        const opp = state.players[oppId];

        if (me) {
          document.getElementById('vs-you-avatar').src =
            me.avatar || '/assets/images/avatar-my.png';
          document.getElementById('vs-you-name').textContent = me.displayedName || me.username;
          document.getElementById('vs-you-mmr').textContent = `MMR: ${me.rating}`;
          document.getElementById('vs-you-sword').src =
            `/assets/images/sword-${me.swordId || 1}.png`;
        }

        if (opp) {
          document.getElementById('vs-opp-avatar').src =
            opp.avatar || '/assets/images/avatar-enemy.png';
          document.getElementById('vs-opp-name').textContent = opp.displayedName || opp.username;
          document.getElementById('vs-opp-mmr').textContent = `MMR: ${opp.rating}`;
          document.getElementById('vs-opp-sword').src =
            `/assets/images/sword-${opp.swordId || 1}.png`;
        }

        // Возвращаем динамические элементы для эпичной анимации (искры, надпись)
        let finaleTitle = document.getElementById('vs-finale-title');
        if (!finaleTitle) {
          finaleTitle = document.createElement('div');
          finaleTitle.id = 'vs-finale-title';
          finaleTitle.className = 'vs-finale-title';

          const words = ['MAY', 'THE', 'STRONGEST', 'WIN'];
          finaleTitle.innerHTML = words
            .map((word, index) => {
              return `<span class="vs-word" data-word-index="${index}">${word}</span>`;
            })
            .join('');

          vsOverlay.appendChild(finaleTitle);
        }

        let particleWrapper = document.getElementById('vs-particles-wrapper');
        if (!particleWrapper) {
          particleWrapper = document.createElement('div');
          particleWrapper.id = 'vs-particles-wrapper';

          // Данные по ударам: время (сек) и CSS-переменные для их координат
          const clashes = [
            { time: 6.51, varX: 'var(--impact1-x)', varY: 'var(--impact1-y)' },
            { time: 7.44, varX: 'var(--impact2-x)', varY: 'var(--impact2-y)' },
            { time: 10.23, varX: 'var(--impact3-x)', varY: 'var(--impact3-y)' },
          ];
          const particlesPerClash = 25;

          clashes.forEach((clash, index) => {
            const container = document.createElement('div');
            container.className = 'vs-particles-container';
            // Жестко привязываем контейнер к переменной удара!
            container.style.setProperty('--impact-x', clash.varX);
            container.style.setProperty('--impact-y', clash.varY);

            let particlesHTML = '';
            for (let i = 0; i < particlesPerClash; i++) {
              const angle = Math.random() * Math.PI * 2;
              const velocity = 150 + Math.random() * 400;
              const tx = Math.cos(angle) * velocity;
              const ty = Math.sin(angle) * velocity;
              const rot = Math.random() * 360;
              const scale = 0.3 + Math.random() * 1.2;

              particlesHTML += `<div class="vs-particle" data-clash-time="${clash.time}" style="--tx: ${tx}px; --ty: ${ty}px; --rot: ${rot}deg; --s: ${scale};"></div>`;
            }
            container.innerHTML = particlesHTML;
            particleWrapper.appendChild(container);
          });

          vsOverlay.appendChild(particleWrapper);
        }

        let wipeTransition = document.getElementById('vs-wipe');
        if (!wipeTransition) {
          wipeTransition = document.createElement('div');
          wipeTransition.id = 'vs-wipe';
          wipeTransition.className = 'vs-wipe';
          vsOverlay.appendChild(wipeTransition);
        }

        vsOverlay.style.display = '';
        vsOverlay.classList.remove('hidden');

        // Вызываем reflow браузера
        void vsOverlay.offsetWidth;
        vsOverlay.classList.add('vs-active');

        // 3. ПРО-ХАК: СИНХРОНИЗАЦИЯ (теперь ВНУТРИ if, чтобы не сбивать анимацию при обновлении стейта)
        const totalPhaseDuration = 15500;
        const passedTimeMs = totalPhaseDuration - (state.turnEndsInMs || totalPhaseDuration);
        const passedSeconds = Math.max(0, passedTimeMs / 1000);

        // Синхронизируем базовые статичные 15.5s анимации (аватары, мечи, фон)
        const animatedElements = vsOverlay.querySelectorAll(
          '.vs-background-blur, .vs-opp, .vs-you, .vs-info, .vs-sword, .vs-text, .vs-wipe'
        );
        animatedElements.forEach((el) => {
          el.style.animationDelay = `-${passedSeconds}s`;
        });
        vsOverlay.style.animationDelay = `-${passedSeconds}s`;

        const wordsElements = vsOverlay.querySelectorAll('.vs-word');
        const timeLeftSec = (state.turnEndsInMs || 0) / 1000;
        const wordAnimDuration = 3.6;

        wordsElements.forEach((word) => {
          const index = parseInt(word.getAttribute('data-word-index') || '0', 10);
          const staggerDelay = index * 0.15;
          const delayToStart = timeLeftSec - wordAnimDuration + staggerDelay;
          word.style.animationDelay = `${delayToStart}s`;
        });

        // ДИНАМИЧЕСКАЯ СИНХРОНИЗАЦИЯ ИСКР
        const particles = vsOverlay.querySelectorAll('.vs-particle');
        particles.forEach((p) => {
          const clashTimeSec = parseFloat(p.getAttribute('data-clash-time') || '0');
          const particleDelay = clashTimeSec - passedSeconds;
          p.style.animationDelay = `${particleDelay}s`;
        });

        vsOverlay.style.animationDelay = `-${passedSeconds}s`;
      }
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

  updateBmoDisplay(remainingMs, isMyTurn, elements, phase) {
    if (!elements.bmoTextTop || !elements.bmoTextBottom) return;

    if (phase === 'loading') {
      elements.bmoTextTop.textContent = 'WAIT';
      elements.bmoTextBottom.className = 'bmo-large-font';
      elements.bmoTextBottom.textContent = 'SYNC...';
      return;
    }

    const exactSeconds = Math.ceil(remainingMs / 1000);
    const displaySeconds = Math.min(30, Math.max(0, exactSeconds));

    const isIntroPhase = phase === 'coin_toss' || remainingMs > 30000;

    if (isIntroPhase) {
      elements.bmoTextTop.textContent = '30';
      elements.bmoTextBottom.className = 'bmo-large-font';

      // Вычисляем, сколько миллисекунд осталось чисто на интро (от 2000 до 0)
      const introTimeLeft = remainingMs - 30000;

      if (isMyTurn) {
        // Жесткие тайминги для 2 слов (по 1000мс на фазу)
        if (introTimeLeft > 1000) {
          elements.bmoTextBottom.textContent = 'YOUR';
        } else {
          elements.bmoTextBottom.textContent = 'TURN';
        }
      } else {
        // Жесткие тайминги для 3 слов (по ~666мс на фазу)
        if (introTimeLeft > 1333) {
          elements.bmoTextBottom.textContent = 'OPPO';
        } else if (introTimeLeft > 666) {
          elements.bmoTextBottom.textContent = 'NENT';
        } else {
          elements.bmoTextBottom.textContent = 'TURN';
        }
      }
    } else {
      // Игровая фаза
      elements.bmoTextTop.textContent = isMyTurn ? 'YOUR TURN' : 'OPPONENT';
      elements.bmoTextBottom.className = 'bmo-timer-font';
      elements.bmoTextBottom.textContent = displaySeconds;

      if (displaySeconds <= 8 && displaySeconds > 0) {
        elements.bmoTextBottom.classList.add('danger-tick');
      } else {
        elements.bmoTextBottom.classList.remove('danger-tick');
      }
    }
  },

  // Анимация вибрации BMO при клике
  triggerBmoVibration(elements) {
    if (!elements.bmoBody) return;
    elements.bmoBody.classList.remove('bmo-vibrate');
    void elements.bmoBody.offsetWidth; // Форсируем Reflow
    elements.bmoBody.classList.add('bmo-vibrate');
  },
};
