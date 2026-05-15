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

export async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return mapUserRow(rows[0]);
}

export async function findConflictingUser({ userId, username, email }) {
  const conditions = [];
  const values = [];

  if (username !== undefined) {
    conditions.push('username = ?');
    values.push(username);
  }

  if (email !== undefined) {
    conditions.push('email = ?');
    values.push(email);
  }

  if (conditions.length === 0) {
    return null;
  }

  const query = `SELECT username, email FROM users WHERE (${conditions.join(' OR ')}) AND id != ? LIMIT 1`;
  values.push(userId);

  const [rows] = await pool.query(query, values);
  return rows[0] ?? null;
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

export async function updateProfileData(userId, data) {
  const fields = [];
  const values = [];

  if (data.username !== undefined) {
    fields.push('username = ?');
    values.push(data.username);
  }
  if (data.email !== undefined) {
    fields.push('email = ?');
    values.push(data.email);
  }
  if (data.displayedName !== undefined) {
    fields.push('displayed_name = ?');
    values.push(data.displayedName);
  }
  if (data.avatar !== undefined) {
    fields.push('avatar = ?');
    values.push(data.avatar);
  }

  if (fields.length === 0) return;

  values.push(userId);
  const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
  await pool.query(query, values);
}

export async function updatePasswordHash(userId, newHash) {
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);
}

export async function saveResetToken(userId, token, expiresAt) {
  await pool.query(
    'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
    [userId, token, expiresAt]
  );
}

export async function findValidResetToken(token) {
  const [rows] = await pool.query(
    'SELECT * FROM password_reset_tokens WHERE token = ? AND expires_at > NOW() LIMIT 1',
    [token]
  );
  return rows[0];
}

export async function deleteResetToken(tokenId) {
  await pool.query('DELETE FROM password_reset_tokens WHERE id = ?', [tokenId]);
}

export async function updateRating(userId, newRating) {
  await pool.query('UPDATE users SET rating = ? WHERE id = ?', [newRating, userId]);
}
