// Étapes de l'onboarding, validation des réponses et sauvegarde temporaire (sessionStorage de l'onglet)
import { healthyRange } from '../../lib/targets';

export const STORAGE_KEY = 'kammel_onboarding';

export const GOALS = ['PERTE_POIDS', 'PRISE_MASSE', 'FORME', 'FORCE'];
export const ACTIVITIES = ['SEDENTAIRE', 'LEGER', 'ACTIF', 'TRES_ACTIF'];
export const LEVELS = ['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE'];
export const DIETS = ['EQUILIBRE', 'PROTEINES', 'VEGETARIEN', 'LOW_CARB'];
export const SESSION_MINUTES = [30, 45, 60, 90];

export const LIMITS = {
  height: [100, 250],
  weight: [30, 300],
  minAge: 12,
  maxAge: 90,
  days: [2, 6],
};

export const thisYear = () => new Date().getFullYear();

/** 4 parties ; les écrans « final » (résultats, courbe, récapitulatif) n'ont pas de barre de progression */
export const STEPS = [
  { id: 'goal', section: 0 },
  { id: 'sex', section: 1 },
  { id: 'birthYear', section: 1 },
  { id: 'height', section: 1 },
  { id: 'weight', section: 1 },
  { id: 'goalWeight', section: 1, skip: (a) => a.goal === 'FORME' },
  { id: 'activity', section: 1 },
  { id: 'level', section: 2 },
  { id: 'pains', section: 2 },
  { id: 'days', section: 2 },
  { id: 'diet', section: 3 },
  { id: 'consent', section: 3 },
  { id: 'results', final: true },
  { id: 'timeline', final: true },
  { id: 'summary', final: true },
];

export const stepById = (id) => STEPS.find((s) => s.id === id);
export const visibleSteps = (a) => STEPS.filter((s) => !s.skip || !s.skip(a));

const inRange = (v, [min, max]) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/** Erreur d'une étape (clé de traduction + variables) ou null */
export function stepError(id, a) {
  switch (id) {
    case 'birthYear': {
      if (a.birthYear == null) return null;
      const age = thisYear() - a.birthYear;
      return age < LIMITS.minAge || age > LIMITS.maxAge ? { key: 'onb.birth.error' } : null;
    }
    case 'height':
      return a.height != null && !inRange(a.height, LIMITS.height) ? { key: 'onb.height.error' } : null;
    case 'weight':
      return a.weight != null && !inRange(a.weight, LIMITS.weight) ? { key: 'onb.weight.error' } : null;
    case 'goalWeight': {
      if (a.goalWeight == null) return null;
      if (!inRange(a.goalWeight, LIMITS.weight)) return { key: 'onb.weight.error' };
      if (a.goal === 'PERTE_POIDS' && a.weight && a.goalWeight >= a.weight) return { key: 'onb.target.errLose', w: a.weight };
      if (a.goal === 'PRISE_MASSE' && a.weight && a.goalWeight <= a.weight) return { key: 'onb.target.errGain', w: a.weight };
      return null;
    }
    case 'days': {
      const n = (a.trainingDays || []).length;
      if (n > LIMITS.days[1]) return { key: 'onb.days.max' };
      return null;
    }
    default:
      return null;
  }
}

/** L'étape a une réponse valide */
export function isValid(id, a) {
  if (stepError(id, a)) return false;
  switch (id) {
    case 'goal':
      return GOALS.includes(a.goal);
    case 'sex':
      return ['H', 'F', 'NA'].includes(a.sex);
    case 'birthYear':
      return Number.isInteger(a.birthYear);
    case 'height':
      return Number.isInteger(a.height) && inRange(a.height, LIMITS.height);
    case 'weight':
      return inRange(a.weight, LIMITS.weight);
    case 'goalWeight':
      return inRange(a.goalWeight, LIMITS.weight);
    case 'activity':
      return ACTIVITIES.includes(a.activity);
    case 'level':
      return LEVELS.includes(a.level);
    case 'pains':
      return Array.isArray(a.injuries);
    case 'days': {
      const n = (a.trainingDays || []).length;
      return n >= LIMITS.days[0] && n <= LIMITS.days[1] && SESSION_MINUTES.includes(a.sessionMinutes);
    }
    case 'diet':
      return DIETS.includes(a.dietStyle);
    case 'consent':
      return a.healthConsent === true;
    default:
      return true;
  }
}

