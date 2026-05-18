import { loginUser, registerUser } from '../services/authService.js';
import crypto from 'crypto';
import { sendResetPasswordEmail } from '../services/emailService.js';
import { hashPassword } from '../utils/hash.js';
import { validateDisplayedName, validatePassword, validateUsername } from '../utils/validators.js';
import {
  findByEmail,
  saveResetToken,
  findValidResetToken,
  updatePasswordHash,
  deleteResetToken,
} from '../repositories/userRepository.js';

export async function register(req, res) {
  const {
    username,
    email,
    password,
    displayedName,
    displayed_name,
    avatar,
    avatarFrame,
    avatar_frame,
  } = req.body;
  const normalizedDisplayName = displayedName ?? displayed_name ?? null;
  const normalizedAvatarFrame = avatarFrame ?? avatar_frame ?? null;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required' });
  }

  const usernameError = validateUsername(username);
  if (usernameError) {
    return res.status(400).json({ message: usernameError });
  }

  const displayedNameError = validateDisplayedName(normalizedDisplayName);
  if (displayedNameError) {
    return res.status(400).json({ message: displayedNameError });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  try {
    await registerUser({
      username,
      email,
      password,
      displayedName: normalizedDisplayName,
      avatar,
      avatarFrame: normalizedAvatarFrame,
    });
    return res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || 'Server error' });
  }
}

export async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    const payload = await loginUser({ username, password });
    return res.status(200).json(payload);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || 'Server error' });
  }
}

export async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await findByEmail(email);
    if (!user) return res.status(200).json({ message: 'Check your email for reset link' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await saveResetToken(user.id, token, expiresAt);
    await sendResetPasswordEmail(user.email, token);

    return res.status(200).json({ message: 'Check your email for reset link' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
}

export async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword)
      return res.status(400).json({ message: 'Token and password required' });

    const resetRequest = await findValidResetToken(token);
    if (!resetRequest) return res.status(400).json({ message: 'Invalid or expired token' });

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const passwordHash = await hashPassword(newPassword);
    await updatePasswordHash(resetRequest.user_id, passwordHash);
    await deleteResetToken(resetRequest.id);

    return res.status(200).json({ message: 'Password reset successful' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
}
