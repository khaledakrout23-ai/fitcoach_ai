// Repas et eau du membre : objectif du jour, repas par moment, aliments, eau, conseil, statistiques
const router = require('express').Router();
const { Op } = require('sequelize');
const { Gym, NutritionTarget, Meal, Food, WaterLog } = require('../models');
const { ah, HttpError } = require('../middleware/errors');
const { auth, requireRole } = require('../middleware/auth');
const { rateLimit } = require('../middleware/security');
const { required, num, oneOf, text, isoDate, localDate, addDays } = require('../utils');
const { cleanFood } = require('../services/foods');
const { saveTarget, profileComplete, analyzeMeal, weeklyKg, waterForDay, dayInsight } = require('../services/nutrition');
const { gymSettings } = require('../services/gymSettings');
const { likeQuery } = require('../services/members');
const { weekdayOf } = require('../services/schedule');
const { MEAL_TYPES, DRINKS } = require('../services/constants');

router.use(auth, requireRole('SPORTIF'));

// Fonction désactivée par la salle → 403 FEATURE_DISABLED
router.use(
  ah(async (req, res, next) => {
    const gym = req.user.gymId ? await Gym.findByPk(req.user.gymId) : null;
    if (!gymSettings(gym).features.meals) throw new HttpError(403, 'FEATURE_DISABLED', 'Fonction désactivée par ta salle.');
    next();
  })
);

const MACROS = ['calories', 'protein', 'carbs', 'fat'];
const MEAL_KEYS = Object.keys(MEAL_TYPES);
const GLASS_ML = 250;

// Date de lecture : n'importe quel jour valide ; date d'écriture : de −1 an à demain
function readDate(value) {
  return value === undefined || value === '' ? localDate() : isoDate(value, 'date');
}
function writeDate(value) {
  const date = readDate(value);
  const today = localDate();
  if (date > addDays(today, 1) || date < addDays(today, -365)) throw new HttpError(400, 'VALIDATION', 'Date invalide : date');
  return date;
}

const mealView = (m) => ({
  id: m.id,
  date: m.date,
  mealType: m.mealType,
  name: m.name,
  quantity: m.quantity,
  calories: m.calories,
  protein: m.protein,
  carbs: m.carbs,
  fat: m.fat,
  foodId: m.foodId || null,
  createdAt: m.createdAt,
});

const waterView = (w) => ({ id: w.id, date: w.date, ml: w.ml, drink: w.drink, kcal: w.kcal, createdAt: w.createdAt });

// Bilan d'une journée : objectif, repas par moment, totaux, reste, eau, conseil
router.get(
  '/day',
  ah(async (req, res) => {
    const user = req.user;
    const date = readDate(req.query.date);
    const [existing, meals, water] = await Promise.all([
      NutritionTarget.findOne({ where: { userId: user.id } }),
      Meal.findAll({ where: { userId: user.id, date }, order: [['createdAt', 'ASC'], ['id', 'ASC']] }),
      WaterLog.findAll({ where: { userId: user.id, date }, order: [['createdAt', 'ASC'], ['id', 'ASC']] }),
    ]);
    // pas encore d'objectif : calculé dès que le profil est complet
    const target = existing || (await saveTarget(user, { useAI: false }));
    const drinksKcal = water.reduce((s, w) => s + w.kcal, 0);
    const totals = Object.fromEntries(MACROS.map((k) => [k, meals.reduce((s, m) => s + m[k], 0)]));
    totals.calories += drinksKcal;
    totals.drinksKcal = drinksKcal;
    const remaining = target ? Object.fromEntries(MACROS.map((k) => [k, Math.max(0, target[k] - totals[k])])) : null;
    const grouped = Object.fromEntries(MEAL_KEYS.map((k) => [k, []]));
    for (const m of meals) grouped[m.mealType].push(mealView(m));

    const consumedMl = water.reduce((s, w) => s + w.ml, 0);
    const day = waterForDay(user, { trainingDay: (user.trainingDays || []).includes(weekdayOf(date)) });
    const waterInfo = {
      ...day,
      consumedMl,
      pct: Math.min(100, Math.round((consumedMl / day.targetMl) * 100)),
      glasses: { glassMl: GLASS_ML, total: Math.ceil(day.targetMl / GLASS_ML), filled: Math.floor(consumedMl / GLASS_ML) },
      logs: water.map(waterView),
    };
    const isToday = date === localDate();
    res.json({
      date,
      target: target
        ? { calories: target.calories, protein: target.protein, carbs: target.carbs, fat: target.fat, maintenance: target.maintenance, waterMl: target.waterMl, source: target.source, advice: target.advice }
        : null,
      meals: grouped,
      totals,
      remaining,
      water: waterInfo,
      insight: dayInsight({ target, totals, mealsCount: meals.length, water: waterInfo, language: user.language, isToday }),
      profileComplete: profileComplete(user),
    });
  })
);

