// Progression du membre : volume par semaine, records, muscles travaillés, régularité, historique, séries du jour
const router = require('express').Router();
const { Op } = require('sequelize');
const { WorkoutSession, SessionEntry, Exercise, Meal, WaterLog } = require('../models');
const { ah } = require('../middleware/errors');
const { auth, requireRole } = require('../middleware/auth');
const { localDate, addDays } = require('../utils');
const { mondayOf } = require('../services/schedule');

router.use(auth, requireRole('SPORTIF'));

const weekKey = (d) => mondayOf(localDate(new Date(d)));

async function finishedSessions(userId) {
  return WorkoutSession.findAll({
    where: { userId, status: 'TERMINEE' },
    include: [
      {
        model: SessionEntry,
        as: 'entries',
        include: [{ model: Exercise, as: 'exercise', attributes: ['id', 'nameFr', 'nameAr', 'nameEn', 'primaryMuscle'] }],
      },
    ],
    order: [['startedAt', 'ASC']],
  });
}

const volumeOf = (s) => s.entries.reduce((v, e) => v + e.setsDone.reduce((x, set) => x + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0), 0);

router.get(
  '/',
  ah(async (req, res) => {
    const user = req.user;
    const sessions = await finishedSessions(user.id);
    const today = localDate();
    const current = mondayOf(today);

    // Volume (kg × répétitions) et nombre de séances, 8 dernières semaines
    const weeks = [];
    for (let i = 7; i >= 0; i -= 1) weeks.push({ week: addDays(current, -7 * i), sessions: 0, volume: 0 });
    const records = {};
    const musclesThisWeek = {};

    for (const s of sessions) {
      const key = weekKey(s.startedAt);
      const w = weeks.find((x) => x.week === key);
      for (const e of s.entries) {
        if (!e.exercise) continue;
        for (const set of e.setsDone) {
          const r = records[e.exercise.id];
          if (!r || Number(set.weight) > r.weight) {
            records[e.exercise.id] = { exercise: e.exercise, weight: Number(set.weight) || 0, reps: Number(set.reps) || 0, date: s.startedAt };
          }
        }
        if (key === current) musclesThisWeek[e.exercise.primaryMuscle] = (musclesThisWeek[e.exercise.primaryMuscle] || 0) + e.setsDone.length;
      }
      if (w) {
        w.sessions += 1;
        w.volume += Math.round(volumeOf(s));
      }
    }

    // Semaines d'affilée avec au moins une séance
    const activeWeeks = new Set(sessions.map((s) => weekKey(s.startedAt)));
    let streakWeeks = 0;
    let cursor = activeWeeks.has(current) ? current : addDays(current, -7);
    while (activeWeeks.has(cursor)) {
      streakWeeks += 1;
      cursor = addDays(cursor, -7);
    }

    res.json({
      totalSessions: sessions.length,
      thisWeekSessions: weeks[weeks.length - 1].sessions,
      weeklyTarget: (user.trainingDays || []).length || user.daysPerWeek || 3,
      streakWeeks,
      weeks,
      musclesThisWeek,
      records: Object.values(records)
        .filter((r) => r.weight > 0)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 8),
    });
  })
);

// Séances terminées (écran « Historique »)
router.get(
  '/history',
  ah(async (req, res) => {
    const sessions = await WorkoutSession.findAll({
      where: { userId: req.user.id, status: 'TERMINEE' },
      include: [{ model: SessionEntry, as: 'entries', attributes: ['setsDone', 'reason'] }],
      order: [['startedAt', 'DESC']],
      limit: 100,
    });
    res.json(
      sessions.map((s) => ({
        id: s.id,
        date: localDate(new Date(s.startedAt)),
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
        dayIndex: s.dayIndex,
        dayLabelFr: s.dayLabelFr,
        dayLabelAr: s.dayLabelAr,
        quick: s.quick,
        rating: s.rating,
        durationMin: s.finishedAt ? Math.max(1, Math.round((new Date(s.finishedAt) - new Date(s.startedAt)) / 60000)) : null,
        volumeKg: Math.round(volumeOf(s)),
        sets: s.entries.reduce((n, e) => n + e.setsDone.length, 0),
        exercises: s.entries.length,
        substitutions: s.entries.filter((e) => e.reason).length,
      }))
    );
  })
);

// Courbe d'un exercice : charge maximale à chaque séance
router.get(
  '/exercise/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id) || 0;
    const sessions = await finishedSessions(req.user.id);
    const points = [];
    for (const s of sessions) {
      const sets = s.entries.filter((e) => e.exerciseId === id).flatMap((e) => e.setsDone);
      if (sets.length) points.push({ date: s.startedAt, maxWeight: Math.max(...sets.map((x) => Number(x.weight) || 0)) });
    }
    res.json(points);
  })
);

// Séries par jour : eau, calories notées, séances (7, 30 ou 90 jours)
router.get(
  '/series',
  ah(async (req, res) => {
    const span = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
    const end = localDate();
    const start = addDays(end, -(span - 1));
    const [meals, water, sessions] = await Promise.all([
      Meal.findAll({ attributes: ['date', 'calories'], where: { userId: req.user.id, date: { [Op.between]: [start, end] } }, raw: true }),
      WaterLog.findAll({ attributes: ['date', 'ml', 'kcal'], where: { userId: req.user.id, date: { [Op.between]: [start, end] } }, raw: true }),
      WorkoutSession.findAll({ attributes: ['startedAt'], where: { userId: req.user.id, status: 'TERMINEE', startedAt: { [Op.gte]: new Date(`${start}T00:00:00`) } }, raw: true }),
    ]);
    const days = [];
    for (let i = 0; i < span; i += 1) {
      const date = addDays(start, i);
      days.push({
        date,
        waterMl: water.filter((w) => w.date === date).reduce((s, w) => s + w.ml, 0),
        calories: meals.filter((m) => m.date === date).reduce((s, m) => s + m.calories, 0) + water.filter((w) => w.date === date).reduce((s, w) => s + w.kcal, 0),
        sessions: sessions.filter((s) => localDate(new Date(s.startedAt)) === date).length,
      });
    }
    res.json({ span, days, weight: req.user.weight, goalWeight: req.user.goalWeight });
  })
);

module.exports = router;
