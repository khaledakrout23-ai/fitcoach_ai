// Client de l'API Express. La session est un cookie httpOnly (inaccessible au JavaScript) ;
// l'en-tête X-Requested-With protège les requêtes qui modifient des données (anti-CSRF).
const BASE = '/api';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Événements globaux : session expirée, mot de passe provisoire à changer
const listeners = new Set();
export function onApiEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(type, detail) {
  for (const fn of listeners) fn(type, detail);
}

function checkPath(path) {
  // uniquement des chemins internes de l'API (« /me/profile »), jamais une URL complète
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new ApiError(0, 'BAD_PATH', 'Chemin invalide.');
  }
}

async function request(method, path, body, { signal, raw = false } = {}) {
  checkPath(path);
  const headers = { Accept: 'application/json', 'X-Requested-With': 'kammel' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'same-origin',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Serveur injoignable.');
  }
  if (raw && res.ok) return res;
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const code = data?.code || (res.status === 429 ? 'TOO_MANY_REQUESTS' : 'ERROR');
    if (res.status === 401 && !path.startsWith('/auth/login')) emit('unauthorized');
    if (res.status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') emit('password-change-required');
    throw new ApiError(res.status, code, data?.message || 'Erreur.', data?.details);
  }
  return data;
}

export const api = {
  get: (path, opts) => request('GET', path, undefined, opts),
  post: (path, body = {}, opts) => request('POST', path, body, opts),
  put: (path, body = {}, opts) => request('PUT', path, body, opts),
  patch: (path, body = {}, opts) => request('PATCH', path, body, opts),
  del: (path, body, opts) => request('DELETE', path, body, opts),
  // URL d'une ressource protégée (photo de panne) utilisable dans <img src>
  url: (path) => {
    checkPath(path);
    return BASE + path;
  },
};

/** Télécharge un fichier de l'API (export CSV, export de mes données) */
export async function download(path, filename) {
  const res = await request('GET', path, undefined, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
