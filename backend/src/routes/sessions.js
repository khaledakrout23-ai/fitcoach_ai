// Séances d'entraînement : démarrer, saisir les séries, remplacer un exercice, attendre, terminer, noter
const router = require('express').Router();
const { Op } = require('sequelize');
const { sequelize, WorkoutSession, SessionEntry, Program, ProgramItem, Exercise, Equipment, Machine, Report } = require('../models');
const { ah, HttpError } = require('../middleware/errors');
const { auth, requireRole } = require('../middleware/auth');
const { num, oneOf } = require('../utils');
const { alternativesFor, machinesByEquipment, performanceHistory, exerciseSummary } = require('../services/catalog');
const { suggestWeight } = require('../services/schedule');
const { todayView } = require('../services/programs');
const { REASONS } = require('./catalog');

router.use(auth, requireRole('SPORTIF'));

const QUICK_EXERCISES = 3; // séance rapide 30 min : les 3 premiers exercices (écran Programmes)
const MET_RESISTANCE = 5; // dépense estimée de la musculation (MET)

const entryInclude = [
  { model: Exercise, as: 'exercise', include: [{ model: Equipment, as: 'equipment' }] },
  { model: Exercise, as: 'originalExercise', attributes: ['id', 'nameFr', 'nameAr', 'nameEn'] },
];

async function loadSession(id, userId) {
  const session = await WorkoutSession.findOne({
    where: { id: Number(id) || 0, userId },
    include: [{ model: SessionEntry, as: 'entries', separate: true, include: entryInclude, order: [['position', 'ASC']] }],
  });
  if (!session) throw new HttpError(404, 'NOT_FOUND', 'Séance introuvable.');
  return session;
}

function loadEntry(session, entryId) {
  const entry = session.entries.find((e) => e.id === Number(entryId));
  if (!entry) throw new HttpError(404, 'NOT_FOUND', 'Exercice de la séance introuvable.');
  if (session.status !== 'EN_COURS') throw new HttpError(400, 'SESSION_FINISHED', 'Cette séance est terminée.');
  return entry;
}

/** Séance complète : séries de la dernière fois (« Précédent ») et charge conseillée pour chaque exercice */
async function sessionView(session, user) {
  const machines = await machinesByEquipment(user.gymId);
  const history = await performanceHistory(user.id, session.entries.map((e) => e.exerciseId), { perExercise: 2, excludeSessionId: session.id });
  const entries = session.entries.map((e) => {
    const h = history.get(e.exerciseId) || [];
    return {
      id: e.id,
      position: e.position,
      targetSets: e.targetSets,
      targetReps: e.targetReps,
      restSec: e.restSec,
      reason: e.reason,
      setsDone: e.setsDone,
      exercise: exerciseSummary(e.exercise, machines),
      originalExercise: e.originalExercise ? { id: e.originalExercise.id, nameFr: e.originalExercise.nameFr, nameAr: e.originalExercise.nameAr, nameEn: e.originalExercise.nameEn } : null,
      previous: h[0] ? { date: h[0].date, sets: h[0].setsDone } : null,
      suggestedKg: suggestWeight(h, { targetSets: e.targetSets, targetReps: e.targetReps }),
    };
  });
  const end = session.finishedAt ? new Date(session.finishedAt) : new Date();
  return {
    id: session.id,
    programId: session.programId,
    status: session.status,
    quick: session.quick,
    dayIndex: session.dayIndex,
    dayLabelFr: session.dayLabelFr,
    dayLabelAr: session.dayLabelAr,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    rating: session.rating,
    elapsedSec: Math.max(0, Math.round((end - new Date(session.startedAt)) / 1000)),
    progress: { done: entries.filter((e) => e.setsDone.length >= e.targetSets).length, total: entries.length },
    entries,
  };
}

