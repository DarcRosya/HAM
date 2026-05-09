export function renderCard(props = {}) {
  const { label = '??', faceDown = false } = props;
  const cardDiv = document.createElement('div');
  cardDiv.classList.add('card');

  if (faceDown) {
    cardDiv.classList.add('face-down');
  }

  const labelSpan = document.createElement('span');
  labelSpan.className = 'card-label';
  labelSpan.innerText = faceDown ? 'CARD' : label;
  cardDiv.appendChild(labelSpan);
  return cardDiv;
}
