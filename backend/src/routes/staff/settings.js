// Paramètres de la salle (D19 / M14) et journal des actions de l'équipe
const router = require('express').Router();
const { AuditLog, User } = require('../../models');
const { ah, HttpError } = require('../../middleware/errors');
const { requirePermission } = require('../../middleware/auth');
const { num, text, normalizePhone } = require('../../utils');
const { cleanSettings } = require('../../services/gymSettings');
const { audit } = require('../../services/audit');

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_KEYS = ['week', 'sat', 'sun'];

// Horaires : { week: ['06:00','23:00'] | null, sat, sun, ramadan?: { week, sat, sun } } ; null = fermé
function cleanHours(value, { nested = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'VALIDATION', 'Champ invalide : hours');
  const out = {};
  for (const k of DAY_KEYS) {
    const range = value[k];
    if (range === null || range === undefined) {
      out[k] = null;
      continue;
    }
    if (!Array.isArray(range) || range.length !== 2 || !range.every((h) => HHMM.test(String(h))) || range[0] >= range[1]) {
      throw new HttpError(400, 'VALIDATION', `Champ invalide : hours.${k}`);
    }
    out[k] = [range[0], range[1]];
  }
  if (!nested && value.ramadan) out.ramadan = cleanHours(value.ramadan, { nested: true });
  return out;
}

const gymView = (g) => ({ id: g.id, name: g.name, address: g.address, city: g.city, phone: g.phone, capacity: g.capacity, hours: g.hours });

router.get(
  '/settings',
  requirePermission('settings'),
  ah(async (req, res) => {
    res.json({ gym: gymView(req.gym), settings: req.settings });
  })
);

router.put(
  '/settings',
  requirePermission('settings'),
  ah(async (req, res) => {
    const gym = req.gym;
    const data = {};
    const g = req.body.gym || {};
    if (g.name !== undefined) {
      data.name = text(g.name, 120);
      if (!data.name) throw new HttpError(400, 'VALIDATION', 'Champ invalide : name');
    }
    if (g.address !== undefined) data.address = text(g.address, 200);
    if (g.city !== undefined) data.city = text(g.city, 80);
    if (g.phone !== undefined) {
      if (g.phone && !normalizePhone(g.phone)) throw new HttpError(400, 'VALIDATION', 'Champ invalide : phone');
      data.phone = text(g.phone, 30);
    }
    if (g.capacity !== undefined) data.capacity = num(g.capacity, 'capacity', { min: 1, max: 5000, integer: true });
    if (g.hours !== undefined) data.hours = cleanHours(g.hours);
    if (req.body.settings !== undefined) {
      if (!req.body.settings || typeof req.body.settings !== 'object') throw new HttpError(400, 'VALIDATION', 'Champ invalide : settings');
      data.settings = cleanSettings(gym.settings, req.body.settings);
    }
    await gym.update(data);
    await audit(req, 'settings.update', { type: 'Gym', id: gym.id }, { gym: Object.keys(data).filter((k) => k !== 'settings'), settings: req.body.settings ? Object.keys(req.body.settings) : [] });
    res.json({ gym: gymView(gym), settings: cleanSettings(gym.settings, {}) });
  })
);

// Journal : qui a fait quoi (membres, paiements, formules, caisse, équipe, réglages, machines, pannes)
router.get(
  '/audit',
  requirePermission('audit'),
  ah(async (req, res) => {
    const page = req.query.page === undefined ? 1 : num(req.query.page, 'page', { min: 1, max: 10000, integer: true });
    const pageSize = 50;
    const where = { gymId: req.gym.id };
    if (req.query.action) where.action = String(req.query.action).slice(0, 60);
    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      include: [{ model: User, as: 'actor', attributes: ['id', 'name', 'role'] }],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    res.json({
      total: count,
      page,
      pageSize,
      items: rows.map((a) => ({ id: a.id, action: a.action, targetType: a.targetType, targetId: a.targetId, details: a.details, createdAt: a.createdAt, actor: a.actor ? { id: a.actor.id, name: a.actor.name, role: a.actor.role } : null })),
    });
  })
);

module.exports = router;
module.exports.cleanHours = cleanHours;
