// Session : jeton JWT signé (HS256) dans un cookie httpOnly. Chaque requête recharge le compte,
// ce qui permet de couper une session tout de suite (compte désactivé, mot de passe changé, déconnexion partout).
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { HttpError } = require('./errors');
const { SESSION_COOKIE, setSessionCookie } = require('./security');
const { can, STAFF_ROLES } = require('../services/permissions');

const ISSUER = 'kammel';
const TOKEN_DAYS = 7;

function loadSecret() {
  const secret = process.env.JWT_SECRET || '';
  const weak = secret.length < 32 || /change-moi|fitcoach-dev-secret/i.test(secret);
  if (!weak) return secret;
  if (process.env.NODE_ENV === 'production') {
    // jamais de secret faible ou connu en production : refuser de démarrer
    throw new Error('JWT_SECRET manquant ou trop faible (32 caractères aléatoires minimum).');
  }
  console.warn('[sécurité] JWT_SECRET absent ou faible : clé aléatoire temporaire (les sessions tombent au redémarrage).');
  return crypto.randomBytes(48).toString('hex');
}

const SECRET = loadSecret();

const SHORT_HOURS = 12; // « Rester connecté » décoché (PC partagé de l'accueil)

function signToken(user, { remember = true } = {}) {
  return jwt.sign({ sub: String(user.id), tv: user.tokenVersion || 0, rm: remember ? 1 : 0 }, SECRET, {
    algorithm: 'HS256',
    issuer: ISSUER,
    expiresIn: remember ? `${TOKEN_DAYS}d` : `${SHORT_HOURS}h`,
  });
}

// remember = false : cookie de session du navigateur (effacé à la fermeture) et jeton de 12 h
function startSession(res, user, { remember = true } = {}) {
  setSessionCookie(res, signToken(user, { remember }), remember ? TOKEN_DAYS * 86400 : null);
}

function readToken(req) {
  const fromCookie = req.cookies && req.cookies[SESSION_COOKIE];
  if (fromCookie) return fromCookie;
  // « Authorization: Bearer » reste accepté pour les outils (Postman, tests) ; le site utilise le cookie
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// Routes accessibles tant que le mot de passe provisoire n'a pas été changé
const ALLOWED_BEFORE_PASSWORD_CHANGE = new Set(['GET /api/auth/me', 'POST /api/auth/first-password', 'POST /api/auth/logout']);

/**
 * Vérifie la session et charge le compte dans req.user (instance Sequelize, sans le hash du mot de passe).
 */
async function auth(req, res, next) {
  try {
    const token = readToken(req);
    if (!token) throw new HttpError(401, 'AUTH_REQUIRED', 'Connexion requise.');
    let payload;
    try {
      payload = jwt.verify(token, SECRET, { algorithms: ['HS256'], issuer: ISSUER });
    } catch {
      throw new HttpError(401, 'AUTH_INVALID', 'Session expirée, reconnecte-toi.');
    }
    const { User } = require('../models');
    const user = await User.findByPk(Number(payload.sub));
    if (!user || !user.active || user.deletedAt || (user.tokenVersion || 0) !== payload.tv) {
      throw new HttpError(401, 'AUTH_INVALID', 'Session expirée, reconnecte-toi.');
    }
    if (user.mustChangePassword) {
      const route = `${req.method} ${req.originalUrl.split('?')[0]}`.replace(/\/$/, '');
      if (!ALLOWED_BEFORE_PASSWORD_CHANGE.has(route)) {
        throw new HttpError(403, 'PASSWORD_CHANGE_REQUIRED', 'Choisis ton mot de passe pour continuer.');
      }
    }
    req.user = user;
    // session glissante : nouveau jeton si l'actuel a plus d'un jour (sessions longues seulement)
    if (payload.rm !== 0 && payload.iat && Date.now() / 1000 - payload.iat > 86400) startSession(res, user);
    return next();
  } catch (err) {
    return next(err);
  }
}

// Autorise seulement certains rôles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'FORBIDDEN', 'Accès refusé.'));
    }
    return next();
  };
}

// Espace salle : membre de l'équipe rattaché à une salle (RG : chacun ne gère que sa salle)
function requireStaff(req, res, next) {
  if (!req.user || !STAFF_ROLES.includes(req.user.role) || !req.user.gymId) {
    return next(new HttpError(403, 'FORBIDDEN', 'Accès refusé.'));
  }
  return next();
}

// Vérifie une permission de la matrice des rôles (services/permissions.js)
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user || !can(req.user.role, permission)) {
      return next(new HttpError(403, 'FORBIDDEN', 'Accès refusé.'));
    }
    return next();
  };
}

// Clé dérivée pour un autre usage (ex. carte d'accès) : jamais la clé des sessions elle-même
function deriveKey(label) {
  return crypto.createHmac('sha256', SECRET).update(`kammel:${label}`).digest();
}

module.exports = { auth, requireRole, requireStaff, requirePermission, signToken, startSession, deriveKey, TOKEN_DAYS };
