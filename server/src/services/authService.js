import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createUser, findByEmail, findByUsername } from '../repositories/userRepository.js';
import { hashPassword, verifyPassword } from '../utils/hash.js';
import { generateToken } from '../utils/jwt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const avatarsDir = path.resolve(__dirname, '../../../client/assets/avatars');
const avatarPublicBase = '/assets/avatars';
const allowedAvatarExtensions = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp']);

async function pickRandomAvatar() {
  try {
    const entries = await fs.readdir(avatarsDir, { withFileTypes: true });
    const avatars = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => allowedAvatarExtensions.has(path.extname(name).toLowerCase()))
      .map((name) => `${avatarPublicBase}/${name}`);

    if (avatars.length === 0) return null;

    const index = Math.floor(Math.random() * avatars.length);
    return avatars[index];
  } catch (error) {
    return null;
  }
}

export async function registerUser({ username, email, password, displayedName, avatar, avatarFrame }) {
  const [existingUser, existingEmail] = await Promise.all([
    findByUsername(username),
    findByEmail(email),
  ]);

  if (existingUser) {
    const error = new Error('Username already exists');
    error.status = 409;
    throw error;
  }

  if (existingEmail) {
    const error = new Error('Email already exists');
    error.status = 409;
    throw error;
  }

  const passwordHash = await hashPassword(password);
  const normalizedAvatar = typeof avatar === 'string' && avatar.trim() !== '' ? avatar : null;
  const resolvedAvatar = normalizedAvatar ?? (await pickRandomAvatar()) ?? '/assets/default-avatar.svg';
  const user = await createUser({
    username,
    email,
    passwordHash,
    displayedName,
    avatar: resolvedAvatar,
    avatarFrame,
  });

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayedName: user.displayedName,
    avatar: user.avatar,
    avatarFrame: user.avatarFrame,
  };
}

export async function loginUser({ username, password }) {
  const isEmail = username.includes('@');

  const user = isEmail ? await findByEmail(username) : await findByUsername(username);

  if (!user) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  const token = generateToken(
    user.id,
    user.username,
    user.displayedName,
    user.avatar,
    user.avatarFrame
  );

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayedName: user.displayedName,
      avatar: user.avatar,
      avatarFrame: user.avatarFrame,
    },
  };
}
