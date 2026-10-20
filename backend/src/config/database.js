require('dotenv').config();
const { Sequelize } = require('sequelize');

const DB_NAME = process.env.DB_NAME || 'fitcoach';

const sequelize = new Sequelize(DB_NAME, process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  dialect: 'mysql',
  logging: false,
  timezone: '+01:00', // heure de Tunis
  define: {
    underscored: true, // colonnes en snake_case dans MySQL (created_at, gym_id, ...)
    charset: 'utf8mb4', // nécessaire pour l'arabe
    collate: 'utf8mb4_unicode_ci',
  },
  dialectOptions: { charset: 'utf8mb4' },
});

module.exports = { sequelize, DB_NAME };
