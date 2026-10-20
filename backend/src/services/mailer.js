// Envoi des e-mails (SMTP, ex. Gmail avec un « mot de passe d'application »).
// Sans configuration SMTP, l'e-mail est affiché dans la console du serveur (mode développement).
const nodemailer = require('nodemailer');
const { HttpError } = require('../middleware/errors');

function hasMail() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter = null;
function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      // Google affiche le mot de passe d'application par groupes « abcd efgh ... » : on retire les espaces
      auth: { user: process.env.SMTP_USER.trim(), pass: process.env.SMTP_PASS.replace(/\s+/g, '') },
    });
  }
  return transporter;
}

/**
 * @param {{ to: string, subject: string, text: string, html: string }} mail
 */
async function sendMail(mail) {
  if (!hasMail()) {
    console.log(`\n[E-mail non envoyé : SMTP non configuré] À : ${mail.to}\nObjet : ${mail.subject}\n${mail.text}\n`);
    return;
  }
  try {
    await getTransporter().sendMail({ from: process.env.MAIL_FROM || `FitCoach AI <${process.env.SMTP_USER}>`, ...mail });
  } catch (err) {
    console.error('[E-mail] envoi impossible :', err.message);
    throw new HttpError(502, 'MAIL_FAILED', 'Impossible d’envoyer l’e-mail pour le moment. Réessayez plus tard.');
  }
}

module.exports = { sendMail, hasMail };
