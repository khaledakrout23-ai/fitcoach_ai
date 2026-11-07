// Contenu de l'app (D12 – D15), permission « content » (gérant, coach) : exercices (lecture), modèles de programmes,
// aliments de la salle, règles de calcul, réglages et statistiques anonymes du coach (jamais le contenu des messages).
const router = require('express').Router();
const { Op, fn, col } = require('sequelize');
const { Exercise, Equipment, Machine, ProgramTemplate, Food, ChatMessage, User } = require('../../models');
const { ah, HttpError } = require('../../middleware/errors');
const { requirePermission } = require('../../middleware/auth');
const { required, num, oneOf, text } = require('../../utils');
const { cleanSettings } = require('../../services/gymSettings');
const { cleanFood } = require('../../services/foods');
const { likeQuery } = require('../../services/members');
const { templateMemberCounts } = require('../../services/programs');
const { audit } = require('../../services/audit');
const targets = require('../../services/targets');
const { GOALS, LEVELS, INJURY_ZONES, COACH_TOPICS } = require('../../services/constants');

const perm = requirePermission('content');

// ---------------------------------------------------------------- Exercices (le catalogue global reste modifiable par l'administrateur)
async function exerciseRows(req, where = {}) {
  const [exercises, machines] = await Promise.all([
    Exercise.findAll({ where, include: [{ model: Equipment, as: 'equipment' }], order: [['primaryMuscle', 'ASC'], ['nameFr', 'ASC']] }),
    Machine.findAll({ where: { gymId: req.gym.id }, include: [{ model: Equipment, as: 'equipment', attributes: ['code'] }], order: [['code', 'ASC']] }),
  ]);
  const names = new Map((await Exercise.findAll({ attributes: ['id', 'nameFr', 'nameAr', 'nameEn'] })).map((e) => [e.id, e]));
  return exercises.map((e) => {
    // machines de la salle qui permettent l'exercice (équipement principal ou accessoire)
    const serving = machines.filter((m) => m.equipmentId === e.equipmentId || (m.equipment && (e.accessories || []).includes(m.equipment.code)));
    const alternatives = (e.alternativeIds || []).map((id) => names.get(Number(id))).filter(Boolean);
    return {
      id: e.id,
      nameFr: e.nameFr,
      nameAr: e.nameAr,
      nameEn: e.nameEn,
      primaryMuscle: e.primaryMuscle,
      secondaryMuscles: e.secondaryMuscles,
      pattern: e.pattern,
      difficulty: e.difficulty,
      equipment: e.equipment ? { id: e.equipment.id, code: e.equipment.code, nameFr: e.equipment.nameFr, nameAr: e.equipment.nameAr, category: e.equipment.category } : null,
      machines: serving.map((m) => ({ id: m.id, code: m.code, label: m.label, status: m.status })),
      availableInGym: e.equipment ? e.equipment.code === 'poids_du_corps' || serving.length > 0 : true,
      injuryZones: e.injuryZones,
      defaultSets: e.defaultSets,
      defaultReps: e.defaultReps,
      alternatives: alternatives.map((a) => ({ id: a.id, nameFr: a.nameFr, nameAr: a.nameAr, nameEn: a.nameEn })),
      alternativesCount: alternatives.length,
      videoUrl: e.videoUrl || null,
    };
  });
}

router.get(
  '/content/exercises',
  perm,
  ah(async (req, res) => {
    const where = {};
    if (req.query.muscle) where.primaryMuscle = String(req.query.muscle).slice(0, 30);
    if (req.query.q) {
      const q = likeQuery(req.query.q);
      where[Op.or] = [{ nameFr: { [Op.like]: q } }, { nameAr: { [Op.like]: q } }, { nameEn: { [Op.like]: q } }];
    }
    const items = await exerciseRows(req, where);
    res.json({ total: items.length, items });
  })
);

router.get(
  '/content/exercises/:id',
  perm,
  ah(async (req, res) => {
    const [item] = await exerciseRows(req, { id: Number(req.params.id) || 0 });
    if (!item) throw new HttpError(404, 'NOT_FOUND', 'Exercice introuvable.');
    res.json(item);
  })
);

// ---------------------------------------------------------------- Modèles de programmes
const REPS = /^\d{1,3}(-\d{1,3})?( ?(s|sec|min))?$/;

