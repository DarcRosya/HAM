let activeElements = null;
let activeSocket = null;
let tipInterval = null;
let frameInterval = null;

const frameIntervalMs = 320;
const searchTips = [
  'Searching for an opponent...',
  'Estimating player strength...',
  'Synchronizing game session...',
  'Allocating server resources...',
  'Preparing battlefield...',
  'Loading combat environment...',
  'Finalizing match setup...',
];
const matchFramePaths = Array.from(
  { length: 8 },
  (_, index) => `/assets/images/find_match/${index + 1}.png`
);
const frameMotion = [
  { scale: 1.0, y: 0 },
  { scale: 1.03, y: -2 },
  { scale: 1.07, y: -4 },
  { scale: 1.04, y: -2 },
  { scale: 1.01, y: 0 },
  { scale: 0.99, y: 1 },
  { scale: 0.97, y: 2 },
  { scale: 1.03, y: -1 },
];

export function initMatchmaking(elements, socket) {
  activeElements = elements;
  activeSocket = socket;

  if (activeElements?.matchFrame && typeof Image !== 'undefined') {
    preloadMatchFrames();
  }

  if (activeElements?.playBtn && activeElements?.searchOverlay) {
    activeElements.playBtn.addEventListener('click', handlePlayClick);
  }

  if (activeElements?.cancelBtn) {
    activeElements.cancelBtn.addEventListener('click', handleCancelClick);
  }
}

export function stopMatchmaking(elements = activeElements) {
  clearTipAnimation();
  stopMatchAnimation();

  if (elements?.playBtn) {
    elements.playBtn.removeEventListener('click', handlePlayClick);
  }

  if (elements?.cancelBtn) {
    elements.cancelBtn.removeEventListener('click', handleCancelClick);
  }

  if (elements?.searchOverlay) {
    elements.searchOverlay.classList.add('is-hidden');
  }

  resetMatchFrame();
  activeElements = null;
  activeSocket = null;
}

function handlePlayClick() {
  if (!activeElements?.searchOverlay || !activeSocket) return;

  activeElements.searchOverlay.classList.remove('is-hidden');
  startMatchAnimation();

  let tipIndex = 0;
  if (activeElements.tipElement) {
    activeElements.tipElement.textContent = searchTips[tipIndex];
  }

  clearTipAnimation();
  tipInterval = setInterval(() => {
    if (
      !activeElements?.searchOverlay ||
      activeElements.searchOverlay.classList.contains('is-hidden')
    ) {
      clearTipAnimation();
      return;
    }

    tipIndex = (tipIndex + 1) % searchTips.length;
    if (activeElements.tipElement) {
      activeElements.tipElement.textContent = searchTips[tipIndex];
    }
  }, 3000);

  activeSocket.emit('find_match');
}

function handleCancelClick() {
  if (!activeElements?.searchOverlay || !activeSocket) return;

  activeElements.searchOverlay.classList.add('is-hidden');
  clearTipAnimation();
  stopMatchAnimation();
  activeSocket.emit('cancel_matchmaking');
}

function preloadMatchFrames() {
  matchFramePaths.forEach((path) => {
    const img = new Image();
    img.src = path;
  });
}

function applyFrameMotion(index) {
  if (!activeElements?.matchFrame) return;
  const motion = frameMotion[index % frameMotion.length];
  activeElements.matchFrame.style.setProperty('--frame-scale', motion.scale);
  activeElements.matchFrame.style.setProperty('--frame-y', `${motion.y}px`);
}

function resetMatchFrame() {
  if (!activeElements?.matchFrame) return;
  activeElements.matchFrame.src = matchFramePaths[0];
  applyFrameMotion(0);
}

function startMatchAnimation() {
  if (!activeElements?.matchFrame) return;

  let frameIndex = 0;
  resetMatchFrame();

  if (frameInterval) clearInterval(frameInterval);

  frameInterval = setInterval(() => {
    frameIndex = (frameIndex + 1) % matchFramePaths.length;
    activeElements.matchFrame.src = matchFramePaths[frameIndex];
    applyFrameMotion(frameIndex);
  }, frameIntervalMs);
}

function stopMatchAnimation() {
  if (frameInterval) {
    clearInterval(frameInterval);
    frameInterval = null;
  }
}

function clearTipAnimation() {
  if (tipInterval) {
    clearInterval(tipInterval);
    tipInterval = null;
  }
}
