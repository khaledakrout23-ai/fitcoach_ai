// =============================================================================
//  Génération d'un programme par règles (utilisée sans clé IA, ou si l'IA échoue)
//  Ne dépend pas de la base de données : testée dans test/.
// =============================================================================
const { isDoable, hitsInjury, BODYWEIGHT } = require('./substitution');
const { LEVEL_VALUE } = require('./constants');

// Un "créneau" = un muscle + les types de mouvement préférés
const DAY_TYPES = {
  FULL_A: {
    fr: 'Corps entier A',
    ar: 'الجسم كاملاً أ',
    slots: [
      ['quadriceps', ['squat']],
      ['pectoraux', ['poussee_horizontale']],
      ['dos', ['tirage_vertical', 'tirage_horizontal']],
      ['ischios', ['charniere']],
      ['epaules', ['poussee_verticale']],
      ['abdos', ['gainage']],
    ],
  },
  FULL_B: {
    fr: 'Corps entier B',
    ar: 'الجسم كاملاً ب',
    slots: [
      ['ischios', ['charniere']],
      ['dos', ['tirage_horizontal']],
      ['quadriceps', ['fente', 'squat']],
      ['pectoraux', ['poussee_horizontale']],
      ['biceps', ['isolation']],
      ['abdos', ['isolation', 'gainage']],
    ],
  },
  FULL_C: {
    fr: 'Corps entier C',
    ar: 'الجسم كاملاً ج',
    slots: [
      ['quadriceps', ['squat']],
      ['epaules', ['poussee_verticale']],
      ['dos', ['tirage_vertical']],
      ['fessiers', ['charniere']],
      ['triceps', ['isolation']],
      ['mollets', ['isolation']],
    ],
  },
  UPPER: {
    fr: 'Haut du corps',
    ar: 'الجزء العلوي',
    slots: [
      ['pectoraux', ['poussee_horizontale']],
      ['dos', ['tirage_horizontal']],
      ['epaules', ['poussee_verticale']],
      ['dos', ['tirage_vertical']],
      ['biceps', ['isolation']],
      ['triceps', ['isolation']],
    ],
  },
  LOWER: {
    fr: 'Bas du corps',
    ar: 'الجزء السفلي',
    slots: [
      ['quadriceps', ['squat']],
      ['ischios', ['charniere']],
      ['quadriceps', ['fente', 'isolation']],
      ['ischios', ['isolation']],
      ['mollets', ['isolation']],
      ['abdos', ['gainage', 'isolation']],
    ],
  },
  PUSH: {
    fr: 'Poussée (pecs, épaules, triceps)',
    ar: 'دفع (صدر، أكتاف، تراي)',
    slots: [
      ['pectoraux', ['poussee_horizontale']],
      ['epaules', ['poussee_verticale']],
      ['pectoraux', ['isolation', 'poussee_horizontale']],
      ['epaules', ['isolation']],
      ['triceps', ['isolation']],
    ],
  },
  PULL: {
    fr: 'Tirage (dos, biceps)',
    ar: 'سحب (ظهر، باي)',
    slots: [
      ['dos', ['tirage_vertical']],
      ['dos', ['tirage_horizontal']],
      ['epaules', ['tirage_horizontal']],
      ['biceps', ['isolation']],
      ['abdos', ['isolation', 'gainage']],
    ],
  },
  LEGS: {
    fr: 'Jambes',
    ar: 'الأرجل',
    slots: [
      ['quadriceps', ['squat']],
      ['ischios', ['charniere']],
      ['fessiers', ['charniere', 'isolation']],
      ['quadriceps', ['isolation', 'fente']],
      ['mollets', ['isolation']],
    ],
  },
};

const SPLITS = {
  2: ['FULL_A', 'FULL_B'],
  3: ['FULL_A', 'FULL_B', 'FULL_C'],
  4: ['UPPER', 'LOWER', 'UPPER', 'LOWER'],
  5: ['PUSH', 'PULL', 'LEGS', 'UPPER', 'LOWER'],
  6: ['PUSH', 'PULL', 'LEGS', 'PUSH', 'PULL', 'LEGS'],
};

