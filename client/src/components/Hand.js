import { renderCard } from './Card.js';

export function renderHand(cards = []) {
  const handDiv = document.createElement('div');
  handDiv.className = 'hand';

  cards.forEach((card, index) => {
    const cardElement = renderCard(card);
    cardElement.dataset.index = index;
    handDiv.appendChild(cardElement);
  });

  return handDiv;
}
