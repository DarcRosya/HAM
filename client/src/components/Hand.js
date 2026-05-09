import { renderCard } from './Card.js';

const starterCards = ['AS', '10H', '3D', 'KC', '7S'];

export function renderHand(cards = starterCards) {
  const handDiv = document.createElement('div');
  handDiv.className = 'hand';

  cards.forEach((label, index) => {
    const cardElement = renderCard({
      label: label,
      faceDown: false,
    });

    cardElement.dataset.index = index;
    handDiv.appendChild(cardElement);
  });

  return handDiv;
}
