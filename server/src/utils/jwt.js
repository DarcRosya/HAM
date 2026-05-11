import jwt from 'jsonwebtoken';

export function generateToken(userId, username, displayedName, avatar) {
  const payload = { id: userId, username, displayedName, avatar };
  const secret = process.env.JWT_SECRET || 'fallback_secret_key';

  return jwt.sign(payload, secret, { expiresIn: '24h' });
}
