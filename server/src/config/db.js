import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'ham_user',
  password: process.env.DB_PASSWORD || 'ham_password',
  database: process.env.DB_NAME || 'ham',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export const verifyConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Connected to MySQL via mysql2 pool');
    connection.release();
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
};
