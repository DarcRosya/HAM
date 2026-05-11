import express from 'express';
import { getCards } from '../controllers/gameController.js';

const router = express.Router();

router.get('/cards', getCards);

export default router;
