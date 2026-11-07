// npm run db:setup
// Crée la base (si besoin), recrée toutes les tables avec Sequelize, puis ajoute les données de démo Kammel.
// ATTENTION : supprime et recrée les tables existantes. Refusé en production ; base distante : ajouter --yes.
require('dotenv').config();
const mysql = require('mysql2/promise');
const { connectionSettings, sslOptions } = require('../config/database');

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('db:setup supprime toutes les données : refusé avec NODE_ENV=production.');
    process.exit(1);
  }
  const settings = connectionSettings();
  if (!LOCAL_HOSTS.includes(settings.host) && !process.argv.includes('--yes')) {
    console.error(`La base "${settings.database}" est sur ${settings.host} (pas en local). Toutes ses tables seront supprimées.`);
    console.error('Relancez avec : npm run db:setup -- --yes');
    process.exit(1);
  }
  if (!/^[\w$-]{1,64}$/.test(settings.database)) throw new Error('Nom de base invalide.');

  console.log(`> Connexion à MySQL (${settings.user}@${settings.host}:${settings.port})...`);
  const conn = await mysql.createConnection({
    host: settings.host,
    port: settings.port,
    user: settings.user,
    password: settings.password,
    ssl: sslOptions(),
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${settings.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
  console.log(`> Base "${settings.database}" prête.`);

  // chargé seulement maintenant : la base existe
  const { seed, DEMO_ACCOUNTS, sequelize } = require('../seed/seed');
  try {
    await sequelize.sync({ force: true });
    console.log('> Tables créées.');
    const started = Date.now();
    const result = await seed();
    console.log(`> Données de démo ajoutées en ${Math.round((Date.now() - started) / 1000)} s : ${result.exercises} exercices, ${result.members} membres, ${result.checkins} entrées, ${result.payments} paiements.`);
    console.log('\nComptes de démonstration (identifiant / mot de passe) :');
    for (const [label, login, password] of DEMO_ACCOUNTS) console.log(`  ${label.padEnd(44)} ${login.padEnd(22)} ${password}`);
  } finally {
    await sequelize.close();
  }
}

main().catch((err) => {
  console.error('\nErreur :', err.message);
  if (err.code === 'ER_ACCESS_DENIED_ERROR') console.error('Vérifiez DB_USER et DB_PASSWORD (ou DATABASE_URL) dans le fichier .env.');
  if (err.code === 'ECONNREFUSED') console.error('MySQL ne répond pas. Démarrez le serveur MySQL / MariaDB.');
  process.exit(1);
});
