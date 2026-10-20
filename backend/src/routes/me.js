// Espace du sportif connecté : profil, abonnement, présence en salle, signalement de panne
const router = require('express').Router();
const { Op } = require('sequelize');
const { User, Gym, Subscription, CheckIn, Machine, Report } = require('../models');
const { ah, HttpError } = require('../middleware/errors');
const { auth } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { publicUser, pick, subscriptionStatus, required, checkPassword } = require('../utils');
const { INJURY_ZONES } = require('../services/constants');
const { saveTarget } = require('../services/nutrition');

const NUTRITION_FIELDS = ['age', 'weight', 'height', 'goal', 'level', 'daysPerWeek'];

router.use(auth);

router.put(
  '/profile',
  ah(async (req, res) => {
    const user = await User.findByPk(req.user.id);
    const data = pick(req.body, ['name', 'language', 'age', 'weight', 'height', 'goal', 'level', 'daysPerWeek', 'injuries', 'gymId', 'healthConsent']);
    if (data.injuries) {
      if (!Array.isArray(data.injuries)) throw new HttpError(400, 'VALIDATION', 'injuries doit être une liste.');
      data.injuries = data.injuries.filter((z) => INJURY_ZONES[z]);
    }
    if (data.daysPerWeek !== undefined) data.daysPerWeek = Math.min(6, Math.max(2, Number(data.daysPerWeek) || 3));
    if (data.gymId !== undefined && data.gymId !== null) {
      if (user.role !== 'SPORTIF') delete data.gymId; // un gérant ne change pas de salle ici
      else if (!(await Gym.findByPk(data.gymId))) throw new HttpError(400, 'GYM_NOT_FOUND', 'Salle introuvable.');
    }
    // Données de santé (poids, blessures) : seulement avec l'accord du sportif
    if ((data.weight || (data.injuries && data.injuries.length)) && !(data.healthConsent ?? user.healthConsent)) {
      throw new HttpError(400, 'CONSENT_REQUIRED', 'Accord requis pour enregistrer le poids et les blessures.');
    }
    await user.update(data);
    // profil physique ou objectif modifié : l'objectif repas est recalculé
    if (user.role === 'SPORTIF' && NUTRITION_FIELDS.some((f) => data[f] !== undefined)) {
      try {
        await saveTarget(user);
      } catch (err) {
        console.warn('Objectif repas non recalculé :', err.message);
      }
    }
    const fresh = await User.findByPk(user.id, { include: [{ model: Gym, as: 'gym' }] });
    res.json(publicUser(fresh));
  })
);

// Changer son mot de passe (tous les rôles) : l'ancien mot de passe est demandé
router.put(
  '/password',
  ah(async (req, res) => {
    required(req.body, ['currentPassword', 'newPassword']);
    const user = await User.scope('withPassword').findByPk(req.user.id);
    if (!(await bcrypt.compare(String(req.body.currentPassword), user.passwordHash))) {
      throw new HttpError(400, 'BAD_PASSWORD', 'Mot de passe actuel incorrect.');
    }
    checkPassword(req.body.newPassword);
    if (req.body.newPassword === req.body.currentPassword) throw new HttpError(400, 'SAME_PASSWORD', 'Le nouveau mot de passe doit être différent de l’ancien.');
    await user.update({ passwordHash: await bcrypt.hash(String(req.body.newPassword), 10) });
    res.json({ ok: true });
  })
);

// Mon abonnement (le plus récent)
router.get(
  '/subscription',
  ah(async (req, res) => {
    const sub = await Subscription.findOne({ where: { userId: req.user.id }, order: [['endDate', 'DESC']] });
    if (!sub) return res.json(null);
    return res.json({ ...sub.toJSON(), ...subscriptionStatus(sub.endDate) });
  })
);

// Présence en salle (pour l'affluence)
router.post(
  '/checkin',
  ah(async (req, res) => {
    const user = await User.findByPk(req.user.id);
    if (!user.gymId) throw new HttpError(400, 'NO_GYM', 'Choisissez d’abord votre salle.');
    const since = new Date(Date.now() - 2 * 3600000);
    const open = await CheckIn.findOne({ where: { userId: user.id, checkOutAt: null, checkInAt: { [Op.gte]: since } } });
    if (open) return res.json(open);
    const checkin = await CheckIn.create({ userId: user.id, gymId: user.gymId, checkInAt: new Date() });
    return res.status(201).json(checkin);
  })
);

router.post(
  '/checkout',
  ah(async (req, res) => {
    const open = await CheckIn.findOne({ where: { userId: req.user.id, checkOutAt: null }, order: [['checkInAt', 'DESC']] });
    if (open) await open.update({ checkOutAt: new Date() });
    res.json({ ok: true });
  })
);

router.get(
  '/checkin',
  ah(async (req, res) => {
    const since = new Date(Date.now() - 2 * 3600000);
    const open = await CheckIn.findOne({ where: { userId: req.user.id, checkOutAt: null, checkInAt: { [Op.gte]: since } } });
    res.json(open);
  })
);

// Signaler une machine en panne
router.post(
  '/reports',
  ah(async (req, res) => {
    const machine = await Machine.findByPk(req.body.machineId);
    const user = await User.findByPk(req.user.id);
    if (!machine || machine.gymId !== user.gymId) throw new HttpError(404, 'NOT_FOUND', 'Machine introuvable dans votre salle.');
    const report = await Report.create({
      machineId: machine.id,
      gymId: machine.gymId,
      userId: user.id,
      description: String(req.body.description || '').slice(0, 255),
    });
    res.status(201).json(report);
  })
);

module.exports = router;
