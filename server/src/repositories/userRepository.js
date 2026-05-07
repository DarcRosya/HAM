import User from '../models/User.js';

export async function findByUsername(username) {
  return User.findOne({ where: { username } });
}

export async function createUser({ username, passwordHash }) {
  return User.create({ username, passwordHash });
}
