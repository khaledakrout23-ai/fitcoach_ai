// Membres d'une salle : abonnement en cours, statut, dernière visite. Toujours limité à une salle (gymId).
const { fn, col } = require('sequelize');
const { User, Subscription, Plan, CheckIn } = require('../models');
const { Op } = require('sequelize');
const { localDate, addDays, subscriptionStatus } = require('../utils');

// Filtres de l'écran Membres (la somme active + expired + frozen = all)
const STATUS_FILTERS = {
  all: null,
  active: ['ACTIF', 'EXPIRE_BIENTOT', 'GRACE'],
  expiring: ['EXPIRE_BIENTOT', 'GRACE'],
  expired: ['EXPIRE', 'AUCUN'],
  frozen: ['GELE'],
};

const initials = (name) =>
  String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

const planName = (plan) => (plan ? { id: plan.id, nameFr: plan.nameFr, nameAr: plan.nameAr, nameEn: plan.nameEn || plan.nameFr } : null);

/** Abonnement le plus récent (date de fin la plus lointaine) de chaque membre de la salle */
async function latestSubscriptions(gymId, userIds = null) {
  const where = { gymId };
  if (userIds) where.userId = userIds;
  const subs = await Subscription.findAll({
    where,
    include: [{ model: Plan, as: 'plan' }],
    order: [['endDate', 'DESC'], ['id', 'DESC']],
  });
  const map = new Map();
  for (const s of subs) if (!map.has(s.userId)) map.set(s.userId, s);
  return map;
}

/** Abonnement qui compte pour l'accès aujourd'hui : commencé, avec la fin la plus lointaine (un renouvellement futur ne compte pas encore) */
function currentSubscription(subs, today = localDate()) {
  const started = subs.filter((s) => s.startDate <= today).sort((a, b) => (a.endDate < b.endDate ? 1 : a.endDate > b.endDate ? -1 : b.id - a.id));
  return started[0] || null;
}

/** Statut d'un abonnement avec le délai de grâce de la salle */
function statusOf(sub, { today = localDate(), graceDays = 0 } = {}) {
  const st = subscriptionStatus(sub, { today, graceDays });
  return { ...st, graceDays };
}

function subscriptionView(sub, opts) {
  if (!sub) return { status: 'AUCUN', daysLeft: null };
  return {
    id: sub.id,
    startDate: sub.startDate,
    endDate: sub.endDate,
    amount: sub.amount,
    paymentMethod: sub.paymentMethod,
    frozenFrom: sub.frozenFrom,
    frozenUntil: sub.frozenUntil,
    freezeDaysUsed: sub.freezeDaysUsed,
    plan: planName(sub.plan),
    ...statusOf(sub, opts),
  };
}

/** Dernière entrée acceptée de chaque membre de la salle */
async function lastVisits(gymId, userIds = null) {
  const where = { gymId, status: 'ENTREE' };
  if (userIds) where.userId = userIds;
  const rows = await CheckIn.findAll({
    attributes: ['userId', [fn('MAX', col('check_in_at')), 'last']],
    where,
    group: ['userId'],
    raw: true,
  });
  return new Map(rows.map((r) => [r.userId, r.last ? new Date(r.last) : null]));
}

/**
 * Tous les membres (SPORTIF, non supprimés) d'une salle avec leur abonnement et leur statut.
 * @returns {Promise<{ user, sub, subscription, status, lastVisitAt }[]>}
 */
async function memberRows(gymId, { graceDays = 0, today = localDate(), where = {} } = {}) {
  const users = await User.findAll({
    where: { gymId, role: 'SPORTIF', deletedAt: null, ...where },
    order: [['name', 'ASC']],
  });
  const ids = users.map((u) => u.id);
  const [subs, visits] = await Promise.all([latestSubscriptions(gymId, ids), lastVisits(gymId, ids)]);
  return users.map((user) => {
    const sub = subs.get(user.id) || null;
    const subscription = subscriptionView(sub, { today, graceDays });
    return { user, sub, subscription, status: subscription.status, lastVisitAt: visits.get(user.id) || null };
  });
}

/** Ligne de la liste des membres (jamais de données de santé) */
function memberListItem(row) {
  const u = row.user;
  return {
    id: u.id,
    name: u.name,
    initials: initials(u.name),
    phone: u.phone,
    email: u.email,
    active: u.active,
    accessActive: u.accessActive,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt,
    plan: row.subscription.plan || null,
    subscription: row.subscription,
    status: u.active ? row.status : 'DESACTIVE',
    lastVisitAt: row.lastVisitAt,
  };
}

/** Membre de la salle par id (404 sinon) */
async function findMember(gymId, id, options = {}) {
  const { HttpError } = require('../middleware/errors');
  const member = await User.findOne({ where: { id: Number(id) || 0, gymId, role: 'SPORTIF', deletedAt: null }, ...options });
  if (!member) throw new HttpError(404, 'NOT_FOUND', 'Membre introuvable.');
  return member;
}

/**
 * Nombre de membres actifs dont l'abonnement le plus récent se termine dans 0 à 7 jours (non gelé) — requêtes de comptage légères.
 */
async function expiringCount(gymId, today = localDate()) {
  const soon = await Subscription.findAll({
    attributes: ['userId', 'frozenFrom', 'frozenUntil'],
    where: { gymId, endDate: { [Op.between]: [today, addDays(today, 7)] } },
    include: [{ model: User, as: 'member', attributes: [], where: { active: true, deletedAt: null, role: 'SPORTIF' } }],
    raw: true,
  });
  const candidates = [...new Set(soon.filter((s) => !(s.frozenFrom && s.frozenUntil && today >= s.frozenFrom && today <= s.frozenUntil)).map((s) => s.userId))];
  if (!candidates.length) return 0;
  const renewed = await Subscription.findAll({ attributes: ['userId'], where: { gymId, userId: candidates, endDate: { [Op.gt]: addDays(today, 7) } }, raw: true });
  const later = new Set(renewed.map((r) => r.userId));
  return candidates.filter((id) => !later.has(id)).length;
}

// Échappe % et _ pour une recherche LIKE
const likeEscape = (s) => String(s).replace(/[\\%_]/g, (c) => `\\${c}`);
const likeQuery = (q) => `%${likeEscape(String(q).trim().slice(0, 60))}%`;

module.exports = {
  STATUS_FILTERS,
  initials,
  planName,
  latestSubscriptions,
  currentSubscription,
  statusOf,
  subscriptionView,
  lastVisits,
  memberRows,
  memberListItem,
  findMember,
  expiringCount,
  likeEscape,
  likeQuery,
};
