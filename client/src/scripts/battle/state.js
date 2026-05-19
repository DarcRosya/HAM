export const battleState = {
  match: null,
  isMatchStarted: false,
  isMounted: false,
  hasRenderedOnce: false,

  queue: {
    actionQueue: null,
  },

  drag: {
    attackCardId: null,
    playCardId: null,
    ghostElement: null,
    lastDropCoords: null,
  },

  ui: {
    hoveredCardCost: 0,
    activeTooltip: null,
    isAnimating: false,
    initialDrawDone: false,
    lastBoardIds: { me: [], opp: [] },
  },

  timers: {
    turn: null,
    watchdog: null,
    opponentStatus: null,
    battleMessage: null,
    tooltip: null,
    animationSafety: null,
  },

  elements: {},

  setMatch(newState) {
    this.match = newState;
  },

  setMounted(status) {
    this.isMounted = status;
  },

  clearTimers() {
    if (this.timers.turn) clearInterval(this.timers.turn);
    if (this.timers.watchdog) clearTimeout(this.timers.watchdog);
    if (this.timers.opponentStatus) clearTimeout(this.timers.opponentStatus);
    if (this.timers.battleMessage) clearTimeout(this.timers.battleMessage);
    if (this.timers.tooltip) clearTimeout(this.timers.tooltip);
    if (this.timers.animationSafety) clearTimeout(this.timers.animationSafety);

    this.timers = {
      turn: null,
      watchdog: null,
      opponentStatus: null,
      battleMessage: null,
      tooltip: null,
      animationSafety: null,
    };
  },

  reset() {
    this.match = null;
    this.isMatchStarted = false;
    this.hasRenderedOnce = false;
    this.initialDrawDone = false;
    this.ui.lastBoardIds = { me: [], opp: [] };
    const actionQueue = this.queue.actionQueue;
    if (actionQueue) actionQueue.clear();
    this.queue = { actionQueue };

    if (this.drag.ghostElement) this.drag.ghostElement.remove();
    if (this.ui.activeTooltip) this.ui.activeTooltip.remove();

    this.drag = { attackCardId: null, playCardId: null, ghostElement: null, lastDropCoords: null };
    this.ui.hoveredCardCost = 0;
    this.ui.activeTooltip = null;
    this.ui.isAnimating = false;
    this.elements = {};

    this.clearTimers();
  },
};
