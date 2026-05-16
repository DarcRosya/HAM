export function renderCard(props = {}) {
  const {
    name = 'Unknown',
    cost = 0,
    attack = 0,
    defense = 0,
    type = 'Unit',
    description = '',
    art = '/assets/cards-art/bubblegum.png',
    faceDown = false,
    variant = 'hand', // 'hand' или 'board'
  } = props;

  const cardDiv = document.createElement('div');
  cardDiv.classList.add('card');

  if (variant === 'board') {
    cardDiv.classList.add('card-board');
  }

  if (faceDown) {
    cardDiv.classList.add('face-down');
    cardDiv.innerHTML = `<img src="/assets/images/card-back.png" class="card-back" style="width: 100%; height: 100%;">`;
    return cardDiv;
  }

  // Для стола убираем лишние элементы разметки
  const descHtml = variant === 'board' ? '' : `<div class="card-description">${description}</div>`;
  const typeHtml = variant === 'board' ? '' : `<div class="card-type">${type}</div>`;

  cardDiv.innerHTML = `
    <div class="card-art" style="background-image: url('${art}');"></div>
    <img src="/assets/images/card-frame.png" class="card-frame">

    <div class="card-title">${name}</div>
    <div class="card-cost">${cost}</div>
    ${typeHtml}
    ${descHtml}

    <div class="card-attack">${attack}</div>
    <div class="card-defense">${defense}</div>
  `;

  return cardDiv;
}
