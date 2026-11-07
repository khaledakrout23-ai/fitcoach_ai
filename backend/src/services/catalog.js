// Lecture des exercices et du matériel d'une salle, au format utilisé par les algorithmes
const { Op } = require('sequelize');
const { Exercise, Equipment, Machine, WorkoutSession, SessionEntry, User } = require('../models');
const { HttpError } = require('../middleware/errors');
const { findAlternatives } = require('./substitution');

function normalizeExercise(ex) {
  return {
    id: ex.id,
    nameFr: ex.nameFr,
    nameAr: ex.nameAr,
    nameEn: ex.nameEn,
    primaryMuscle: ex.primaryMuscle,
    secondaryMuscles: ex.secondaryMuscles,
    pattern: ex.pattern,
    equipmentCode: ex.equipment ? ex.equipment.code : 'poids_du_corps',
    equipmentCategory: ex.equipment ? ex.equipment.category : 'POIDS_DU_CORPS',
    accessories: ex.accessories,
    difficulty: ex.difficulty,
    injuryZones: ex.injuryZones,
    alternativeIds: ex.alternativeIds || [],
  };
}

async function loadCatalog() {
  const rows = await Exercise.findAll({ include: [{ model: Equipment, as: 'equipment' }], order: [['id', 'ASC']] });
  return rows.map(normalizeExercise);
}

// Une machine est utilisable si elle n'est ni hors service ni en réparation (RG6)
const USABLE = { outOfService: false, status: { [Op.ne]: 'REPARATION' } };

// Codes des équipements utilisables dans la salle (au moins une machine en service)
async function availableEquipment(gymId) {
  if (!gymId) return ['poids_du_corps'];
  const machines = await Machine.findAll({ where: { gymId, ...USABLE }, include: [{ model: Equipment, as: 'equipment' }] });
  return [...new Set(['poids_du_corps', ...machines.filter((m) => m.equipment).map((m) => m.equipment.code)])];
}

// Machines de la salle regroupées par type d'équipement (affichage « Chest Press #04 · Zone machines »)
async function machinesByEquipment(gymId) {
  const map = new Map();
  if (!gymId) return map;
  const machines = await Machine.findAll({ where: { gymId }, order: [['code', 'ASC'], ['id', 'ASC']] });
  for (const m of machines) {
    if (!map.has(m.equipmentId)) map.set(m.equipmentId, []);
    map.get(m.equipmentId).push({ id: m.id, code: m.code, label: m.label, zone: m.zone, status: m.status, outOfService: m.outOfService });
  }
  return map;
}

// Ids des exercices déjà réalisés par le sportif
async function exerciseHistory(userId) {
  const entries = await SessionEntry.findAll({
    attributes: ['exerciseId'],
    include: [{ model: WorkoutSession, as: 'session', attributes: [], where: { userId } }],
  });
  return [...new Set(entries.map((e) => e.exerciseId))];
}

/**
 * Séries des dernières séances terminées pour chaque exercice (la plus récente d'abord).
 * @returns {Promise<Map<number, { sessionId, date, setsDone }[]>>}
 */
async function performanceHistory(userId, exerciseIds, { perExercise = 3, excludeSessionId = null } = {}) {
  const map = new Map();
  if (!exerciseIds.length) return map;
  const where = { userId, status: 'TERMINEE' };
  if (excludeSessionId) where.id = { [Op.ne]: excludeSessionId };
  const entries = await SessionEntry.findAll({
    attributes: ['exerciseId', 'setsDone', 'sessionId'],
    where: { exerciseId: exerciseIds },
    include: [{ model: WorkoutSession, as: 'session', attributes: ['id', 'finishedAt', 'startedAt'], where }],
    order: [[{ model: WorkoutSession, as: 'session' }, 'startedAt', 'DESC']],
  });
  for (const e of entries) {
    if (!e.setsDone.length) continue;
    const list = map.get(e.exerciseId) || [];
    if (list.length < perExercise) list.push({ sessionId: e.sessionId, date: e.session.finishedAt || e.session.startedAt, setsDone: e.setsDone });
    map.set(e.exerciseId, list);
  }
  return map;
}

const exerciseInclude = [{ model: Equipment, as: 'equipment' }];

/**
 * Remplacements pour le sportif connecté : règles de sécurité (même muscle, matériel en service, pas de douleur),
 * puis les alternatives choisies à la main par la salle (Exercise.alternativeIds) passent en premier.
 * @param {object} options { limit, extraInjuries: zones à éviter en plus (ex. douleur signalée au coach) }
 */
async function alternativesFor(userId, exerciseId, { limit = 3, extraInjuries = [] } = {}) {
  const user = await User.findByPk(userId);
  const catalog = await loadCatalog();
  const original = catalog.find((c) => c.id === Number(exerciseId));
  if (!original) throw new HttpError(404, 'NOT_FOUND', 'Exercice introuvable.');
  const ranked = findAlternatives({
    original,
    catalog,
    availableEquipment: await availableEquipment(user.gymId),
    level: user.level || 'DEBUTANT',
    injuries: [...new Set([...(user.injuries || []), ...extraInjuries])],
    history: await exerciseHistory(user.id),
    limit: 100,
  });
  const manual = (original.alternativeIds || []).map(Number);
  const ordered = [
    ...manual.map((id) => ranked.find((r) => r.exercise.id === id)).filter(Boolean).map((r) => ({ ...r, manual: true })),
    ...ranked.filter((r) => !manual.includes(r.exercise.id)).map((r) => ({ ...r, manual: false })),
  ].slice(0, limit);
  const ids = ordered.map((r) => r.exercise.id);
  const full = ids.length ? await Exercise.findAll({ where: { id: ids }, include: exerciseInclude }) : [];
  const machines = await machinesByEquipment(user.gymId);
  return {
    user,
    original,
    alternatives: ordered.map((r) => {
      const ex = full.find((f) => f.id === r.exercise.id);
      return {
        exercise: exerciseSummary(ex, machines),
        score: r.score,
        reasons: r.reasons,
        sharedMuscles: r.sharedMuscles,
        advice: r.advice,
        relaxed: r.relaxed,
        manual: r.manual,
      };
    }),
  };
}

/** Exercice au format court des réponses (avec les machines de la salle qui le permettent) */
function exerciseSummary(ex, machinesMap = null) {
  if (!ex) return null;
  return {
    id: ex.id,
    nameFr: ex.nameFr,
    nameAr: ex.nameAr,
    nameEn: ex.nameEn,
    primaryMuscle: ex.primaryMuscle,
    secondaryMuscles: ex.secondaryMuscles,
    pattern: ex.pattern,
    difficulty: ex.difficulty,
    injuryZones: ex.injuryZones,
    defaultReps: ex.defaultReps,
    videoUrl: ex.videoUrl || null,
    equipment: ex.equipment ? { id: ex.equipment.id, code: ex.equipment.code, nameFr: ex.equipment.nameFr, nameAr: ex.equipment.nameAr, category: ex.equipment.category } : null,
    machines: machinesMap ? machinesMap.get(ex.equipmentId) || [] : undefined,
  };
}

module.exports = {
  normalizeExercise,
  loadCatalog,
  availableEquipment,
  machinesByEquipment,
  exerciseHistory,
  performanceHistory,
  alternativesFor,
  exerciseSummary,
  exerciseInclude,
  USABLE,
};
