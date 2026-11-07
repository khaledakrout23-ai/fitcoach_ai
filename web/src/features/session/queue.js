// File d'attente des séries (hors ligne) : mémoire + sessionStorage « kammel_pending_sets ».
// Chaque exercice garde seulement sa dernière liste de séries (le PUT remplace tout), rejouée au retour du réseau.
import { api } from '../../lib/api';

const KEY = 'kammel_pending_sets';
let pending = read();
let running = null;

function read() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function write() {
  try {
    if (Object.keys(pending).length) sessionStorage.setItem(KEY, JSON.stringify(pending));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible : la mémoire suffit tant que la page reste ouverte */
  }
}

const keyOf = (sessionId, entryId) => `${sessionId}:${entryId}`;

export function enqueue(sessionId, entryId, setsDone) {
  pending[keyOf(sessionId, entryId)] = { sessionId: Number(sessionId), entryId: Number(entryId), setsDone, seq: Date.now() + Math.random() };
  write();
}

export function pendingCount(sessionId) {
  return Object.values(pending).filter((p) => p.sessionId === Number(sessionId)).length;
}

export function hasPending(sessionId, entryId) {
  return Boolean(pending[keyOf(sessionId, entryId)]);
}

/** Oublie les séries en attente d'une séance (abandon) ou d'un exercice (remplacé) */
export function drop(sessionId, entryId) {
  for (const k of Object.keys(pending)) {
    const p = pending[k];
    if (p.sessionId === Number(sessionId) && (entryId == null || p.entryId === Number(entryId))) delete pending[k];
  }
  write();
}

/**
 * Envoie les séries en attente de la séance. Coupure réseau : on garde et on s'arrête.
 * Autre erreur (séance terminée, exercice supprimé) : la série est abandonnée et l'erreur renvoyée.
 * @returns {Promise<{ view: object|null, error: Error|null, remaining: number }>}
 */
export function flush(sessionId) {
  const id = Number(sessionId);
  const run = async () => {
    let view = null;
    let error = null;
    for (const [k, item] of Object.entries(pending)) {
      if (item.sessionId !== id) continue;
      try {
        view = await api.put(`/sessions/${item.sessionId}/entries/${item.entryId}`, { setsDone: item.setsDone });
        if (pending[k] && pending[k].seq === item.seq) delete pending[k]; // une saisie plus récente attend encore
      } catch (err) {
        if (err && err.status === 0) {
          error = err;
          break;
        }
        delete pending[k];
        error = err;
      }
      write();
    }
    return { view, error, remaining: pendingCount(id) };
  };
  // une seule synchronisation à la fois ; les appels suivants s'enchaînent
  running = (running || Promise.resolve()).then(run, run);
  return running;
}
