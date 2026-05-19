import { renderCard } from '../components/Card.js';
import { API_BASE_URL } from '../services/api.js';

export async function mount() {
  const cardsGrid = document.querySelector('.cards-grid');
  if (!cardsGrid) return;

  cardsGrid.innerHTML =
    '<h2 style="color:white; grid-column: 1 / -1; text-align: center;">Loading cards...</h2>';

  try {
    const response = await fetch(`${API_BASE_URL}/api/cards`);
    if (!response.ok) throw new Error('Failed to fetch cards');

    const allCards = await response.json();
    cardsGrid.innerHTML = '';

    const uniqueCardsMap = new Map();
    allCards.forEach((card) => {
      if (!uniqueCardsMap.has(card.name)) {
        uniqueCardsMap.set(card.name, card);
      }
    });

    const uniqueCards = Array.from(uniqueCardsMap.values());

    uniqueCards.forEach((cardData, index) => {
      const cardElement = renderCard(cardData);

      cardElement.classList.add('card-entrance');
      cardElement.style.animationDelay = `${index * 0.03}s`;

      cardElement.addEventListener(
        'animationend',
        (e) => {
          if (e.animationName === 'fadeInUpCard') {
            cardElement.classList.remove('card-entrance');
            cardElement.style.animationDelay = '';
          }
        },
        { once: true }
      );

      cardElement.addEventListener('mousemove', handleMouseMove);
      cardElement.addEventListener('mouseleave', handleMouseLeave);

      cardsGrid.appendChild(cardElement);
    });
  } catch (error) {
    console.error('[Gallery] Error:', error);
    cardsGrid.innerHTML =
      '<h2 style="color:red; grid-column: 1 / -1; text-align: center;">Failed to load cards.</h2>';
  }
}

export function unmount() {
  const cardsGrid = document.querySelector('.cards-grid');
  if (cardsGrid) cardsGrid.innerHTML = '';
}

function handleMouseMove(e) {
  const card = e.currentTarget;
  const rect = card.getBoundingClientRect();

  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  const maxRotate = 15;

  const rotateY = ((x - centerX) / centerX) * maxRotate;
  const rotateX = -((y - centerY) / centerY) * maxRotate;

  card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.08)`;
}

function handleMouseLeave(e) {
  const card = e.currentTarget;
  card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)`;
}
