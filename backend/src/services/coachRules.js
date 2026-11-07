// Règles déterministes du coach (sans IA) : sujet de la question, zones douloureuses, exercice mentionné.
// Les propositions de changement de séance viennent d'ici, jamais du texte produit par l'IA. Fonctions pures, testées.

// minuscules, sans accents (é → e), apostrophes et ponctuation remplacées par des espaces
function normalize(text) {
  return ` ${String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // accents latins, voyelles et hamza arabes
    .replace(/[’'`]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;
}

// mot entier (latin) ou suite de lettres (arabe) contenue dans le texte normalisé ; « * » final = préfixe
function has(norm, words) {
  return words.some((w) => {
    const prefix = w.endsWith('*');
    const nw = normalize(prefix ? w.slice(0, -1) : w).trim();
    if (!nw) return false;
    if (/[؀-ۿ]/.test(nw)) return norm.includes(nw);
    return prefix ? norm.includes(` ${nw}`) : norm.includes(` ${nw} `);
  });
}

const TOPIC_WORDS = {
  DOULEUR: ['mal', 'douleur*', 'douloureu*', 'bless*', 'pain', 'hurt*', 'hurts', 'injur*', 'sore', 'ache*', 'ألم', 'وجع', 'يوجع', 'توجع', 'إصابة', 'wja3', 'yoja3', 'touja3', 'tewja3', 'oja3', 'mridh', 'mrith', '3andi wja3'],
  REMPLACER: ['remplac*', 'occupe*', 'occupee', 'prise', 'panne', 'cassee', 'casse', 'marche pas', 'alternative*', 'autre exercice', 'busy', 'taken', 'broken', 'replace*', 'swap', 'substitut*', 'machine', 'مشغول', 'مشغولة', 'عطل', 'معطلة', 'بدل', 'نبدل', 'makina', 'mechghoula', 'mechghoul', 'mchaghla', '3atla', 'nbadel', 'badel'],
  NUTRITION: ['manger', 'mange', 'repas', 'calorie*', 'kcal', 'protein*', 'proteine*', 'glucide*', 'lipide*', 'regime', 'nutrition', 'diete', 'eau', 'boire', 'faim', 'petit dej*', 'dejeuner', 'diner', 'eat', 'eating', 'food', 'meal*', 'diet', 'water', 'snack', 'أكل', 'ماكلة', 'بروتين', 'ماء', 'نشرب', 'makla', 'nekel', 'nekol', 'nechreb', 'couscous', 'lablabi', 'ojja', 'brik'],
  PROGRAMME: ['programme', 'program', 'planning', 'seance*', 'entrainement*', 'semaine', 'jour*', 'workout', 'session', 'training', 'routine', 'split', 'برنامج', 'حصة', 'تمرين', 'barnemej', 'barnamej', 'hessa', 'tamrin'],
  MOTIVATION: ['motivation', 'motive*', 'fatigu*', 'flemme', 'envie', 'decourag*', 'abandon*', 'lazy', 'tired', 'motivat*', 'give up', 'تعب', 'تعبان', 'كسل', 'ta3ban', 'mkasel', 'fadit', 'fdit'],
};
const TOPIC_ORDER = ['DOULEUR', 'REMPLACER', 'NUTRITION', 'PROGRAMME', 'MOTIVATION'];

/** Sujet principal d'une question (statistiques anonymes) */
function detectTopic(text) {
  const norm = normalize(text);
  return TOPIC_ORDER.find((t) => has(norm, TOPIC_WORDS[t])) || 'AUTRE';
}

// Mots des zones de douleur. « haut du dos » est cherché avant « dos ».
const ZONE_WORDS = [
  ['haut_dos', ['haut du dos', 'upper back', 'omoplate*', 'trapeze*', 'اعلى الظهر', 'أعلى الظهر']],
  ['dos', ['bas du dos', 'dos', 'lombaire*', 'lombalgie', 'lower back', 'back', 'ظهر', 'الظهر', 'dhar', 'dhahr', 'dhhar']],
  ['epaule', ['epaule*', 'shoulder*', 'كتف', 'الكتف', 'ktef', 'ktafi', 'ktefi']],
  ['genou', ['genou*', 'knee*', 'ركبة', 'ركبتي', 'الركبة', 'rokba', 'rkobti', 'rokbti', 'rkeb']],
  ['poignet', ['poignet*', 'wrist*', 'معصم', 'm3sam']],
  ['coude', ['coude*', 'elbow*', 'مرفق', 'كوع', 'mirfe9', 'koue3']],
  ['cheville', ['cheville*', 'ankle*', 'كاحل', 'الكاحل', 'ka3ba']],
  ['cou', ['cou', 'nuque', 'neck', 'رقبة', 'الرقبة', 'ra9ba', 'rgba', 'rogba']],
  ['hanche', ['hanche*', 'hip', 'hips', 'ورك', 'الورك', 'حوض']],
];