// Une journée est « réussie » si calories et protéines atteignent au moins 80 % de l'objectif
const REACHED = 0.8;
const isReached = (day, target) => Boolean(target) && day.calories >= target.calories * REACHED && day.protein >= target.protein * REACHED;

// Statistiques sur 7 ou 30 jours (+ eau par jour) et rythme de poids estimé
router.get(
  '/stats',
  ah(async (req, res) => {
    const user = req.user;
    const end = readDate(req.query.date);
    const span = Number(req.query.days) === 30 ? 30 : 7;
    const start = addDays(end, -(span - 1));
    const [target, meals, water] = await Promise.all([
      NutritionTarget.findOne({ where: { userId: user.id } }),
      Meal.findAll({ where: { userId: user.id, date: { [Op.between]: [start, end] } } }),
      WaterLog.findAll({ where: { userId: user.id, date: { [Op.between]: [start, end] } } }),
    ]);
    const days = [];
    for (let i = 0; i < span; i += 1) {
      const date = addDays(start, i);
      const list = meals.filter((m) => m.date === date);
      const drinks = water.filter((w) => w.date === date);
      const day = { date, meals: list.length, ...Object.fromEntries(MACROS.map((k) => [k, list.reduce((s, m) => s + m[k], 0)])) };
      day.calories += drinks.reduce((s, w) => s + w.kcal, 0);
      day.waterMl = drinks.reduce((s, w) => s + w.ml, 0);
      day.reached = list.length > 0 && isReached(day, target);
      days.push(day);
    }
    const logged = days.filter((d) => d.meals > 0);
    const average = logged.length ? Object.fromEntries(MACROS.map((k) => [k, Math.round(logged.reduce((s, d) => s + d[k], 0) / logged.length)])) : null;
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i -= 1) {
      if (days[i].reached) streak += 1;
      else if (i !== days.length - 1) break;
    }
    const maintenance = target ? target.maintenance : null;
    res.json({
      span,
      goal: user.goal,
      weight: user.weight,
      target,
      maintenance,
      targetWeeklyKg: target && maintenance ? weeklyKg(target.calories, maintenance) : null,
      actualWeeklyKg: average && maintenance ? weeklyKg(average.calories, maintenance) : null,
      days,
      average,
      averageWaterMl: Math.round(days.reduce((s, d) => s + d.waterMl, 0) / span),
      loggedDays: logged.length,
      reachedDays: days.filter((d) => d.reached).length,
      streak,
    });
  })
);

// (Re)calcule l'objectif journalier (formule, ajusté par l'IA si disponible, jamais à plus de 30 %)
const targetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, key: (req) => `target:${req.user.id}` });
router.post(
  '/target',
  targetLimiter,
  ah(async (req, res) => {
    const target = await saveTarget(req.user, { useAI: true });
    if (!target) throw new HttpError(400, 'NUTRITION_PROFILE', 'Renseigne ton année de naissance, ton poids et ta taille.');
    res.json(target);
  })
);

// Photo d'un repas → estimation (non enregistrée : le membre vérifie puis ajoute)
const analyzeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 15, key: (req) => `analyze:${req.user.id}` });
router.post(
  '/analyze',
  analyzeLimiter,
  ah(async (req, res) => {
    required(req.body, ['image']);
    res.json(await analyzeMeal(req.body.image, req.user.language));
  })
);

// ---------------------------------------------------------------- Aliments
// Catalogue Kammel + aliments de la salle + aliments créés par le membre
const foodScope = (user) => ({
  [Op.or]: [{ gymId: null, userId: null }, ...(user.gymId ? [{ gymId: user.gymId, userId: null }] : []), { userId: user.id }],
});
const foodView = (f, user) => ({
  id: f.id,
  nameFr: f.nameFr,
  nameAr: f.nameAr,
  nameEn: f.nameEn || f.nameFr,
  portion: f.portion,
  calories: f.calories,
  protein: f.protein,
  carbs: f.carbs,
  fat: f.fat,
  source: f.userId === user.id ? 'MINE' : f.gymId ? 'GYM' : 'KAMMEL',
});

router.get(
  '/foods',
  ah(async (req, res) => {
    const user = req.user;
    const tab = req.query.tab === undefined ? 'all' : oneOf(req.query.tab, ['all', 'recent', 'mine'], 'tab');
    const where = { [Op.and]: [foodScope(user)] };
    if (req.query.q) {
      const q = likeQuery(req.query.q);
      where[Op.and].push({ [Op.or]: [{ nameFr: { [Op.like]: q } }, { nameAr: { [Op.like]: q } }, { nameEn: { [Op.like]: q } }] });
    }
    if (tab === 'mine') where[Op.and].push({ userId: user.id });
    if (tab === 'recent') {
      const recent = await Meal.findAll({ attributes: ['foodId'], where: { userId: user.id, foodId: { [Op.ne]: null } }, order: [['createdAt', 'DESC']], limit: 60 });
      const ids = [...new Set(recent.map((m) => m.foodId))].slice(0, 20);
      if (!ids.length) return res.json([]);
      where[Op.and].push({ id: ids });
      const foods = await Food.findAll({ where });
      return res.json(ids.map((id) => foods.find((f) => f.id === id)).filter(Boolean).map((f) => foodView(f, user)));
    }
    const foods = await Food.findAll({ where, order: [['nameFr', 'ASC']], limit: 100 });
    return res.json(foods.map((f) => foodView(f, user)));
  })
);

