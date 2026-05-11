import express from 'express';
import { getLeaderboard, getAvatars, updateProfile, updatePassword } from '../controllers/userController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/leaderboard', getLeaderboard);
router.get('/avatars', getAvatars);
router.patch('/profile', requireAuth, updateProfile);
router.patch('/password', requireAuth, updatePassword);

export default router;
