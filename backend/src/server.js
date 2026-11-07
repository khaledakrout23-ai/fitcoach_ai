require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');
const { hasMail } = require('./services/mailer');
const { hasAI } = require('./services/gemini');
const { startJobs } = require('./services/jobs');

const PORT = Number(process.env.PORT || 4000);
// 0.0.0.0 : accessible depuis un téléphone sur le même Wi-Fi ; HOST=127.0.0.1 pour limiter à ce PC
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  try {
    await sequelize.authenticate();
  } catch (err) {
    console.error('Impossible de se connecter à MySQL :', err.message);
    console.error('Vérifiez le fichier .env puis lancez "npm run db:setup".');
    process.exit(1);
  }
  // Base créée avec une ancienne version (FitCoach AI) : il manque les colonnes de Kammel
  try {
    const columns = await sequelize.getQueryInterface().describeTable('users');
    if (!columns.phone || !columns.token_version) {
      console.error('La base date de l’ancienne version. Lancez "npm run db:setup" (recrée les tables et les données de démo).');
      process.exit(1);
    }
  } catch {
    console.error('Base vide. Lancez "npm run db:setup".');
    process.exit(1);
  }
  await sequelize.sync(); // crée seulement les tables manquantes, sans toucher aux données

  app.listen(PORT, HOST, () => {
    console.log(`API Kammel : http://localhost:${PORT}/api`);
    console.log(hasAI() ? 'Coach IA : Gemini activé' : 'Coach IA : mode simple (ajoutez GEMINI_API_KEY dans .env pour activer Gemini)');
    console.log(hasMail() ? 'E-mails : SMTP activé' : 'E-mails : SMTP non configuré, les codes sont affichés dans cette console');
    startJobs();
  });
}

start();
