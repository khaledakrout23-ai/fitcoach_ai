// Séances d'entraînement : démarrer, saisir les séries, remplacer un exercice, terminer
const router = require('express').Router();
const { Op } = require('sequelize');
const {
  WorkoutSession, SessionEntry, Program, ProgramItem, Exercise, Equipment, Machine, Report,
} = require('../models');
const { ah, HttpError } = require('../middleware/errors');
const { auth, requireRole } = require('../middleware/auth');
const { alternativesFor, REASONS } = require('./catalog');

router.use(auth, requireRole('SPORTIF'));

const entryInclude = [
  { model: Exercise, as: 'exercise', include: [{ model: Equipment, as: 'equipment' }] },
  { model: Exercise, as: 'originalExercise', attributes: ['id', 'nameFr', 'nameAr'] },
];

async function loadSession(id, userId) {
  const session = await WorkoutSession.findOne({
    where: { id, userId },
    include: [{ model: SessionEntry, as: 'entries', separate: true, include: entryInclude, order: [['position', 'ASC']] }],
  });
  if (!session) throw new HttpError(404, 'NOT_FOUND', 'Séance introuvable.');
  return session;
}

async function loadEntry(session, entryId) {
  const entry = session.entries.find((e) => e.id === Number(entryId));
  if (!entry) throw new HttpError(404, 'NOT_FOUND', 'Exercice de la séance introuvable.');
  if (session.status !== 'EN_COURS') throw new HttpError(400, 'SESSION_FINISHED', 'Cette séance est terminée.');
  return entry;
}

// Historique des séances
router.get(
  '/',
  ah(async (req, res) => {
    const sessions = await WorkoutSession.findAll({
      where: { userId: req.user.id },
      include: [{ model: SessionEntry, as: 'entries', attributes: ['id', 'reason', 'setsDone'] }],
      order: [['startedAt', 'DESC']],
      limit: 50,
    });
    res.json(sessions);
  })
);

// Démarrer la séance d'un jour du programme. quick30 = mode « 30 minutes »
router.post(
  '/',
  ah(async (req, res) => {
    const already = await WorkoutSession.findOne({ where: { userId: req.user.id, status: 'EN_COURS' } });
    if (already) return res.json(await loadSession(already.id, req.user.id));

    const program = await Program.findOne({ where: { userId: req.user.id, active: true }, order: [['createdAt', 'DESC']] });
    if (!program) throw new HttpError(400, 'NO_PROGRAM', 'Générez d’abord votre programme.');
    const dayIndex = Number(req.body.dayIndex) || 1;
    let items = await ProgramItem.findAll({ where: { programId: program.id, dayIndex }, order: [['position', 'ASC']] });
    if (!items.length) throw new HttpError(400, 'DAY_NOT_FOUND', 'Jour introuvable dans le programme.');

    // Mode 30 minutes : on garde les 4 premiers exercices (les plus importants) et 3 séries maximum
    const quick = Boolean(req.body.quick30);
    if (quick) items = items.slice(0, 4);

    const session = await WorkoutSession.create({
      userId: req.user.id,
      programId: program.id,
      dayIndex,
      dayLabelFr: items[0].dayLabelFr,
      dayLabelAr: items[0].dayLabelAr,
      startedAt: new Date(),
    });
    await SessionEntry.bulkCreate(
      items.map((it, i) => ({
        sessionId: session.id,
        exerciseId: it.exerciseId,
        position: i + 1,
        targetSets: quick ? Math.min(3, it.sets) : it.sets,
        targetReps: it.reps,
        restSec: quick ? Math.min(60, it.restSec) : it.restSec,
        setsDone: [],
      }))
    );
    return res.status(201).json(await loadSession(session.id, req.user.id));
  })
);

router.get(
  '/:id',
  ah(async (req, res) => {
    res.json(await loadSession(req.params.id, req.user.id));
  })
);

