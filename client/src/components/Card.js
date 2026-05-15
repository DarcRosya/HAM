export function renderCard(props = {}) {
  const {
    name = 'Unknown',
    mana = 0,
    attack = 0,
    defense = 0,
    type = 'Unit',
    description = '',
    art = 'default-art.png',
    faceDown = false
  } = props;

  const cardDiv = document.createElement('div');
  cardDiv.classList.add('card');

  if (faceDown) {
    cardDiv.classList.add('face-down');
    cardDiv.innerHTML = `<img src="src/assets/images/card-back.png" class="card-back">`;
    return cardDiv;
  }

   cardDiv.innerHTML = `
    <div class="card-art" style="background-image: url('${art}');"></div>
    <img src="src/assets/images/card-frame.png" class="card-frame">

    <div class="card-title">${name}</div>
    <div class="card-mana">${mana}</div>
    <div class="card-type">${type}</div>
    <div class="card-description">${description}</div>

    <div class="card-attack">${attack}</div>
    <div class="card-defense">${defense}</div>
  `;

  return cardDiv;
}