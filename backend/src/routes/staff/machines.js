// Machines de la salle (D10 / M10) : liste, ajout, modification, état, étiquettes QR, reconnaissance par photo
const router = require('express').Router();
const { Op, fn, col } = require('sequelize');
const { Machine, Equipment, Report } = require('../../models');
const { ah, HttpError } = require('../../middleware/errors');
const { requirePermission } = require('../../middleware/auth');
const { rateLimit } = require('../../middleware/security');
const { required, num, oneOf, text, isoDate, localDate, addDays } = require('../../utils');
const { dayStart } = require('../../services/schedule');
const { identifyMachine } = require('../../services/machinePhoto');
const { audit } = require('../../services/audit');

const read = requirePermission('machines.read');
const write = requirePermission('machines.write');
const STATUSES = ['OK', 'SIGNALEE', 'REPARATION'];
const OPEN = ['NOUVEAU', 'VU', 'REPARATION'];

const equipmentView = (e) => (e ? { id: e.id, code: e.code, nameFr: e.nameFr, nameAr: e.nameAr, category: e.category } : null);
const machineView = (m, counts = {}) => ({
  id: m.id,
  code: m.code,
  label: m.label,
  zone: m.zone,
  status: m.status,
  outOfService: m.outOfService,
  lastMaintenanceAt: m.lastMaintenanceAt,
  equipment: equipmentView(m.equipment),
  reports30d: counts.reports30d || 0,
  openReports: counts.open || 0,
});

async function findMachine(gymId, id) {
  const machine = await Machine.findOne({ where: { id: Number(id) || 0, gymId }, include: [{ model: Equipment, as: 'equipment' }] });
  if (!machine) throw new HttpError(404, 'NOT_FOUND', 'Machine introuvable.');
  return machine;
}

