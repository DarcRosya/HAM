import express from 'express';
import {
	getMatchHistory,
	getAvatars,
	getAvatarFrames,
	updateProfile,
	updatePassword,
} from '../controllers/userController.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/history', requireAuth, getMatchHistory);
router.get('/avatars', getAvatars);
router.get('/avatar-frames', getAvatarFrames);
router.patch('/profile', requireAuth, updateProfile);
router.patch('/password', requireAuth, updatePassword);

export default router;
