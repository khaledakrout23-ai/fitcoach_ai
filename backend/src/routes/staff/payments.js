// Paiements (D9) et caisse du jour. Les paiements ne se modifient pas et ne se suppriment pas.
const router = require('express').Router();
const { Op } = require('sequelize');
const { sequelize, Payment, Plan, User, CashSession } = require('../../models');
const { ah, HttpError } = require('../../middleware/errors');
const { requirePermission } = require('../../middleware/auth');
const { required, num, oneOf, text, localDate, addDays, addMonths } = require('../../utils');
const { dayStart, mondayOf } = require('../../services/schedule');
const { assertMethod, recordPayment, openCashSession, cashReceived, totalBetween, round3 } = require('../../services/payments');
const { findMember, planName } = require('../../services/members');
const { audit } = require('../../services/audit');
const { sendCsv } = require('../../services/csv');
const { PAYMENT_METHOD_LABELS } = require('../../services/constants');

const perm = requirePermission('payments');
const PERIODS = ['today', 'week', 'month', 'lastMonth', 'all'];

function periodRange(period, today = localDate()) {
  const tomorrow = dayStart(addDays(today, 1));
  const monthStart = `${today.slice(0, 7)}-01`;
  if (period === 'today') return [dayStart(today), tomorrow];
  if (period === 'week') return [dayStart(mondayOf(today)), tomorrow];
  if (period === 'month') return [dayStart(monthStart), tomorrow];
  if (period === 'lastMonth') return [dayStart(addMonths(monthStart, -1)), dayStart(monthStart)];
  return [new Date(0), tomorrow];
}

const include = [
  { model: User, as: 'member', attributes: ['id', 'name'] },
  { model: User, as: 'receivedBy', attributes: ['id', 'name'] },
  { model: Plan, as: 'plan' },
];

const paymentView = (p) => ({
  id: p.id,
  createdAt: p.createdAt,
  amount: p.amount,
  method: p.method,
  kind: p.kind,
  label: p.label,
  member: p.member ? { id: p.member.id, name: p.member.name } : null,
  plan: planName(p.plan),
  receivedBy: p.receivedBy ? { id: p.receivedBy.id, name: p.receivedBy.name } : null,
  cashSessionId: p.cashSessionId || null,
});

