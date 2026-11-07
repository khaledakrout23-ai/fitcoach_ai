// Protections HTTP communes : en-têtes de sécurité, anti-CSRF, limitation du débit, cookies.
// Aucune dépendance externe : moins de code tiers = moins de risque sur la chaîne d'approvisionnement.
const { HttpError } = require('./errors');

const isProd = process.env.NODE_ENV === 'production';

// Origines autorisées à appeler l'API (en plus de la même origine). Ex. CORS_ORIGINS=https://app.kammel.tn
const allowedOrigins = new Set(
  String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
);

// ---------------------------------------------------------------- En-têtes
// Politique du site web (servi par Express en production). L'API JSON n'a besoin de rien.
const WEB_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // attributs style des SVG et de React
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  'frame-src https://www.youtube-nocookie.com',
  "worker-src 'self'",
  "manifest-src 'self'",
].join('; ');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  // caméra : scanner de l'accueil et photos ; micro : saisie vocale du coach
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()');
  if (req.path.startsWith('/api/')) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cache-Control', 'no-store');
  } else {
    res.setHeader('Content-Security-Policy', WEB_CSP);
  }
  if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.removeHeader('X-Powered-By');
  next();
}

// ---------------------------------------------------------------- CORS (liste blanche seulement)
function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Requested-With');
      res.setHeader('Access-Control-Max-Age', '600');
      return res.status(204).end();
    }
  }
  return next();
}

// ---------------------------------------------------------------- Anti-CSRF
// Le cookie de session est SameSite=Strict ; en plus, toute requête qui modifie des données doit porter
// l'en-tête X-Requested-With (un formulaire d'un autre site ne peut pas l'ajouter) et venir d'une origine connue.
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

function sameOrigin(req, origin) {
  try {
    const url = new URL(origin);
    // derrière le proxy de confiance (Cloudflare Pages), l'hôte vu par le navigateur est transmis dans x-forwarded-host
    const host = req.viaTrustedProxy && req.headers['x-forwarded-host'] ? req.headers['x-forwarded-host'] : req.headers.host;
    return url.host === host;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- Proxy de confiance (déploiement Cloudflare Pages → Render)
// Avec PROXY_SECRET, l'API n'accepte que les requêtes qui passent par le proxy du site (en-tête secret) :
// l'adresse Render directe est fermée, et l'adresse IP réelle du client vient de l'en-tête x-client-ip.
// /api/health reste ouvert pour la surveillance de Render.
const PROXY_SECRET = process.env.PROXY_SECRET || '';
function trustedProxy(req, res, next) {
  if (!PROXY_SECRET) return next();
  const given = Buffer.from(String(req.headers['x-kammel-proxy'] || ''));
  const expected = Buffer.from(PROXY_SECRET);
  const ok = given.length === expected.length && require('crypto').timingSafeEqual(given, expected);
  if (!ok) {
    if (req.path === '/health') return next();
    return next(new HttpError(403, 'FORBIDDEN', 'Accès refusé.'));
  }
  req.viaTrustedProxy = true;
  const ip = String(req.headers['x-client-ip'] || '').trim();
  if (/^[0-9a-fA-F:.]{3,45}$/.test(ip)) Object.defineProperty(req, 'ip', { value: ip, configurable: true });
  return next();
}

function csrfGuard(req, res, next) {
  if (SAFE.has(req.method)) return next();
  if (req.headers['x-requested-with'] !== 'kammel') {
    return next(new HttpError(403, 'CSRF', 'Requête refusée.'));
  }
  const origin = req.headers.origin;
  if (origin && !sameOrigin(req, origin) && !allowedOrigins.has(origin)) {
    return next(new HttpError(403, 'CSRF', 'Requête refusée.'));
  }
  return next();
}

// ---------------------------------------------------------------- Limitation du débit (mémoire)
// Fenêtre fixe par clé. Suffisant pour un seul serveur ; derrière plusieurs instances, utiliser Redis.
function rateLimit({ windowMs, max, key = (req) => req.ip, code = 'TOO_MANY_REQUESTS' }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs);
  timer.unref();
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return next(new HttpError(429, code, 'Trop de tentatives. Réessayez dans quelques minutes.'));
    }
    return next();
  };
}

// ---------------------------------------------------------------- Cookies
function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[name] = part.slice(i + 1).trim();
    }
  }
  return out;
}

function cookies(req, res, next) {
  req.cookies = parseCookies(req.headers.cookie);
  next();
}

const SESSION_COOKIE = 'kammel_session';

// maxAgeSec null : cookie de session (effacé à la fermeture du navigateur)
function setSessionCookie(res, token, maxAgeSec) {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, 'Path=/api', 'HttpOnly', 'SameSite=Strict'];
  if (maxAgeSec) parts.push(`Max-Age=${maxAgeSec}`);
  if (isProd || process.env.COOKIE_SECURE === 'true') parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/api', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (isProd || process.env.COOKIE_SECURE === 'true') parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

module.exports = {
  securityHeaders,
  trustedProxy,
  cors,
  csrfGuard,
  rateLimit,
  cookies,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE,
};