// Enregistrer les séries faites : [{ reps, weight }]
router.put(
  '/:id/entries/:entryId',
  ah(async (req, res) => {
    const session = await loadSession(req.params.id, req.user.id);
    const entry = await loadEntry(session, req.params.entryId);
    const sets = Array.isArray(req.body.setsDone) ? req.body.setsDone : [];
    const clean = sets.slice(0, 10).map((s) => ({
      reps: Math.max(0, Math.min(200, Number(s.reps) || 0)),
      weight: Math.max(0, Math.min(500, Number(s.weight) || 0)),
    }));
    await entry.update({ setsDone: clean });
    res.json(await loadSession(session.id, req.user.id));
  })
);

// Remplacements proposés pour un exercice de la séance
router.get(
  '/:id/entries/:entryId/alternatives',
  ah(async (req, res) => {
    const session = await loadSession(req.params.id, req.user.id);
    const entry = await loadEntry(session, req.params.entryId);
    const reason = REASONS.includes(req.query.reason) ? req.query.reason : 'OCCUPEE';
    const { alternatives } = await alternativesFor(req.user.id, entry.exerciseId);
    res.json({ reason, alternatives });
  })
);

// Remplacer l'exercice. Si la machine est en panne, le gérant est prévenu (RG6)
router.post(
  '/:id/entries/:entryId/substitute',
  ah(async (req, res) => {
    const session = await loadSession(req.params.id, req.user.id);
    const entry = await loadEntry(session, req.params.entryId);
    const reason = REASONS.includes(req.body.reason) ? req.body.reason : 'OCCUPEE';
    const newId = Number(req.body.exerciseId);

    // Sécurité : l'exercice choisi doit respecter les règles (même muscle, matériel dispo, pas de blessure)
    const { user, alternatives } = await alternativesFor(req.user.id, entry.exerciseId, 100);
    if (!alternatives.some((a) => a.exercise.id === newId)) {
      throw new HttpError(400, 'INVALID_ALTERNATIVE', 'Cet exercice ne peut pas remplacer celui-ci.');
    }

    if (reason === 'PANNE') await reportBrokenEquipment(user, entry.exercise, req.body.machineId);

    await entry.update({
      originalExerciseId: entry.originalExerciseId || entry.exerciseId,
      exerciseId: newId,
      reason,
      setsDone: [],
    });
    res.json(await loadSession(session.id, req.user.id));
  })
);

async function reportBrokenEquipment(user, exercise, machineId) {
  if (!user.gymId || !exercise.equipment || exercise.equipment.code === 'poids_du_corps') return;
  const where = machineId ? { id: machineId, gymId: user.gymId } : { gymId: user.gymId, equipmentId: exercise.equipmentId, status: 'OK' };
  const machine = await Machine.findOne({ where });
  if (!machine) return;
  const existing = await Report.findOne({ where: { machineId: machine.id, status: { [Op.in]: ['NOUVEAU', 'CONFIRME'] } } });
  if (existing) return;
  await Report.create({
    machineId: machine.id,
    gymId: user.gymId,
    userId: user.id,
    description: `Signalé pendant une séance (${exercise.nameFr}).`,
  });
}

// « J'attends » : l'exercice passe en fin de séance
router.post(
  '/:id/entries/:entryId/postpone',
  ah(async (req, res) => {
    const session = await loadSession(req.params.id, req.user.id);
    const entry = await loadEntry(session, req.params.entryId);
    const max = Math.max(...session.entries.map((e) => e.position));
    await entry.update({ position: max + 1 });
    res.json(await loadSession(session.id, req.user.id));
  })
);

router.post(
  '/:id/finish',
  ah(async (req, res) => {
    const session = await loadSession(req.params.id, req.user.id);
    if (session.status === 'EN_COURS') await session.update({ status: 'TERMINEE', finishedAt: new Date() });
    res.json(await loadSession(session.id, req.user.id));
  })
);

// Abandonner une séance en cours
router.delete(
  '/:id',
  ah(async (req, res) => {
    const session = await loadSession(req.params.id, req.user.id);
    if (session.status !== 'EN_COURS') throw new HttpError(400, 'SESSION_FINISHED', 'Cette séance est terminée.');
    await session.destroy();
    res.json({ ok: true });
  })
);

module.exports = router;
