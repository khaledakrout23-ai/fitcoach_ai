const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { User, Gym } = require('../models');
const { ah, HttpError } = require('../middleware/errors');
const { auth, signToken } = require('../middleware/auth');
const { publicUser, required, checkPassword } = require('../utils');
const { sendCode, checkCode } = require('../services/emailCodes');

const normEmail = (email) => String(email || '').toLowerCase().trim();
const findByEmail = (email) => User.scope('withPassword').findOne({ where: { email: normEmail(email) } });

// Inscription : seuls les sportifs créent leur compte eux-mêmes (RG7).
// Le compte n'est utilisable qu'après la saisie du code reçu par e-mail.
router.post(
  '/register',
  ah(async (req, res) => {
    required(req.body, ['name', 'email', 'password']);
    const { name, email, password, language } = req.body;
    checkPassword(password);
    const exists = await User.findOne({ where: { email: normEmail(email) } });
    if (exists) throw new HttpError(409, 'EMAIL_TAKEN', 'Cet e-mail est déjà utilisé.');
    const user = await User.create({
      name: String(name).trim(),
      email: normEmail(email),
      passwordHash: await bcrypt.hash(String(password), 10),
      role: 'SPORTIF',
      language: language === 'ar' ? 'ar' : 'fr',
      injuries: [],
      emailVerified: false,
    });
    await sendCode(user, 'VERIFY', { force: true });
    res.status(201).json({ needsVerification: true, email: user.email });
  })
);

router.post(
  '/login',
  ah(async (req, res) => {
    required(req.body, ['email', 'password']);
    const user = await findByEmail(req.body.email);
    const ok = user && (await bcrypt.compare(String(req.body.password), user.passwordHash));
    if (!ok) throw new HttpError(401, 'BAD_CREDENTIALS', 'E-mail ou mot de passe incorrect.');
    if (!user.active) throw new HttpError(403, 'ACCOUNT_DISABLED', 'Compte désactivé. Contactez votre salle.');
    if (!user.emailVerified) {
      // nouveau code envoyé automatiquement (sauf si un code vient déjà de partir)
      await sendCode(user, 'VERIFY').catch((err) => {
        if (err.code !== 'TOO_SOON') throw err;
      });
      throw new HttpError(403, 'EMAIL_NOT_VERIFIED', 'Adresse e-mail non vérifiée : saisissez le code reçu par e-mail.');
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

// Code reçu par e-mail → adresse vérifiée, le sportif est connecté
router.post(
  '/verify-email',
  ah(async (req, res) => {
    required(req.body, ['email', 'code']);
    const user = await findByEmail(req.body.email);
    // compte inconnu ou déjà vérifié : aucun jeton sans code valide
    if (!user || user.emailVerified) throw new HttpError(400, 'CODE_INVALID', 'Code invalide ou expiré. Demandez un nouveau code.');
    await checkCode(user, 'VERIFY', req.body.code);
    await user.update({ emailVerified: true });
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

// Renvoyer un code (vérification ou mot de passe oublié). Réponse identique que le compte existe ou non.
router.post(
  '/resend-code',
  ah(async (req, res) => {
    required(req.body, ['email']);
    const purpose = req.body.purpose === 'RESET' ? 'RESET' : 'VERIFY';
    const user = await findByEmail(req.body.email);
    if (user && user.active && (purpose === 'RESET' || !user.emailVerified)) await sendCode(user, purpose);
    res.json({ ok: true });
  })
);

// Mot de passe oublié : envoie un code (sans révéler si l'adresse existe)
router.post(
  '/forgot-password',
  ah(async (req, res) => {
    required(req.body, ['email']);
    const user = await findByEmail(req.body.email);
    if (user && user.active) {
      await sendCode(user, 'RESET').catch((err) => {
        if (err.code !== 'TOO_SOON') throw err;
      });
    }
    res.json({ ok: true });
  })
);

// Nouveau mot de passe avec le code reçu → le compte est aussi considéré comme vérifié
router.post(
  '/reset-password',
  ah(async (req, res) => {
    required(req.body, ['email', 'code', 'password']);
    checkPassword(req.body.password);
    const user = await findByEmail(req.body.email);
    if (!user || !user.active) throw new HttpError(400, 'CODE_INVALID', 'Code invalide ou expiré. Demandez un nouveau code.');
    await checkCode(user, 'RESET', req.body.code);
    await user.update({ passwordHash: await bcrypt.hash(String(req.body.password), 10), emailVerified: true });
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get(
  '/me',
  auth,
  ah(async (req, res) => {
    const user = await User.findByPk(req.user.id, { include: [{ model: Gym, as: 'gym' }] });
    if (!user) throw new HttpError(404, 'NOT_FOUND', 'Utilisateur introuvable.');
    res.json(publicUser(user));
  })
);

module.exports = router;
