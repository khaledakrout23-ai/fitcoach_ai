// Tableau de bord de la salle (D2 / M2) et compteurs du menu. Les blocs qu'un rôle ne peut pas voir sont absents.
const router = require('express').Router();
const { Op } = require('sequelize');
const { CheckIn, Report, Machine, User, Payment } = require('../../models');
const { ah } = require('../../middleware/errors');
const { requirePermission } = require('../../middleware/auth');
const { can } = require('../../services/permissions');
const { localDate, addMonths } = require('../../utils');
const { dayStart } = require('../../services/schedule');
const { liveSnapshot } = require('../../services/occupancy');
const { memberRows, expiringCount, initials } = require('../../services/members');
const { totalBetween, round3 } = require('../../services/payments');

const OPEN = ['NOUVEAU', 'VU', 'REPARATION'];
const machineView = (m) => (m ? { id: m.id, code: m.code, label: m.label, zone: m.zone } : null);

/** Signalements regroupés par machine (une ligne par machine, le plus récent d'abord) */
function groupByMachine(reports) {
  const map = new Map();
  for (const r of reports) {
    const g = map.get(r.machineId);
    if (!g) map.set(r.machineId, { report: r, count: 1 });
    else g.count += 1;
  }
  return [...map.values()];
}

// Compteurs du menu latéral (requêtes de comptage seulement)
router.get(
  '/nav-counts',
  ah(async (req, res) => {
    const gymId = req.gym.id;
    const role = req.user.role;
    const out = {};
    if (can(role, 'reports.read')) {
      [out.newReports, out.openReports] = await Promise.all([
        Report.count({ where: { gymId, status: 'NOUVEAU' } }),
        Report.count({ where: { gymId, status: OPEN } }),
      ]);
    }
    if (can(role, 'members.read')) out.expiringSoon = await expiringCount(gymId);
    if (can(role, 'live')) {
      out.refusedToday = await CheckIn.count({ where: { gymId, status: 'REFUSEE', checkInAt: { [Op.gte]: dayStart(localDate()) } } });
    }
    res.json(out);
  })
);

