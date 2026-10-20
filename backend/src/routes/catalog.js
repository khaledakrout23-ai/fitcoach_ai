// Salles, équipements, exercices et remplacements
const router = require('express').Router();
const { Op } = require('sequelize');
const { Gym, Machine, Equipment, Exercise, User, CheckIn } = require('../models');
const { ah, HttpError } = require('../middleware/errors');
const { auth } = require('../middleware/auth');
const { findAlternatives } = require('../services/substitution');
const { loadCatalog, availableEquipment, exerciseHistory, normalizeExercise } = require('../services/catalog');
const { explainSubstitution } = require('../services/coach');
const { MUSCLES, PATTERNS, INJURY_ZONES } = require('../services/constants');

const REASONS = ['OCCUPEE', 'ABSENTE', 'PANNE'];

// Listes de référence (muscles, mouvements, zones) pour les formulaires
router.get('/meta', (req, res) => res.json({ muscles: MUSCLES, patterns: PATTERNS, injuryZones: INJURY_ZONES }));

// Liste publique des salles (pour l'inscription)
router.get(
  '/gyms',
  ah(async (req, res) => {
    const gyms = await Gym.findAll({ attributes: ['id', 'name', 'address', 'city', 'openingHours'], order: [['name', 'ASC']] });
    res.json(gyms);
  })
);

router.get(
  '/gyms/:id',
  auth,
  ah(async (req, res) => {
    const gym = await Gym.findByPk(req.params.id, {
      include: [{ model: Machine, as: 'machines', separate: true, include: [{ model: Equipment, as: 'equipment' }], order: [['label', 'ASC']] }],
    });
    if (!gym) throw new HttpError(404, 'NOT_FOUND', 'Salle introuvable.');
    res.json(gym);
  })
);

// Affluence en direct : personnes entrées depuis moins de 2 h et pas encore sorties (RG10)
router.get(
  '/gyms/:id/occupancy',
  auth,
  ah(async (req, res) => {
    const since = new Date(Date.now() - 2 * 3600000);
    const now = new Date();
    const count = await CheckIn.count({
      where: {
        gymId: req.params.id,
        checkInAt: { [Op.gte]: since },
        [Op.or]: [{ checkOutAt: null }, { checkOutAt: { [Op.gt]: now } }],
      },
    });
    const level = count < 8 ? 'CALME' : count < 20 ? 'MOYEN' : 'CHARGE';
    res.json({ count, level });
  })
);

router.get(
  '/equipment',
  ah(async (req, res) => {
    res.json(await Equipment.findAll({ order: [['nameFr', 'ASC']] }));
  })
);

router.get(
  '/exercises',
  ah(async (req, res) => {
    const where = {};
    if (req.query.muscle) where.primaryMuscle = req.query.muscle;
    if (req.query.q) {
      const q = `%${req.query.q}%`;
      where[Op.or] = [{ nameFr: { [Op.like]: q } }, { nameAr: { [Op.like]: q } }, { nameEn: { [Op.like]: q } }];
    }
    const exercises = await Exercise.findAll({ where, include: [{ model: Equipment, as: 'equipment' }], order: [['primaryMuscle', 'ASC'], ['nameFr', 'ASC']] });
    res.json(exercises);
  })
);

router.get(
  '/exercises/:id',
  ah(async (req, res) => {
    const exercise = await Exercise.findByPk(req.params.id, { include: [{ model: Equipment, as: 'equipment' }] });
    if (!exercise) throw new HttpError(404, 'NOT_FOUND', 'Exercice introuvable.');
    res.json(exercise);
  })
);

// Vidéo de démonstration à afficher dans la page : celle de l'administrateur, sinon la 1re vidéo d'une recherche YouTube
const videoCache = new Map();
router.get(
  '/exercises/:id/video',
  ah(async (req, res) => {
    const exercise = await Exercise.findByPk(req.params.id);
    if (!exercise) throw new HttpError(404, 'NOT_FOUND', 'Exercice introuvable.');
    const own = exercise.videoUrl && exercise.videoUrl.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
    if (own) return res.json({ videoId: own[1] });
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
      if (!videoId) return res.json({ videoId: null });
      videoCache.set(exercise.id, videoId);
    }
    res.json({ videoId: videoCache.get(exercise.id) });
  })
);

// Calcule les remplacements pour le sportif connecté (utilisé aussi par les séances)
async function alternativesFor(userId, exerciseId, limit = 3) {
  const user = await User.findByPk(userId);
  const catalog = await loadCatalog();
  const original = catalog.find((c) => c.id === Number(exerciseId));
  if (!original) throw new HttpError(404, 'NOT_FOUND', 'Exercice introuvable.');
  const results = findAlternatives({
    original,
    catalog,
    availableEquipment: await availableEquipment(user.gymId),
    level: user.level || 'DEBUTANT',
    injuries: user.injuries,
    history: await exerciseHistory(user.id),
    limit,
  });
  const ids = results.map((r) => r.exercise.id);
  const full = ids.length ? await Exercise.findAll({ where: { id: ids }, include: [{ model: Equipment, as: 'equipment' }] }) : [];
  return {
    user,
    original,
    alternatives: results.map((r) => ({
      exercise: full.find((f) => f.id === r.exercise.id),
      score: r.score,
      reasons: r.reasons,
      sharedMuscles: r.sharedMuscles,
      advice: r.advice,
      relaxed: r.relaxed,
    })),
  };
}

router.get(
  '/exercises/:id/alternatives',
  auth,
  ah(async (req, res) => {
    const reason = REASONS.includes(req.query.reason) ? req.query.reason : 'OCCUPEE';
    const { alternatives } = await alternativesFor(req.user.id, req.params.id);
    res.json({ reason, alternatives });
  })
);

// « Pourquoi ce remplacement ? »
router.get(
  '/exercises/:id/explain/:altId',
  auth,
  ah(async (req, res) => {
    const [a, b] = await Promise.all([
      Exercise.findByPk(req.params.id, { include: [{ model: Equipment, as: 'equipment' }] }),
      Exercise.findByPk(req.params.altId, { include: [{ model: Equipment, as: 'equipment' }] }),
    ]);
    if (!a || !b) throw new HttpError(404, 'NOT_FOUND', 'Exercice introuvable.');
    const original = normalizeExercise(a);
    const alternative = normalizeExercise(b);
    const sharedMuscles = alternative.secondaryMuscles.filter((m) => original.secondaryMuscles.includes(m));
    const user = await User.findByPk(req.user.id);
    const text = await explainSubstitution({ original, alternative, sharedMuscles, language: req.query.lang || user.language });
    res.json({ text });
  })
);

module.exports = { router, alternativesFor, REASONS };