async function cleanTemplate(body, { partial = false } = {}) {
  if (!partial) required(body, ['nameFr', 'nameAr', 'goal', 'daysPerWeek', 'weeks', 'days']);
  const out = {};
  if (body.nameFr !== undefined) out.nameFr = text(body.nameFr, 120);
  if (body.nameAr !== undefined) out.nameAr = text(body.nameAr, 120);
  if ((body.nameFr !== undefined && !out.nameFr) || (body.nameAr !== undefined && !out.nameAr)) throw new HttpError(400, 'VALIDATION', 'Champ invalide : name');
  if (body.goal !== undefined) out.goal = oneOf(body.goal, Object.keys(GOALS), 'goal');
  if (body.level !== undefined) out.level = body.level === null ? null : oneOf(body.level, Object.keys(LEVELS), 'level');
  if (body.daysPerWeek !== undefined) out.daysPerWeek = num(body.daysPerWeek, 'daysPerWeek', { min: 1, max: 6, integer: true });
  if (body.weeks !== undefined) out.weeks = num(body.weeks, 'weeks', { min: 1, max: 52, integer: true });
  if (body.days !== undefined) {
    if (!Array.isArray(body.days) || !body.days.length || body.days.length > 6) throw new HttpError(400, 'VALIDATION', 'Champ invalide : days');
    const ids = new Set();
    out.days = body.days.map((d, i) => {
      if (!d || !Array.isArray(d.items) || !d.items.length || d.items.length > 12) throw new HttpError(400, 'VALIDATION', `Champ invalide : days[${i}].items`);
      return {
        labelFr: text(d.labelFr, 60) || `Jour ${i + 1}`,
        labelAr: text(d.labelAr, 60) || `اليوم ${i + 1}`,
        focusFr: text(d.focusFr, 60),
        focusAr: text(d.focusAr, 60),
        items: d.items.map((it) => {
          const exerciseId = num(it && it.exerciseId, 'exerciseId', { min: 1, integer: true });
          ids.add(exerciseId);
          const reps = String(it.reps ?? '').trim();
          if (!REPS.test(reps)) throw new HttpError(400, 'VALIDATION', 'Champ invalide : reps');
          return {
            exerciseId,
            sets: num(it.sets, 'sets', { min: 1, max: 10, integer: true }),
            reps,
            restSec: it.restSec === undefined ? 60 : num(it.restSec, 'restSec', { min: 0, max: 600, integer: true }),
          };
        }),
      };
    });
    const found = await Exercise.count({ where: { id: [...ids] } });
    if (found !== ids.size) throw new HttpError(400, 'UNKNOWN_EXERCISE', 'Exercice inconnu dans le programme.');
    if (out.daysPerWeek === undefined) out.daysPerWeek = out.days.length;
  }
  if (out.days && out.daysPerWeek !== out.days.length) throw new HttpError(400, 'VALIDATION', 'Le nombre de jours ne correspond pas.');
  if (body.published !== undefined) {
    if (typeof body.published !== 'boolean') throw new HttpError(400, 'VALIDATION', 'Champ invalide : published');
    out.published = body.published;
  }
  return out;
}

async function templateViews(templates) {
  const counts = await templateMemberCounts(templates.map((t) => t.id));
  const ids = [...new Set(templates.flatMap((t) => t.days.flatMap((d) => (d.items || []).map((it) => Number(it.exerciseId)))))];
  const names = new Map((ids.length ? await Exercise.findAll({ where: { id: ids }, attributes: ['id', 'nameFr', 'nameAr', 'nameEn', 'primaryMuscle'] }) : []).map((e) => [e.id, e]));
  return templates.map((t) => ({
    id: t.id,
    nameFr: t.nameFr,
    nameAr: t.nameAr,
    goal: t.goal,
    level: t.level,
    daysPerWeek: t.daysPerWeek,
    weeks: t.weeks,
    published: t.published,
    membersCount: counts.get(t.id) || 0,
    days: t.days.map((d) => ({
      ...d,
      items: (d.items || []).map((it) => {
        const e = names.get(Number(it.exerciseId));
        return { ...it, exercise: e ? { id: e.id, nameFr: e.nameFr, nameAr: e.nameAr, nameEn: e.nameEn, primaryMuscle: e.primaryMuscle } : null };
      }),
    })),
    updatedAt: t.updatedAt,
  }));
}

async function findTemplate(req) {
  const t = await ProgramTemplate.findOne({ where: { id: Number(req.params.id) || 0, gymId: req.gym.id } });
  if (!t) throw new HttpError(404, 'NOT_FOUND', 'Programme introuvable.');
  return t;
}

