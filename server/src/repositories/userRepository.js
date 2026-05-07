import User from '../models/user.js';

export async function findByUsername(username) {
  return User.findOne({ where: { username } });
}

export async function findByEmail(email) {
  return User.findOne({ where: { email } });
}

export async function createUser({
  username,
  email,
  passwordHash,
  displayedName,
  avatar,
}) {
  return User.create({
    username,
    email,
    passwordHash,
    displayedName: displayedName || null,
    avatar: avatar || undefined,
  });
}
