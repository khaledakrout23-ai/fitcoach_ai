// Équipe de la salle (D18) : invitations (mot de passe provisoire), rôles, désactivation, matrice des accès.
// Un gérant ne peut ni se rétrograder ni se désactiver, et la salle garde toujours au moins un gérant actif.
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, Gym } = require('../../models');
const { ah, HttpError } = require('../../middleware/errors');
const { requirePermission } = require('../../middleware/auth');
const { required, oneOf, text, temporaryPassword } = require('../../utils');
const { STAFF_ROLES, PERMISSIONS } = require('../../services/permissions');
const { initials } = require('../../services/members');
const { audit } = require('../../services/audit');
const { cleanEmail, assertUnique } = require('./members');
const { BCRYPT_COST } = require('../auth');

const perm = requirePermission('team');
const ONLINE_MS = 10 * 60 * 1000;
const TEMP_PASSWORD_DAYS = 7;

const staffView = (u) => ({
  id: u.id,
  name: u.name,
  initials: initials(u.name),
  email: u.email,
  role: u.role,
  active: u.active,
  lastLoginAt: u.lastLoginAt,
  online: Boolean(u.lastLoginAt) && Date.now() - new Date(u.lastLoginAt) < ONLINE_MS,
  pendingInvitation: u.mustChangePassword,
  invitationExpiresAt: u.mustChangePassword ? u.tempPasswordExpiresAt : null,
  createdAt: u.createdAt,
});

async function findStaff(req) {
  const user = await User.findOne({ where: { id: Number(req.params.id) || 0, gymId: req.gym.id, role: STAFF_ROLES, deletedAt: null } });
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'Personne introuvable dans l’équipe.');
  return user;
}

// La salle doit garder un gérant actif
async function assertNotLastManager(req, user) {
  if (user.role !== 'GERANT') return;
  const others = await User.count({ where: { gymId: req.gym.id, role: 'GERANT', active: true, id: { [Op.ne]: user.id } } });
  if (!others) throw new HttpError(409, 'LAST_MANAGER', 'La salle doit garder au moins un gérant.');
}

router.get(
  '/team',
  perm,
  ah(async (req, res) => {
    const users = await User.findAll({ where: { gymId: req.gym.id, role: STAFF_ROLES, deletedAt: null }, order: [['active', 'DESC'], ['role', 'ASC'], ['name', 'ASC']] });
    res.json({
      members: users.map(staffView),
      roles: STAFF_ROLES,
      permissions: Object.fromEntries(Object.entries(PERMISSIONS).map(([p, roles]) => [p, roles.filter((r) => STAFF_ROLES.includes(r))])),
    });
  })
);

// Inviter : compte créé avec un mot de passe provisoire donné une seule fois
router.post(
  '/team',
  perm,
  ah(async (req, res) => {
    required(req.body, ['name', 'email', 'role']);
    const name = text(req.body.name, 100);
    if (!name || name.length < 2) throw new HttpError(400, 'VALIDATION', 'Champ invalide : name');
    const email = cleanEmail(req.body.email);
    if (!email) throw new HttpError(400, 'VALIDATION', 'Champ invalide : email');
    const role = oneOf(req.body.role, STAFF_ROLES, 'role');
    await assertUnique({ email });
    const temp = temporaryPassword();
    const expiresAt = new Date(Date.now() + TEMP_PASSWORD_DAYS * 86400000);
    const user = await User.create({
      name,
      email,
      role,
      gymId: req.gym.id,
      passwordHash: await bcrypt.hash(temp, BCRYPT_COST),
      mustChangePassword: true,
      tempPasswordExpiresAt: expiresAt,
      language: req.settings.languages.default,
    });
    await audit(req, 'team.create', { type: 'User', id: user.id }, { role });
    res.status(201).json({ member: staffView(user), login: email, temporaryPassword: temp, temporaryPasswordExpiresAt: expiresAt });
  })
);

// Changer le rôle (toutes les sessions de la personne sont coupées)
router.put(
  '/team/:id',
  perm,
  ah(async (req, res) => {
    const user = await findStaff(req);
    const role = oneOf(req.body.role, STAFF_ROLES, 'role');
    if (user.id === req.user.id) throw new HttpError(400, 'SELF', 'Tu ne peux pas changer ton propre rôle.');
    if (role !== user.role) {
      if (role !== 'GERANT') await assertNotLastManager(req, user);
      const before = user.role;
      await user.update({ role, tokenVersion: user.tokenVersion + 1 });
      if (before === 'GERANT') await Gym.update({ managerId: null }, { where: { id: req.gym.id, managerId: user.id } });
      await audit(req, 'team.role', { type: 'User', id: user.id }, { from: before, to: role });
    }
    res.json(staffView(user));
  })
);

async function setActive(req, res, active) {
  const user = await findStaff(req);
  if (user.id === req.user.id) throw new HttpError(400, 'SELF', 'Tu ne peux pas désactiver ton propre compte.');
  if (!active) await assertNotLastManager(req, user);
  await user.update({ active, tokenVersion: user.tokenVersion + 1 });
  await audit(req, active ? 'team.reactivate' : 'team.deactivate', { type: 'User', id: user.id });
  res.json(staffView(user));
}
router.post('/team/:id/deactivate', perm, ah((req, res) => setActive(req, res, false)));
router.post('/team/:id/reactivate', perm, ah((req, res) => setActive(req, res, true)));

// Nouveau mot de passe provisoire (invitation expirée, oubli)
router.post(
  '/team/:id/reset-password',
  perm,
  ah(async (req, res) => {
    const user = await findStaff(req);
    if (user.id === req.user.id) throw new HttpError(400, 'SELF', 'Change ton mot de passe depuis ton compte.');
    const temp = temporaryPassword();
    const expiresAt = new Date(Date.now() + TEMP_PASSWORD_DAYS * 86400000);
    await user.update({
      passwordHash: await bcrypt.hash(temp, BCRYPT_COST),
      mustChangePassword: true,
      tempPasswordExpiresAt: expiresAt,
      failedLogins: 0,
      lockedUntil: null,
      tokenVersion: user.tokenVersion + 1,
    });
    await audit(req, 'team.reset_password', { type: 'User', id: user.id });
    res.json({ login: user.email, temporaryPassword: temp, temporaryPasswordExpiresAt: expiresAt });
  })
);

module.exports = router;
