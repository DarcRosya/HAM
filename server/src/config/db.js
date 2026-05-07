import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

export const sequelize = new Sequelize(
  process.env.DB_NAME || 'ham',
  process.env.DB_USER || 'ham_user',
  process.env.DB_PASSWORD || 'ham_password',
  {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    logging: false,
  }
);

export const verifyConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('Sequelize connected to MySQL');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
};
