// Réglages d'une salle (écran « Paramètres » du gérant). Stockés en JSON dans gyms.settings ;
// les valeurs par défaut ci-dessous sont fusionnées à la lecture, donc une nouvelle option n'a pas besoin de migration.
const { STAFF_ROLES } = require('./permissions');

const DEFAULTS = {
  features: {
    live: true, // Gym en direct (nombre de personnes et affluence)
    alternatives: true, // alternatives aux machines
    reports: true, // signaler une panne
    coach: true, // onglet Coach
    meals: true, // repas et eau
    painProgram: true, // programme adapté aux douleurs
    inAppPurchase: false, // achat d'abonnement dans l'app (D17 / Flouci) — nécessite un contrat de paiement
  },
  languages: { fr: true, ar: true, en: true, default: 'fr' },
  paymentMethods: { ESPECES: true, CARTE: true, D17: true, FLOUCI: true, VIREMENT: false },
  live: {
    calmThreshold: 25, // « salle calme » sous ce nombre
    alertAbove: 100, // alerte à l'équipe au-delà
    showCount: true, // afficher le nombre dans l'app (jamais de noms)
    autoCheckoutHours: 3, // sortie automatique après 3 h sans badge de sortie
  },
  rules: {
    registrationFee: 20, // TND
    graceDays: 3, // entrée autorisée avec alerte
    maxFreezeDaysPerYear: 30,
  },
  zones: ['Machines', 'Poids libres', 'Cardio'],
  coach: {
    proposeChanges: true, // le membre doit appuyer sur « Appliquer »
    addPainWithConsent: true,
    languages: { fr: true, derja: true, en: true },
    safety: { notMedical: true, physioAfter3Days: true, noSupplements: true },
    physio: { name: '', phone: '' },
  },
  automations: {
    expiry: { enabled: true, daysBefore: 4, hour: 9 },
    calm: { enabled: true },
    repaired: { enabled: true },
    inactive: { enabled: true, days: 14 },
    welcome: { enabled: true },
  },
  privacy: { checkinRetentionMonths: 12 },
};

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

// Fusion profonde : seules les clés connues des valeurs par défaut sont gardées, avec le même type
function merge(defaults, value) {
  if (!isObject(defaults)) {
    if (Array.isArray(defaults)) return Array.isArray(value) ? value : defaults;
    if (typeof defaults === 'number' && typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
    return typeof value === typeof defaults ? value : defaults;
  }
  const out = {};
  for (const key of Object.keys(defaults)) out[key] = merge(defaults[key], isObject(value) ? value[key] : undefined);
  return out;
}

function gymSettings(gym) {
  return merge(DEFAULTS, gym && gym.settings);
}

// Nettoie des réglages envoyés par le gérant (types vérifiés, bornes raisonnables)
function cleanSettings(current, incoming) {
  const next = merge(DEFAULTS, merge(merge(DEFAULTS, current), incoming));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
  next.live.calmThreshold = clamp(next.live.calmThreshold, 0, 2000);
  next.live.alertAbove = clamp(next.live.alertAbove, 1, 5000);
  next.live.autoCheckoutHours = clamp(next.live.autoCheckoutHours, 1, 12);
  next.rules.registrationFee = Math.min(10000, Math.max(0, Number(next.rules.registrationFee) || 0));
  next.rules.graceDays = clamp(next.rules.graceDays, 0, 15);
  next.rules.maxFreezeDaysPerYear = clamp(next.rules.maxFreezeDaysPerYear, 0, 180);
  next.zones = next.zones.map((z) => String(z).trim().slice(0, 40)).filter(Boolean).slice(0, 20);
  next.coach.physio.name = String(next.coach.physio.name || '').slice(0, 80);
  next.coach.physio.phone = String(next.coach.physio.phone || '').slice(0, 30);
  next.automations.expiry.daysBefore = clamp(next.automations.expiry.daysBefore, 1, 30);
  next.automations.expiry.hour = clamp(next.automations.expiry.hour, 6, 21);
  next.automations.inactive.days = clamp(next.automations.inactive.days, 3, 90);
  next.privacy.checkinRetentionMonths = clamp(next.privacy.checkinRetentionMonths, 1, 36);
  if (!['fr', 'ar', 'en'].includes(next.languages.default)) next.languages.default = 'fr';
  return next;
}

// Ce que le site reçoit avec /auth/me : l'équipe voit tout, un membre seulement ce qui change son app
function publicGymSettings(gym, role) {
  const s = gymSettings(gym);
  if (STAFF_ROLES.includes(role) || role === 'ADMIN') return s;
  return {
    features: s.features,
    languages: s.languages,
    live: { calmThreshold: s.live.calmThreshold, showCount: s.live.showCount },
  };
}

module.exports = { DEFAULTS, gymSettings, cleanSettings, publicGymSettings };
