// Connexion, première connexion (mot de passe provisoire), déconnexion, mot de passe oublié de l'équipe
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { User, Gym } = require('../models');
const { ah, HttpError } = require('../middleware/errors');
const { auth, startSession } = require('../middleware/auth');
const { rateLimit, clearSessionCookie } = require('../middleware/security');
const { publicUser, required, checkPassword, normalizePhone, normEmail } = require('../utils');
const { sendCode, checkCode } = require('../services/emailCodes');
const { permissionsOf } = require('../services/permissions');
const { publicGymSettings } = require('../services/gymSettings');

const BCRYPT_COST = 11;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
// hash factice : même durée de calcul que le compte existe ou non (pas d'énumération par le temps de réponse)
const DUMMY_HASH = bcrypt.hashSync('kammel-dummy-password', BCRYPT_COST);

const BAD_CREDENTIALS = () => new HttpError(401, 'BAD_CREDENTIALS', 'Identifiant ou mot de passe incorrect.');

// 10 essais par minute et par adresse IP, 30 par identifiant et par heure
const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
const identifierLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  key: (req) => `id:${String(req.body?.identifier || '').toLowerCase().replace(/\s+/g, '')}`,
});
const codeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 8 });

// Téléphone (membres) ou e-mail (équipe, administrateur)
function findByIdentifier(identifier) {
  const raw = String(identifier || '').trim();
  if (raw.includes('@')) return User.scope('withPassword').findOne({ where: { email: normEmail(raw) } });
  const phone = normalizePhone(raw);
  return phone ? User.scope('withPassword').findOne({ where: { phone } }) : Promise.resolve(null);
}

// Utilisateur connecté + salle + permissions (réponse de /me, /login, /first-password)
async function sessionPayload(userId) {
  const user = await User.findByPk(userId, { include: [{ model: Gym, as: 'gym' }] });
  const data = publicUser(user);
  if (data.gym) data.gym = { ...data.gym, settings: publicGymSettings(user.gym, user.role) };
  data.permissions = permissionsOf(user.role);
  return data;
}

router.post(
  '/login',
  loginLimiter,
  identifierLimiter,
  ah(async (req, res) => {
    required(req.body, ['identifier', 'password']);
    const user = await findByIdentifier(req.body.identifier);
    const password = String(req.body.password).slice(0, 200);
    if (!user || user.deletedAt) {
      await bcrypt.compare(password, DUMMY_HASH);
      throw BAD_CREDENTIALS();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await bcrypt.compare(password, DUMMY_HASH);
      throw new HttpError(429, 'ACCOUNT_LOCKED', `Trop d'essais. Réessaie dans ${LOCK_MINUTES} minutes.`);
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      const failed = user.failedLogins + 1;
      await user.update({
        failedLogins: failed >= MAX_FAILED ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000) : user.lockedUntil,
      });
      throw BAD_CREDENTIALS();
    }
    if (!user.active) throw new HttpError(403, 'ACCOUNT_DISABLED', 'Compte désactivé. Contacte ta salle.');
    if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < new Date()) {
      throw new HttpError(403, 'TEMP_PASSWORD_EXPIRED', 'Mot de passe provisoire expiré : demande un nouveau code à l’accueil.');
    }
    await user.update({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() });
    startSession(res, user, { remember: req.body.remember !== false });
    res.json(await sessionPayload(user.id));
  })
);

// Première connexion : le mot de passe provisoire donné à l'accueil est remplacé
router.post(
  '/first-password',
  auth,
  ah(async (req, res) => {
    required(req.body, ['currentPassword', 'newPassword']);
    const user = await User.scope('withPassword').findByPk(req.user.id);
    if (!user.mustChangePassword) throw new HttpError(400, 'NOT_REQUIRED', 'Mot de passe déjà choisi.');
    if (!(await bcrypt.compare(String(req.body.currentPassword), user.passwordHash))) {
      throw new HttpError(400, 'BAD_PASSWORD', 'Mot de passe provisoire incorrect.');
    }
    checkPassword(req.body.newPassword, { temporary: String(req.body.currentPassword) });
    await user.update({
      passwordHash: await bcrypt.hash(String(req.body.newPassword), BCRYPT_COST),
      mustChangePassword: false,
      tempPasswordExpiresAt: null,
      passwordChangedAt: new Date(),
      tokenVersion: user.tokenVersion + 1, // les autres sessions ouvertes avec le code provisoire sont coupées
    });
    startSession(res, user);
    res.json(await sessionPayload(user.id));
  })
);

// Déconnexion ; everywhere = couper aussi les autres appareils
router.post(
  '/logout',
  ah(async (req, res, next) => {
    if (req.body?.everywhere) {
      return auth(req, res, async (err) => {
        if (err) return next(err);
        await req.user.increment('tokenVersion');
        clearSessionCookie(res);
        return res.json({ ok: true });
      });
    }
    clearSessionCookie(res);
    return res.json({ ok: true });
  })
);

router.get(
  '/me',
  auth,
  ah(async (req, res) => {
    res.json(await sessionPayload(req.user.id));
  })
);

// Mot de passe oublié (équipe et administrateur, par e-mail). Les membres passent par l'accueil.
// Réponse identique que l'adresse existe ou non.
router.post(
  '/forgot-password',
  codeLimiter,
  ah(async (req, res) => {
    required(req.body, ['email']);
    const user = await User.findOne({ where: { email: normEmail(req.body.email) } });
    if (user && user.active && !user.deletedAt && user.role !== 'SPORTIF') {
      await sendCode(user, 'RESET').catch((err) => {
        if (err.code !== 'TOO_SOON') throw err;
      });
    }
    res.json({ ok: true });
  })
);

router.post(
  '/reset-password',
  codeLimiter,
  ah(async (req, res) => {
    required(req.body, ['email', 'code', 'password']);
    checkPassword(req.body.password);
    const user = await User.scope('withPassword').findOne({ where: { email: normEmail(req.body.email) } });
    if (!user || !user.active || user.deletedAt || user.role === 'SPORTIF') {
      throw new HttpError(400, 'CODE_INVALID', 'Code invalide ou expiré. Demande un nouveau code.');
    }
    await checkCode(user, 'RESET', req.body.code);
    await user.update({
      passwordHash: await bcrypt.hash(String(req.body.password), BCRYPT_COST),
      mustChangePassword: false,
      tempPasswordExpiresAt: null,
      passwordChangedAt: new Date(),
      failedLogins: 0,
      lockedUntil: null,
      tokenVersion: user.tokenVersion + 1,
    });
    startSession(res, user);
    res.json(await sessionPayload(user.id));
  })
);

module.exports = router;
module.exports.BCRYPT_COST = BCRYPT_COST;
module.exports.sessionPayload = sessionPayload;
