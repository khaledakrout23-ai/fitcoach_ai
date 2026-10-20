// =============================================================================
//  Algorithme de remplacement d'un exercice (fonction principale du projet)
//
//  Quand une machine est occupée, absente ou en panne, on cherche des exercices :
//    1. qui travaillent le même muscle principal (RG3),
//    2. faisables avec le matériel disponible dans la salle (RG2),
//    3. qui n'utilisent pas la machine indisponible,
//    4. qui ne sollicitent pas une zone blessée (RG5).
//  Chaque candidat reçoit un score, et on garde les 3 meilleurs (RG4).
//
//  Ce fichier ne dépend pas de la base de données : il est testé dans test/.
// =============================================================================
const { LEVEL_VALUE } = require('./constants');

const BODYWEIGHT = 'poids_du_corps';

// Un exercice "normalisé" : { id, nameFr, primaryMuscle, secondaryMuscles[], pattern,
//   equipmentCode, equipmentCategory, accessories[], difficulty, injuryZones[] }

function isDoable(exercise, available) {
  return [exercise.equipmentCode, ...exercise.accessories].every((code) => code === BODYWEIGHT || available.has(code));
}

function hitsInjury(exercise, injuries) {
  return exercise.injuryZones.some((zone) => injuries.includes(zone));
}

function scoreCandidate(candidate, original, levelValue, history) {
  let score = 0;
  const reasons = [];
  if (candidate.pattern === original.pattern) {
    score += 3;
    reasons.push('SAME_PATTERN');
  }
  const shared = candidate.secondaryMuscles.filter((m) => original.secondaryMuscles.includes(m));
  if (shared.length) {
    score += shared.length;
    reasons.push('SHARED_MUSCLES');
  }
  const gap = Math.abs(candidate.difficulty - levelValue);
  if (gap === 0) {
    score += 2;
    reasons.push('LEVEL_MATCH');
  } else if (gap === 1) {
    score += 1;
  }
  if (history.has(candidate.id)) {
    score += 1;
    reasons.push('ALREADY_DONE');
  }
  return { score, reasons, sharedMuscles: shared };
}

// Conseil de charge quand on passe d'une machine à des poids libres ou au poids du corps
function loadAdvice(original, alternative) {
  if (alternative.equipmentCode === BODYWEIGHT) return 'BODYWEIGHT';
  if (original.equipmentCategory === 'MACHINE' && alternative.equipmentCategory !== 'MACHINE') return 'START_LIGHTER';
  return 'SAME_EFFORT';
}

/**
 * @param {object} params
 * @param {object} params.original        exercice à remplacer
 * @param {object[]} params.catalog       tous les exercices
 * @param {string[]} params.availableEquipment codes d'équipement en service dans la salle
 * @param {string} [params.level]         DEBUTANT | INTERMEDIAIRE | AVANCE
 * @param {string[]} [params.injuries]    zones blessées déclarées
 * @param {number[]} [params.history]     ids des exercices déjà faits
 * @param {number} [params.limit]
 */
function findAlternatives({ original, catalog, availableEquipment, level = 'INTERMEDIAIRE', injuries = [], history = [], limit = 3 }) {
  const available = new Set(availableEquipment);
  available.add(BODYWEIGHT);
  // la machine prise / absente / en panne n'est pas utilisable
  if (original.equipmentCode !== BODYWEIGHT) available.delete(original.equipmentCode);

  const levelValue = LEVEL_VALUE[level] || 2;
  const done = new Set(history);

  const usable = (c) =>
    c.id !== original.id && isDoable(c, available) && !hitsInjury(c, injuries) && c.difficulty <= levelValue + 1;

  const rank = (list, relaxed) =>
    list
      .map((c) => ({ exercise: c, relaxed, advice: loadAdvice(original, c), ...scoreCandidate(c, original, levelValue, done) }))
      .sort((a, b) => b.score - a.score || a.exercise.difficulty - b.exercise.difficulty || a.exercise.id - b.exercise.id);

  // 1er passage : même muscle principal
  let results = rank(catalog.filter((c) => usable(c) && c.primaryMuscle === original.primaryMuscle), false);

  // 2e passage si rien trouvé : exercices où ce muscle travaille en secondaire
  if (results.length === 0) {
    results = rank(
      catalog.filter((c) => usable(c) && c.secondaryMuscles.includes(original.primaryMuscle)),
      true
    );
  }
  return results.slice(0, limit);
}

module.exports = { findAlternatives, isDoable, hitsInjury, BODYWEIGHT };