/** Zones douloureuses citées dans le message (seulement si on parle de douleur) */
function detectPainZones(text) {
  let norm = normalize(text);
  if (!has(norm, TOPIC_WORDS.DOULEUR)) return [];
  const zones = [];
  for (const [zone, words] of ZONE_WORDS) {
    if (has(norm, words)) {
      zones.push(zone);
      if (zone === 'haut_dos') norm = norm.replace(/ haut du dos | upper back /g, ' ');
    }
  }
  return zones;
}

/** Durée de la douleur en jours si elle est indiquée (« depuis 4 jours », « une semaine », « 5 days »…) */
function painDurationDays(text) {
  const norm = normalize(text);
  const m = norm.match(/ (\d{1,3}) (jours?|j|days?|ayem|iyem|يوم|ايام) /);
  if (m) return Number(m[1]);
  if (has(norm, ['semaine*', 'week*', 'jem3a', 'جمعة', 'أسبوع', 'اسبوع'])) return 7;
  if (has(norm, ['mois', 'month*', 'chhar', 'شهر'])) return 30;
  return null;
}

const STOP = new Set(['a', 'au', 'aux', 'la', 'le', 'les', 'de', 'du', 'des', 'et', 'en', 'un', 'une', 'avec', 'sur', 'the', 'with', 'machine', 'barre', 'poulie', 'halteres', 'haltere']);
const tokens = (name) => normalize(String(name).replace(/\(.*?\)/g, ' ')).trim().split(' ').filter((w) => w.length >= 3 && !STOP.has(w));

/**
 * Exercice cité dans le message parmi une liste (séance du jour ou en cours).
 * Un exercice est retenu si tous ses mots importants, ou au moins deux, sont présents.
 * @param {string} text
 * @param {{ id, nameFr, nameEn, nameAr }[]} exercises
 * @returns {object|null}
 */
function matchExercise(text, exercises) {
  const norm = normalize(text);
  let best = null;
  for (const ex of exercises) {
    for (const name of [ex.nameFr, ex.nameEn]) {
      const t = tokens(name || '');
      if (!t.length) continue;
      const found = t.filter((w) => norm.includes(` ${w} `) || norm.includes(` ${w}s `) || (w.endsWith('s') && norm.includes(` ${w.slice(0, -1)} `))).length;
      const ok = found === t.length || found >= 2;
      if (!ok) continue;
      const score = found / t.length + found / 10;
      if (!best || score > best.score) best = { ex, score };
    }
    if (ex.nameAr && String(text).includes(ex.nameAr)) {
      if (!best || best.score < 2) best = { ex, score: 2 };
    }
  }
  return best ? best.ex : null;
}

/** Le membre parle d'une machine prise ou en panne sans la nommer (« elle est occupée ») */
function refersToCurrentMachine(text) {
  const norm = normalize(text);
  return has(norm, ['occupe*', 'occupee', 'prise', 'panne', 'cassee', 'busy', 'taken', 'broken', 'مشغول', 'مشغولة', 'معطلة', 'mechghoula', 'mechghoul', '3atla']);
}

/** Langue de réponse : arabe (ou derja en lettres arabes), anglais, sinon langue du profil */
function replyLanguage(text, profileLanguage = 'fr', languages = { fr: true, derja: true, en: true }) {
  if (/[؀-ۿ]/.test(text) && languages.derja !== false) return 'ar';
  const norm = normalize(text);
  const english = [' the ', ' my ', ' what ', ' how ', ' should ', ' can ', ' is ', ' it ', ' and ', ' hurts ', ' i '].filter((w) => norm.includes(w)).length;
  if (english >= 2 && languages.en !== false) return 'en';
  if (profileLanguage === 'ar' && languages.derja === false) return 'fr';
  if (profileLanguage === 'en' && languages.en === false) return 'fr';
  return profileLanguage;
}

module.exports = { normalize, detectTopic, detectPainZones, painDurationDays, matchExercise, refersToCurrentMachine, replyLanguage, TOPIC_WORDS };
