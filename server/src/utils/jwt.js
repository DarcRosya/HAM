import { jsonwebtoken } from 'jsonwebtoken';

const generateToken = (userId, username) => {
  const payload = { id: userId, username };
  const secret = process.env.JWT_SECRET || 'fallback_secret_key';

  return jwt.sign(payload, secret, { expiresIn: '24h' });
};

module.exports = { generateToken };
