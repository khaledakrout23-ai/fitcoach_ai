// Espace salle (/api/staff) : équipe de la salle (GERANT, ACCUEIL, TECHNICIEN, COACH).
// Chaque requête est limitée à la salle du compte connecté (req.gym) ; un id envoyé par le client est toujours
// revérifié contre cette salle. Les permissions par rôle viennent de services/permissions.js.
const router = require('express').Router();
const { Gym } = require('../../models');
const { ah, HttpError } = require('../../middleware/errors');
const { auth, requireStaff } = require('../../middleware/auth');
const { gymSettings } = require('../../services/gymSettings');

router.use(
  auth,
  requireStaff,
  ah(async (req, res, next) => {
    const gym = await Gym.findByPk(req.user.gymId);
    if (!gym) throw new HttpError(403, 'FORBIDDEN', 'Accès refusé.');
    req.gym = gym;
    req.settings = gymSettings(gym);
    next();
  })
);

router.use(require('./dashboard'));
router.use(require('./live'));
router.use(require('./members'));
router.use(require('./plans'));
router.use(require('./payments'));
router.use(require('./machines'));
router.use(require('./reports'));
router.use(require('./team'));
router.use(require('./settings'));
router.use(require('./campaigns'));
router.use(require('./stats'));
router.use(require('./content'));

module.exports = router;
