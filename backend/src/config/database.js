require('dotenv').config();
const { Sequelize } = require('sequelize');

// Connexion MySQL / MariaDB / TiDB.
// - en local : DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (MySQL Workbench, XAMPP)
// - en ligne : DATABASE_URL=mysql://user:motdepasse@hote:4000/kammel (TiDB Cloud, etc.) + DB_SSL=true
function connectionSettings() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    if (!/^mysql2?:$/.test(url.protocol)) throw new Error('DATABASE_URL doit commencer par mysql://');
    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: (process.env.DB_NAME || decodeURIComponent(url.pathname.slice(1)) || 'kammel').trim(),
    };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kammel',
  };
}

// Chiffrement TLS vers la base (obligatoire pour une base en ligne). Le certificat du serveur est toujours vérifié ;
// DB_SSL_CA permet de fournir l'autorité de certification (contenu PEM) si elle n'est pas publique.
function sslOptions() {
  if (process.env.DB_SSL !== 'true') return undefined;
  const ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
  if (process.env.DB_SSL_CA) ssl.ca = process.env.DB_SSL_CA.replace(/\\n/g, '\n');
  return ssl;
}

const settings = connectionSettings();
const DB_NAME = settings.database;

const sequelize = new Sequelize(settings.database, settings.user, settings.password, {
  host: settings.host,
  port: settings.port,
  dialect: 'mysql',
  logging: false,
  timezone: '+01:00', // heure de Tunis
  define: {
    underscored: true, // colonnes en snake_case dans MySQL (created_at, gym_id, ...)
    charset: 'utf8mb4', // nécessaire pour l'arabe
    collate: 'utf8mb4_unicode_ci',
  },
  dialectOptions: { charset: 'utf8mb4', ssl: sslOptions(), connectTimeout: 20000 },
  // base en ligne gratuite : peu de connexions, et aucune connexion gardée ouverte inutilement
  pool: { max: Number(process.env.DB_POOL_MAX || 5), min: 0, idle: 10000, acquire: 30000, evict: 10000 },
});

module.exports = { sequelize, DB_NAME, connectionSettings, sslOptions };
