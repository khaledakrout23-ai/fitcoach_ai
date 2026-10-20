const { HttpError } = require('./middleware/errors');

// Retire les champs sensibles avant d'envoyer un utilisateur au client
function publicUser(user) {
  if (!user) return null;
  const data = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
  delete data.passwordHash;
  return data;
}

function toInt(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new HttpError(400, 'VALIDATION', `Champ invalide : ${field}`);
  return n;
}

function required(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) throw new HttpError(400, 'VALIDATION', `Champs obligatoires : ${missing.join(', ')}`);
}

// Copie seulement les champs autorisés (évite qu'un client modifie le rôle, etc.)
function pick(body, fields) {
  const out = {};
  for (const f of fields) if (body[f] !== undefined) out[f] = body[f];
  return out;
}

// Règles du mot de passe : 8 caractères minimum, au moins une majuscule, une minuscule et un chiffre
const PASSWORD_RULES = [
  [(p) => p.length >= 8, '8 caractères minimum'],
  [(p) => /[A-Z]/.test(p), 'une lettre majuscule'],
  [(p) => /[a-z]/.test(p), 'une lettre minuscule'],
  [(p) => /\d/.test(p), 'un chiffre'],
];

function checkPassword(password) {
  const p = String(password || '');
  const missing = PASSWORD_RULES.filter(([ok]) => !ok(p)).map(([, label]) => label);
  if (missing.length) throw new HttpError(400, 'WEAK_PASSWORD', `Mot de passe trop faible : ${missing.join(', ')}.`);
  return p;
}

// Statut d'un abonnement (RG : rappel 3 jours avant la fin)
function subscriptionStatus(endDate) {
  const end = new Date(`${endDate}T23:59:59`);
  const days = Math.ceil((end - new Date()) / 86400000);
  if (days < 0) return { status: 'EXPIRE', daysLeft: days };
  if (days <= 7) return { status: 'EXPIRE_BIENTOT', daysLeft: days };
  return { status: 'ACTIF', daysLeft: days };
}

module.exports = { publicUser, toInt, required, pick, subscriptionStatus, checkPassword };
