// Carte d'accès du membre : QR code qui change toutes les 30 secondes (HMAC signé par le serveur).
// Une capture d'écran partagée ne sert que quelques secondes ; le code ne contient aucune donnée personnelle.
const crypto = require('crypto');

const STEP_SECONDS = 30;
const ACCEPTED_STEPS = 2; // tolérance : code affiché il y a moins de ~60 s
const PREFIX = 'K1';

let key = null;
function getKey() {
  if (!key) key = require('../middleware/auth').deriveKey('access-pass');
  return key;
}

function signature(userId, step) {
  return crypto.createHmac('sha256', getKey()).update(`${userId}.${step}`).digest('base64url').slice(0, 16);
}

function currentStep(now = Date.now()) {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

/** Code à afficher dans le QR du membre */
function issuePass(userId, now = Date.now()) {
  const step = currentStep(now);
  return {
    code: `${PREFIX}.${userId}.${step}.${signature(userId, step)}`,
    expiresAt: new Date((step + 1) * STEP_SECONDS * 1000).toISOString(),
    refreshSeconds: STEP_SECONDS,
  };
}

/**
 * Vérifie un code scanné.
 * @returns {number|null} id du membre, ou null si le code est faux ou trop ancien
 */
function verifyPass(code, now = Date.now()) {
  const m = /^K1\.(\d{1,10})\.(\d{1,12})\.([A-Za-z0-9_-]{16})$/.exec(String(code || '').trim());
  if (!m) return null;
  const userId = Number(m[1]);
  const step = Number(m[2]);
  const current = currentStep(now);
  if (step > current || current - step > ACCEPTED_STEPS) return null;
  const expected = Buffer.from(signature(userId, step));
  const given = Buffer.from(m[3]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  return userId;
}

module.exports = { issuePass, verifyPass, STEP_SECONDS };
