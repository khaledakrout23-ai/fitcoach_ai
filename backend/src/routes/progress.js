// Progression du sportif : volume par semaine, records, muscles travaillés, régularité
const router = require('express').Router();
const { WorkoutSession, SessionEntry, Exercise, User } = require('../models');
const { ah } = require('../middleware/errors');
const { auth, requireRole } = require('../middleware/auth');

router.use(auth, requireRole('SPORTIF'));

function weekStart(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // lundi = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

// date locale AAAA-MM-JJ (une conversion en UTC décalerait d'un jour)
function localDate(d) {
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const key = (d) => localDate(weekStart(d));

async function finishedSessions(userId) {
  return WorkoutSession.findAll({
    where: { userId, status: 'TERMINEE' },
    include: [
      {
        model: SessionEntry,
        as: 'entries',
        include: [{ model: Exercise, as: 'exercise', attributes: ['id', 'nameFr', 'nameAr', 'primaryMuscle'] }],
      },
    ],
    order: [['startedAt', 'ASC']],
  });
}

router.get(
  '/',
  ah(async (req, res) => {
    const user = await User.findByPk(req.user.id);
    const sessions = await finishedSessions(user.id);

    // Volume (kg x répétitions) et nombre de séances, 8 dernières semaines
    const weeks = [];
    const current = weekStart(new Date());
    for (let i = 7; i >= 0; i -= 1) {
      const d = new Date(current);
      d.setDate(d.getDate() - i * 7);
      weeks.push({ week: localDate(d), sessions: 0, volume: 0 });
    }
    const records = {};
    const musclesThisWeek = {};
    const thisWeek = key(new Date());

    for (const s of sessions) {
      const w = weeks.find((x) => x.week === key(s.startedAt));
      let volume = 0;
      for (const e of s.entries) {
        if (!e.exercise) continue;
        for (const set of e.setsDone) {
          volume += (set.weight || 0) * (set.reps || 0);
          const r = records[e.exercise.id];
          if (!r || set.weight > r.weight) {
            records[e.exercise.id] = { exercise: e.exercise, weight: set.weight, reps: set.reps, date: s.startedAt };
          }
        }
        if (key(s.startedAt) === thisWeek) {
          musclesThisWeek[e.exercise.primaryMuscle] = (musclesThisWeek[e.exercise.primaryMuscle] || 0) + e.setsDone.length;
        }
      }
      if (w) {
        w.sessions += 1;
        w.volume += Math.round(volume);
      }
    }

    // Semaines d'affilée avec au moins une séance
    const activeWeeks = new Set(sessions.map((s) => key(s.startedAt)));
    let streakWeeks = 0;
    const cursor = new Date(current);
    if (!activeWeeks.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 7);
    while (activeWeeks.has(localDate(cursor))) {
      streakWeeks += 1;
      cursor.setDate(cursor.getDate() - 7);
    }

    res.json({
      totalSessions: sessions.length,
      thisWeekSessions: weeks[weeks.length - 1].sessions,
      weeklyTarget: user.daysPerWeek || 3,
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

// Courbe d'un exercice : charge maximale à chaque séance
router.get(
  '/exercise/:id',
  ah(async (req, res) => {
    const sessions = await finishedSessions(req.user.id);
    const points = [];
    for (const s of sessions) {
      const sets = s.entries.filter((e) => e.exerciseId === Number(req.params.id)).flatMap((e) => e.setsDone);
      if (sets.length) points.push({ date: s.startedAt, maxWeight: Math.max(...sets.map((x) => x.weight || 0)) });
    }
    res.json(points);
  })
);

module.exports = router;
