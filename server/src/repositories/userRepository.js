import { pool } from '../config/db.js';

const mapUserRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    displayedName: row.displayed_name ?? null,
    username: row.username,
    email: row.email,
    avatar: row.avatar,
    rating: row.rating ?? 500,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
};

export async function findByUsername(username) {
  const [rows] = await pool.query('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);

  return mapUserRow(rows[0]);
}

export async function findByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);

  return mapUserRow(rows[0]);
}

export async function createUser({ username, email, passwordHash, displayedName, avatar }) {
  const normalizedDisplayedName = displayedName ?? null;
  const normalizedAvatar = avatar ?? '/assets/default-avatar.svg';

  const [result] = await pool.query(
    'INSERT INTO users (username, email, password_hash, displayed_name, avatar) VALUES (?, ?, ?, ?, ?)',
    [username, email, passwordHash, normalizedDisplayedName, normalizedAvatar]
  );

  return {
    id: result.insertId,
    username,
    email,
    displayedName: normalizedDisplayedName,
    avatar: normalizedAvatar,
    rating: 500,
  };
}

export async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return mapUserRow(rows[0]);
}

export async function updateRating(userId, newRating) {
  await pool.query('UPDATE users SET rating = ? WHERE id = ?', [newRating, userId]);
}
