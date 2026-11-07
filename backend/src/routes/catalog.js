// Listes de référence, exercices, et salle du membre (affluence, machines).
// ATTENTION : ce routeur est monté sur /api ; jamais de router.use() global ici (il s'appliquerait à toute l'API).
const router = require('express').Router();
const { Op } = require('sequelize');
const { Gym, Machine, Equipment, Exercise, User, Plan } = require('../models');
const { ah, HttpError } = require('../middleware/errors');
const { auth, requireRole } = require('../middleware/auth');
const { rateLimit } = require('../middleware/security');
const { normalizeExercise, machinesByEquipment, performanceHistory, alternativesFor, exerciseSummary } = require('../services/catalog');
const { hitsInjury } = require('../services/substitution');
const { explainSubstitution } = require('../services/coach');
const { gymSettings } = require('../services/gymSettings');
const { liveSnapshot } = require('../services/occupancy');
const { likeQuery } = require('../services/members');
const C = require('../services/constants');
const { PAYMENT_METHODS, REPORT_ISSUES } = require('../models');

const REASONS = ['OCCUPEE', 'ABSENTE', 'PANNE'];
const sportif = [auth, requireRole('SPORTIF')];

// Listes de référence pour les formulaires et les libellés (public)
router.get('/meta', (req, res) =>
  res.json({
    muscles: C.MUSCLES,
    patterns: C.PATTERNS,
    injuryZones: C.INJURY_ZONES,
    issueTypes: Object.fromEntries(REPORT_ISSUES.map((k) => [k, C.ISSUE_TYPES[k]])),
    reportStatuses: C.REPORT_STATUSES,
    machineStatuses: C.MACHINE_STATUSES,
    goals: C.GOALS,
    levels: C.LEVELS,
    activities: C.ACTIVITIES,
    dietStyles: C.DIET_STYLES,
    sexes: C.SEXES,
    mealTypes: C.MEAL_TYPES,
    drinks: C.DRINKS,
    paymentMethods: Object.fromEntries(PAYMENT_METHODS.map((k) => [k, C.PAYMENT_METHOD_LABELS[k]])),
    planUnits: C.PLAN_UNITS,
    subscriptionStatuses: C.SUBSCRIPTION_STATUSES,
    roles: C.ROLE_LABELS,
    weekdays: C.WEEKDAYS,
    coachTopics: C.COACH_TOPICS,
    sessionMinutes: [30, 45, 60, 90],
  })
);

router.get(
  '/equipment',
  auth,
  ah(async (req, res) => {
    res.json(await Equipment.findAll({ order: [['nameFr', 'ASC']] }));
  })
);

// ---------------------------------------------------------------- Exercices
// ?q= recherche · ?muscle= · ?safe=1 : sans les exercices qui chargent les douleurs du membre
router.get(
  '/exercises',
  auth,
  ah(async (req, res) => {
    const where = {};
    if (req.query.muscle) where.primaryMuscle = String(req.query.muscle).slice(0, 30);
    if (req.query.q) {
      const q = likeQuery(req.query.q);
      where[Op.or] = [{ nameFr: { [Op.like]: q } }, { nameAr: { [Op.like]: q } }, { nameEn: { [Op.like]: q } }];
    }
    const exercises = await Exercise.findAll({ where, include: [{ model: Equipment, as: 'equipment' }], order: [['primaryMuscle', 'ASC'], ['nameFr', 'ASC']] });
    const injuries = req.user.injuries || [];
    const list = req.query.safe === '1' ? exercises.filter((e) => !hitsInjury(normalizeExercise(e), injuries)) : exercises;
    const machines = await machinesByEquipment(req.user.gymId);
    res.json(
      list.map((e) => ({
        ...exerciseSummary(e, machines),
        defaultSets: e.defaultSets,
        avoidForMe: hitsInjury(normalizeExercise(e), injuries),
      }))
    );
  })
);

