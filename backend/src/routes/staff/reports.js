// Pannes (D11 / M8 / M9) : colonnes Nouveaux / En cours / Réparées (7 jours), détail, suivi, photo.
// Un changement d'état s'applique à tous les signalements ouverts de la même machine (même incident),
// sauf REJETE qui ne concerne que le signalement choisi.
const router = require('express').Router();
const { Op } = require('sequelize');
const { sequelize, Report, Machine, User, Campaign } = require('../../models');
const { ah, HttpError } = require('../../middleware/errors');
const { requirePermission } = require('../../middleware/auth');
const { rateLimit } = require('../../middleware/security');
const { required, num, oneOf, text, localDate } = require('../../utils');
const { parsePhoto, sendPhoto } = require('../../services/images');
const { notifyUsers, textFor } = require('../../services/notifications');
const { audit } = require('../../services/audit');
const { ISSUE_TYPES } = require('../../services/constants');

const STATUSES = ['NOUVEAU', 'VU', 'REPARATION', 'REPAREE', 'REJETE'];
const OPEN = ['NOUVEAU', 'VU', 'REPARATION'];
const RANK = { NOUVEAU: 0, VU: 1, REPARATION: 2 };
const ASSIGNABLE = ['TECHNICIEN', 'GERANT'];

const include = [
  { model: Machine, as: 'machine', attributes: ['id', 'code', 'label', 'zone', 'status', 'outOfService'] },
  { model: User, as: 'author', attributes: ['id', 'name', 'role', 'language', 'deletedAt'] },
  { model: User, as: 'assignedTo', attributes: ['id', 'name', 'role'] },
];
const person = (u) => (u ? { id: u.id, name: u.name, role: u.role } : null);

function groupView(reports) {
  const latest = reports[0];
  const lead = reports.reduce((best, r) => ((RANK[r.status] ?? 3) > (RANK[best.status] ?? 3) ? r : best), latest);
  return {
    mainReportId: latest.id,
    reportIds: reports.map((r) => r.id),
    machine: latest.machine,
    status: lead.status,
    issueType: latest.issueType,
    latestAt: latest.createdAt,
    firstAt: reports[reports.length - 1].createdAt,
    count: reports.length,
    hasPhoto: reports.some((r) => r.hasPhoto),
    assignedTo: person(reports.find((r) => r.assignedTo)?.assignedTo),
    internalNote: lead.internalNote,
    repairStartedAt: lead.repairStartedAt,
    repairedAt: lead.repairedAt,
    notified: reports.filter((r) => r.notify && r.author && r.author.role === 'SPORTIF').length,
  };
}

function groupBy(reports) {
  const map = new Map();
  for (const r of reports) {
    if (!map.has(r.machineId)) map.set(r.machineId, []);
    map.get(r.machineId).push(r);
  }
  return [...map.values()].map(groupView);
}

async function assignees(gymId) {
  const users = await User.findAll({ where: { gymId, role: ASSIGNABLE, active: true }, attributes: ['id', 'name', 'role'], order: [['name', 'ASC']] });
  return users.map(person);
}

router.get(
  '/reports',
  requirePermission('reports.read'),
  ah(async (req, res) => {
    const gymId = req.gym.id;
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const reports = await Report.findAll({
      where: { gymId, [Op.or]: [{ status: OPEN }, { status: 'REPAREE', repairedAt: { [Op.gte]: weekAgo } }] },
      include,
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
    });
    const nouveaux = groupBy(reports.filter((r) => r.status === 'NOUVEAU'));
    const enCours = groupBy(reports.filter((r) => r.status === 'VU' || r.status === 'REPARATION'));
    const reparees = groupBy(reports.filter((r) => r.status === 'REPAREE')).sort((a, b) => new Date(b.repairedAt) - new Date(a.repairedAt));
    res.json({
      columns: { nouveaux, enCours, reparees },
      counts: {
        nouveaux: nouveaux.length,
        enCours: enCours.length,
        reparees: reparees.length,
        openReports: reports.filter((r) => OPEN.includes(r.status)).length,
        openMachines: new Set(reports.filter((r) => OPEN.includes(r.status)).map((r) => r.machineId)).size,
      },
      assignees: await assignees(gymId),
    });
  })
);

