// Formules et tarifs (D8) + règles communes (frais d'inscription, délai de grâce, gel maximum).
// Un changement de prix ne touche que les prochains achats : l'abonnement garde le montant payé.
const router = require('express').Router();
const { Op } = require('sequelize');
const { Plan, Payment, Subscription } = require('../../models');
const { ah, HttpError } = require('../../middleware/errors');
const { requirePermission } = require('../../middleware/auth');
const { required, num, oneOf, text, localDate, addMonths } = require('../../utils');
const { cleanSettings } = require('../../services/gymSettings');
const { dayStart } = require('../../services/schedule');
const { audit } = require('../../services/audit');
const { round3 } = require('../../services/payments');

function cleanPlan(body, { partial = false } = {}) {
  if (!partial) required(body, ['nameFr', 'nameAr', 'duration', 'durationUnit', 'price']);
  const out = {};
  const has = (k) => body[k] !== undefined;
  const name = (k, max) => {
    const v = text(body[k], max);
    if (!v) throw new HttpError(400, 'VALIDATION', `Champ invalide : ${k}`);
    return v;
  };
  if (has('nameFr')) out.nameFr = name('nameFr', 60);
  if (has('nameAr')) out.nameAr = name('nameAr', 60);
  if (has('nameEn')) out.nameEn = text(body.nameEn, 60);
  if (has('durationUnit')) out.durationUnit = oneOf(body.durationUnit, ['DAY', 'MONTH'], 'durationUnit');
  if (has('duration')) out.duration = num(body.duration, 'duration', { min: 1, max: 365, integer: true });
  if (has('price')) out.price = round3(num(body.price, 'price', { min: 0, max: 100000 }));
  if (has('accessHours')) out.accessHours = oneOf(body.accessHours, ['ALL', 'OFF_PEAK'], 'accessHours');
  if (has('freezeDays')) out.freezeDays = num(body.freezeDays, 'freezeDays', { min: 0, max: 180, integer: true });
  if (has('position')) out.position = num(body.position, 'position', { min: 0, max: 1000, integer: true });
  for (const k of ['inApp', 'visible']) {
    if (has(k)) {
      if (typeof body[k] !== 'boolean') throw new HttpError(400, 'VALIDATION', `Champ invalide : ${k}`);
      out[k] = body[k];
    }
  }
  if (has('noteFr')) out.noteFr = text(body.noteFr, 120);
  if (has('noteAr')) out.noteAr = text(body.noteAr, 120);
  return out;
}

const planView = (p) => ({
  id: p.id,
  nameFr: p.nameFr,
  nameAr: p.nameAr,
  nameEn: p.nameEn,
  duration: p.duration,
  durationUnit: p.durationUnit,
  price: p.price,
  accessHours: p.accessHours,
  inApp: p.inApp,
  freezeDays: p.freezeDays,
  noteFr: p.noteFr,
  noteAr: p.noteAr,
  visible: p.visible,
  archived: p.archived,
  position: p.position,
});

async function findPlan(req) {
  const plan = await Plan.findOne({ where: { id: Number(req.params.id) || 0, gymId: req.gym.id } });
  if (!plan) throw new HttpError(404, 'NOT_FOUND', 'Formule introuvable.');
  return plan;
}

// Liste + membres en cours + part des revenus du mois dernier + règles communes
router.get(
  '/plans',
  requirePermission('plans.read'),
  ah(async (req, res) => {
    const gymId = req.gym.id;
    const today = localDate();
    const lastMonthStart = `${addMonths(today, -1).slice(0, 7)}-01`;
    const thisMonthStart = `${today.slice(0, 7)}-01`;
    const [plans, payments, current] = await Promise.all([
      Plan.findAll({ where: { gymId }, order: [['archived', 'ASC'], ['position', 'ASC'], ['id', 'ASC']] }),
      Payment.findAll({ attributes: ['planId', 'amount'], where: { gymId, planId: { [Op.ne]: null }, createdAt: { [Op.gte]: dayStart(lastMonthStart), [Op.lt]: dayStart(thisMonthStart) } }, raw: true }),
      Subscription.findAll({ attributes: ['userId', 'planId'], where: { gymId, startDate: { [Op.lte]: today }, endDate: { [Op.gte]: today } }, raw: true }),
    ]);
    const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0);
    res.json({
      month: lastMonthStart.slice(0, 7),
      plans: plans.map((p) => {
        const mine = payments.filter((x) => x.planId === p.id);
        const revenue = mine.reduce((s, x) => s + Number(x.amount), 0);
        return {
          ...planView(p),
          activeMembers: new Set(current.filter((s) => s.planId === p.id).map((s) => s.userId)).size,
          salesLastMonth: mine.length,
          revenueLastMonth: round3(revenue),
          revenueShare: totalRevenue ? Math.round((revenue / totalRevenue) * 100) : 0,
        };
      }),
      rules: req.settings.rules,
    });
  })
);

router.post(
  '/plans',
  requirePermission('plans.write'),
  ah(async (req, res) => {
    const plan = await Plan.create({ ...cleanPlan(req.body), gymId: req.gym.id });
    await audit(req, 'plan.create', { type: 'Plan', id: plan.id }, { nameFr: plan.nameFr, price: plan.price });
    res.status(201).json(planView(plan));
  })
);

router.put(
  '/plans/:id',
  requirePermission('plans.write'),
  ah(async (req, res) => {
    const plan = await findPlan(req);
    const data = cleanPlan(req.body, { partial: true });
    const before = { price: plan.price };
    await plan.update(data);
    await audit(req, 'plan.update', { type: 'Plan', id: plan.id }, { fields: Object.keys(data), ...(data.price !== undefined ? { priceBefore: before.price, priceAfter: plan.price } : {}) });
    const running = await Subscription.count({ where: { gymId: req.gym.id, planId: plan.id, endDate: { [Op.gte]: localDate() } } });
    res.json({ ...planView(plan), runningSubscriptions: running });
  })
);

// Archiver (masquer) ; les abonnements en cours ne changent pas
router.post(
  '/plans/:id/archive',
  requirePermission('plans.write'),
  ah(async (req, res) => {
    const plan = await findPlan(req);
    await plan.update({ archived: true, visible: false });
    await audit(req, 'plan.archive', { type: 'Plan', id: plan.id });
    res.json(planView(plan));
  })
);

router.post(
  '/plans/:id/unarchive',
  requirePermission('plans.write'),
  ah(async (req, res) => {
    const plan = await findPlan(req);
    await plan.update({ archived: false });
    await audit(req, 'plan.unarchive', { type: 'Plan', id: plan.id });
    res.json(planView(plan));
  })
);

// Règles communes : frais d'inscription, délai de grâce, gel maximum par an
router.put(
  '/plans-rules',
  requirePermission('plans.write'),
  ah(async (req, res) => {
    const incoming = {};
    for (const k of ['registrationFee', 'graceDays', 'maxFreezeDaysPerYear']) {
      if (req.body[k] !== undefined) incoming[k] = num(req.body[k], k, { min: 0, max: 10000 });
    }
    const settings = cleanSettings(req.gym.settings, { rules: incoming });
    await req.gym.update({ settings });
    await audit(req, 'settings.rules', { type: 'Gym', id: req.gym.id }, settings.rules);
    res.json(settings.rules);
  })
);

module.exports = router;
