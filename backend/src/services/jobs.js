// Tâches de fond (toutes les 10 minutes) : messages programmés, rappels d'expiration, membres inactifs,
// alerte « salle calme », purge de l'historique des entrées. Chaque tâche vérifie qu'elle n'a pas déjà
// envoyé la même notification (pas de doublon) ; une erreur est écrite dans la console, jamais propagée.
const { Op } = require('sequelize');
const { Gym, User, Campaign, Notification, CheckIn, Subscription, Plan } = require('../models');
const { localDate, addDays, addMonths } = require('../utils');
const { gymSettings } = require('./gymSettings');
const { sendDueCampaigns } = require('./campaigns');
const { notifyUsers, textFor } = require('./notifications');
const { presentCount } = require('./occupancy');
const { dayStart, isOpenAt } = require('./schedule');

const INTERVAL_MS = 10 * 60 * 1000;
const INACTIVE_START_HOUR = 10; // relance des inactifs : en fin de matinée

// Campagne automatique (historique de l'écran Notifications) + une notification par membre
async function autoCampaign(gym, kind, audience, users, params, options = {}) {
  if (!users.length) return 0;
  const fr = textFor(options.textKey || kind, 'fr', typeof params === 'function' ? params(users[0]) : params);
  const ar = textFor(options.textKey || kind, 'ar', typeof params === 'function' ? params(users[0]) : params);
  const campaign = await Campaign.create({
    gymId: gym.id,
    audience,
    kind,
    auto: true,
    channel: 'APP',
    titleFr: fr.title,
    bodyFr: fr.body,
    titleAr: ar.title,
    bodyAr: ar.body,
    sentAt: new Date(),
    recipients: users.length,
  });
  return notifyUsers(users, kind, params, { gymId: gym.id, campaignId: campaign.id, ...options });
}