const MAX_CUSTOM_FOODS = 200;
router.post(
  '/foods',
  ah(async (req, res) => {
    if ((await Food.count({ where: { userId: req.user.id } })) >= MAX_CUSTOM_FOODS) {
      throw new HttpError(400, 'LIMIT_REACHED', 'Nombre maximal d’aliments personnels atteint.');
    }
    const food = await Food.create({ ...cleanFood(req.body), userId: req.user.id, gymId: null });
    res.status(201).json(foodView(food, req.user));
  })
);

router.delete(
  '/foods/:id',
  ah(async (req, res) => {
    const food = await Food.findOne({ where: { id: Number(req.params.id) || 0, userId: req.user.id } });
    if (!food) throw new HttpError(404, 'NOT_FOUND', 'Aliment introuvable.');
    await food.destroy();
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------- Repas
// Avec foodId : valeurs de l'aliment × servings ; sinon valeurs saisies (ou issues de l'analyse photo)
router.post(
  '/meals',
  ah(async (req, res) => {
    const user = req.user;
    const data = {
      userId: user.id,
      date: writeDate(req.body.date),
      mealType: req.body.mealType === undefined ? 'DEJEUNER' : oneOf(req.body.mealType, MEAL_KEYS, 'mealType'),
    };
    if (req.body.foodId !== undefined && req.body.foodId !== null) {
      const food = await Food.findOne({ where: { [Op.and]: [{ id: Number(req.body.foodId) || 0 }, foodScope(user)] } });
      if (!food) throw new HttpError(404, 'NOT_FOUND', 'Aliment introuvable.');
      const servings = req.body.servings === undefined ? 1 : num(req.body.servings, 'servings', { min: 0.25, max: 10 });
      const name = user.language === 'ar' ? food.nameAr : user.language === 'en' ? food.nameEn || food.nameFr : food.nameFr;
      Object.assign(data, {
        foodId: food.id,
        name,
        quantity: text(req.body.quantity, 60) || (servings === 1 ? food.portion : `${servings} × ${food.portion}`).slice(0, 60),
        ...Object.fromEntries(MACROS.map((k) => [k, Math.round(food[k] * servings)])),
      });
    } else {
      required(req.body, ['name', 'calories']);
      Object.assign(data, {
        name: text(req.body.name, 150) || 'Repas',
        quantity: text(req.body.quantity, 60),
        calories: Math.round(num(req.body.calories, 'calories', { min: 0, max: 5000 })),
        protein: Math.round(num(req.body.protein ?? 0, 'protein', { min: 0, max: 400 })),
        carbs: Math.round(num(req.body.carbs ?? 0, 'carbs', { min: 0, max: 800 })),
        fat: Math.round(num(req.body.fat ?? 0, 'fat', { min: 0, max: 400 })),
      });
    }
    const meal = await Meal.create(data);
    res.status(201).json(mealView(meal));
  })
);

router.delete(
  '/meals/:id',
  ah(async (req, res) => {
    const meal = await Meal.findOne({ where: { id: Number(req.params.id) || 0, userId: req.user.id } });
    if (!meal) throw new HttpError(404, 'NOT_FOUND', 'Repas introuvable.');
    await meal.destroy();
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------- Eau (et autres boissons)
router.post(
  '/water',
  ah(async (req, res) => {
    const ml = Math.round(num(req.body.ml, 'ml', { min: 50, max: 2000 }));
    const drink = req.body.drink === undefined ? 'EAU' : oneOf(req.body.drink, Object.keys(DRINKS), 'drink');
    const log = await WaterLog.create({ userId: req.user.id, date: writeDate(req.body.date), ml, drink, kcal: Math.round(ml * DRINKS[drink].kcalPerMl) });
    res.status(201).json(waterView(log));
  })
);

// Annuler un ajout (toast « Annuler »)
router.delete(
  '/water/:id',
  ah(async (req, res) => {
    const log = await WaterLog.findOne({ where: { id: Number(req.params.id) || 0, userId: req.user.id } });
    if (!log) throw new HttpError(404, 'NOT_FOUND', 'Ajout introuvable.');
    await log.destroy();
    res.json({ ok: true });
  })
);

module.exports = router;
