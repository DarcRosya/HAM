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
  } = props;

  const cardDiv = document.createElement('div');
  cardDiv.classList.add('card');

  if (faceDown) {
    cardDiv.classList.add('face-down');
    cardDiv.innerHTML = `<img src="/assets/images/card-back.png" class="card-back" style="width: 100%; height: 100%;">`;
    return cardDiv;
  }

  cardDiv.innerHTML = `
    <div class="card-art" style="background-image: url('${art}');"></div>
    <img src="/assets/images/card-frame.png" class="card-frame">

    <div class="card-title">${name}</div>
    <div class="card-cost">${cost}</div>
    <div class="card-type">${type}</div>
    <div class="card-description">${description}</div>

    <div class="card-attack">${attack}</div>
    <div class="card-defense">${defense}</div>
  `;

  return cardDiv;
}
