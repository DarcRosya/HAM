import { renderCard } from '../../components/Card.js';
import { battleState } from './state.js';
import { store } from '../../core/store.js';

let messageTimer = null;

// --- Константы ---
const TRAITS_DESC = {
  taunt: { title: 'Taunt', desc: 'Enemies must attack this unit first.' },
  charge: { title: 'Charge', desc: 'Can attack the same turn it is played.' },
  poison: { title: 'Poison', desc: 'Instantly destroys any card it damages.' },
};

// --- Вспомогательные функции ---

function safeSetText(element, text) {
  if (element) element.textContent = text;
}

function applyAvatarFrame(frameEl, frameSrc) {
  if (!frameEl) return;
  if (frameSrc) {
    frameEl.src = frameSrc;
    frameEl.style.display = '';
  } else {
    frameEl.removeAttribute('src');
    frameEl.style.display = 'none';
  }
}

function wait(ms, cancelToken) {
  return new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };

    const timer = setTimeout(done, ms);
    if (cancelToken?.onCancel) {
      cancelToken.onCancel(() => {
        clearTimeout(timer);
        done();
      });
    }
  });
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

function syncHandVisibilityByPhase(phase) {
  const shouldHideHands = phase === 'coin_toss';
  ['opp-hand-zone', 'player-hand-zone'].forEach((zoneId) => {
    const handZone = document.getElementById(zoneId);
    if (handZone) handZone.classList.toggle('hand-hidden', shouldHideHands);
  });
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
          document.getElementById('vs-you-avatar').src = me.avatar || '/assets/avatars/avatar.png';
          document.getElementById('vs-you-name').textContent = me.displayedName || me.username;
          document.getElementById('vs-you-mmr').textContent = `MMR: ${me.rating}`;
          document.getElementById('vs-you-sword').src =
            `/assets/images/sword-${me.swordId || 1}.png`;

          const myFrame = document.getElementById('vs-you-frame');
          const myFrameSrc = me.avatar_frame || me.avatarFrame || '';
          applyAvatarFrame(myFrame, myFrameSrc);
        }

        if (opp) {
          document.getElementById('vs-opp-avatar').src = opp.avatar || '/assets/avatars/avatar.png';
          document.getElementById('vs-opp-name').textContent = opp.displayedName || opp.username;
          document.getElementById('vs-opp-mmr').textContent = `MMR: ${opp.rating}`;
          document.getElementById('vs-opp-sword').src =
            `/assets/images/sword-${opp.swordId || 1}.png`;

          // Рендер рамки для противника
          const oppFrame = document.getElementById('vs-opp-frame');
          const oppFrameSrc = opp.avatar_frame || opp.avatarFrame || '';
          applyAvatarFrame(oppFrame, oppFrameSrc);
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

          const clashes = [
            { time: 6.51, varX: 'var(--impact1-x)', varY: 'var(--impact1-y)' },
            { time: 7.44, varX: 'var(--impact2-x)', varY: 'var(--impact2-y)' },
            { time: 10.23, varX: 'var(--impact3-x)', varY: 'var(--impact3-y)' },
          ];
          const particlesPerClash = 25;

          clashes.forEach((clash, index) => {
            const container = document.createElement('div');
            container.className = 'vs-particles-container';
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

        void vsOverlay.offsetWidth;
        vsOverlay.classList.add('vs-active');

        const totalPhaseDuration = 15500;
        const passedTimeMs = totalPhaseDuration - (state.turnEndsInMs || totalPhaseDuration);
        const passedSeconds = Math.max(0, passedTimeMs / 1000);

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

  async updateBoard(state, socketId, dragState = {}, options = {}) {
    const { allowAnimations = true, cancelToken = null } = options;
    let cancelled = false;
    if (cancelToken?.onCancel) cancelToken.onCancel(() => (cancelled = true));
    const { myPlayerId, me, opponent } = resolvePlayers(state, socketId);
    if (!myPlayerId || !me || !opponent) return;

    const isMyTurn = String(state.activeTurn) === String(myPlayerId);
    const isPlaying = state.phase === 'playing';
    syncHandVisibilityByPhase(state.phase);

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

    if (state.round) {
      updateRoundDisplay(state.round);
    }

    const oppAvatar = document.getElementById('opp-avatar');
    if (oppAvatar && opponent.avatar) oppAvatar.src = opponent.avatar;
    const playerAvatar = document.getElementById('player-avatar');
    if (playerAvatar && me.avatar) playerAvatar.src = me.avatar;

    const oppFrame = document.getElementById('opp-avatar-frame');
    const playerFrame = document.getElementById('player-avatar-frame');
    const oppFrameSrc =
      opponent.avatarFrame ||
      opponent.avatar_frame ||
      opponent.user?.avatar_frame ||
      opponent.user?.avatarFrame ||
      '';
    const playerFrameSrc =
      me.avatarFrame || me.avatar_frame || me.user?.avatar_frame || me.user?.avatarFrame || '';
    applyAvatarFrame(oppFrame, oppFrameSrc);
    applyAvatarFrame(playerFrame, playerFrameSrc);

    // 2. Колоды и Усталость
    safeSetText(document.getElementById('opp-deck'), opponent.deckCount);
    const playerDeck = document.getElementById('player-deck');
    if (playerDeck) {
      playerDeck.dataset.count = `${me.deckCount} cards left`;
    }

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

    // --- DIFFING И АНИМАЦИИ СМЕРТИ ---
    const myTable = document.getElementById('player-table-zone');
    const oppTable = document.getElementById('opp-table-zone');
    const boardContainer = document.querySelector('.battle-center-column');

    const oldMyCardIds = battleState.ui.lastBoardIds.me;
    const oldOppCardIds = battleState.ui.lastBoardIds.opp;
    const newMyCardIds = me.table.map((c) => String(c.instanceId));
    const newOppCardIds = opponent.table.map((c) => String(c.instanceId));

    const myDeaths = oldMyCardIds.filter((id) => !newMyCardIds.includes(id));
    const oppDeaths = oldOppCardIds.filter((id) => !newOppCardIds.includes(id));

    if ((myDeaths.length > 0 || oppDeaths.length > 0) && allowAnimations) {
      const processDeadCards = (deadIds, tableEl) => {
        if (!tableEl || !boardContainer) return;
        const boardRect = boardContainer.getBoundingClientRect();

        deadIds.forEach((id) => {
          const deadCardEl = tableEl.querySelector(`[data-instance-id="${id}"]`);
          if (deadCardEl) {
            const rect = deadCardEl.getBoundingClientRect();
            const placeholder = document.createElement('div');
            placeholder.className = 'card-slot death-placeholder';
            placeholder.style.width = `${rect.width}px`;
            placeholder.style.height = `${rect.height}px`;
            deadCardEl.parentNode.replaceChild(placeholder, deadCardEl);

            const clone = deadCardEl.cloneNode(true);
            clone.classList.remove(
              'can-attack',
              'taunt-target-glow',
              'playable',
              'anim-target-hit'
            );
            clone.classList.add('anim-card-shatter');
            clone.style.position = 'absolute';
            clone.style.left = `${rect.left - boardRect.left + rect.width / 2}px`;
            clone.style.top = `${rect.top - boardRect.top + rect.height / 2}px`;
            clone.style.margin = '0';
            boardContainer.appendChild(clone);

            setTimeout(() => {
              clone.remove();
              placeholder.remove();
            }, 900);
          }
        });
      };

      processDeadCards(myDeaths, myTable);
      processDeadCards(oppDeaths, oppTable);

      await wait(950, cancelToken);
      if (cancelled) return;
    }

    battleState.ui.lastBoardIds = { me: newMyCardIds, opp: newOppCardIds };

    const spawnPromises = [];

    const updateCardDOM = (tableEl, cardData, isMine, isNewCard, index) => {
      let cardUI = tableEl.querySelector(`[data-instance-id="${cardData.instanceId}"]`);

      if (!cardUI) {
        cardUI = renderCard({ ...cardData, variant: 'board' });
        cardUI.classList.add('card-slot');
        if (!isMine) cardUI.classList.add('enemy-card');
        cardUI.dataset.instanceId = cardData.instanceId;

        if (isNewCard && allowAnimations) {
          const dropCoords = isMine ? dragState.lastDropCoords : null;
          const ghostEl = isMine ? dragState.ghostElement : null;
          spawnPromises.push(
            this.playEpicSpawn(cardUI, cardData, dropCoords, ghostEl, cancelToken)
          );
        }
      } else {
        const atkEl = cardUI.querySelector('.token-attack');
        const defEl = cardUI.querySelector('.token-defense');
        const borderEl = cardUI.querySelector('.token-border');

        if (atkEl) atkEl.textContent = cardData.attack;
        if (defEl) defEl.textContent = cardData.defense;

        const dummy = renderCard({ ...cardData, variant: 'board' });
        const newBorder = dummy.querySelector('.token-border');
        if (borderEl && newBorder && borderEl.src !== newBorder.src) {
          borderEl.src = newBorder.src;
        }
      }

      if (tableEl.children[index] !== cardUI) {
        tableEl.insertBefore(cardUI, tableEl.children[index]);
      }

      if (isMine) {
        if (
          dragState.attackCardId &&
          String(cardData.instanceId) === String(dragState.attackCardId)
        ) {
          cardUI.classList.add('is-attacking-active');
        } else {
          cardUI.classList.remove('is-attacking-active');
        }

        if (cardData.canAttack && isMyTurn) {
          cardUI.classList.add('can-attack');
          cardUI.classList.remove('exhausted');
          cardUI.style.pointerEvents = 'auto';
        } else {
          cardUI.classList.remove('can-attack');
          cardUI.classList.add('exhausted');
          cardUI.style.pointerEvents = 'none';
        }
      } else {
        if (cardData.canAttack === false) {
          cardUI.classList.add('exhausted');
        } else {
          cardUI.classList.remove('exhausted');
        }
      }
    };

    if (myTable) {
      me.table.forEach((card, index) => {
        const isNewCard =
          !oldMyCardIds.includes(String(card.instanceId)) &&
          state.phase === 'playing' &&
          battleState.hasRenderedOnce;
        updateCardDOM(myTable, card, true, isNewCard, index);
      });
    }

    if (oppTable) {
      opponent.table.forEach((card, index) => {
        const isNewCard =
          !oldOppCardIds.includes(String(card.instanceId)) &&
          state.phase === 'playing' &&
          battleState.hasRenderedOnce;
        updateCardDOM(oppTable, card, false, isNewCard, index);
      });
    }

    // 5. Рука противника
    const oppHand = document.getElementById('opp-hand-zone');
    if (oppHand) {
      const existingOpp = Array.from(oppHand.children);
      while (existingOpp.length > opponent.handCount) existingOpp.pop().remove();
      while (existingOpp.length < opponent.handCount) {
        const newCard = renderCard({ faceDown: true });
        oppHand.prepend(newCard);
        existingOpp.push(newCard);
      }

      Array.from(oppHand.children).forEach((cardUI, index) => {
        if (!battleState.ui.initialDrawDone && state.phase !== 'playing')
          cardUI.style.opacity = '0';
        else cardUI.style.opacity = '1';
        applyFanMath(cardUI, index, opponent.handCount, false, !isMyTurn);
      });
    }

    // 6. Наша рука
    const handDisplay = document.getElementById('player-hand-zone');
    if (handDisplay) {
      const existingNodes = Array.from(handDisplay.children);
      const newIds = me.hand.map((c) => c.instanceId);

      existingNodes.forEach((node) => {
        if (!newIds.includes(node.dataset.instanceId)) node.remove();
      });
      const visualHandOrder = [...me.hand].reverse();

      visualHandOrder.forEach((card, index) => {
        let cardUI = handDisplay.querySelector(`[data-instance-id="${card.instanceId}"]`);
        if (!cardUI) {
          cardUI = renderCard(card);
          cardUI.dataset.instanceId = card.instanceId;
        }
        if (handDisplay.children[index] !== cardUI)
          handDisplay.insertBefore(cardUI, handDisplay.children[index]);

        const isBeingDragged =
          card.instanceId === dragState.playCardId ||
          (dragState.ghostElement &&
            dragState.ghostElement.dataset.instanceId === String(card.instanceId));

        if (isBeingDragged) {
          cardUI.style.opacity = '0';
          cardUI.style.pointerEvents = 'none';
        } else {
          if (!battleState.ui.initialDrawDone && state.phase !== 'playing')
            cardUI.style.opacity = '0';
          else cardUI.style.opacity = '1';
          cardUI.style.pointerEvents = 'auto';
        }

        if (isMyTurn && me.mana >= card.cost) cardUI.classList.add('playable');
        else cardUI.classList.remove('playable');

        applyFanMath(cardUI, index, me.hand.length, true, isMyTurn);
      });
    }

    // 7. ЗАПУСК АНИМАЦИИ (ЦЕНТРАЛИЗОВАННО ЧЕРЕЗ DATA-MARKERS)

    // Защита от реконнекта: если мы влетели в середину игры (прошло уже > 3 сек хода),
    // мы тихо помечаем все карты как "отрисованные" и отменяем стартовый залп анимаций.
    const isReconnectingNow =
      isPlaying && !battleState.ui.initialDrawDone && state.turnEndsInMs < 27000;

    if (isReconnectingNow) {
      battleState.ui.initialDrawDone = true;
      Array.from(oppHand?.children || []).forEach((c) => (c.dataset.drawn = 'true'));
      Array.from(handDisplay?.children || []).forEach((c) => (c.dataset.drawn = 'true'));
    }

    if (isPlaying && allowAnimations) {
      battleState.ui.initialDrawDone = true;
      const newOppCards = Array.from(oppHand?.children || []).filter((c) => !c.dataset.drawn);
      const newPlayerCards = Array.from(handDisplay?.children || []).filter(
        (c) => !c.dataset.drawn
      );

      if (newOppCards.length > 0)
        spawnPromises.push(this.animateDraw(newOppCards, 'opp-deck', true, cancelToken));
      if (newPlayerCards.length > 0)
        spawnPromises.push(this.animateDraw(newPlayerCards, 'player-deck', false, cancelToken));
    }

    battleState.hasRenderedOnce = true;

    if (spawnPromises.length > 0) await Promise.all(spawnPromises);
  },

  animateDraw(cards, deckId, isOpponent = false, cancelToken = null) {
    const deck = document.getElementById(deckId);
    if (!deck || cards.length === 0) return Promise.resolve();

    return new Promise((resolve) => {
      const timeouts = [];
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        resolve();
      };

      const schedule = (fn, ms) => {
        const id = setTimeout(fn, ms);
        timeouts.push(id);
        return id;
      };

      if (cancelToken?.onCancel) {
        cancelToken.onCancel(() => {
          timeouts.forEach((id) => clearTimeout(id));
          timeouts.length = 0;
          done();
        });
      }

      const deckRect = deck.getBoundingClientRect();

      cards.forEach((cardUI, index) => {
        cardUI.dataset.drawn = 'true'; // МАРКЕР: Эта карта отстреляла, больше не трогаем

        const cardRect = cardUI.getBoundingClientRect();
        const deltaX = deckRect.left - cardRect.left;
        const deltaY = deckRect.top - cardRect.top;

        cardUI.style.transition = 'none';
        cardUI.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(0.2) rotate(180deg)`;
        cardUI.style.opacity = '0';
        cardUI.style.zIndex = '9999';

        requestAnimationFrame(() => {
          schedule(() => {
            const fanX = cardUI.style.getPropertyValue('--fan-x') || '0px';
            const fanY = cardUI.style.getPropertyValue('--fan-y') || '0px';
            const fanRot = cardUI.style.getPropertyValue('--fan-rot') || '0deg';

            // Пружина для тебя, плавная кривая для противника
            const easing = isOpponent ? 'ease-out' : 'cubic-bezier(0.175, 0.885, 0.32, 1.275)';

            cardUI.style.transition = `transform 0.6s ${easing}, opacity 0.3s ease-out`;
            cardUI.style.transform = `translate(${fanX}, ${fanY}) rotate(${fanRot}) scale(1)`;
            cardUI.style.opacity = '1';

            schedule(() => {
              cardUI.style.transform = '';
              cardUI.style.transition = '';
              cardUI.style.opacity = '';
              cardUI.style.zIndex = '';

              if (index === cards.length - 1) done();
            }, 600);
          }, index * 150);
        });
      });
    });
  },

  playEpicSpawn(cardUI, cardData, dropCoords, ghostEl, cancelToken = null) {
    return new Promise((resolve) => {
      const timeouts = [];
      let finished = false;
      let ghostCard = null;

      const done = () => {
        if (finished) return;
        finished = true;
        resolve();
      };

      const schedule = (fn, ms) => {
        const id = setTimeout(fn, ms);
        timeouts.push(id);
        return id;
      };

      if (cancelToken?.onCancel) {
        cancelToken.onCancel(() => {
          timeouts.forEach(clearTimeout);
          if (ghostCard?.parentNode) ghostCard.remove();
          cardUI.style.opacity = '1';
          cardUI.classList.remove('epic-spawn-token');
          done();
        });
      }

      // 1. Скрываем финальный овальный токен на столе
      cardUI.style.opacity = '0';

      requestAnimationFrame(() => {
        let startX = window.innerWidth / 2;
        let startY = window.innerHeight;

        // Откуда летит карта (из руки или по умолчанию снизу)
        if (dropCoords) {
          startX = dropCoords.x;
          startY = dropCoords.y;
        } else if (ghostEl) {
          const ghostRect = ghostEl.getBoundingClientRect();
          startX = ghostRect.left + ghostRect.width / 2;
          startY = ghostRect.top + ghostRect.height / 2;
        } else if (cardUI.classList.contains('enemy-card')) {
          const oppHand = document.getElementById('opp-hand-zone');
          if (oppHand) {
            const oppRect = oppHand.getBoundingClientRect();
            startX = oppRect.left + oppRect.width / 2;
            startY = oppRect.top + oppRect.height / 2;
          } else {
            startY = -100; // Фоллбэк: летит просто из-за верхнего края экрана
          }
        }

        const boardContainer = document.querySelector('.battle-center-column');
        if (!boardContainer) {
          cardUI.style.opacity = '1';
          done();
          return;
        }

        const boardRect = boardContainer.getBoundingClientRect();
        const targetRect = cardUI.getBoundingClientRect();

        // Вычисляем координаты относительно доски
        const targetX = targetRect.left - boardRect.left + targetRect.width / 2;
        const targetY = targetRect.top - boardRect.top + targetRect.height / 2;
        const startRelX = startX - boardRect.left;
        const startRelY = startY - boardRect.top;

        // 2. Создаем летящую прямоугольную карту (ghost)
        ghostCard = renderCard({ ...cardData, variant: 'hand' });
        ghostCard.className = 'card anim-card-fly-arc';

        // Начальная позиция (с небольшим наклоном)
        ghostCard.style.left = `${startRelX}px`;
        ghostCard.style.top = `${startRelY}px`;
        ghostCard.style.transform = 'translate(-50%, -50%) scale(0.6) rotate(-10deg)';

        boardContainer.appendChild(ghostCard);

        // Форсируем рендер стартовой точки
        void ghostCard.offsetWidth;

        // 3. Отправляем в полет к слоту на столе
        ghostCard.style.left = `${targetX}px`;
        ghostCard.style.top = `${targetY}px`;
        ghostCard.style.transform = 'translate(-50%, -50%) scale(0.8) rotate(5deg)';

        // 4. Тайминг столкновения (350мс, чуть раньше конца полета)
        schedule(() => {
          // Удаляем прямоугольник
          if (ghostCard?.parentNode) ghostCard.remove();

          // Генерируем вспышку морфинга
          const flash = document.createElement('div');
          flash.className = 'morph-flash';
          flash.style.left = `${targetX}px`;
          flash.style.top = `${targetY}px`;
          boardContainer.appendChild(flash);

          schedule(() => {
            if (flash.parentNode) flash.remove();
          }, 300);

          // Показываем овальный токен с анимацией впечатывания
          cardUI.style.opacity = '1';
          cardUI.classList.add('epic-spawn-token');

          // Ударная волна магии
          const shockwave = document.createElement('div');
          shockwave.className = 'epic-spawn-shockwave';
          shockwave.style.left = `${targetX}px`;
          shockwave.style.top = `${targetY}px`;
          boardContainer.appendChild(shockwave);

          schedule(() => {
            if (shockwave.parentNode) shockwave.remove();
          }, 500);

          // Легкая тряска доски от приземления
          const board = document.querySelector('.game-board');
          if (board) {
            board.classList.add('board-shake-light');
            schedule(() => board.classList.remove('board-shake-light'), 250);
          }

          // 5. Очистка классов
          schedule(() => {
            cardUI.classList.remove('epic-spawn-token');
            done();
          }, 400); // 400мс - длина CSS анимации tokenSlam
        }, 350);
      });
    });
  },

  playAttackAnimation(attackerEl, targetEl, onImpact, onComplete) {
    if (!attackerEl || !targetEl) {
      if (onImpact) onImpact();
      if (onComplete) onComplete();
      return;
    }

    const attackerAtk = parseInt(attackerEl.querySelector('.token-attack')?.textContent || '0', 10);
    let targetAtk = 0;
    if (targetEl.classList.contains('card-slot') || targetEl.classList.contains('enemy-card')) {
      targetAtk = parseInt(targetEl.querySelector('.token-attack')?.textContent || '0', 10);
    }
    const aRect = attackerEl.getBoundingClientRect();
    const tRect = targetEl.getBoundingClientRect();

    const deltaX = tRect.left + tRect.width / 2 - (aRect.left + aRect.width / 2);
    const deltaY = tRect.top + tRect.height / 2 - (aRect.top + aRect.height / 2);
    const tilt = Math.max(-20, Math.min(20, deltaX * 0.04));

    const originalZ = attackerEl.style.zIndex;
    const originalTransition = attackerEl.style.transition;

    attackerEl.style.zIndex = '10000';
    attackerEl.style.transition = 'transform 0.2s cubic-bezier(0.42, 0, 0.58, 1)';
    attackerEl.style.transform = `translate(${-deltaX * 0.08}px, ${-deltaY * 0.08}px) scale(0.95) rotate(${-tilt * 0.2}deg)`;

    setTimeout(() => {
      attackerEl.classList.add('anim-attacking');
      attackerEl.style.transition = 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      attackerEl.style.transform = `translate(${deltaX * 0.85}px, ${deltaY * 0.85}px) scale(1.15) rotate(${tilt}deg)`;

      setTimeout(() => {
        // ДОБАВЛЕНО: Теперь удар (и отправка на сервер) регистрируется точно в момент столкновения
        if (onImpact) onImpact();

        const checkAndBreakPoison = (cardEl) => {
          if (cardEl && cardEl.dataset.isPoison === 'true') {
            const borderEl = cardEl.querySelector('.token-border');
            if (borderEl) borderEl.src = '/assets/images/break-poison-frame.png';
          }
        };

        checkAndBreakPoison(attackerEl);
        checkAndBreakPoison(targetEl);

        attackerEl.style.transition = 'all 0.05s ease-out';
        attackerEl.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.3)`;
        attackerEl.style.filter = 'brightness(2) drop-shadow(0 0 30px #ff3333)';
        targetEl.classList.add('anim-target-hit');

        this.showFloatingDamage(targetEl, attackerAtk);
        if (targetAtk > 0) this.showFloatingDamage(attackerEl, targetAtk);

        const boardContainer = document.querySelector('.battle-center-column');
        if (boardContainer) {
          const shockwave = document.createElement('div');
          shockwave.className = 'epic-spawn-shockwave';
          shockwave.style.borderColor = 'rgba(255, 50, 50, 0.9)';
          const boardRect = boardContainer.getBoundingClientRect();
          shockwave.style.left = `${tRect.left + tRect.width / 2 - boardRect.left}px`;
          shockwave.style.top = `${tRect.top + tRect.height / 2 - boardRect.top}px`;
          boardContainer.appendChild(shockwave);
          setTimeout(() => {
            if (shockwave.parentNode) shockwave.remove();
          }, 400);
        }

        const board = document.querySelector('.game-board');
        if (board) {
          board.classList.add('board-shake');
          setTimeout(() => board.classList.remove('board-shake'), 300);
        }

        setTimeout(() => {
          attackerEl.classList.remove('anim-attacking');
          attackerEl.classList.add('anim-attack-return');
          attackerEl.style.filter = '';
          attackerEl.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
          attackerEl.style.transform = 'translate(0px, 0px) scale(1) rotate(0deg)';

          setTimeout(() => {
            attackerEl.classList.remove('anim-attack-return');
            attackerEl.style.zIndex = originalZ;
            attackerEl.style.transition = originalTransition;
            attackerEl.style.transform = '';
            targetEl.classList.remove('anim-target-hit');
            if (onComplete) onComplete();
          }, 300);
        }, 70);
      }, 250);
    }, 200);
  },

  showFloatingDamage(element, damageAmount) {
    if (!element || damageAmount <= 0) return;
    const targetContainer = element.closest('.avatar-container') || element;
    const dmgEl = document.createElement('div');
    dmgEl.className = 'damage-number';
    dmgEl.textContent = `-${damageAmount}`;
    targetContainer.appendChild(dmgEl);
    setTimeout(() => {
      if (dmgEl.parentNode) dmgEl.remove();
    }, 1000);
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

  playSpellAnimation(effectType, targetEl, onComplete) {
    if (!targetEl) {
      if (onComplete) onComplete();
      return;
    }

    let effectClass = '';
    switch (effectType) {
      case 'damage':
        effectClass = 'anim-spell-damage';
        break;
      case 'heal_card':
      case 'heal_avatar':
        effectClass = 'anim-spell-heal';
        break;
      case 'buff_card':
        effectClass = 'anim-spell-buff';
        break;
      case 'add_mana':
        effectClass = 'anim-spell-mana';
        break;
      default:
        effectClass = 'anim-spell-damage';
    }

    // Считываем точные координаты цели на экране
    const rect = targetEl.getBoundingClientRect();
    const effectEl = document.createElement('div');
    effectEl.className = `spell-effect-overlay ${effectClass}`;

    // Абсолютное позиционирование поверх экрана
    effectEl.style.position = 'fixed';
    effectEl.style.left = `${rect.left + rect.width / 2}px`;
    effectEl.style.top = `${rect.top + rect.height / 2}px`;
    effectEl.style.zIndex = '15000'; // Точно поверх всего UI

    document.body.appendChild(effectEl);
    targetEl.classList.add('anim-target-hit');

    // Ожидаем завершения анимации
    setTimeout(() => {
      if (effectEl.parentNode) effectEl.remove();
      targetEl.classList.remove('anim-target-hit');
      if (onComplete) onComplete();
    }, 800);
  },

  // Анимация вибрации BMO при клике
  triggerBmoVibration(elements) {
    if (!elements.bmoBody) return;
    elements.bmoBody.classList.remove('bmo-vibrate');
    void elements.bmoBody.offsetWidth; // Форсируем Reflow
    elements.bmoBody.classList.add('bmo-vibrate');
  },

  playFatigueAnimation(data, myPlayerId) {
    return new Promise((resolve) => {
      const isMe = String(data.playerId) === String(myPlayerId);

      if (!isMe) {
        // Логика для оппонента (быстрый удар)
        const oppAvatarContainer =
          document.querySelector('.opp-avatar-container') || document.getElementById('opp-avatar');
        if (oppAvatarContainer) {
          oppAvatarContainer.classList.add('anim-target-hit');
          this.showFloatingDamage(oppAvatarContainer, data.damage);
          setTimeout(() => {
            oppAvatarContainer.classList.remove('anim-target-hit');
            resolve();
          }, 600);
        } else {
          resolve();
        }
        return;
      }

      // === ЭПИЧНАЯ АНИМАЦИЯ ИЗ КОЛОДЫ ===
      const overlay = document.createElement('div');
      overlay.className = 'fatigue-overlay';

      const card = document.createElement('div');
      card.className = 'fatigue-card';
      card.innerHTML = `<div class="fatigue-text">Out of cards!<br>Take ${data.damage} damage</div>`;

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      // Вычисляем траекторию полета из колоды
      const deckEl = document.getElementById('player-deck');
      let startX = 0;
      let startY = window.innerHeight; // Фолбэк, если колода не найдена (вылетит снизу)

      if (deckEl) {
        const deckRect = deckEl.getBoundingClientRect();
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        // Насколько колода смещена относительно центра экрана
        startX = deckRect.left + deckRect.width / 2 - centerX;
        startY = deckRect.top + deckRect.height / 2 - centerY;
      }

      // 1. Прячем карту в координаты колоды, делаем маленькой и перевернутой
      card.style.transition = 'none';
      card.style.transform = `translate(${startX}px, ${startY}px) scale(0.2) rotate(180deg)`;
      card.style.opacity = '0';

      // 2. Запускаем полет в центр экрана
      requestAnimationFrame(() => {
        setTimeout(() => {
          overlay.style.opacity = '1';

          // Анимация полета (пружинистая, как при доборе)
          card.style.transition =
            'transform 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease-out';
          card.style.transform = `translate(0px, 0px) scale(1) rotate(0deg)`;
          card.style.opacity = '1';

          // 3. Ждем 2 секунды в центре, затем запускаем сгорание
          setTimeout(() => {
            card.classList.add('anim-fatigue-burn');

            // 4. Бьем по аватару на середине сгорания
            setTimeout(() => {
              const myAvatar =
                document.querySelector('.player-avatar-container') ||
                document.getElementById('player-avatar');
              if (myAvatar) {
                myAvatar.classList.add('anim-target-hit');
                this.showFloatingDamage(myAvatar, data.damage);

                const board = document.querySelector('.game-board');
                if (board) {
                  board.classList.add('board-shake');
                  setTimeout(() => board.classList.remove('board-shake'), 300);
                }
                setTimeout(() => myAvatar.classList.remove('anim-target-hit'), 500);
              }
            }, 500);

            // 5. Очищаем DOM и завершаем экшен
            setTimeout(() => {
              overlay.style.opacity = '0';
              setTimeout(() => {
                if (overlay.parentNode) overlay.remove();
                resolve();
              }, 300);
            }, 1000); // 1000мс - это время работы CSS-анимации fatigueBurn
          }, 2000); // Висит в центре 2 секунды
        }, 50); // Небольшой таймаут, чтобы браузер успел применить начальные стили (важно для Safari/Chrome)
      });
    });
  },
};

function updateRoundDisplay(newRound) {
  const roundValue = document.getElementById('round-number');
  if (!roundValue) return;
  if (roundValue.innerText !== String(newRound)) {
    roundValue.classList.add('round-change-anim');
    setTimeout(() => {
      roundValue.innerText = newRound;
    }, 150);
    setTimeout(() => {
      roundValue.classList.remove('round-change-anim');
    }, 600);
  }
}
