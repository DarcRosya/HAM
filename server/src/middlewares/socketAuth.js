import jwt from 'jsonwebtoken';

export const socketAuth = (socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const secret = process.env.JWT_SECRET || 'fallback_secret_key';

    const decoded = jwt.verify(token, secret);

    socket.user = decoded;

    next();
  } catch (error) {
    return next(new Error('Authentication error: Invalid token'));
  }
};
