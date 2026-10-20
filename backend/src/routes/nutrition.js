// Section repas du sportif : objectif journalier, repas scannés, bilan du jour
const router = require('express').Router();
const { Op } = require('sequelize');
const { User, NutritionTarget, Meal } = require('../models');
const { ah, HttpError } = require('../middleware/errors');
const { auth, requireRole } = require('../middleware/auth');
const { required } = require('../utils');
const { saveTarget, profileComplete, analyzeMeal, maintenanceCalories, weeklyKg } = require('../services/nutrition');

router.use(auth, requireRole('SPORTIF'));

const MACROS = ['calories', 'protein', 'carbs', 'fat'];
const clamp = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));

// Jour local du sportif (envoyé par le téléphone), sinon jour du serveur
function dayOf(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return value;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Bilan d'une journée : objectif, repas, totaux, reste à manger
router.get(
  '/day',
  ah(async (req, res) => {
    const date = dayOf(req.query.date);
    const [user, existing, meals] = await Promise.all([
      User.findByPk(req.user.id),
      NutritionTarget.findOne({ where: { userId: req.user.id } }),
      Meal.findAll({ where: { userId: req.user.id, date }, order: [['createdAt', 'ASC']] }),
    ]);
    // pas encore d'objectif : calculé automatiquement dès que le profil est complet
    const target = existing || (await saveTarget(user));
    const totals = Object.fromEntries(MACROS.map((k) => [k, meals.reduce((s, m) => s + m[k], 0)]));
    const remaining = target ? Object.fromEntries(MACROS.map((k) => [k, Math.max(0, target[k] - totals[k])])) : null;
    res.json({ date, target, meals, totals, remaining, profileComplete: profileComplete(user) });
  })
);

// Une journée est « réussie » si calories et protéines atteignent au moins 80 % de l'objectif
const REACHED = 0.8;
const isReached = (day, target) => Boolean(target) && day.calories >= target.calories * REACHED && day.protein >= target.protein * REACHED;

function shiftDay(date, n) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dayOf(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
}

// Statistiques sur 7 ou 30 jours + ce que l'objectif permet d'atteindre
router.get(
  '/stats',
  ah(async (req, res) => {
    const end = dayOf(req.query.date);
    const span = Number(req.query.days) === 30 ? 30 : 7;
    const start = shiftDay(end, -(span - 1));
    const [user, target, meals] = await Promise.all([
      User.findByPk(req.user.id),
      NutritionTarget.findOne({ where: { userId: req.user.id } }),
      Meal.findAll({ where: { userId: req.user.id, date: { [Op.between]: [start, end] } } }),
    ]);

    const days = [];
    for (let i = 0; i < span; i += 1) {
      const date = shiftDay(start, i);
      const list = meals.filter((m) => m.date === date);
      const day = { date, meals: list.length, ...Object.fromEntries(MACROS.map((k) => [k, list.reduce((s, m) => s + m[k], 0)])) };
      day.reached = list.length > 0 && isReached(day, target);
      days.push(day);
    }
    const logged = days.filter((d) => d.meals > 0);
    const average = logged.length ? Object.fromEntries(MACROS.map((k) => [k, Math.round(logged.reduce((s, d) => s + d[k], 0) / logged.length)])) : null;

    // série de jours réussis consécutifs (aujourd'hui compte s'il est déjà réussi)
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i -= 1) {
      if (days[i].reached) streak += 1;
      else if (i !== days.length - 1) break;
    }

    const maintenance = maintenanceCalories(user);
    res.json({
      span,
      goal: user.goal,
      weight: user.weight,
      target,
      maintenance,
      // en suivant l'objectif / au rythme actuel
      targetWeeklyKg: target && maintenance ? weeklyKg(target.calories, maintenance) : null,
      actualWeeklyKg: average && maintenance ? weeklyKg(average.calories, maintenance) : null,
      days,
      average,
      loggedDays: logged.length,
      reachedDays: days.filter((d) => d.reached).length,
      streak,
    });
  })
);

// (Re)calcule l'objectif journalier à partir du profil
router.post(
  '/target',
  ah(async (req, res) => {
    const user = await User.findByPk(req.user.id);
    const target = await saveTarget(user);
    if (!target) throw new HttpError(400, 'NUTRITION_PROFILE', 'Renseignez votre âge, votre poids et votre taille dans le profil.');
    res.json(target);
  })
);

// Photo d'un repas → estimation (non enregistrée : le sportif vérifie puis ajoute)
router.post(
  '/analyze',
  ah(async (req, res) => {
    const user = await User.findByPk(req.user.id);
    res.json(await analyzeMeal(req.body.image, user.language));
  })
);

router.post(
  '/meals',
  ah(async (req, res) => {
    required(req.body, ['name', 'calories']);
    const meal = await Meal.create({
      userId: req.user.id,
      date: dayOf(req.body.date),
      name: String(req.body.name).trim().slice(0, 150) || 'Repas',
      calories: clamp(req.body.calories, 0, 5000),
      protein: clamp(req.body.protein, 0, 400),
      carbs: clamp(req.body.carbs, 0, 800),
      fat: clamp(req.body.fat, 0, 400),
    });
    res.status(201).json(meal);
  })
);

router.delete(
  '/meals/:id',
  ah(async (req, res) => {
    const meal = await Meal.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!meal) throw new HttpError(404, 'NOT_FOUND', 'Repas introuvable.');
    await meal.destroy();
    res.json({ ok: true });
  })
);

module.exports = router;
