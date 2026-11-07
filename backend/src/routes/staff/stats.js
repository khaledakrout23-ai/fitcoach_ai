// Rapports du mois (D17 / M12) : revenus, membres, renouvellements, visites, utilisation de l'app
const router = require('express').Router();
const { Op } = require('sequelize');
const { User, Payment, Plan, Subscription, CheckIn, WorkoutSession, SessionEntry, Meal } = require('../../models');
const { ah, HttpError } = require('../../middleware/errors');
const { requirePermission } = require('../../middleware/auth');
const { localDate, addDays, addMonths } = require('../../utils');
const { dayStart, weekdayOf } = require('../../services/schedule');
const { round3 } = require('../../services/payments');
const { planName } = require('../../services/members');

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

function monthBounds(month) {
  const first = `${month}-01`;
  const next = addMonths(first, 1);
  return { first, next, last: addDays(next, -1) };
}

async function monthFigures(gymId, month, today) {
  const { first, next, last } = monthBounds(month);
  const ref = last < today ? last : today; // dernier jour observé du mois
  const [revenue, subs, entries] = await Promise.all([
    Payment.sum('amount', { where: { gymId, createdAt: { [Op.gte]: dayStart(first), [Op.lt]: dayStart(next) } } }),
    Subscription.findAll({ attributes: ['id', 'userId', 'startDate', 'endDate'], where: { gymId, startDate: { [Op.lte]: ref }, endDate: { [Op.gte]: addMonths(first, -14) } }, raw: true }),
    CheckIn.count({ where: { gymId, status: 'ENTREE', checkInAt: { [Op.gte]: dayStart(first), [Op.lt]: dayStart(next) } } }),
  ]);
  const active = new Set(subs.filter((s) => s.startDate <= ref && s.endDate >= ref).map((s) => s.userId)).size;
  // renouvellements : abonnements terminés dans le mois suivis d'un autre abonnement
  const ending = subs.filter((s) => s.endDate >= first && s.endDate <= last && s.endDate < today);
  const renewed = ending.filter((s) => subs.some((o) => o.userId === s.userId && o.id !== s.id && o.startDate > s.startDate));
  const days = Math.max(1, (new Date(`${ref}T12:00:00`) - new Date(`${first}T12:00:00`)) / 86400000 + 1);
  return {
    revenue: round3(revenue),
    activeMembers: active,
    renewalRate: pct(renewed.length, ending.length),
    departures: ending.length - renewed.length,
    visitsPerMemberWeek: active ? Math.round((entries / active / (days / 7)) * 10) / 10 : 0,
    entries,
    days,
  };
}

