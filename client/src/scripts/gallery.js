import { allCards } from '../components/allCards.js'; 
import { renderCard } from '../components/Card.js';

export function initGallery() {
    const cardsGrid = document.querySelector('.cards-grid');

    if (!cardsGrid) return;

    cardsGrid.innerHTML = '';

    allCards.forEach(cardData => {
        
        const currentDefense = cardData.defense !== undefined ? cardData.defense : cardData.defence;

        const props = {
            name: cardData.name,
            mana: cardData.mana,
            attack: cardData.attack,
            defense: currentDefense,
            description: cardData.description,
            art: cardData.art
        };

        const cardElement = renderCard(props);
        cardsGrid.appendChild(cardElement);
    });
}