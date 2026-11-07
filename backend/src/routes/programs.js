// Programme du membre : programme en cours avec la semaine, séance du jour, génération
const router = require('express').Router();
const { ah } = require('../middleware/errors');
const { auth, requireRole } = require('../middleware/auth');
const { rateLimit } = require('../middleware/security');
const { oneOf } = require('../utils');
const { generateForUser, programView, todayView } = require('../services/programs');

router.use(auth, requireRole('SPORTIF'));

router.get(
  '/current',
  ah(async (req, res) => {
    res.json(await programView(req.user));
  })
);

// Séance du jour (ou la prochaine prévue) avec la charge conseillée d'après les dernières séances
router.get(
  '/today',
  ah(async (req, res) => {
    res.json(await todayView(req.user));
  })
);

// Nouveau programme : modèle publié par la salle si un modèle correspond, sinon IA, sinon règles.
// source : 'TEMPLATE' (défaut), 'AI' (sans modèle), 'RULES' (règles seulement)
const generateLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 6, key: (req) => `generate:${req.user.id}` });
router.post(
  '/generate',
  generateLimiter,
  ah(async (req, res) => {
    const source = req.body.source === undefined ? undefined : oneOf(req.body.source, ['TEMPLATE', 'AI', 'RULES'], 'source');
    await generateForUser(req.user, { source });
    res.status(201).json(await programView(req.user));
  })
);

module.exports = router;
