import { createUser, findByEmail, findByUsername } from '../repositories/userRepository.js';
import { hashPassword, verifyPassword } from '../utils/hash.js';
import { generateToken } from '../utils/jwt.js';

export async function registerUser({ username, email, password, displayedName, avatar }) {
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
  const user = await createUser({
    username,
    email,
    passwordHash,
    displayedName,
    avatar,
  });

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayedName: user.displayedName,
    avatar: user.avatar,
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

  const token = generateToken(user.id, user.username, user.displayedName, user.avatar);

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayedName: user.displayedName,
      avatar: user.avatar,
    },
  };
}
