// Salle en direct (D3 / M7) et entrées : scan de la carte d'accès, entrée manuelle, sortie.
const router = require('express').Router();
const { Op } = require('sequelize');
const { CheckIn, User, Subscription, Plan } = require('../../models');
const { ah, HttpError } = require('../../middleware/errors');
const { requirePermission } = require('../../middleware/auth');
const { localDate, isoDate, addDays, num } = require('../../utils');
const { dayStart } = require('../../services/schedule');
const { liveSnapshot, weeklyHeatmap } = require('../../services/occupancy');
const { verifyPass } = require('../../services/accessPass');
const { latestSubscriptions, currentSubscription, statusOf, initials, planName, findMember } = require('../../services/members');
const { audit } = require('../../services/audit');

const live = requirePermission('live');
const DEDUPE_MS = 2 * 60 * 1000; // deux scans du même membre en moins de 2 min = un seul passage
const PEAK_HOURS = [17, 21]; // formules « heures creuses » : pas d'accès de 17:00 à 21:00

router.get(
  '/live',
  live,
  ah(async (req, res) => {
    const gym = req.gym;
    const settings = req.settings;
    const start = dayStart(localDate());
    const [snapshot, heatmap, entriesToday, refusedToday, members] = await Promise.all([
      liveSnapshot(gym, settings),
      weeklyHeatmap(gym, settings),
      CheckIn.count({ where: { gymId: gym.id, status: 'ENTREE', checkInAt: { [Op.gte]: start } } }),
      CheckIn.count({ where: { gymId: gym.id, status: 'REFUSEE', checkInAt: { [Op.gte]: start } } }),
      User.findAll({ attributes: ['id', 'prefs'], where: { gymId: gym.id, role: 'SPORTIF', active: true, deletedAt: null } }),
    ]);
    res.json({
      ...snapshot,
      entriesToday,
      refusedToday,
      calmAlertMembers: members.filter((m) => m.prefs.calmAlert).length,
      settings: { ...settings.live, capacity: gym.capacity },
      heatmap,
    });
  })
);

// Entrées d'une journée (refusées comprises), la plus récente d'abord
router.get(
  '/checkins',
  live,
  ah(async (req, res) => {
    const date = req.query.date ? isoDate(req.query.date, 'date') : localDate();
    const rows = await CheckIn.findAll({
      where: { gymId: req.gym.id, checkInAt: { [Op.gte]: dayStart(date), [Op.lt]: dayStart(addDays(date, 1)) } },
      include: [
        { model: User, as: 'user', attributes: ['id', 'name'] },
        { model: User, as: 'byStaff', attributes: ['id', 'name'] },
      ],
      order: [['checkInAt', 'DESC']],
      limit: 1000,
    });
    const subs = await latestSubscriptions(req.gym.id, [...new Set(rows.map((r) => r.userId).filter(Boolean))]);
    const now = new Date();
    const auto = req.settings.live.autoCheckoutHours * 3600000;
    res.json({
      date,
      count: rows.filter((r) => r.status === 'ENTREE').length,
      refused: rows.filter((r) => r.status === 'REFUSEE').length,
      items: rows.map((r) => {
        const sub = r.userId ? subs.get(r.userId) : null;
        const out = r.checkOutAt ? new Date(r.checkOutAt) : null;
        const present = r.status === 'ENTREE' && !out && now - new Date(r.checkInAt) < auto;
        return {
          id: r.id,
          at: r.checkInAt,
          checkOutAt: r.checkOutAt,
          status: r.status,
          refusalReason: r.refusalReason,
          source: r.source,
          present,
          durationMin: out ? Math.round((out - new Date(r.checkInAt)) / 60000) : null,
          member: r.user ? { id: r.user.id, name: r.user.name, initials: initials(r.user.name) } : null,
          byStaff: r.byStaff ? { id: r.byStaff.id, name: r.byStaff.name } : null,
          subscription: sub ? { ...statusOf(sub, { graceDays: req.settings.rules.graceDays }), endDate: sub.endDate, plan: planName(sub.plan) } : null,
        };
      }),
    });
  })
);

/**
 * Décision d'accès d'un membre (pure) : compte désactivé, carte désactivée, abonnement en cours, heures creuses.
 * sub = abonnement commencé qui compte aujourd'hui (currentSubscription).
 * @returns {{ result: 'GRANTED'|'GRANTED_GRACE'|'REFUSED', reason: string|null }}
 */
