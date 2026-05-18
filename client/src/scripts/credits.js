export function mount() {
  console.log('Credits mounted!');

  const container = document.querySelector('.credits-container');

  if (container) {
    container.style.opacity = '1';
  }
}

export function unmount() {
  const container = document.querySelector('.credits-container');
  if (container) {
    container.style.opacity = '0';
  }
}