router.get(
  '/dashboard',
  requirePermission('dashboard'),
  ah(async (req, res) => {
    const gym = req.gym;
    const settings = req.settings;
    const role = req.user.role;
    const gymId = gym.id;
    const now = new Date();
    const today = localDate(now);
    const start = dayStart(today);
    const seesMembers = can(role, 'members.read') || can(role, 'live');

    const live = await liveSnapshot(gym, settings, now);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const [entriesToday, entriesLastWeek] = await Promise.all([
      CheckIn.count({ where: { gymId, status: 'ENTREE', checkInAt: { [Op.gte]: start, [Op.lte]: now } } }),
      CheckIn.count({ where: { gymId, status: 'ENTREE', checkInAt: { [Op.gte]: new Date(start.getTime() - 7 * 86400000), [Op.lte]: weekAgo } } }),
    ]);

    const out = {
      date: today,
      now: now.toISOString(),
      gym: { id: gym.id, name: gym.name, city: gym.city, open: live.open, opening: live.opening },
      presentNow: { count: live.count, capacity: live.capacity, level: live.level, comparedToUsual: live.comparedToUsual, deltaSince: live.deltaSince },
      entriesToday: { count: entriesToday, lastWeekSameTime: entriesLastWeek, diff: entriesToday - entriesLastWeek },
      hourlyToday: live.hourlyToday,
      peak: live.peak,
      calmWindow: live.calmWindow,
    };

    const todo = [];
    if (can(role, 'reports.read')) {
      const open = await Report.findAll({
        where: { gymId, status: OPEN },
        include: [
          { model: Machine, as: 'machine', attributes: ['id', 'code', 'label', 'zone'] },
          { model: User, as: 'assignedTo', attributes: ['id', 'name'] },
        ],
        order: [['createdAt', 'DESC']],
      });
      const fresh = open.filter((r) => r.status === 'NOUVEAU');
      out.openReports = {
        count: open.length,
        machines: new Set(open.map((r) => r.machineId)).size,
        new: fresh.length,
        newToday: fresh.filter((r) => r.createdAt >= start).length,
      };
      for (const g of groupByMachine(fresh)) {
        todo.push({ type: 'REPORT_NEW', reportId: g.report.id, machine: machineView(g.report.machine), issueType: g.report.issueType, at: g.report.createdAt, count: g.count });
      }
      for (const g of groupByMachine(open.filter((r) => r.status === 'REPARATION'))) {
        todo.push({
          type: 'REPORT_REPAIR',
          reportId: g.report.id,
          machine: machineView(g.report.machine),
          issueType: g.report.issueType,
          at: g.report.repairStartedAt || g.report.createdAt,
          assignedTo: g.report.assignedTo ? { id: g.report.assignedTo.id, name: g.report.assignedTo.name } : null,
          note: g.report.internalNote,
          count: g.count,
        });
      }
    }

    if (seesMembers) {
      const rows = await memberRows(gymId, { graceDays: settings.rules.graceDays, today, where: { active: true } });
      out.expiringSoon = { count: rows.filter((r) => r.status === 'EXPIRE_BIENTOT').length };
      const refused = await CheckIn.findAll({
        where: { gymId, status: 'REFUSEE', checkInAt: { [Op.gte]: start } },
        include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
        order: [['checkInAt', 'DESC']],
      });
      const byUser = new Map(rows.map((r) => [r.user.id, r]));
      const memberRef = (u) => ({ id: u.id, name: u.name, initials: initials(u.name) });
      const refusedTodo = refused.filter((c) => c.user).map((c) => ({
        type: 'ENTRY_REFUSED',
        checkinId: c.id,
        member: memberRef(c.user),
        at: c.checkInAt,
        reason: c.refusalReason,
        endDate: byUser.get(c.user.id) ? byUser.get(c.user.id).subscription.endDate || null : null,
      }));
      const expiringTodo = rows
        .filter((r) => r.subscription.endDate === today && r.status !== 'GELE')
        .map((r) => ({ type: 'EXPIRES_TODAY', member: memberRef(r.user), plan: r.subscription.plan, endDate: r.subscription.endDate, lastVisitAt: r.lastVisitAt }));
      const graceTodo = rows
        .filter((r) => r.status === 'GRACE')
        .map((r) => ({ type: 'IN_GRACE', member: memberRef(r.user), plan: r.subscription.plan, endDate: r.subscription.endDate, daysLate: -r.subscription.daysLeft, lastVisitAt: r.lastVisitAt }));
      // ordre de l'écran : pannes nouvelles, entrées refusées, expirations, délai de grâce, réparations
      const reportsNew = todo.filter((t) => t.type === 'REPORT_NEW');
      const repairs = todo.filter((t) => t.type === 'REPORT_REPAIR');
      todo.length = 0;
      todo.push(...reportsNew, ...refusedTodo, ...expiringTodo, ...graceTodo, ...repairs);

      const last = await CheckIn.findAll({
        where: { gymId, checkInAt: { [Op.gte]: start } },
        include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
        order: [['checkInAt', 'DESC']],
        limit: 5,
      });
      out.lastEntries = last.filter((c) => c.user).map((c) => {
        const row = byUser.get(c.user.id);
        return {
          id: c.id,
          at: c.checkInAt,
          status: c.status,
          refusalReason: c.refusalReason,
          member: memberRef(c.user),
          subscription: row ? { status: row.status, daysLeft: row.subscription.daysLeft, endDate: row.subscription.endDate || null, plan: row.subscription.plan } : null,
        };
      });
    }
    out.todo = { count: todo.length, items: todo.slice(0, 10) };

    if (can(role, 'payments')) {
      out.cashedToday = await totalBetween(gymId, start, new Date(now.getTime() + 1000));
      // revenus des 12 derniers mois (mois en cours compris, à ce jour)
      const firstMonth = `${addMonths(today, -11).slice(0, 7)}-01`;
      const payments = await Payment.findAll({ attributes: ['amount', 'createdAt'], where: { gymId, createdAt: { [Op.gte]: dayStart(firstMonth) } } });
      const months = [];
      for (let i = 11; i >= 0; i -= 1) months.push({ month: addMonths(`${today.slice(0, 7)}-01`, -i).slice(0, 7), total: 0 });
      for (const p of payments) {
        const m = months.find((x) => x.month === localDate(new Date(p.createdAt)).slice(0, 7));
        if (m) m.total += p.amount;
      }
      for (const m of months) m.total = round3(m.total);
      out.revenue = { months, lastMonth: months[10], currentMonthToDate: months[11] };
    }
    res.json(out);
  })
);

module.exports = router;
module.exports.groupByMachine = groupByMachine;