/** Première question sans réponse valide (null si tout est rempli) */
export function firstIncomplete(a) {
  return visibleSteps(a).find((s) => !s.final && !isValid(s.id, a)) || null;
}

const round1 = (n) => Math.round(n * 10) / 10;

/** Poids visé proposé : borne du poids sain la plus proche, sinon ±3 kg */
export function suggestedGoalWeight(a) {
  if (!a.weight) return null;
  const range = healthyRange(a.height);
  if (a.goal === 'PERTE_POIDS') {
    if (range && a.weight > range[1]) return range[1];
    return round1(Math.max(LIMITS.weight[0], a.weight - 3));
  }
  if (a.goal === 'PRISE_MASSE') {
    if (range && a.weight < range[0]) return range[0];
    return round1(Math.min(LIMITS.weight[1], a.weight + 3));
  }
  return a.weight;
}

/** Corps de PUT /api/me/onboarding */
export function payloadOf(a) {
  return {
    goal: a.goal,
    sex: a.sex,
    birthYear: a.birthYear,
    height: a.height,
    weight: a.weight,
    goalWeight: a.goal === 'FORME' ? null : a.goalWeight,
    activity: a.activity,
    level: a.level,
    trainingDays: [...a.trainingDays].sort((x, y) => x - y),
    sessionMinutes: a.sessionMinutes,
    injuries: a.injuries || [],
    dietStyle: a.dietStyle,
    healthConsent: true,
  };
}

const EMPTY = {
  goal: null,
  sex: null,
  birthYear: null,
  height: null,
  weight: null,
  goalWeight: null,
  activity: null,
  level: null,
  injuries: null,
  trainingDays: [],
  sessionMinutes: 60,
  dietStyle: null,
  healthConsent: false,
};

/** Réponses déjà connues du compte (rare : profil partiellement rempli) */
function fromUser(user) {
  const out = {};
  for (const k of ['goal', 'sex', 'birthYear', 'height', 'weight', 'goalWeight', 'activity', 'level', 'dietStyle']) {
    if (user?.[k] != null) out[k] = user[k];
  }
  if (Array.isArray(user?.trainingDays) && user.trainingDays.length) out.trainingDays = user.trainingDays;
  if (SESSION_MINUTES.includes(user?.sessionMinutes)) out.sessionMinutes = user.sessionMinutes;
  if (Array.isArray(user?.injuries) && user.onboardedAt) out.injuries = user.injuries;
  for (const k of ['weight', 'goalWeight', 'height']) if (out[k] != null) out[k] = Number(out[k]);
  return out;
}

/** Réponses gardées dans l'onglet (rechargement) — seulement pour ce compte */
export function loadAnswers(user) {
  let saved = null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.uid === user?.id && parsed.answers && typeof parsed.answers === 'object') saved = parsed.answers;
  } catch {
    /* stockage indisponible ou illisible */
  }
  const merged = { ...EMPTY, ...fromUser(user), ...(saved || {}) };
  // valeurs relues : on ne garde que des types attendus
  if (!Array.isArray(merged.trainingDays)) merged.trainingDays = [];
  merged.trainingDays = merged.trainingDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (merged.injuries != null && !Array.isArray(merged.injuries)) merged.injuries = null;
  return merged;
}

export function saveAnswers(user, answers) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ uid: user?.id, answers }));
  } catch {
    /* stockage plein ou indisponible : on garde la mémoire */
  }
}

export function clearAnswers() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
