// Codes à 6 chiffres envoyés par e-mail : vérification de l'adresse et mot de passe oublié
const crypto = require('crypto');
const { Op } = require('sequelize');
const { EmailCode } = require('../models');
const { HttpError } = require('../middleware/errors');
const { sendMail } = require('./mailer');

const VALID_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;

const hash = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

const TEXTS = {
  fr: {
    VERIFY: { subject: 'Votre code de vérification FitCoach AI', intro: 'Bienvenue sur FitCoach AI ! Voici votre code pour confirmer votre adresse e-mail :' },
    RESET: { subject: 'Réinitialisation de votre mot de passe FitCoach AI', intro: 'Vous avez demandé à changer votre mot de passe. Voici votre code :' },
    footer: `Ce code est valable ${VALID_MINUTES} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
  },
  ar: {
    VERIFY: { subject: 'رمز التحقق من FitCoach AI', intro: 'مرحباً بك في FitCoach AI! هذا رمز تأكيد بريدك الإلكتروني:' },
    RESET: { subject: 'إعادة تعيين كلمة السر - FitCoach AI', intro: 'طلبت تغيير كلمة السر. هذا رمزك:' },
    footer: `هذا الرمز صالح لمدة ${VALID_MINUTES} دقيقة. إذا لم تطلب ذلك، تجاهل هذه الرسالة.`,
  },
};

/**
 * Crée un nouveau code (les anciens du même type sont supprimés) et l'envoie par e-mail.
 * @param {{ force?: boolean }} options force : ignore le délai minimal entre deux envois
 */
async function sendCode(user, purpose, { force = false } = {}) {
  const last = await EmailCode.findOne({ where: { userId: user.id, purpose }, order: [['createdAt', 'DESC']] });
  if (!force && last && Date.now() - new Date(last.createdAt).getTime() < RESEND_SECONDS * 1000) {
    throw new HttpError(429, 'TOO_SOON', `Patientez ${RESEND_SECONDS} secondes avant de demander un nouveau code.`);
  }
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await EmailCode.destroy({ where: { userId: user.id, purpose } });
  await EmailCode.create({ userId: user.id, purpose, codeHash: hash(code), expiresAt: new Date(Date.now() + VALID_MINUTES * 60000) });

  const t = TEXTS[user.language === 'ar' ? 'ar' : 'fr'];
  const dir = user.language === 'ar' ? 'rtl' : 'ltr';
  await sendMail({
    to: user.email,
    subject: t[purpose].subject,
    text: `${t[purpose].intro}\n\n${code}\n\n${t.footer}`,
    html: `<div dir="${dir}" style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#16232B">
  <h2 style="color:#1F6F78;margin:0 0 16px">FitCoach AI</h2>
  <p>${t[purpose].intro}</p>
  <p style="font-size:34px;font-weight:bold;letter-spacing:8px;background:#EEF2F1;border-radius:12px;padding:16px;text-align:center;margin:20px 0">${code}</p>
  <p style="color:#5D6B72;font-size:13px">${t.footer}</p>
</div>`,
  });
}

/**
 * Vérifie un code ; il est supprimé dès qu'il est utilisé.
 * @throws {HttpError} CODE_INVALID (mauvais code, expiré ou trop d'essais)
 */
async function checkCode(user, purpose, code) {
  const row = await EmailCode.findOne({ where: { userId: user.id, purpose, expiresAt: { [Op.gt]: new Date() } } });
  if (!row || row.attempts >= MAX_ATTEMPTS) {
    throw new HttpError(400, 'CODE_INVALID', 'Code invalide ou expiré. Demandez un nouveau code.');
  }
  if (row.codeHash !== hash(String(code || '').trim())) {
    const attempts = row.attempts + 1;
    await row.update({ attempts });
    throw new HttpError(400, 'CODE_INVALID', `Code incorrect (${Math.max(0, MAX_ATTEMPTS - attempts)} essai(s) restant(s)).`);
  }
  await row.destroy();
}

module.exports = { sendCode, checkCode };
