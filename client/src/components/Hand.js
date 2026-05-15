import { renderCard } from './Card.js';
import { allCards } from './allCards.js';

export function renderHand(cards = allCards) {
  const handDiv = document.createElement('div');
  handDiv.className = 'hand';

  cards.forEach((card, index) => {
    const cardElement = renderCard(card);

    cardElement.dataset.index = index;

    handDiv.appendChild(cardElement);
  });

  return handDiv;
}