/** Rappel avant expiration : N jours avant, à partir de l'heure H, une seule fois par abonnement */
async function expiryReminders(gym, settings, now) {
  const rule = settings.automations.expiry;
  if (!rule.enabled || now.getHours() < rule.hour) return 0;
  const today = localDate(now);
  const target = addDays(today, rule.daysBefore);
  const subs = await Subscription.findAll({
    where: { gymId: gym.id, endDate: { [Op.between]: [today, target] } },
    include: [
      { model: User, as: 'member', where: { active: true, deletedAt: null, role: 'SPORTIF' } },
      { model: Plan, as: 'plan' },
    ],
  });
  if (!subs.length) return 0;
  const userIds = subs.map((s) => s.userId);
  // déjà renouvelé (abonnement qui finit plus tard) : pas de rappel
  const later = new Set((await Subscription.findAll({ attributes: ['userId'], where: { gymId: gym.id, userId: userIds, endDate: { [Op.gt]: target } }, raw: true })).map((s) => s.userId));
  const links = subs.map((s) => `/app/account/subscription?s=${s.id}`);
  const sent = new Set((await Notification.findAll({ attributes: ['link'], where: { userId: userIds, kind: 'EXPIRY', link: links }, raw: true })).map((n) => n.link));
  const due = subs.filter((s) => !later.has(s.userId) && !sent.has(`/app/account/subscription?s=${s.id}`) && !(s.frozenFrom && s.frozenUntil && today >= s.frozenFrom && today <= s.frozenUntil));
  if (!due.length) return 0;
  const bySub = new Map(due.map((s) => [s.member.id, s]));
  const params = (u) => {
    const s = bySub.get(u.id);
    return { days: Math.round((new Date(`${s.endDate}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000), plan: s.plan ? s.plan.nameFr : '', date: s.endDate };
  };
  return autoCampaign(gym, 'EXPIRY', 'EXPIRING', due.map((s) => s.member), params, {
    textKey: (u, p) => (p.days <= 0 ? 'EXPIRY_TODAY' : 'EXPIRY'),
    link: (u) => `/app/account/subscription?s=${bySub.get(u.id).id}`,
  });
}

/** Membre inactif : abonnement en cours, pas venu depuis N jours ; une fois par période d'absence */
async function inactiveMembers(gym, settings, now) {
  const rule = settings.automations.inactive;
  if (!rule.enabled || now.getHours() < INACTIVE_START_HOUR) return 0;
  const today = localDate(now);
  const subs = await Subscription.findAll({ attributes: ['userId'], where: { gymId: gym.id, startDate: { [Op.lte]: today }, endDate: { [Op.gte]: today } }, raw: true });
  const ids = [...new Set(subs.map((s) => s.userId))];
  if (!ids.length) return 0;
  const limit = dayStart(addDays(today, -rule.days));
  const [lastVisits, lastNotices, users] = await Promise.all([
    CheckIn.findAll({ attributes: ['userId', 'checkInAt'], where: { gymId: gym.id, userId: ids, status: 'ENTREE', checkInAt: { [Op.gte]: dayStart(addDays(today, -365)) } }, order: [['checkInAt', 'DESC']], raw: true }),
    Notification.findAll({ attributes: ['userId', 'createdAt'], where: { userId: ids, kind: 'INACTIVE' }, order: [['createdAt', 'DESC']], raw: true }),
    User.findAll({ where: { id: ids, active: true, deletedAt: null, role: 'SPORTIF', createdAt: { [Op.lt]: limit } } }),
  ]);
  const lastVisit = new Map();
  for (const c of lastVisits) if (!lastVisit.has(c.userId)) lastVisit.set(c.userId, new Date(c.checkInAt));
  const lastNotice = new Map();
  for (const n of lastNotices) if (!lastNotice.has(n.userId)) lastNotice.set(n.userId, new Date(n.createdAt));
  const due = users.filter((u) => {
    const visit = lastVisit.get(u.id) || new Date(u.createdAt);
    if (visit >= limit) return false;
    const notice = lastNotice.get(u.id);
    return !notice || notice < visit; // déjà relancé pendant cette absence : rien
  });
  return autoCampaign(gym, 'INACTIVE', 'INACTIVE', due, { days: rule.days });
}

// État « au-dessus du seuil » au passage précédent, par salle : l'alerte part quand la salle redevient calme
const wasBusy = new Map();

/** Alerte « salle calme » aux membres qui l'ont demandée, au plus une fois par jour, pendant les heures d'ouverture */
async function calmAlerts(gym, settings, now) {
  if (!settings.automations.calm.enabled || !settings.features.live || !isOpenAt(gym.hours, now)) {
    wasBusy.delete(gym.id);
    return 0;
  }
  const count = await presentCount(gym.id, settings, now);
  const busy = count >= settings.live.calmThreshold;
  const previous = wasBusy.get(gym.id);
  wasBusy.set(gym.id, busy);
  if (busy || previous !== true) return 0;
  const users = (await User.findAll({ where: { gymId: gym.id, role: 'SPORTIF', active: true, deletedAt: null } })).filter(
    (u) => u.prefs.calmAlert && (u.prefs.notifications || {}).gym !== false
  );
  if (!users.length) return 0;
  const already = new Set(
    (await Notification.findAll({ attributes: ['userId'], where: { userId: users.map((u) => u.id), kind: 'CALM', createdAt: { [Op.gte]: dayStart(localDate(now)) } }, raw: true })).map((n) => n.userId)
  );
  return autoCampaign(gym, 'CALM', 'ALL', users.filter((u) => !already.has(u.id)), { count, gym: gym.name });
}

// Purge une fois par jour et par salle
const lastPurge = new Map();
async function purgeCheckins(gym, settings, now) {
  const today = localDate(now);
  if (lastPurge.get(gym.id) === today) return 0;
  lastPurge.set(gym.id, today);
  const before = dayStart(addMonths(today, -settings.privacy.checkinRetentionMonths));
  return CheckIn.destroy({ where: { gymId: gym.id, checkInAt: { [Op.lt]: before } } });
}

const JOBS = { expiryReminders, inactiveMembers, calmAlerts, purgeCheckins };

let running = false;
/** Un passage complet ; renvoie le nombre d'envois par tâche (utile aux tests) */
async function runJobs(now = new Date()) {
  if (running) return null;
  running = true;
  const result = { campaigns: 0 };
  try {
    try {
      result.campaigns = await sendDueCampaigns(now);
    } catch (err) {
      console.error('[jobs] messages programmés :', err.message);
    }
    const gyms = await Gym.findAll();
    for (const gym of gyms) {
      const settings = gymSettings(gym);
      for (const [name, job] of Object.entries(JOBS)) {
        try {
          result[name] = (result[name] || 0) + (await job(gym, settings, now));
        } catch (err) {
          console.error(`[jobs] ${name} (salle ${gym.id}) :`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('[jobs] passage interrompu :', err.message);
  } finally {
    running = false;
  }
  return result;
}

let timer = null;
function startJobs({ intervalMs = INTERVAL_MS } = {}) {
  if (timer) return; // un seul minuteur, même si appelé deux fois
  timer = setInterval(() => runJobs(), intervalMs);
  timer.unref();
  setTimeout(() => runJobs(), 30 * 1000).unref();
}

function stopJobs() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startJobs, stopJobs, runJobs, expiryReminders, inactiveMembers, calmAlerts, purgeCheckins };