function accessDecision({ member, sub, graceDays, now = new Date() }) {
  if (!member.active || !member.accessActive) return { result: 'REFUSED', reason: 'DESACTIVE' };
  if (!sub) return { result: 'REFUSED', reason: 'AUCUN' };
  const today = localDate(now);
  const st = statusOf(sub, { today, graceDays });
  if (st.status === 'GELE') return { result: 'REFUSED', reason: 'GELE' };
  if (st.status === 'EXPIRE') return { result: 'REFUSED', reason: 'EXPIRE' };
  if (sub.plan && sub.plan.accessHours === 'OFF_PEAK' && now.getHours() >= PEAK_HOURS[0] && now.getHours() < PEAK_HOURS[1]) {
    return { result: 'REFUSED', reason: 'HORS_HORAIRES' };
  }
  return st.status === 'GRACE' ? { result: 'GRANTED_GRACE', reason: 'GRACE' } : { result: 'GRANTED', reason: null };
}

// Scan de la carte d'accès (code du QR) ou entrée manuelle (memberId)
router.post(
  '/checkins',
  live,
  ah(async (req, res) => {
    const gym = req.gym;
    let member;
    if (req.body.code !== undefined) {
      const userId = verifyPass(req.body.code);
      member = userId ? await User.findOne({ where: { id: userId, gymId: gym.id, role: 'SPORTIF', deletedAt: null } }) : null;
      // code faux, trop ancien ou d'une autre salle : même réponse, aucune information sur le compte
      if (!member) return res.json({ result: 'REFUSED', reason: 'CODE_INVALIDE', member: null, checkin: null, duplicate: false });
    } else if (req.body.memberId !== undefined) {
      member = await findMember(gym.id, num(req.body.memberId, 'memberId', { min: 1, integer: true }));
    } else {
      throw new HttpError(400, 'VALIDATION', 'Champs obligatoires : code ou memberId');
    }
    const now = new Date();
    const subs = await Subscription.findAll({ where: { gymId: gym.id, userId: member.id }, include: [{ model: Plan, as: 'plan' }] });
    const sub = currentSubscription(subs, localDate(now));
    const decision = accessDecision({ member, sub, graceDays: req.settings.rules.graceDays, now });
    const status = decision.result === 'REFUSED' ? 'REFUSEE' : 'ENTREE';

    const recent = await CheckIn.findOne({
      where: { gymId: gym.id, userId: member.id, status, checkInAt: { [Op.gte]: new Date(now.getTime() - DEDUPE_MS) } },
      order: [['checkInAt', 'DESC']],
    });
    const checkin =
      recent ||
      (await CheckIn.create({
        gymId: gym.id,
        userId: member.id,
        checkInAt: now,
        status,
        refusalReason: status === 'REFUSEE' ? decision.reason : null,
        source: req.body.code !== undefined ? 'SCAN' : 'MANUEL',
        byStaffId: req.user.id,
      }));
    const st = sub ? statusOf(sub, { graceDays: req.settings.rules.graceDays }) : { status: 'AUCUN', daysLeft: null };
    res.status(recent ? 200 : 201).json({
      result: decision.result,
      reason: decision.reason,
      duplicate: Boolean(recent),
      checkin: { id: checkin.id, at: checkin.checkInAt, status: checkin.status },
      member: {
        id: member.id,
        name: member.name,
        initials: initials(member.name),
        plan: sub ? planName(sub.plan) : null,
        endDate: sub ? sub.endDate : null,
        daysLeft: st.daysLeft,
        status: st.status,
      },
    });
  })
);

router.post(
  '/checkins/:id/checkout',
  live,
  ah(async (req, res) => {
    const checkin = await CheckIn.findOne({ where: { id: Number(req.params.id) || 0, gymId: req.gym.id, status: 'ENTREE' } });
    if (!checkin) throw new HttpError(404, 'NOT_FOUND', 'Entrée introuvable.');
    if (!checkin.checkOutAt) {
      await checkin.update({ checkOutAt: new Date() });
      await audit(req, 'checkin.checkout', { type: 'CheckIn', id: checkin.id });
    }
    res.json({ id: checkin.id, at: checkin.checkInAt, checkOutAt: checkin.checkOutAt });
  })
);

module.exports = router;
module.exports.accessDecision = accessDecision;
