// Tableau de bord du gérant de salle (RG8 : il ne gère que sa propre salle)
const router = require('express').Router();
const { Op } = require('sequelize');
const {
  User, Gym, Machine, Equipment, Subscription, Report, CheckIn, SessionEntry, WorkoutSession, Exercise,
} = require('../models');
const { ah, HttpError } = require('../middleware/errors');
const { auth, requireRole } = require('../middleware/auth');
const { required, pick, subscriptionStatus, publicUser } = require('../utils');
const { identifyMachine } = require('../services/machinePhoto');

router.use(auth, requireRole('GERANT'));

// Charge la salle du gérant connecté
router.use(
  ah(async (req, res, next) => {
    const me = await User.findByPk(req.user.id);
    const gym = me && me.gymId ? await Gym.findByPk(me.gymId) : null;
    if (!gym) throw new HttpError(400, 'NO_GYM', 'Aucune salle n’est associée à ce compte gérant.');
    req.gym = gym;
    next();
  })
);

// ---------------------------------------------------------------- Salle
router.get('/gym', (req, res) => res.json(req.gym));

router.put(
  '/gym',
  ah(async (req, res) => {
    await req.gym.update(pick(req.body, ['name', 'address', 'city', 'phone', 'openingHours']));
    res.json(req.gym);
  })
);

// ---------------------------------------------------------------- Machines
router.get(
  '/machines',
  ah(async (req, res) => {
    const machines = await Machine.findAll({
      where: { gymId: req.gym.id },
      include: [{ model: Equipment, as: 'equipment' }],
      order: [['label', 'ASC']],
    });
    res.json(machines);
  })
);

router.post(
  '/machines',
  ah(async (req, res) => {
    required(req.body, ['equipmentId', 'label']);
    if (!(await Equipment.findByPk(req.body.equipmentId))) throw new HttpError(400, 'VALIDATION', 'Équipement inconnu.');
    const machine = await Machine.create({ gymId: req.gym.id, equipmentId: req.body.equipmentId, label: req.body.label, status: 'OK' });
    res.status(201).json(machine);
  })
);

// Reconnaissance d'un équipement à partir d'une photo (IA) : propose le type et un nom
router.post(
  '/machines/identify',
  ah(async (req, res) => {
    const result = await identifyMachine(req.body.image);
    // seul l'administrateur peut créer un nouveau type d'équipement
    if (!result.equipmentId) throw new HttpError(422, 'NOT_RECOGNIZED', 'Équipement non reconnu. Choisissez le type à la main.');
    res.json(result);
  })
);

async function myMachine(req) {
  const machine = await Machine.findOne({ where: { id: req.params.id, gymId: req.gym.id } });
  if (!machine) throw new HttpError(404, 'NOT_FOUND', 'Machine introuvable.');
  return machine;
}

router.put(
  '/machines/:id',
  ah(async (req, res) => {
    const machine = await myMachine(req);
    const data = pick(req.body, ['label', 'status', 'equipmentId']);
    await machine.update(data);
    // machine réparée : on clôt les signalements ouverts
    if (data.status === 'OK') {
      await Report.update({ status: 'RESOLU' }, { where: { machineId: machine.id, status: { [Op.in]: ['NOUVEAU', 'CONFIRME'] } } });
    }
    res.json(machine);
  })
);