function breakdown(rows, keyOf) {
  const total = rows.reduce((s, p) => s + Number(p.amount), 0);
  const map = new Map();
  for (const p of rows) {
    const k = keyOf(p);
    const e = map.get(k) || { amount: 0, count: 0 };
    e.amount += Number(p.amount);
    e.count += 1;
    map.set(k, e);
  }
  return [...map.entries()]
    .map(([key, e]) => ({ key, amount: round3(e.amount), count: e.count, pct: total ? Math.round((e.amount / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

router.get(
  '/payments',
  perm,
  ah(async (req, res) => {
    const gymId = req.gym.id;
    const today = localDate();
    const period = req.query.period === undefined ? 'week' : oneOf(req.query.period, PERIODS, 'period');
    const page = req.query.page === undefined ? 1 : num(req.query.page, 'page', { min: 1, max: 10000, integer: true });
    const pageSize = req.query.pageSize === undefined ? 20 : num(req.query.pageSize, 'pageSize', { min: 5, max: 100, integer: true });
    const [from, to] = periodRange(period, today);
    const where = { gymId, createdAt: { [Op.gte]: from, [Op.lt]: to } };
    if (req.query.method) where.method = oneOf(req.query.method, Object.keys(PAYMENT_METHOD_LABELS), 'method');

    const monthStart = `${today.slice(0, 7)}-01`;
    const [lmFrom, lmTo] = periodRange('lastMonth', today);
    const [list, count, todayT, weekT, monthT, lastMonthT, beforeT, lastMonthRows, periodRows] = await Promise.all([
      Payment.findAll({ where, include, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: pageSize, offset: (page - 1) * pageSize }),
      Payment.count({ where }),
      totalBetween(gymId, ...periodRange('today', today)),
      totalBetween(gymId, ...periodRange('week', today)),
      totalBetween(gymId, ...periodRange('month', today)),
      totalBetween(gymId, lmFrom, lmTo),
      totalBetween(gymId, dayStart(addMonths(monthStart, -2)), lmFrom),
      Payment.findAll({ attributes: ['amount', 'method'], where: { gymId, createdAt: { [Op.gte]: lmFrom, [Op.lt]: lmTo } }, raw: true }),
      Payment.findAll({ attributes: ['amount', 'receivedById'], where, include: [{ model: User, as: 'receivedBy', attributes: ['id', 'name'] }] }),
    ]);
    const staffNames = new Map(periodRows.filter((p) => p.receivedBy).map((p) => [p.receivedById, p.receivedBy.name]));
    res.json({
      period,
      from,
      to,
      total: count,
      page,
      pageSize,
      items: list.map(paymentView),
      totals: {
        today: todayT,
        week: weekT,
        month: monthT,
        lastMonth: {
          month: localDate(lmFrom).slice(0, 7),
          ...lastMonthT,
          previousAmount: beforeT.amount,
          deltaPct: beforeT.amount ? Math.round(((lastMonthT.amount - beforeT.amount) / beforeT.amount) * 1000) / 10 : null,
        },
        period: { amount: round3(periodRows.reduce((s, p) => s + p.amount, 0)), count: periodRows.length },
      },
      byMethod: { month: localDate(lmFrom).slice(0, 7), items: breakdown(lastMonthRows, (p) => p.method).map((e) => ({ method: e.key, amount: e.amount, count: e.count, pct: e.pct })) },
      byStaff: breakdown(periodRows, (p) => p.receivedById || 0).map((e) => ({ staff: e.key ? { id: e.key, name: staffNames.get(e.key) || null } : null, amount: e.amount, count: e.count, pct: e.pct })),
    });
  })
);

router.get(
  '/payments/export.csv',
  perm,
  ah(async (req, res) => {
    const period = req.query.period === undefined ? 'month' : oneOf(req.query.period, PERIODS, 'period');
    const [from, to] = periodRange(period);
    const rows = await Payment.findAll({ where: { gymId: req.gym.id, createdAt: { [Op.gte]: from, [Op.lt]: to } }, include, order: [['createdAt', 'ASC']] });
    await audit(req, 'payment.export', { type: 'Gym', id: req.gym.id }, { period, count: rows.length });
    sendCsv(
      res,
      `paiements-${period}-${localDate()}.csv`,
      rows.map((p) => ({
        date: new Date(p.createdAt).toISOString().slice(0, 16).replace('T', ' '),
        member: p.member ? p.member.name : p.label,
        plan: p.plan ? p.plan.nameFr : p.label,
        kind: p.kind,
        method: (PAYMENT_METHOD_LABELS[p.method] || {}).fr || p.method,
        staff: p.receivedBy ? p.receivedBy.name : '',
        amount: p.amount.toFixed(3),
      })),
      [
        { key: 'date', label: 'Date' },
        { key: 'member', label: 'Membre' },
        { key: 'plan', label: 'Formule' },
        { key: 'kind', label: 'Type' },
        { key: 'method', label: 'Moyen' },
        { key: 'staff', label: 'Encaissé par' },
        { key: 'amount', label: 'Montant (TND)' },
      ]
    );
  })
);

// Paiement ponctuel : séance unique d'un visiteur (formule à la journée), ou d'un membre de la salle
router.post(
  '/payments',
  perm,
  ah(async (req, res) => {
    required(req.body, ['planId', 'method']);
    const plan = await Plan.findOne({ where: { id: num(req.body.planId, 'planId', { min: 1, integer: true }), gymId: req.gym.id, archived: false, durationUnit: 'DAY' } });
    if (!plan) throw new HttpError(404, 'PLAN_NOT_FOUND', 'Formule à la journée introuvable.');
    const method = assertMethod(req.settings, req.body.method);
    const member = req.body.memberId ? await findMember(req.gym.id, req.body.memberId) : null;
    const payment = await recordPayment({
      gymId: req.gym.id,
      userId: member ? member.id : null,
      amount: plan.price,
      method,
      kind: 'SEANCE',
      label: text(req.body.label, 100) || (member ? member.name : 'Visiteur'),
      planId: plan.id,
      receivedById: req.user.id,
    });
    await audit(req, 'payment.create', { type: 'Payment', id: payment.id }, { kind: 'SEANCE', amount: payment.amount, method });
    const fresh = await Payment.findByPk(payment.id, { include });
    res.status(201).json(paymentView(fresh));
  })
);

// ---------------------------------------------------------------- Caisse du jour
async function cashView(session) {
  if (!session) return null;
  const received = await cashReceived(session);
  const opener = session.openedById ? await User.findByPk(session.openedById, { attributes: ['id', 'name'] }) : null;
  const closer = session.closedById ? await User.findByPk(session.closedById, { attributes: ['id', 'name'] }) : null;
  return {
    id: session.id,
    openedAt: session.openedAt,
    openedBy: opener ? { id: opener.id, name: opener.name } : null,
    openingFloat: session.openingFloat,
    cashReceived: received,
    expected: round3(session.openingFloat + received),
    closedAt: session.closedAt,
    closedBy: closer ? { id: closer.id, name: closer.name } : null,
    countedCash: session.countedCash,
    difference: session.countedCash == null ? null : round3(session.countedCash - session.expectedCash),
    note: session.note,
  };
}

router.get(
  '/cash',
  perm,
  ah(async (req, res) => {
    const [open, last] = await Promise.all([
      openCashSession(req.gym.id),
      CashSession.findOne({ where: { gymId: req.gym.id, closedAt: { [Op.ne]: null } }, order: [['closedAt', 'DESC']] }),
    ]);
    res.json({ open: await cashView(open), lastClosed: await cashView(last) });
  })
);

router.post(
  '/cash/open',
  perm,
  ah(async (req, res) => {
    const openingFloat = round3(num(req.body.openingFloat ?? 0, 'openingFloat', { min: 0, max: 10000 }));
    const session = await sequelize.transaction(async (t) => {
      if (await openCashSession(req.gym.id, t)) throw new HttpError(409, 'CASH_ALREADY_OPEN', 'La caisse est déjà ouverte.');
      return CashSession.create({ gymId: req.gym.id, openedAt: new Date(), openingFloat, openedById: req.user.id }, { transaction: t });
    });
    await audit(req, 'cash.open', { type: 'CashSession', id: session.id }, { openingFloat });
    res.status(201).json(await cashView(session));
  })
);

router.post(
  '/cash/close',
  perm,
  ah(async (req, res) => {
    const countedCash = round3(num(req.body.countedCash, 'countedCash', { min: 0, max: 1000000 }));
    const session = await openCashSession(req.gym.id);
    if (!session) throw new HttpError(409, 'CASH_NOT_OPEN', 'Aucune caisse ouverte.');
    const expectedCash = round3(session.openingFloat + (await cashReceived(session)));
    await session.update({ closedAt: new Date(), closedById: req.user.id, expectedCash, countedCash, note: text(req.body.note, 200) });
    await audit(req, 'cash.close', { type: 'CashSession', id: session.id }, { expectedCash, countedCash, difference: round3(countedCash - expectedCash) });
    res.json(await cashView(session));
  })
);

module.exports = router;
