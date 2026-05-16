import { renderCard } from '../components/Card.js';
import { API_BASE_URL } from '../services/api.js';

export async function initGallery() {
  const cardsGrid = document.querySelector('.cards-grid');
  if (!cardsGrid) return;

  cardsGrid.innerHTML =
    '<h2 style="color:white; grid-column: 1 / -1; text-align: center;">Loading cards...</h2>';

  try {
    const response = await fetch(`${API_BASE_URL}/api/cards`);
    if (!response.ok) throw new Error('Failed to fetch cards');

    const allCards = await response.json();
    cardsGrid.innerHTML = '';

    allCards.forEach((cardData) => {
      const cardElement = renderCard(cardData);
      cardsGrid.appendChild(cardElement);
    });
  } catch (error) {
    console.error('[Gallery] Error:', error);
    cardsGrid.innerHTML =
      '<h2 style="color:red; grid-column: 1 / -1; text-align: center;">Failed to load cards.</h2>';
  }
}
