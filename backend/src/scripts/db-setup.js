// npm run db:setup
// Crée la base MySQL (si besoin), crée toutes les tables avec Sequelize, puis ajoute les données de démo.
// ATTENTION : supprime et recrée les tables existantes.
require('dotenv').config();
const mysql = require('mysql2/promise');
const { sequelize } = require('../models');
const { DB_NAME } = require('../config/database');
const { seed } = require('../seed/seed');

async function main() {
  console.log(`> Connexion à MySQL (${process.env.DB_USER || 'root'}@${process.env.DB_HOST || 'localhost'})...`);
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
  console.log(`> Base "${DB_NAME}" prête.`);

  await sequelize.sync({ force: true });
  console.log('> Tables créées.');

  const result = await seed();
  console.log(`> Données de démo ajoutées (${result.exercises} exercices).`);
  console.log('\nComptes de démonstration :');
  console.log('  Administrateur : admin@fitcoach.tn / Admin123!');
  console.log('  Gérant         : gerant@fitcoach.tn / Gerant123!');
  console.log('  Sportif        : sportif@fitcoach.tn / Sportif123!');
  await sequelize.close();
}

main().catch(async (err) => {
  console.error('\nErreur :', err.message);
  if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('Vérifiez DB_USER et DB_PASSWORD dans le fichier .env (les mêmes que dans MySQL Workbench).');
  }
  if (err.code === 'ECONNREFUSED') {
    console.error('MySQL ne répond pas. Démarrez le serveur MySQL (MySQL80 dans les services Windows).');
  }
  try {
    await sequelize.close();
  } catch {
    /* rien */
  }
  process.exit(1);
});
