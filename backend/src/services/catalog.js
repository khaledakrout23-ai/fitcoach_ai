// Lecture des exercices et du matériel d'une salle, au format utilisé par les algorithmes
const { Exercise, Equipment, Machine, WorkoutSession, SessionEntry } = require('../models');

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
  };
}

async function loadCatalog() {
  const rows = await Exercise.findAll({ include: [{ model: Equipment, as: 'equipment' }], order: [['id', 'ASC']] });
  return rows.map(normalizeExercise);
}

// Codes des équipements en service dans la salle (au moins une machine "OK")
async function availableEquipment(gymId) {
  if (!gymId) return ['poids_du_corps'];
  const machines = await Machine.findAll({
    where: { gymId, status: 'OK' },
    include: [{ model: Equipment, as: 'equipment' }],
  });
  return [...new Set(['poids_du_corps', ...machines.map((m) => m.equipment.code)])];
}

// Ids des exercices déjà réalisés par le sportif
async function exerciseHistory(userId) {
  const entries = await SessionEntry.findAll({
    attributes: ['exerciseId'],
    include: [{ model: WorkoutSession, as: 'session', attributes: [], where: { userId } }],
  });
  return [...new Set(entries.map((e) => e.exerciseId))];
}

module.exports = { normalizeExercise, loadCatalog, availableEquipment, exerciseHistory };
