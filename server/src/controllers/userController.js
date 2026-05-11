import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  findById,
  findConflictingUser,
  getTopUsers,
  updatePasswordHash,
  updateProfileData,
} from '../repositories/userRepository.js';
import { generateToken } from '../utils/jwt.js';
import { hashPassword, verifyPassword } from '../utils/hash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const avatarsDir = path.resolve(__dirname, '../../../client/assets/avatars');
const avatarPublicBase = '/assets/avatars';
const allowedAvatarExtensions = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp']);

export const updateProfile = async (req, res) => {
  try {
    const { username, email, displayedName, avatar } = req.body;
    const userId = req.user.id;

    const profileUpdates = {};
    if (username !== undefined) profileUpdates.username = username;
    if (email !== undefined) profileUpdates.email = email;
    if (displayedName !== undefined) profileUpdates.displayedName = displayedName;
    if (avatar !== undefined) profileUpdates.avatar = avatar;

    if (
      displayedName !== undefined &&
      displayedName !== null &&
      !/^[A-Za-z0-9_()\-]+(?: [A-Za-z0-9_()\-]+)?$/.test(displayedName)
    ) {
      return res.status(400).json({ message: 'Invalid displayedName format' });
    }

    if (username !== undefined || email !== undefined) {
      const existing = await findConflictingUser({ userId, username, email });
      if (existing) return res.status(409).json({ message: 'Username/Email already taken' });
    }

    await updateProfileData(userId, profileUpdates);

    const updatedUser = await findById(userId);
    const token = generateToken(
      updatedUser.id,
      updatedUser.username,
      updatedUser.displayedName,
      updatedUser.avatar
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

    const user = await findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isValid = await verifyPassword(oldPassword, user.passwordHash);
    if (!isValid) return res.status(401).json({ message: 'Incorrect old password' });

    const newHash = await hashPassword(newPassword);
    await updatePasswordHash(userId, newHash);

    res.status(200).json({ message: 'Password updated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getLeaderboard = async (req, res) => {
  try {
    const users = await getTopUsers(10);
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
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
