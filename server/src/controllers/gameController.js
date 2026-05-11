import { CARDS } from '../game/cards.js';

export const getCards = (req, res) => {
  try {
    res.status(200).json(CARDS);
  } catch (error) {
    console.error('Error fetching cards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