router.get(
  '/stats',
  requirePermission('stats'),
  ah(async (req, res) => {
    const gymId = req.gym.id;
    const today = localDate();
    const month = req.query.month === undefined ? addMonths(today, -1).slice(0, 7) : String(req.query.month);
    if (!MONTH.test(month) || month > today.slice(0, 7)) throw new HttpError(400, 'VALIDATION', 'Champ invalide : month');
    const previous = addMonths(`${month}-01`, -1).slice(0, 7);
    const { first, next, last } = monthBounds(month);
    const [cur, prev] = await Promise.all([monthFigures(gymId, month, today), monthFigures(gymId, previous, today)]);

    const members = await User.findAll({ attributes: ['id', 'createdAt', 'lastLoginAt'], where: { gymId, role: 'SPORTIF', deletedAt: null }, raw: true });
    const ids = members.map((m) => m.id);
    const inMonth = { [Op.gte]: dayStart(first), [Op.lt]: dayStart(next) };
    const newMembers = members.filter((m) => new Date(m.createdAt) >= dayStart(first) && new Date(m.createdAt) < dayStart(next)).length;

    // revenus des 12 mois jusqu'au mois en cours
    const from12 = `${addMonths(`${today.slice(0, 7)}-01`, -11).slice(0, 7)}-01`;
    const [payments12, monthPayments, checkins, sessionsLogged, mealsLogged, alternativesChosen, currentSubs] = await Promise.all([
      Payment.findAll({ attributes: ['amount', 'createdAt'], where: { gymId, createdAt: { [Op.gte]: dayStart(from12) } }, raw: true }),
      Payment.findAll({ attributes: ['amount', 'planId'], where: { gymId, planId: { [Op.ne]: null }, createdAt: inMonth }, include: [{ model: Plan, as: 'plan' }] }),
      CheckIn.findAll({ attributes: ['checkInAt'], where: { gymId, status: 'ENTREE', checkInAt: inMonth }, raw: true }),
      ids.length ? WorkoutSession.count({ where: { userId: ids, status: 'TERMINEE', startedAt: inMonth } }) : 0,
      ids.length ? Meal.count({ where: { userId: ids, date: { [Op.between]: [first, last] } } }) : 0,
      ids.length
        ? SessionEntry.count({ where: { originalExerciseId: { [Op.ne]: null } }, include: [{ model: WorkoutSession, as: 'session', attributes: [], where: { userId: ids, startedAt: inMonth } }] })
        : 0,
      Subscription.findAll({ attributes: ['userId'], where: { gymId, startDate: { [Op.lte]: today }, endDate: { [Op.gte]: today } }, raw: true }),
    ]);
    const months = [];
    for (let i = 11; i >= 0; i -= 1) months.push({ month: addMonths(`${today.slice(0, 7)}-01`, -i).slice(0, 7), total: 0 });
    for (const p of payments12) {
      const m = months.find((x) => x.month === localDate(new Date(p.createdAt)).slice(0, 7));
      if (m) m.total += Number(p.amount);
    }
    for (const m of months) m.total = round3(m.total);

    const planTotal = monthPayments.reduce((s, p) => s + p.amount, 0);
    const byPlan = new Map();
    for (const p of monthPayments) {
      const e = byPlan.get(p.planId) || { plan: planName(p.plan), amount: 0, count: 0 };
      e.amount += p.amount;
      e.count += 1;
      byPlan.set(p.planId, e);
    }

    // moyenne des entrées par jour de semaine (jours observés du mois)
    const counts = new Array(7).fill(0);
    const occurrences = new Array(7).fill(0);
    for (let d = first; d <= last && d <= today; d = addDays(d, 1)) occurrences[weekdayOf(d)] += 1;
    for (const c of checkins) counts[weekdayOf(localDate(new Date(c.checkInAt)))] += 1;

    const activeNow = new Set(currentSubs.map((s) => s.userId));
    const weekAgo = Date.now() - 7 * 86400000;
    const openedApp = members.filter((m) => activeNow.has(m.id) && m.lastLoginAt && new Date(m.lastLoginAt).getTime() >= weekAgo).length;

    res.json({
      month,
      previousMonth: previous,
      revenue: { total: cur.revenue, previous: prev.revenue, deltaPct: prev.revenue ? Math.round(((cur.revenue - prev.revenue) / prev.revenue) * 1000) / 10 : null },
      activeMembers: { count: cur.activeMembers, previous: prev.activeMembers, delta: cur.activeMembers - prev.activeMembers },
      newMembers: { count: newMembers, departures: cur.departures },
      renewals: { rate: cur.renewalRate, previousRate: prev.renewalRate, deltaPoints: cur.renewalRate != null && prev.renewalRate != null ? Math.round((cur.renewalRate - prev.renewalRate) * 10) / 10 : null },
      visitsPerMemberWeek: { value: cur.visitsPerMemberWeek, previous: prev.visitsPerMemberWeek, delta: Math.round((cur.visitsPerMemberWeek - prev.visitsPerMemberWeek) * 10) / 10 },
      revenueByMonth: months,
      revenueByPlan: [...byPlan.values()]
        .map((e) => ({ plan: e.plan, amount: round3(e.amount), count: e.count, pct: planTotal ? Math.round((e.amount / planTotal) * 100) : 0 }))
        .sort((a, b) => b.amount - a.amount),
      entriesByWeekday: counts.map((n, weekday) => ({ weekday, average: occurrences[weekday] ? Math.round(n / occurrences[weekday]) : 0 })),
      appUsage: {
        openedThisWeekPct: activeNow.size ? Math.round((openedApp / activeNow.size) * 100) : 0,
        sessionsLogged,
        mealsLogged,
        alternativesChosen,
      },
    });
  })
);

module.exports = router;
