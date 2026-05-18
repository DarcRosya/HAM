import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  findById,
  findConflictingUser,
  updatePasswordHash,
  updateProfileData,
} from '../repositories/userRepository.js';
import { getUserMatchHistory } from '../repositories/matchRepository.js';
import { generateToken } from '../utils/jwt.js';
import { hashPassword, verifyPassword } from '../utils/hash.js';
import { validatePassword } from '../utils/validators.js';
import { gameService } from '../services/gameService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const avatarsDir = path.resolve(__dirname, '../../../client/assets/avatars');
const avatarPublicBase = '/assets/avatars';
const avatarFramesDir = path.resolve(__dirname, '../../../client/assets/avatars/frames');
const avatarFramesPublicBase = '/assets/avatars/frames';
const allowedAvatarExtensions = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp']);

export const updateProfile = async (req, res) => {
  try {
    const { username, email, displayedName, avatar, avatarFrame, avatar_frame } = req.body;
    const userId = req.user.id;

    if (gameService.findGameByPlayer(userId)) {
      return res.status(403).json({ message: 'Cannot edit profile during an active match' });
    }

    const profileUpdates = {};
    if (username !== undefined) profileUpdates.username = username;
    if (email !== undefined) profileUpdates.email = email;
    if (displayedName !== undefined) profileUpdates.displayedName = displayedName;
    if (avatar !== undefined) profileUpdates.avatar = avatar;
    if (avatarFrame !== undefined || avatar_frame !== undefined)
      profileUpdates.avatarFrame = avatarFrame ?? avatar_frame;

    if (
      displayedName !== undefined &&
      displayedName !== null &&
      !/^[A-Za-z0-9_()\-]+(?: [A-Za-z0-9_()\-]+)?$/.test(displayedName)
    ) {
      return res.status(400).json({ message: 'Invalid displayedName format' });
    }

    if (username !== undefined || email !== undefined) {
      const existing = await findConflictingUser({ userId, username, email });

      if (existing) {
        if (existing.username === username) {
          return res
            .status(409)
            .json({ field: 'username', message: 'This username is already taken' });
        }
        if (existing.email === email) {
          return res.status(409).json({ field: 'email', message: 'This email is already in use' });
        }
      }
    }

    await updateProfileData(userId, profileUpdates);

    const updatedUser = await findById(userId);
    const token = generateToken(
      updatedUser.id,
      updatedUser.username,
      updatedUser.displayedName,
      updatedUser.avatar,
      updatedUser.avatarFrame
    );

    res.status(200).json({ message: 'Profile updated', token, user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updatePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (gameService.findGameByPlayer(userId)) {
      return res.status(403).json({ message: 'Cannot edit profile during an active match' });
    }

    const user = await findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isValid = await verifyPassword(oldPassword, user.passwordHash);
    if (!isValid) return res.status(401).json({ message: 'Incorrect old password' });

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const newHash = await hashPassword(newPassword);
    await updatePasswordHash(userId, newHash);

    res.status(200).json({ message: 'Password updated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getMatchHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const history = await getUserMatchHistory(userId);
    res.status(200).json(history);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAvatars = async (req, res) => {
  try {
    const entries = await fs.readdir(avatarsDir, { withFileTypes: true });
    const avatars = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => allowedAvatarExtensions.has(path.extname(name).toLowerCase()))
      .map((name) => `${avatarPublicBase}/${name}`)
      .sort();

    res.status(200).json(avatars);
  } catch (error) {
    console.error('Error loading avatars:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAvatarFrames = async (req, res) => {
  try {
    let entries = [];
    try {
      entries = await fs.readdir(avatarFramesDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return res.status(200).json([]);
      throw error;
    }

    const frames = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => allowedAvatarExtensions.has(path.extname(name).toLowerCase()))
      .map((name) => `${avatarFramesPublicBase}/${name}`)
      .sort();

    res.status(200).json(frames);
  } catch (error) {
    console.error('Error loading avatar frames:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