router.get(
  '/exercises/:id',
  auth,
  ah(async (req, res) => {
    const exercise = await Exercise.findByPk(Number(req.params.id) || 0, { include: [{ model: Equipment, as: 'equipment' }] });
    if (!exercise) throw new HttpError(404, 'NOT_FOUND', 'Exercice introuvable.');
    const altIds = (exercise.alternativeIds || []).map(Number);
    const alternatives = altIds.length ? await Exercise.findAll({ where: { id: altIds }, attributes: ['id', 'nameFr', 'nameAr', 'nameEn'] }) : [];
    const machines = await machinesByEquipment(req.user.gymId);
    const out = {
      ...exerciseSummary(exercise, machines),
      accessories: exercise.accessories,
      defaultSets: exercise.defaultSets,
      benefitsFr: exercise.benefitsFr,
      benefitsAr: exercise.benefitsAr,
      mistakesFr: exercise.mistakesFr,
      mistakesAr: exercise.mistakesAr,
      alternatives: altIds.map((id) => alternatives.find((a) => a.id === id)).filter(Boolean),
      avoidForMe: hitsInjury(normalizeExercise(exercise), req.user.injuries || []),
    };
    // historique personnel (membre) : meilleure charge et courbe des dernières séances
    if (req.user.role === 'SPORTIF') {
      const history = (await performanceHistory(req.user.id, [exercise.id], { perExercise: 12 })).get(exercise.id) || [];
      const points = history.map((h) => ({ date: h.date, maxWeight: Math.max(...h.setsDone.map((s) => Number(s.weight) || 0)) })).reverse();
      let best = null;
      for (const h of history) {
        for (const s of h.setsDone) if (!best || Number(s.weight) > best.weight) best = { weight: Number(s.weight) || 0, reps: Number(s.reps) || 0, date: h.date };
      }
      out.personal = { best, history: points };
    }
    res.json(out);
  })
);

