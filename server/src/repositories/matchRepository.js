import { pool } from '../config/db.js';

export async function saveMatchResult(player1Id, player2Id, winnerId, startedAt, endedAt) {
  const [result] = await pool.query(
    'INSERT INTO match_history (player1_id, player2_id, winner_id, started_at, ended_at) VALUES (?, ?, ?, ?, ?)',
    [player1Id, player2Id, winnerId, startedAt, endedAt]
  );
  return result.insertId;
}