async function findReport(gymId, id, scope = null) {
  const model = scope ? Report.scope(scope) : Report;
  const report = await model.findOne({ where: { id: Number(id) || 0, gymId }, include: scope ? [] : include });
  if (!report) throw new HttpError(404, 'NOT_FOUND', 'Signalement introuvable.');
  return report;
}

async function detailView(report) {
  const sameMachine = await Report.findAll({
    where: { machineId: report.machineId, [Op.or]: [{ status: OPEN }, { id: report.id }] },
    include,
    order: [['createdAt', 'DESC']],
  });
  return {
    id: report.id,
    machine: report.machine,
    issueType: report.issueType,
    description: report.description,
    status: report.status,
    notify: report.notify,
    hasPhoto: report.hasPhoto,
    createdAt: report.createdAt,
    seenAt: report.seenAt,
    repairStartedAt: report.repairStartedAt,
    repairedAt: report.repairedAt,
    author: person(report.author),
    assignedTo: person(report.assignedTo),
    internalNote: report.internalNote,
    reporters: sameMachine.map((r) => ({ reportId: r.id, author: person(r.author), at: r.createdAt, issueType: r.issueType, description: r.description, notify: r.notify, hasPhoto: r.hasPhoto, status: r.status })),
  };
}

router.get(
  '/reports/:id',
  requirePermission('reports.read'),
  ah(async (req, res) => {
    res.json(await detailView(await findReport(req.gym.id, req.params.id)));
  })
);

router.get(
  '/reports/:id/photo',
  requirePermission('reports.read'),
  ah(async (req, res) => {
    const report = await findReport(req.gym.id, req.params.id, 'withPhoto');
    sendPhoto(res, report.photo, report.photoType);
  })
);

// Signalement créé par l'équipe
const createLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 60, key: (req) => `staff-report:${req.user.id}` });
router.post(
  '/reports',
  requirePermission('reports.create'),
  createLimiter,
  ah(async (req, res) => {
    required(req.body, ['machineId', 'issueType']);
    const machine = await Machine.findOne({ where: { id: num(req.body.machineId, 'machineId', { min: 1, integer: true }), gymId: req.gym.id } });
    if (!machine) throw new HttpError(404, 'NOT_FOUND', 'Machine introuvable.');
    const data = {
      machineId: machine.id,
      gymId: req.gym.id,
      userId: req.user.id,
      issueType: oneOf(req.body.issueType, Object.keys(ISSUE_TYPES), 'issueType'),
      description: text(req.body.description, 500),
      notify: false,
    };
    if (req.body.photo) {
      const photo = parsePhoto(req.body.photo);
      data.photo = photo.buffer;
      data.photoType = photo.mimeType;
    }
    const report = await sequelize.transaction(async (t) => {
      const created = await Report.create(data, { transaction: t });
      if (machine.status === 'OK') await machine.update({ status: 'SIGNALEE' }, { transaction: t });
      return created;
    });
    await audit(req, 'report.create', { type: 'Report', id: report.id }, { machineId: machine.id, issueType: data.issueType });
    res.status(201).json(await detailView(await findReport(req.gym.id, report.id)));
  })
);

