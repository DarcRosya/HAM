const userSockets = new Map();

const normalizeUserId = (userId) => String(userId);

export function addUserSocket(userId, socketId) {
  const key = normalizeUserId(userId);
  const sockets = userSockets.get(key) ?? new Set();
  sockets.add(socketId);
  userSockets.set(key, sockets);
  return sockets.size;
}

export function removeUserSocket(userId, socketId) {
  const key = normalizeUserId(userId);
  const sockets = userSockets.get(key);
  if (!sockets) {
    return 0;
  }
  sockets.delete(socketId);
  if (sockets.size === 0) {
    userSockets.delete(key);
    return 0;
  }
  return sockets.size;
}

export function getUserSocketIds(userId) {
  const key = normalizeUserId(userId);
  return userSockets.get(key) ?? new Set();
}

export function getUserSocketCount(userId) {
  const key = normalizeUserId(userId);
  const sockets = userSockets.get(key);
  return sockets ? sockets.size : 0;
}

export function isUserOnline(userId) {
  return getUserSocketCount(userId) > 0;
}