/** Bilan de fin de séance : durée, volume, séries, calories estimées (MET), records personnels */
async function sessionStats(session, user) {
  const end = session.finishedAt ? new Date(session.finishedAt) : new Date();
  const durationMin = Math.max(1, Math.round((end - new Date(session.startedAt)) / 60000));
  let volumeKg = 0;
  let sets = 0;
  const best = new Map();
  for (const e of session.entries) {
    for (const s of e.setsDone) {
      sets += 1;
      volumeKg += (Number(s.weight) || 0) * (Number(s.reps) || 0);
      const b = best.get(e.exerciseId);
      if (Number(s.weight) > 0 && (!b || Number(s.weight) > b.weight)) best.set(e.exerciseId, { weight: Number(s.weight), reps: Number(s.reps) || 0, exercise: e.exercise });
    }
  }
  // meilleure charge des séances précédentes, exercice par exercice
  const previous = new Map();
  if (best.size) {
    const past = await SessionEntry.findAll({
      attributes: ['exerciseId', 'setsDone'],
      where: { exerciseId: [...best.keys()] },
      include: [{ model: WorkoutSession, as: 'session', attributes: [], where: { userId: user.id, status: 'TERMINEE', id: { [Op.ne]: session.id } } }],
    });
    for (const e of past) {
      for (const s of e.setsDone) previous.set(e.exerciseId, Math.max(previous.get(e.exerciseId) || 0, Number(s.weight) || 0));
    }
  }
  const records = [...best.entries()]
    .filter(([id, b]) => previous.has(id) && previous.get(id) > 0 && b.weight > previous.get(id))
    .map(([id, b]) => ({
      exerciseId: id,
      nameFr: b.exercise ? b.exercise.nameFr : null,
      nameAr: b.exercise ? b.exercise.nameAr : null,
      nameEn: b.exercise ? b.exercise.nameEn : null,
      weight: b.weight,
      reps: b.reps,
      previousBest: previous.get(id),
    }));
  return {
    durationMin,
    volumeKg: Math.round(volumeKg),
    sets,
    kcal: Math.round((MET_RESISTANCE * (user.weight || 75) * Math.min(durationMin, 180)) / 60),
    records,
  };
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

// Démarrer la séance d'un jour du programme (par défaut : la séance du jour). quick30 = séance rapide
router.post(
  '/',
  ah(async (req, res) => {
    const user = req.user;
    const already = await WorkoutSession.findOne({ where: { userId: user.id, status: 'EN_COURS' } });
    if (already) return res.json(await sessionView(await loadSession(already.id, user.id), user));

    const program = await Program.findOne({ where: { userId: user.id, active: true }, order: [['createdAt', 'DESC']] });
    if (!program) throw new HttpError(400, 'NO_PROGRAM', 'Génère d’abord ton programme.');
    let dayIndex = req.body.dayIndex === undefined ? null : num(req.body.dayIndex, 'dayIndex', { min: 1, max: 7, integer: true });
    if (!dayIndex) {
      const today = await todayView(user);
      dayIndex = today ? today.dayIndex : 1;
    }
    let items = await ProgramItem.findAll({ where: { programId: program.id, dayIndex }, order: [['position', 'ASC']] });
    if (!items.length) throw new HttpError(400, 'DAY_NOT_FOUND', 'Jour introuvable dans le programme.');

    const quick = req.body.quick30 === true;
    if (quick) items = items.slice(0, QUICK_EXERCISES);

    const session = await sequelize.transaction(async (t) => {
      const created = await WorkoutSession.create(
        { userId: user.id, programId: program.id, dayIndex, dayLabelFr: items[0].dayLabelFr, dayLabelAr: items[0].dayLabelAr, quick, startedAt: new Date() },
        { transaction: t }
      );
      await SessionEntry.bulkCreate(
        items.map((it, i) => ({
          sessionId: created.id,
          exerciseId: it.exerciseId,
          position: i + 1,
          targetSets: quick ? Math.min(3, it.sets) : it.sets,
          targetReps: it.reps,
          restSec: quick ? Math.min(60, it.restSec) : it.restSec,
          setsDone: [],
        })),
        { transaction: t }
      );
      return created;
    });
    return res.status(201).json(await sessionView(await loadSession(session.id, user.id), user));
  })
);

router.get(
  '/:id',
  ah(async (req, res) => {
    res.json(await sessionView(await loadSession(req.params.id, req.user.id), req.user));
  })
);

// Enregistrer les séries faites : [{ reps, weight }]
router.put(
  '/:id/entries/:entryId',
  ah(async (req, res) => {
    const session = await loadSession(req.params.id, req.user.id);
    const entry = loadEntry(session, req.params.entryId);
    if (!Array.isArray(req.body.setsDone) || req.body.setsDone.length > 10) throw new HttpError(400, 'VALIDATION', 'Champ invalide : setsDone');
    const clean = req.body.setsDone.map((s) => ({
      reps: Math.round(num(s && s.reps, 'reps', { min: 0, max: 200 })),
      weight: Math.round(num(s && s.weight, 'weight', { min: 0, max: 500 }) * 4) / 4,
    }));
    await entry.update({ setsDone: clean });
    res.json(await sessionView(await loadSession(session.id, req.user.id), req.user));
  })
);

// Remplacements proposés (alternatives choisies par la salle d'abord, machines hors service exclues)
router.get(
  '/:id/entries/:entryId/alternatives',
  ah(async (req, res) => {
    const session = await loadSession(req.params.id, req.user.id);
    const entry = loadEntry(session, req.params.entryId);
    const reason = REASONS.includes(req.query.reason) ? req.query.reason : 'OCCUPEE';
    const { alternatives } = await alternativesFor(req.user.id, entry.exerciseId);
    res.json({ reason, canWait: true, alternatives });
  })
);

// Panne signalée pendant la séance : un signalement « ne marche pas » (une fois par jour et par machine)
async function reportBroken(user, exercise, machineId) {
  if (!user.gymId || !exercise || !exercise.equipment || exercise.equipment.category === 'POIDS_DU_CORPS') return null;
  const where = machineId
    ? { id: Number(machineId) || 0, gymId: user.gymId, equipmentId: exercise.equipmentId }
    : { gymId: user.gymId, equipmentId: exercise.equipmentId, outOfService: false };
  const machine = await Machine.findOne({ where, order: [['status', 'ASC'], ['code', 'ASC']] });
  if (!machine) return null;
  const recent = await Report.findOne({
    where: { machineId: machine.id, userId: user.id, status: ['NOUVEAU', 'VU', 'REPARATION'], createdAt: { [Op.gte]: new Date(Date.now() - 86400000) } },
  });
  if (recent) return recent;
  const report = await Report.create({
    machineId: machine.id,
    gymId: user.gymId,
    userId: user.id,
    issueType: 'NE_MARCHE_PAS',
    description: `Signalé pendant une séance (${exercise.nameFr}).`,
    notify: true,
  });
  if (machine.status === 'OK') await machine.update({ status: 'SIGNALEE' });
  return report;
}

// Remplacer l'exercice. Sécurité : l'exercice choisi est revérifié (même muscle, matériel en service, pas de douleur)
router.post(
  '/:id/entries/:entryId/substitute',
  ah(async (req, res) => {
    const session = await loadSession(req.params.id, req.user.id);
    const entry = loadEntry(session, req.params.entryId);
    const reason = req.body.reason === undefined ? 'OCCUPEE' : oneOf(req.body.reason, REASONS, 'reason');
    const newId = num(req.body.exerciseId, 'exerciseId', { min: 1, integer: true });
    const { alternatives } = await alternativesFor(req.user.id, entry.exerciseId, { limit: 100 });
    if (!alternatives.some((a) => a.exercise.id === newId)) {
      throw new HttpError(400, 'INVALID_ALTERNATIVE', 'Cet exercice ne peut pas remplacer celui-ci.');
    }
    let report = null;
    if (reason === 'PANNE') report = await reportBroken(req.user, entry.exercise, req.body.machineId);
    await entry.update({ originalExerciseId: entry.originalExerciseId || entry.exerciseId, exerciseId: newId, reason, setsDone: [] });
    const view = await sessionView(await loadSession(session.id, req.user.id), req.user);
    res.json({ ...view, reportId: report ? report.id : null });
  })
);

// « J'attends » : l'exercice passe en fin de séance
router.post(
  '/:id/entries/:entryId/postpone',
  ah(async (req, res) => {
    const session = await loadSession(req.params.id, req.user.id);
    const entry = loadEntry(session, req.params.entryId);
    const max = Math.max(...session.entries.map((e) => e.position));
    if (entry.position !== max) await entry.update({ position: max + 1 });
    res.json(await sessionView(await loadSession(session.id, req.user.id), req.user));
  })
);

router.post(
  '/:id/finish',
  ah(async (req, res) => {
    let session = await loadSession(req.params.id, req.user.id);
    if (session.status === 'EN_COURS') {
      await session.update({ status: 'TERMINEE', finishedAt: new Date() });
      session = await loadSession(session.id, req.user.id);
    }
    res.json({ session: await sessionView(session, req.user), stats: await sessionStats(session, req.user) });
  })
);

router.put(
  '/:id/rating',
  ah(async (req, res) => {
    const session = await loadSession(req.params.id, req.user.id);
    if (session.status !== 'TERMINEE') throw new HttpError(400, 'SESSION_NOT_FINISHED', 'Termine la séance avant de la noter.');
    await session.update({ rating: num(req.body.rating, 'rating', { min: 1, max: 5, integer: true }) });
    res.json({ id: session.id, rating: session.rating });
  })
);

// Abandonner une séance en cours
router.delete(
  '/:id',
  ah(async (req, res) => {
    const session = await loadSession(req.params.id, req.user.id);
    if (session.status !== 'EN_COURS') throw new HttpError(400, 'SESSION_FINISHED', 'Cette séance est terminée.');
    await sequelize.transaction(async (t) => {
      await SessionEntry.destroy({ where: { sessionId: session.id }, transaction: t });
      await session.destroy({ transaction: t });
    });
    res.json({ ok: true });
  })
);

module.exports = router;
module.exports.sessionStats = sessionStats;
module.exports.reportBroken = reportBroken;
