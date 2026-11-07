const crypto = require('crypto');
const { HttpError } = require('./middleware/errors');

// Champs jamais envoyés au site
const PRIVATE_FIELDS = ['passwordHash', 'tokenVersion', 'failedLogins', 'lockedUntil', 'deletedAt'];

// Retire les champs sensibles avant d'envoyer un utilisateur au client
function publicUser(user) {
  if (!user) return null;
  const data = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
  for (const f of PRIVATE_FIELDS) delete data[f];
  return data;
}

// Champs de santé : visibles par le membre, le gérant et le coach seulement
const HEALTH_FIELDS = [
  'sex', 'birthYear', 'age', 'weight', 'height', 'goalWeight', 'goal', 'level', 'activity',
  'trainingDays', 'daysPerWeek', 'sessionMinutes', 'injuries', 'dietStyle', 'healthConsent',
];

function withoutHealth(data) {
  const out = { ...data };
  for (const f of HEALTH_FIELDS) delete out[f];
  return out;
}

function toInt(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new HttpError(400, 'VALIDATION', `Champ invalide : ${field}`);
  return n;
}

// Nombre borné ; lève une erreur VALIDATION si hors limites
function num(value, field, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw new HttpError(400, 'VALIDATION', `Champ invalide : ${field}`);
  }
  return n;
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw new HttpError(400, 'VALIDATION', `Champ invalide : ${field}`);
  return value;
}

// Texte nettoyé (espaces, longueur maximale) ; vide → null
function text(value, max = 200) {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return s || null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isoDate(value, field) {
  if (!ISO_DATE.test(String(value || '')) || Number.isNaN(new Date(`${value}T12:00:00`).getTime())) {
    throw new HttpError(400, 'VALIDATION', `Date invalide : ${field}`);
  }
  return value;
}

function required(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) throw new HttpError(400, 'VALIDATION', `Champs obligatoires : ${missing.join(', ')}`);
}

// Copie seulement les champs autorisés (évite qu'un client modifie le rôle, etc.)
function pick(body, fields) {
  const out = {};
  for (const f of fields) if (body && body[f] !== undefined) out[f] = body[f];
  return out;
}

// ---------------------------------------------------------------- Téléphone (Tunisie par défaut)
// « 22 345 678 », « +216 22345678 », « 0021622345678 » → « +21622345678 »
function normalizePhone(value) {
  let digits = String(value || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (/^\d{8}$/.test(digits)) digits = `+216${digits}`;
  if (/^216\d{8}$/.test(digits)) digits = `+${digits}`;
  return /^\+\d{8,15}$/.test(digits) ? digits : null;
}

const normEmail = (email) => String(email || '').toLowerCase().trim();

// ---------------------------------------------------------------- Mots de passe
// Mots de passe trop courants (les premiers de toutes les fuites), refusés même s'ils respectent les règles
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'azerty123', 'qwerty123', 'abc12345', 'iloveyou1',
  'motdepasse1', 'kammel123', 'fitcoach1', 'tunisie123', 'admin123', 'welcome1', 'aa123456', 'a1234567', '11111111',
  '00000000', 'password123', 'qwertyuiop1', 'azertyuiop1', 'sunshine1', 'football1', 'princess1',
]);

function passwordProblems(password, { temporary } = {}) {
  const p = String(password || '');
  const problems = [];
  if (p.length < 8) problems.push('MIN_LENGTH');
  if (p.length > 128) problems.push('MAX_LENGTH');
  if (!/[A-Za-z؀-ۿ]/.test(p) || !/\d/.test(p)) problems.push('LETTER_AND_DIGIT');
  if (COMMON_PASSWORDS.has(p.toLowerCase())) problems.push('TOO_COMMON');
  if (temporary && p === temporary) problems.push('SAME_AS_TEMPORARY');
  return problems;
}

function checkPassword(password, options) {
  const problems = passwordProblems(password, options);
  if (problems.length) {
    const err = new HttpError(400, 'WEAK_PASSWORD', 'Mot de passe trop faible : 8 caractères minimum, avec au moins une lettre et un chiffre.');
    err.details = problems;
    throw err;
  }
  return String(password);
}

// Mot de passe provisoire lisible au comptoir (pas de 0/O, 1/I/L)
const TEMP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function temporaryPassword(length = 8) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += TEMP_ALPHABET[crypto.randomInt(0, TEMP_ALPHABET.length)];
  // au moins un chiffre pour respecter la règle « lettre + chiffre »
  if (!/\d/.test(out)) out = out.slice(0, -1) + String(crypto.randomInt(2, 10));
  if (!/[A-Z]/.test(out)) out = TEMP_ALPHABET[crypto.randomInt(0, 23)] + out.slice(1);
  return out;
}

// ---------------------------------------------------------------- Dates locales
function localDate(d = new Date()) {
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(date, n) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

function addMonths(date, n) {
  const d = new Date(`${date}T12:00:00`);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return localDate(d);
}

// Fin d'une formule commencée à « start » : 1 mois du 8 oct. → 7 nov. inclus
function planEnd(start, plan) {
  if (plan.durationUnit === 'DAY') return addDays(start, Math.max(1, plan.duration) - 1);
  return addDays(addMonths(start, Math.max(1, plan.duration)), -1);
}

function daysBetween(from, to) {
  return Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);
}

/**
 * Statut d'un abonnement à une date donnée.
 * ACTIF · EXPIRE_BIENTOT (≤ 7 j) · GRACE (expiré depuis ≤ graceDays : entrée autorisée avec alerte) · EXPIRE · GELE
 */
function subscriptionStatus(sub, { today = localDate(), graceDays = 0 } = {}) {
  if (!sub) return { status: 'AUCUN', daysLeft: null };
  const endDate = typeof sub === 'string' ? sub : sub.endDate;
  if (sub.frozenFrom && sub.frozenUntil && today >= sub.frozenFrom && today <= sub.frozenUntil) {
    return { status: 'GELE', daysLeft: daysBetween(today, endDate), frozenUntil: sub.frozenUntil };
  }
  const daysLeft = daysBetween(today, endDate);
  if (daysLeft < 0) {
    return { status: -daysLeft <= graceDays ? 'GRACE' : 'EXPIRE', daysLeft };
  }
  if (daysLeft <= 7) return { status: 'EXPIRE_BIENTOT', daysLeft };
  return { status: 'ACTIF', daysLeft };
}

module.exports = {
  publicUser,
  withoutHealth,
  HEALTH_FIELDS,
  toInt,
  num,
  oneOf,
  text,
  isoDate,
  required,
  pick,
  normalizePhone,
  normEmail,
  passwordProblems,
  checkPassword,
  temporaryPassword,
  localDate,
  addDays,
  addMonths,
  planEnd,
  daysBetween,
  subscriptionStatus,
};