// Suivi : état, personne assignée, hors service dans l'app, note interne
router.put(
  '/reports/:id',
  requirePermission('reports.write'),
  ah(async (req, res) => {
    const report = await findReport(req.gym.id, req.params.id);
    const machine = await Machine.findOne({ where: { id: report.machineId, gymId: req.gym.id } });
    const status = req.body.status === undefined ? null : oneOf(req.body.status, STATUSES, 'status');
    let assignedToId;
    if (req.body.assignedToId !== undefined) {
      if (req.body.assignedToId === null) assignedToId = null;
      else {
        const who = await User.findOne({ where: { id: num(req.body.assignedToId, 'assignedToId', { min: 1, integer: true }), gymId: req.gym.id, role: ASSIGNABLE, active: true } });
        if (!who) throw new HttpError(400, 'INVALID_ASSIGNEE', 'Personne introuvable dans l’équipe technique.');
        assignedToId = who.id;
      }
    }
    if (req.body.outOfService !== undefined && typeof req.body.outOfService !== 'boolean') throw new HttpError(400, 'VALIDATION', 'Champ invalide : outOfService');
    const note = req.body.internalNote === undefined ? undefined : text(req.body.internalNote, 500);
    const now = new Date();
    let repairedReporters = [];

    await sequelize.transaction(async (t) => {
      // signalements concernés : le choisi + les autres ouverts sur la même machine (sauf rejet)
      const group = status === 'REJETE' || !OPEN.includes(report.status)
        ? [report]
        : await Report.findAll({ where: { machineId: report.machineId, status: OPEN }, include: [{ model: User, as: 'author', attributes: ['id', 'role', 'language', 'deletedAt'] }], transaction: t });
      for (const r of group) {
        const data = {};
        if (status) {
          data.status = status;
          if (status !== 'NOUVEAU' && status !== 'REJETE') data.seenAt = r.seenAt || now;
          if (status === 'REPARATION' || status === 'REPAREE') data.repairStartedAt = r.repairStartedAt || now;
          if (status === 'REPAREE') data.repairedAt = now;
        }
        if (assignedToId !== undefined) data.assignedToId = assignedToId;
        if (note !== undefined && r.id === report.id) data.internalNote = note;
        await r.update(data, { transaction: t });
      }
      if (status === 'REPAREE') {
        await machine.update({ status: 'OK', outOfService: false, lastMaintenanceAt: localDate() }, { transaction: t });
        repairedReporters = group.filter((r) => r.notify && r.author && r.author.role === 'SPORTIF' && !r.author.deletedAt).map((r) => r.author);
      } else {
        const machineData = {};
        if (status === 'REPARATION') machineData.status = 'REPARATION';
        if (status === 'VU' || status === 'NOUVEAU') machineData.status = 'SIGNALEE';
        if (status === 'REJETE') {
          const stillOpen = await Report.count({ where: { machineId: machine.id, status: OPEN, id: { [Op.ne]: report.id } }, transaction: t });
          if (!stillOpen && machine.status === 'SIGNALEE') machineData.status = 'OK';
        }
        if (req.body.outOfService !== undefined) machineData.outOfService = req.body.outOfService;
        if (Object.keys(machineData).length) await machine.update(machineData, { transaction: t });
      }
    });

    // machine réparée : chaque membre qui a demandé à être prévenu reçoit une notification (si l'envoi automatique est actif)
    let notified = 0;
    const unique = [...new Map(repairedReporters.map((u) => [u.id, u])).values()];
    if (unique.length && req.settings.automations.repaired.enabled) {
      const label = `${machine.label}${machine.code ? ` #${machine.code}` : ''}`;
      const fr = textFor('REPAIRED', 'fr', { machine: label });
      const ar = textFor('REPAIRED', 'ar', { machine: label });
      const campaign = await Campaign.create({
        gymId: req.gym.id,
        audience: 'REPORTERS',
        kind: 'REPAIRED',
        auto: true,
        channel: 'APP',
        titleFr: fr.title,
        bodyFr: fr.body,
        titleAr: ar.title,
        bodyAr: ar.body,
        sentAt: new Date(),
        recipients: unique.length,
        createdById: req.user.id,
      });
      notified = await notifyUsers(unique, 'REPAIRED', { machine: label }, { gymId: req.gym.id, campaignId: campaign.id });
    }
    await audit(req, 'report.update', { type: 'Report', id: report.id }, { status, assignedToId, outOfService: req.body.outOfService, notified });
    const fresh = await findReport(req.gym.id, report.id);
    res.json({ ...(await detailView(fresh)), notified });
  })
);

module.exports = router;