router.get(
  '/content/programs',
  perm,
  ah(async (req, res) => {
    const templates = await ProgramTemplate.findAll({ where: { gymId: req.gym.id }, order: [['id', 'ASC']] });
    res.json(await templateViews(templates));
  })
);

router.post(
  '/content/programs',
  perm,
  ah(async (req, res) => {
    const t = await ProgramTemplate.create({ published: false, ...(await cleanTemplate(req.body)), gymId: req.gym.id });
    await audit(req, 'program.create', { type: 'ProgramTemplate', id: t.id });
    res.status(201).json((await templateViews([t]))[0]);
  })
);

router.put(
  '/content/programs/:id',
  perm,
  ah(async (req, res) => {
    const t = await findTemplate(req);
    const data = await cleanTemplate(req.body, { partial: true });
    if (data.daysPerWeek !== undefined && !data.days && data.daysPerWeek !== t.days.length) throw new HttpError(400, 'VALIDATION', 'Le nombre de jours ne correspond pas.');
    await t.update(data);
    await audit(req, 'program.update', { type: 'ProgramTemplate', id: t.id }, { fields: Object.keys(data) });
    res.json((await templateViews([t]))[0]);
  })
);

router.post(
  '/content/programs/:id/publish',
  perm,
  ah(async (req, res) => {
    const t = await findTemplate(req);
    const published = req.body.published === undefined ? true : req.body.published;
    if (typeof published !== 'boolean') throw new HttpError(400, 'VALIDATION', 'Champ invalide : published');
    await t.update({ published });
    await audit(req, published ? 'program.publish' : 'program.unpublish', { type: 'ProgramTemplate', id: t.id });
    res.json((await templateViews([t]))[0]);
  })
);