// Code affiché « #09 » : lettres, chiffres et tiret, unique dans la salle
async function cleanMachine(req, body, { partial = false, exceptId = null } = {}) {
  if (!partial) required(body, ['label', 'equipmentId', 'zone']);
  const out = {};
  if (body.label !== undefined) {
    out.label = text(body.label, 100);
    if (!out.label) throw new HttpError(400, 'VALIDATION', 'Champ invalide : label');
  }
  if (body.code !== undefined) {
    const code = String(body.code || '').trim().replace(/^#/, '');
    if (!/^[A-Za-z0-9-]{1,10}$/.test(code)) throw new HttpError(400, 'VALIDATION', 'Champ invalide : code');
    const taken = await Machine.count({ where: { gymId: req.gym.id, code, ...(exceptId ? { id: { [Op.ne]: exceptId } } : {}) } });
    if (taken) throw new HttpError(409, 'CODE_TAKEN', 'Ce code est déjà utilisé dans la salle.');
    out.code = code;
  }
  if (body.zone !== undefined) out.zone = oneOf(body.zone, req.settings.zones, 'zone');
  if (body.equipmentId !== undefined) {
    const eq = await Equipment.findByPk(num(body.equipmentId, 'equipmentId', { min: 1, integer: true }));
    if (!eq) throw new HttpError(400, 'VALIDATION', 'Équipement inconnu.');
    out.equipmentId = eq.id;
  }
  if (body.status !== undefined) out.status = oneOf(body.status, STATUSES, 'status');
  if (body.outOfService !== undefined) {
    if (typeof body.outOfService !== 'boolean') throw new HttpError(400, 'VALIDATION', 'Champ invalide : outOfService');
    out.outOfService = body.outOfService;
  }
  if (body.lastMaintenanceAt !== undefined) {
    out.lastMaintenanceAt = body.lastMaintenanceAt === null ? null : isoDate(body.lastMaintenanceAt, 'lastMaintenanceAt');
    if (out.lastMaintenanceAt && out.lastMaintenanceAt > localDate()) throw new HttpError(400, 'VALIDATION', 'Date invalide : lastMaintenanceAt');
  }
  return out;
}

router.get(
  '/machines',
  read,
  ah(async (req, res) => {
    const gymId = req.gym.id;
    const where = { gymId };
    if (req.query.zone) where.zone = String(req.query.zone).slice(0, 40);
    if (req.query.status) where.status = oneOf(req.query.status, STATUSES, 'status');
    const [machines, all, recent, open] = await Promise.all([
      Machine.findAll({ where, include: [{ model: Equipment, as: 'equipment' }], order: [['code', 'ASC'], ['id', 'ASC']] }),
      Machine.findAll({ attributes: ['zone', 'status', 'outOfService'], where: { gymId }, raw: true }),
      Report.findAll({ attributes: ['machineId', [fn('COUNT', col('id')), 'n']], where: { gymId, createdAt: { [Op.gte]: dayStart(addDays(localDate(), -30)) } }, group: ['machineId'], raw: true }),
      Report.findAll({ attributes: ['machineId', [fn('COUNT', col('id')), 'n']], where: { gymId, status: OPEN }, group: ['machineId'], raw: true }),
    ]);
    const r30 = new Map(recent.map((r) => [r.machineId, Number(r.n)]));
    const ro = new Map(open.map((r) => [r.machineId, Number(r.n)]));
    const byZone = {};
    for (const z of req.settings.zones) byZone[z] = 0;
    for (const m of all) byZone[m.zone] = (byZone[m.zone] || 0) + 1;
    res.json({
      zones: req.settings.zones,
      counts: {
        all: all.length,
        byZone,
        signalees: all.filter((m) => m.status === 'SIGNALEE').length,
        reparation: all.filter((m) => m.status === 'REPARATION').length,
        outOfService: all.filter((m) => m.outOfService).length,
      },
      items: machines.map((m) => machineView(m, { reports30d: r30.get(m.id), open: ro.get(m.id) })),
    });
  })
);

// Types d'équipement (formulaire d'ajout)
router.get(
  '/equipment',
  read,
  ah(async (req, res) => {
    res.json((await Equipment.findAll({ order: [['nameFr', 'ASC']] })).map(equipmentView));
  })
);

// Étiquettes à imprimer : le QR contient « KM.<salle>.<machine> » (lu par l'écran « Signaler une panne »)
router.get(
  '/machines/qr',
  read,
  ah(async (req, res) => {
    const machines = await Machine.findAll({ where: { gymId: req.gym.id }, order: [['code', 'ASC'], ['id', 'ASC']] });
    res.json(machines.map((m) => ({ id: m.id, code: m.code, label: m.label, zone: m.zone, qr: `KM.${req.gym.id}.${m.id}` })));
  })
);

router.post(
  '/machines',
  write,
  ah(async (req, res) => {
    const data = await cleanMachine(req, req.body);
    const machine = await Machine.create({ status: 'OK', ...data, gymId: req.gym.id });
    await audit(req, 'machine.create', { type: 'Machine', id: machine.id }, { label: machine.label, code: machine.code });
    res.status(201).json(machineView(await findMachine(req.gym.id, machine.id)));
  })
);

router.put(
  '/machines/:id',
  write,
  ah(async (req, res) => {
    const machine = await findMachine(req.gym.id, req.params.id);
    const data = await cleanMachine(req, req.body, { partial: true, exceptId: machine.id });
    await machine.update(data);
    await audit(req, 'machine.update', { type: 'Machine', id: machine.id }, { fields: Object.keys(data), status: machine.status, outOfService: machine.outOfService });
    res.json(machineView(await findMachine(req.gym.id, machine.id)));
  })
);

router.delete(
  '/machines/:id',
  write,
  ah(async (req, res) => {
    const machine = await findMachine(req.gym.id, req.params.id);
    await machine.destroy();
    await audit(req, 'machine.delete', { type: 'Machine', id: machine.id }, { label: machine.label, code: machine.code });
    res.json({ ok: true });
  })
);

// Photo d'une machine → type d'équipement reconnu par l'IA (seul l'administrateur crée de nouveaux types)
const identifyLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, key: (req) => `identify:${req.user.id}` });
router.post(
  '/machines/identify',
  write,
  identifyLimiter,
  ah(async (req, res) => {
    required(req.body, ['image']);
    const result = await identifyMachine(req.body.image);
    if (!result.equipmentId) throw new HttpError(422, 'NOT_RECOGNIZED', 'Équipement non reconnu. Choisis le type à la main.');
    res.json(result);
  })
);

module.exports = router;
