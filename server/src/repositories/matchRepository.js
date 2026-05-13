import { pool } from '../config/db.js';

export async function saveMatchResult(
  player1Id,
  player2Id,
  winnerId,
  startedAt,
  endedAt,
  ratingChange = 0
) {
  const [result] = await pool.query(
    'INSERT INTO match_history (player1_id, player2_id, winner_id, started_at, ended_at, rating_change) VALUES (?, ?, ?, ?, ?, ?)',
    [player1Id, player2Id, winnerId, startedAt, endedAt, ratingChange]
  );
  return result.insertId;
}

export async function getUserMatchHistory(userId) {
  const [rows] = await pool.query(
    `SELECT
      mh.id,
      mh.winner_id AS winnerId,
      mh.started_at AS startedAt,
      mh.ended_at AS endedAt,
      TIMESTAMPDIFF(SECOND, mh.started_at, mh.ended_at) AS duration,
      CASE
        WHEN mh.winner_id IS NULL THEN 0
        WHEN mh.winner_id = ? THEN mh.rating_change
        ELSE -mh.rating_change
      END AS ratingChange,
      u.username,
      u.displayed_name AS displayedName,
      u.avatar
    FROM match_history mh
    JOIN users u
      ON u.id = CASE WHEN mh.player1_id = ? THEN mh.player2_id ELSE mh.player1_id END
    WHERE mh.player1_id = ? OR mh.player2_id = ?
    ORDER BY mh.ended_at DESC
    LIMIT 4`,
    [userId, userId, userId, userId]
  );
  return rows;
}