// Séries / répétitions / repos selon l'objectif
const PARAMS = {
  FORCE: { sets: 4, reps: '5-6', restSec: 150 },
  PRISE_MASSE: { sets: 4, reps: '8-12', restSec: 90 },
  PERTE_POIDS: { sets: 3, reps: '12-15', restSec: 45 },
  FORME: { sets: 3, reps: '10-12', restSec: 60 },
};

const GOAL_TITLES = {
  FORCE: 'Force',
  PRISE_MASSE: 'Prise de masse',
  PERTE_POIDS: 'Perte de poids',
  FORME: 'Remise en forme',
};

// Créneaux de secours si une journée est trop courte (ex. blessure au genou : pas de quadriceps)
const FILLERS = [
  ['fessiers', ['isolation', 'charniere']],
  ['ischios', ['isolation', 'charniere']],
  ['abdos', ['gainage', 'isolation']],
  ['abdos', ['isolation', 'gainage']],
  ['mollets', ['isolation']],
];

function clampDays(days) {
  const n = Number(days) || 3;
  return Math.min(6, Math.max(2, n));
}

function pickExercise(candidates, muscle, patterns, levelValue, used, variant) {
  const list = candidates
    .filter((c) => c.primaryMuscle === muscle && !used.has(c.id))
    .map((c) => {
      const patternRank = patterns.indexOf(c.pattern);
      let score = patternRank === -1 ? 0 : 10 - patternRank * 2;
      score -= Math.abs(c.difficulty - levelValue) * 2;
      if (c.equipmentCode === BODYWEIGHT && levelValue > 1) score -= 1; // on préfère charger un peu
      return { c, score };
    })
    .sort((a, b) => b.score - a.score || a.c.id - b.c.id);
  if (!list.length) return null;
  // variante : pour un jour répété (ex. 2e "Haut du corps"), on prend un autre exercice si possible
  return list[Math.min(variant, list.length - 1)].c;
}

/**
 * @returns {{ title, days: [{ dayIndex, labelFr, labelAr, items: [{ exerciseId, sets, reps, restSec }] }] }}
 */
function generateProgram({ profile, catalog, availableEquipment }) {
  const goal = PARAMS[profile.goal] ? profile.goal : 'FORME';
  const level = LEVEL_VALUE[profile.level] || 1;
  const injuries = profile.injuries || [];
  const days = clampDays(profile.daysPerWeek);
  const available = new Set([...availableEquipment, BODYWEIGHT]);

  const candidates = catalog.filter(
    (c) => isDoable(c, available) && !hitsInjury(c, injuries) && c.difficulty <= level + 1
  );

  const params = { ...PARAMS[goal] };
  if (level === 1) params.sets = Math.max(2, params.sets - 1); // débutant : une série de moins

  const seen = {};
  const result = SPLITS[days].map((type, i) => {
    seen[type] = (seen[type] || 0) + 1;
    const variant = seen[type] - 1;
    const def = DAY_TYPES[type];
    const used = new Set();
    const items = [];
    const slots = [...def.slots];
    // Si un créneau est impossible (blessure, matériel absent), on ajoute un créneau de secours
    let missing = 0;
    for (const [muscle, patterns] of def.slots) {
      if (!pickExercise(candidates, muscle, patterns, level, new Set(), 0)) missing += 1;
    }
    slots.push(...FILLERS.slice(0, missing));

    for (const [muscle, patterns] of slots) {
      const ex = pickExercise(candidates, muscle, patterns, level, used, variant);
      if (!ex) continue;
      used.add(ex.id);
      const isCore = ex.primaryMuscle === 'abdos' && ex.pattern === 'gainage';
      items.push({
        exerciseId: ex.id,
        sets: params.sets,
        reps: isCore ? '30-45 s' : ex.primaryMuscle === 'mollets' ? '12-15' : params.reps,
        restSec: params.restSec,
      });
    }
    const suffix = variant > 0 ? ` (${variant + 1})` : '';
    return { dayIndex: i + 1, labelFr: def.fr + suffix, labelAr: def.ar + suffix, items };
  });

  return { title: `${GOAL_TITLES[goal]} · ${days} jours / semaine`, days: result };
}

module.exports = { generateProgram, DAY_TYPES, SPLITS, PARAMS };