router.delete(
  '/machines/:id',
  ah(async (req, res) => {
    const machine = await myMachine(req);
    await machine.destroy();
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------- Signalements de panne
router.get(
  '/reports',
  ah(async (req, res) => {
    const reports = await Report.findAll({
      where: { gymId: req.gym.id },
      include: [
        { model: Machine, as: 'machine', include: [{ model: Equipment, as: 'equipment' }] },
        { model: User, as: 'author', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    res.json(reports);
  })
);

// action : CONFIRMER (machine en panne), RESOUDRE (machine réparée), REJETER
router.put(
  '/reports/:id',
  ah(async (req, res) => {
    const report = await Report.findOne({ where: { id: req.params.id, gymId: req.gym.id }, include: [{ model: Machine, as: 'machine' }] });
    if (!report) throw new HttpError(404, 'NOT_FOUND', 'Signalement introuvable.');
    const action = req.body.action;
    if (action === 'CONFIRMER') {
      await report.update({ status: 'CONFIRME' });
      await report.machine.update({ status: 'PANNE' }); // RG6 : la machine n'est plus proposée
    } else if (action === 'RESOUDRE') {
      await report.update({ status: 'RESOLU' });
      await report.machine.update({ status: 'OK' });
    } else if (action === 'REJETER') {
      await report.update({ status: 'REJETE' });
    } else {
      throw new HttpError(400, 'VALIDATION', 'Action inconnue.');
    }
    res.json(report);
  })
);

// ---------------------------------------------------------------- Abonnés et abonnements
router.get(
  '/members',
  ah(async (req, res) => {
    const members = await User.findAll({
      where: { gymId: req.gym.id, role: 'SPORTIF' },
      include: [{ model: Subscription, as: 'subscriptions', separate: true, order: [['endDate', 'DESC']] }],
      order: [['name', 'ASC']],
    });
    res.json(
      members.map((m) => {
        const data = publicUser(m);
        const last = data.subscriptions[0];
        data.subscription = last ? { ...last, ...subscriptionStatus(last.endDate) } : null;
        delete data.subscriptions;
        return data;
      })
    );
  })
);

// Rattacher un sportif existant à la salle (par e-mail)
router.post(
  '/members',
  ah(async (req, res) => {
    required(req.body, ['email']);
    const user = await User.findOne({ where: { email: String(req.body.email).toLowerCase().trim(), role: 'SPORTIF' } });
    if (!user) throw new HttpError(404, 'NOT_FOUND', 'Aucun sportif avec cet e-mail. Il doit d’abord créer son compte.');
    await user.update({ gymId: req.gym.id });
    res.json(publicUser(user));
  })
);

router.get(
  '/subscriptions',
  ah(async (req, res) => {
    const subs = await Subscription.findAll({
      where: { gymId: req.gym.id },
      include: [{ model: User, as: 'member', attributes: ['id', 'name', 'email'] }],
      order: [['endDate', 'DESC']],
    });
    res.json(subs.map((s) => ({ ...s.toJSON(), ...subscriptionStatus(s.endDate) })));
  })
);

router.post(
  '/subscriptions',
  ah(async (req, res) => {
    required(req.body, ['userId', 'startDate', 'endDate', 'amount']);
    const member = await User.findOne({ where: { id: req.body.userId, gymId: req.gym.id } });
    if (!member) throw new HttpError(404, 'NOT_FOUND', 'Abonné introuvable dans votre salle.');
    if (req.body.endDate < req.body.startDate) throw new HttpError(400, 'VALIDATION', 'La date de fin doit être après la date de début.');
    const sub = await Subscription.create({
      ...pick(req.body, ['startDate', 'endDate', 'amount', 'paymentMethod', 'note']),
      userId: member.id,
      gymId: req.gym.id,
    });
    res.status(201).json(sub);
  })
);

router.put(
  '/subscriptions/:id',
  ah(async (req, res) => {
    const sub = await Subscription.findOne({ where: { id: req.params.id, gymId: req.gym.id } });
    if (!sub) throw new HttpError(404, 'NOT_FOUND', 'Abonnement introuvable.');
    await sub.update(pick(req.body, ['startDate', 'endDate', 'amount', 'paymentMethod', 'note']));
    res.json(sub);
  })
);

router.delete(
  '/subscriptions/:id',
  ah(async (req, res) => {
    const sub = await Subscription.findOne({ where: { id: req.params.id, gymId: req.gym.id } });
    if (!sub) throw new HttpError(404, 'NOT_FOUND', 'Abonnement introuvable.');
    await sub.destroy();
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------- Statistiques
router.get(
  '/stats',
  ah(async (req, res) => {
    const gymId = req.gym.id;
    const since30 = new Date(Date.now() - 30 * 86400000);
    const now = new Date();

    const [members, subs, openReports, checkins, present] = await Promise.all([
      User.count({ where: { gymId, role: 'SPORTIF' } }),
      Subscription.findAll({ where: { gymId } }),
      Report.count({ where: { gymId, status: { [Op.in]: ['NOUVEAU', 'CONFIRME'] } } }),
      CheckIn.findAll({ where: { gymId, checkInAt: { [Op.gte]: since30 } }, attributes: ['checkInAt'] }),
      CheckIn.count({
        where: {
          gymId,
          checkInAt: { [Op.gte]: new Date(Date.now() - 2 * 3600000) },
          [Op.or]: [{ checkOutAt: null }, { checkOutAt: { [Op.gt]: now } }],
        },
      }),
    ]);

    // Abonnements : actifs, bientôt expirés, recettes du mois
    const latestByUser = {};
    for (const s of subs) {
      if (!latestByUser[s.userId] || s.endDate > latestByUser[s.userId].endDate) latestByUser[s.userId] = s;
    }
    let active = 0;
    let expiringSoon = 0;
    for (const s of Object.values(latestByUser)) {
      const st = subscriptionStatus(s.endDate).status;
      if (st !== 'EXPIRE') active += 1;
      if (st === 'EXPIRE_BIENTOT') expiringSoon += 1;
    }
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const revenueMonth = subs.filter((s) => String(s.startDate).startsWith(monthPrefix)).reduce((sum, s) => sum + s.amount, 0);

    // Affluence moyenne par heure (30 derniers jours) et par jour de la semaine
    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, visits: 0 }));
    const byWeekday = Array.from({ length: 7 }, (_, d) => ({ day: d, visits: 0 })); // 0 = lundi
    for (const c of checkins) {
      const d = new Date(c.checkInAt);
      byHour[d.getHours()].visits += 1;
      byWeekday[(d.getDay() + 6) % 7].visits += 1;
    }
    byHour.forEach((h) => {
      h.avg = Math.round((h.visits / 30) * 10) / 10;
    });

    // Équipements les plus souvent remplacés par les sportifs de la salle
    const substituted = await SessionEntry.findAll({
      where: { reason: { [Op.ne]: null } },
      include: [
        { model: WorkoutSession, as: 'session', attributes: [], required: true, include: [{ model: User, as: 'user', attributes: [], where: { gymId } }] },
        { model: Exercise, as: 'originalExercise', include: [{ model: Equipment, as: 'equipment' }] },
      ],
    });
    const counts = {};
    for (const e of substituted) {
      const eqp = e.originalExercise && e.originalExercise.equipment;
      if (!eqp) continue;
      counts[eqp.code] = counts[eqp.code] || { code: eqp.code, nameFr: eqp.nameFr, nameAr: eqp.nameAr, count: 0, OCCUPEE: 0, ABSENTE: 0, PANNE: 0 };
      counts[eqp.code].count += 1;
      counts[eqp.code][e.reason] += 1;
    }

    res.json({
      members,
      activeSubscriptions: active,
      expiringSoon,
      revenueMonth: Math.round(revenueMonth * 1000) / 1000,
      openReports,
      presentNow: present,
      visits30Days: checkins.length,
      byHour,
      byWeekday,
      mostSubstituted: Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 6),
    });
  })
);

module.exports = router;
