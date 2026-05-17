export const battleState = {
  // --- Данные с сервера ---
  match: null,
  isMatchStarted: false,
  isMounted: false,
  hasRenderedOnce: false,

  // --- Состояние Drag & Drop ---
  drag: {
    attackCardId: null,
    playCardId: null,
    ghostElement: null,
  },

  // --- Локальный UI State ---
  ui: {
    hoveredCardCost: 0,
    activeTooltip: null,
    isAnimating: false,
    initialDrawDone: false,
  },

  // --- Реестр таймеров (для защиты от утечек памяти) ---
  timers: {
    turn: null,
    watchdog: null,
    opponentStatus: null,
    battleMessage: null,
    tooltip: null,
  },

  // --- Кеш DOM-элементов (чтобы не спамить document.getElementById) ---
  elements: {},

  // ==========================================
  // МЕТОДЫ УПРАВЛЕНИЯ
  // ==========================================

  setMatch(newState) {
    this.match = newState;
  },

  setMounted(status) {
    this.isMounted = status;
  },

  clearTimers() {
    // Жесткая зачистка всех активных таймеров при unmount
    if (this.timers.turn) clearInterval(this.timers.turn);
    if (this.timers.watchdog) clearTimeout(this.timers.watchdog);
    if (this.timers.opponentStatus) clearTimeout(this.timers.opponentStatus);
    if (this.timers.battleMessage) clearTimeout(this.timers.battleMessage);
    if (this.timers.tooltip) clearTimeout(this.timers.tooltip);

    this.timers = {
      turn: null,
      watchdog: null,
      opponentStatus: null,
      battleMessage: null,
      tooltip: null,
    };
  },

  reset() {
    this.match = null;
    this.isMatchStarted = false;
    this.hasRenderedOnce = false;
    this.initialDrawDone = false;

    if (this.drag.ghostElement) {
      this.drag.ghostElement.remove();
    }

    if (this.ui.activeTooltip) {
      this.ui.activeTooltip.remove();
    }

    this.drag = { attackCardId: null, playCardId: null, ghostElement: null };
    this.ui = { hoveredCardCost: 0, activeTooltip: null, isAnimating: false };
    this.elements = {};

    this.clearTimers();
  },
};