// Vidéo de démonstration : celle de l'administrateur, sinon la 1re vidéo intégrable d'une recherche YouTube (côté serveur)
const videoCache = new Map();
const videoLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, key: (req) => `video:${req.user.id}` });
router.get(
  '/exercises/:id/video',
  auth,
  videoLimiter,
  ah(async (req, res) => {
    const exercise = await Exercise.findByPk(Number(req.params.id) || 0);
    if (!exercise) throw new HttpError(404, 'NOT_FOUND', 'Exercice introuvable.');
    const own = exercise.videoUrl && exercise.videoUrl.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
    if (own) return res.json({ videoId: own[1], source: 'ADMIN' });
    if (!videoCache.has(exercise.id)) {
      let videoId = null;
      try {
        const q = encodeURIComponent(`${exercise.nameEn} exercise proper form`);
        const r = await fetch(`https://www.youtube.com/results?search_query=${q}`, { headers: { 'Accept-Language': 'en' }, signal: AbortSignal.timeout(8000) });
        const ids = [...new Set([...(await r.text()).matchAll(/"videoId":"([\w-]{11})"/g)].map((m) => m[1]))].slice(0, 5);
        // première vidéo dont l'intégration est autorisée (oEmbed répond 401 sinon)
        for (const id of ids) {
          const check = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`, { signal: AbortSignal.timeout(5000) });
          if (check.ok) {
            videoId = id;
            break;
          }
        }
      } catch {
        // pas d'accès à YouTube : le site proposera le lien de recherche
      }
      if (!videoId) return res.json({ videoId: null, source: null });
      if (videoCache.size > 2000) videoCache.clear();
      videoCache.set(exercise.id, videoId);
    }
    return res.json({ videoId: videoCache.get(exercise.id), source: 'SEARCH' });
  })
);

router.get(
  '/exercises/:id/alternatives',
  sportif,
  ah(async (req, res) => {
    const reason = REASONS.includes(req.query.reason) ? req.query.reason : 'OCCUPEE';
    const { alternatives } = await alternativesFor(req.user.id, Number(req.params.id) || 0);
    res.json({ reason, alternatives });
  })
);

// « Pourquoi ce remplacement ? » (IA si disponible)
const explainLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, key: (req) => `explain:${req.user.id}` });
router.get(
  '/exercises/:id/explain/:altId',
  auth,
  explainLimiter,
  ah(async (req, res) => {
    const [a, b] = await Promise.all([
      Exercise.findByPk(Number(req.params.id) || 0, { include: [{ model: Equipment, as: 'equipment' }] }),
      Exercise.findByPk(Number(req.params.altId) || 0, { include: [{ model: Equipment, as: 'equipment' }] }),
    ]);
    if (!a || !b) throw new HttpError(404, 'NOT_FOUND', 'Exercice introuvable.');
    const original = normalizeExercise(a);
    const alternative = normalizeExercise(b);
    const sharedMuscles = alternative.secondaryMuscles.filter((m) => original.secondaryMuscles.includes(m));
    const language = ['fr', 'ar', 'en'].includes(req.query.lang) ? req.query.lang : req.user.language;
    res.json({ text: await explainSubstitution({ original, alternative, sharedMuscles, language }) });
  })
);

// ---------------------------------------------------------------- Salle du membre (jamais un id de salle venant du client)
async function ownGym(req) {
  const gym = req.user.gymId ? await Gym.findByPk(req.user.gymId) : null;
  if (!gym) throw new HttpError(400, 'NO_GYM', 'Aucune salle rattachée à ton compte.');
  return gym;
}

// Gym en direct : des nombres, jamais des noms
router.get(
  '/gym/live',
  sportif,
  ah(async (req, res) => {
    const gym = await ownGym(req);
    const settings = gymSettings(gym);
    if (!settings.features.live) throw new HttpError(403, 'FEATURE_DISABLED', 'Fonction désactivée par ta salle.');
    const live = await liveSnapshot(gym, settings);
    const broken = await Machine.findAll({
      where: { gymId: gym.id, [Op.or]: [{ status: { [Op.ne]: 'OK' } }, { outOfService: true }] },
      attributes: ['id', 'label', 'code', 'zone', 'status', 'outOfService'],
      order: [['code', 'ASC']],
    });
    const me = await User.findByPk(req.user.id, { attributes: ['prefs'] });
    res.json({
      gym: { id: gym.id, name: gym.name, city: gym.city },
      showCount: settings.live.showCount,
      ...live,
      count: settings.live.showCount ? live.count : null,
      deltaSince: settings.live.showCount ? live.deltaSince : null,
      brokenMachines: broken,
      calmAlert: Boolean(me.prefs.calmAlert),
    });
  })
);

// Formules visibles de la salle (feuille « Renouveler » ; l'achat se fait à l'accueil)
router.get(
  '/gym/plans',
  sportif,
  ah(async (req, res) => {
    const gym = await ownGym(req);
    const plans = await Plan.findAll({
      where: { gymId: gym.id, visible: true, archived: false },
      attributes: ['id', 'nameFr', 'nameAr', 'nameEn', 'duration', 'durationUnit', 'price', 'freezeDays', 'noteFr', 'noteAr', 'accessHours'],
      order: [['position', 'ASC'], ['id', 'ASC']],
    });
    res.json(plans);
  })
);

// Machines de la salle (écran « Signaler une panne », QR « KM.<salle>.<machine> »)
router.get(
  '/gym/machines',
  sportif,
  ah(async (req, res) => {
    const gym = await ownGym(req);
    const machines = await Machine.findAll({
      where: { gymId: gym.id },
      attributes: ['id', 'label', 'code', 'zone', 'status', 'outOfService'],
      include: [{ model: Equipment, as: 'equipment', attributes: ['id', 'code', 'nameFr', 'nameAr', 'category'] }],
      order: [['zone', 'ASC'], ['code', 'ASC']],
    });
    res.json(machines);
  })
);

module.exports = { router, REASONS };
