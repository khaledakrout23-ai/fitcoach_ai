// Notifications aux membres (D16 / M11) : publics, message dans l'app (maintenant ou programmé), historique, envois automatiques
const router = require('express').Router();
const { Campaign, User } = require('../../models');
const { ah, HttpError } = require('../../middleware/errors');
const { requirePermission } = require('../../middleware/auth');
const { rateLimit } = require('../../middleware/security');
const { required, oneOf, text } = require('../../utils');
const { cleanSettings } = require('../../services/gymSettings');
const { AUDIENCES, audienceMembers, deliverCampaign, readRates } = require('../../services/campaigns');
const { audit } = require('../../services/audit');

const perm = requirePermission('notifications');

const campaignView = (c, rates) => ({
  id: c.id,
  audience: c.audience,
  kind: c.kind,
  auto: c.auto,
  channel: c.channel,
  titleFr: c.titleFr,
  bodyFr: c.bodyFr,
  titleAr: c.titleAr,
  bodyAr: c.bodyAr,
  scheduledAt: c.scheduledAt,
  sentAt: c.sentAt,
  status: c.sentAt ? 'SENT' : 'SCHEDULED',
  recipients: c.recipients,
  readRate: c.sentAt ? rates.get(c.id) ?? 0 : null,
  createdBy: c.createdBy ? { id: c.createdBy.id, name: c.createdBy.name } : null,
  createdAt: c.createdAt,
});

router.get(
  '/campaigns/audiences',
  perm,
  ah(async (req, res) => {
    const audiences = await audienceMembers(req.gym, req.settings);
    res.json(AUDIENCES.map((a) => ({ audience: a, count: audiences[a].length })));
  })
);

router.get(
  '/campaigns',
  perm,
  ah(async (req, res) => {
    const campaigns = await Campaign.findAll({
      where: { gymId: req.gym.id },
      include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: 50,
    });
    const rates = await readRates(campaigns.filter((c) => c.sentAt).map((c) => c.id));
    res.json({ items: campaigns.map((c) => campaignView(c, rates)), automations: req.settings.automations, smsAvailable: Boolean(process.env.SMS_PROVIDER) });
  })
);

const sendLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, key: (req) => `campaign:${req.gym.id}` });
router.post(
  '/campaigns',
  perm,
  sendLimiter,
  ah(async (req, res) => {
    required(req.body, ['audience', 'titleFr', 'bodyFr']);
    const audience = oneOf(req.body.audience, AUDIENCES, 'audience');
    const channel = req.body.channel === undefined ? 'APP' : oneOf(req.body.channel, ['APP', 'SMS'], 'channel');
    if (channel === 'SMS' && !process.env.SMS_PROVIDER) throw new HttpError(400, 'SMS_NOT_CONFIGURED', 'L’envoi de SMS n’est pas configuré.');
    const data = {
      gymId: req.gym.id,
      audience,
      channel,
      kind: 'MESSAGE',
      auto: false,
      titleFr: text(req.body.titleFr, 120),
      bodyFr: String(req.body.bodyFr).trim().slice(0, 500),
      titleAr: text(req.body.titleAr, 120),
      bodyAr: req.body.bodyAr ? String(req.body.bodyAr).trim().slice(0, 500) : null,
      createdById: req.user.id,
    };
    if (!data.titleFr || !data.bodyFr) throw new HttpError(400, 'VALIDATION', 'Titre et message obligatoires.');
    if (req.body.scheduledAt) {
      const at = new Date(req.body.scheduledAt);
      if (Number.isNaN(at.getTime()) || at < new Date(Date.now() - 60000) || at > new Date(Date.now() + 30 * 86400000)) {
        throw new HttpError(400, 'VALIDATION', 'Date invalide : scheduledAt');
      }
      data.scheduledAt = at;
    }
    const campaign = await Campaign.create(data);
    if (!data.scheduledAt) await deliverCampaign(campaign);
    await audit(req, 'campaign.create', { type: 'Campaign', id: campaign.id }, { audience, scheduled: Boolean(data.scheduledAt), recipients: campaign.recipients });
    const rates = await readRates(campaign.sentAt ? [campaign.id] : []);
    res.status(201).json(campaignView(campaign, rates));
  })
);

// Annuler un message programmé pas encore envoyé
router.delete(
  '/campaigns/:id',
  perm,
  ah(async (req, res) => {
    const campaign = await Campaign.findOne({ where: { id: Number(req.params.id) || 0, gymId: req.gym.id, sentAt: null } });
    if (!campaign) throw new HttpError(404, 'NOT_FOUND', 'Message programmé introuvable.');
    await campaign.destroy();
    await audit(req, 'campaign.cancel', { type: 'Campaign', id: campaign.id });
    res.json({ ok: true });
  })
);

// Envois automatiques (expiration, salle calme, machine réparée, inactifs, bienvenue)
router.put(
  '/campaigns/automations',
  perm,
  ah(async (req, res) => {
    if (!req.body || typeof req.body !== 'object') throw new HttpError(400, 'VALIDATION', 'Champ invalide : automations');
    const settings = cleanSettings(req.gym.settings, { automations: req.body });
    await req.gym.update({ settings });
    await audit(req, 'settings.automations', { type: 'Gym', id: req.gym.id }, settings.automations);
    res.json(settings.automations);
  })
);

module.exports = router;
