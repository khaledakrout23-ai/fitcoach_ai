// Messages de l'équipe aux membres (écran « Notifications ») : publics, envoi, taux de lecture.
const { Op, fn, col } = require('sequelize');
const { Gym, Campaign, Notification, CheckIn } = require('../models');
const { localDate, addDays } = require('../utils');
const { memberRows } = require('./members');
const { gymSettings } = require('./gymSettings');
const { campaignTextFor } = require('./notifications');

const AUDIENCES = ['ALL', 'EXPIRING', 'INACTIVE', 'NEW', 'EXPIRED'];
const CURRENT = ['ACTIF', 'EXPIRE_BIENTOT', 'GRACE', 'GELE'];

/**
 * Membres de chaque public (comptes actifs uniquement).
 * @returns {Promise<Record<string, object[]>>} audience → utilisateurs
 */
async function audienceMembers(gym, settings = gymSettings(gym), today = localDate()) {
  const rows = await memberRows(gym.id, { graceDays: settings.rules.graceDays, today, where: { active: true } });
  const inactiveDays = settings.automations.inactive.days;
  const since = new Date(`${addDays(today, -inactiveDays)}T00:00:00`);
  const recent = await CheckIn.findAll({
    attributes: ['userId'],
    where: { gymId: gym.id, status: 'ENTREE', checkInAt: { [Op.gte]: since } },
    group: ['userId'],
    raw: true,
  });
  const seen = new Set(recent.map((r) => r.userId));
  const monthStart = new Date(`${today.slice(0, 8)}01T00:00:00`);
  const pick = (test) => rows.filter(test).map((r) => r.user);
  return {
    ALL: pick((r) => CURRENT.includes(r.status)),
    EXPIRING: pick((r) => r.status === 'EXPIRE_BIENTOT'),
    INACTIVE: pick((r) => ['ACTIF', 'EXPIRE_BIENTOT'].includes(r.status) && !seen.has(r.user.id)),
    NEW: pick((r) => r.user.createdAt >= monthStart),
    EXPIRED: pick((r) => r.status === 'EXPIRE'),
  };
}

/** Envoie une campagne maintenant : une notification par membre, dans sa langue */
async function deliverCampaign(campaign) {
  const gym = await Gym.findByPk(campaign.gymId);
  if (!gym) return 0;
  const audiences = await audienceMembers(gym);
  const users = audiences[campaign.audience] || [];
  const rows = users.map((u) => ({
    userId: u.id,
    gymId: gym.id,
    campaignId: campaign.id,
    kind: 'MESSAGE',
    link: '/app/notifications',
    ...campaignTextFor(campaign, u.language),
  }));
  for (let i = 0; i < rows.length; i += 500) await Notification.bulkCreate(rows.slice(i, i + 500));
  await campaign.update({ sentAt: new Date(), recipients: rows.length });
  return rows.length;
}

/** Taux de lecture par campagne (notifications lues / envoyées) */
async function readRates(campaignIds) {
  if (!campaignIds.length) return new Map();
  const rows = await Notification.findAll({
    attributes: ['campaignId', [fn('COUNT', col('id')), 'total'], [fn('COUNT', col('read_at')), 'read']],
    where: { campaignId: campaignIds },
    group: ['campaignId'],
    raw: true,
  });
  return new Map(rows.map((r) => [r.campaignId, Number(r.total) ? Math.round((Number(r.read) / Number(r.total)) * 100) : 0]));
}

/** Campagnes programmées arrivées à échéance (appelé par les tâches de fond) */
async function sendDueCampaigns(now = new Date()) {
  const due = await Campaign.findAll({ where: { sentAt: null, scheduledAt: { [Op.lte]: now } } });
  let sent = 0;
  for (const c of due) {
    // réservation atomique : une campagne n'est jamais envoyée deux fois, même avec deux serveurs
    const [claimed] = await Campaign.update({ sentAt: now }, { where: { id: c.id, sentAt: null } });
    if (claimed) sent += await deliverCampaign(c);
  }
  return sent;
}

module.exports = { AUDIENCES, audienceMembers, deliverCampaign, readRates, sendDueCampaigns };