router.delete(
  '/content/programs/:id',
  perm,
  ah(async (req, res) => {
    const t = await findTemplate(req);
    await t.destroy();
    await audit(req, 'program.delete', { type: 'ProgramTemplate', id: t.id });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------- Aliments (catalogue Kammel en lecture + aliments de la salle)
const foodView = (f) => ({
  id: f.id,
  nameFr: f.nameFr,
  nameAr: f.nameAr,
  nameEn: f.nameEn,
  portion: f.portion,
  calories: f.calories,
  protein: f.protein,
  carbs: f.carbs,
  fat: f.fat,
  source: f.gymId ? 'GYM' : 'KAMMEL',
  editable: Boolean(f.gymId),
});

router.get(
  '/content/foods',
  perm,
  ah(async (req, res) => {
    const source = req.query.source === undefined ? 'all' : oneOf(req.query.source, ['all', 'kammel', 'gym'], 'source');
    const scopes = { all: [{ gymId: null }, { gymId: req.gym.id }], kammel: [{ gymId: null }], gym: [{ gymId: req.gym.id }] }[source];
    const where = { userId: null, [Op.and]: [{ [Op.or]: scopes }] };
    if (req.query.q) {
      const q = likeQuery(req.query.q);
      where[Op.and].push({ [Op.or]: [{ nameFr: { [Op.like]: q } }, { nameAr: { [Op.like]: q } }, { nameEn: { [Op.like]: q } }] });
    }
    const [items, total] = await Promise.all([
      Food.findAll({ where, order: [['nameFr', 'ASC']], limit: 200 }),
      Food.count({ where: { userId: null, [Op.or]: [{ gymId: null }, { gymId: req.gym.id }] } }),
    ]);
    res.json({ total, items: items.map(foodView) });
  })
);

async function findGymFood(req) {
  const food = await Food.findOne({ where: { id: Number(req.params.id) || 0, gymId: req.gym.id, userId: null } });
  if (!food) throw new HttpError(404, 'NOT_FOUND', 'Aliment introuvable.');
  return food;
}

router.post(
  '/content/foods',
  perm,
  ah(async (req, res) => {
    const food = await Food.create({ ...cleanFood(req.body), gymId: req.gym.id, userId: null });
    await audit(req, 'food.create', { type: 'Food', id: food.id });
    res.status(201).json(foodView(food));
  })
);

router.put(
  '/content/foods/:id',
  perm,
  ah(async (req, res) => {
    const food = await findGymFood(req);
    await food.update(cleanFood(req.body, { partial: true }));
    await audit(req, 'food.update', { type: 'Food', id: food.id });
    res.json(foodView(food));
  })
);

router.delete(
  '/content/foods/:id',
  perm,
  ah(async (req, res) => {
    const food = await findGymFood(req);
    await food.destroy();
    await audit(req, 'food.delete', { type: 'Food', id: food.id });
    res.json({ ok: true });
  })
);

// Règles de calcul (lecture seule) + exemple de référence
router.get(
  '/content/nutrition-rules',
  perm,
  ah(async (req, res) => {
    const example = { sex: 'H', age: 32, height: 175, weight: 85, goalWeight: 76.3, activity: 'SEDENTAIRE', goal: 'PERTE_POIDS', dietStyle: 'EQUILIBRE', sessionMinutes: 60 };
    res.json({
      formula: 'MIFFLIN_ST_JEOR',
      activityFactors: targets.ACTIVITY_FACTOR,
      goalDelta: targets.GOAL_DELTA,
      macroSplit: targets.MACRO_SPLIT,
      water: targets.WATER,
      kgPerWeek: targets.KG_PER_WEEK,
      example: {
        profile: example,
        ...targets.dailyTarget(example),
        waterMl: targets.waterTarget(example, { trainingDay: true }),
        bmi: targets.bmi(example),
        healthyRange: targets.healthyRange(example.height),
      },
    });
  })
);

// ---------------------------------------------------------------- Coach Kammel : réglages + tendances des 7 derniers jours
router.get(
  '/content/coach',
  perm,
  ah(async (req, res) => {
    const since = new Date(Date.now() - 7 * 86400000);
    const members = await User.findAll({ attributes: ['id', 'injuries', 'active'], where: { gymId: req.gym.id, role: 'SPORTIF', deletedAt: null } });
    const ids = members.map((m) => m.id);
    const base = { userId: ids.length ? ids : [0], createdAt: { [Op.gte]: since } };
    const [questions, conversations, applied, referrals] = await Promise.all([
      ChatMessage.findAll({ attributes: ['userId', 'topic'], where: { ...base, role: 'user' }, raw: true }),
      ChatMessage.findAll({
        attributes: ['userId', [fn('DATE', col('created_at')), 'day']],
        where: { ...base, role: 'user' },
        group: ['userId', fn('DATE', col('created_at'))],
        raw: true,
      }),
      ChatMessage.count({ where: { userId: base.userId, role: 'assistant', proposalState: 'APPLIED', updatedAt: { [Op.gte]: since } } }),
      ChatMessage.count({ where: { ...base, role: 'assistant', topic: 'ORIENTATION' } }),
    ]);
    const topicCounts = Object.fromEntries(Object.keys(COACH_TOPICS).map((t) => [t, 0]));
    for (const q of questions) topicCounts[COACH_TOPICS[q.topic] ? q.topic : 'AUTRE'] += 1;
    const zones = Object.fromEntries(Object.keys(INJURY_ZONES).map((z) => [z, 0]));
    for (const m of members.filter((x) => x.active)) for (const z of m.injuries || []) if (zones[z] !== undefined) zones[z] += 1;
    res.json({
      settings: { enabled: req.settings.features.coach, ...req.settings.coach },
      analytics: {
        days: 7,
        conversations: conversations.length,
        membersUsing: new Set(questions.map((q) => q.userId)).size,
        questions: questions.length,
        proposalsApplied: applied,
        physioReferrals: referrals,
        topics: Object.entries(topicCounts)
          .map(([topic, count]) => ({ topic, count, pct: questions.length ? Math.round((count / questions.length) * 100) : 0 }))
          .sort((a, b) => b.count - a.count),
        painZones: Object.entries(zones).map(([zone, count]) => ({ zone, count })).filter((z) => z.count > 0).sort((a, b) => b.count - a.count),
      },
    });
  })
);

router.put(
  '/content/coach',
  perm,
  ah(async (req, res) => {
    const body = req.body || {};
    const incoming = { coach: {} };
    for (const k of ['proposeChanges', 'addPainWithConsent', 'languages', 'safety', 'physio']) if (body[k] !== undefined) incoming.coach[k] = body[k];
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'VALIDATION', 'Champ invalide : enabled');
      incoming.features = { coach: body.enabled };
    }
    const settings = cleanSettings(req.gym.settings, incoming);
    await req.gym.update({ settings });
    await audit(req, 'settings.coach', { type: 'Gym', id: req.gym.id }, { fields: Object.keys(body) });
    res.json({ enabled: settings.features.coach, ...settings.coach });
  })
);

module.exports = router;
