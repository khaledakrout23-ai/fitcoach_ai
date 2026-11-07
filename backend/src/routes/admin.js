// Espace administrateur Kammel : salles + premier gérant, utilisateurs, catalogue d'exercices, équipements, statistiques
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const {
  sequelize, User, Gym, Machine, Exercise, Equipment, WorkoutSession, ProgramItem, SessionEntry, ROLES,
} = require('../models');
const { ah, HttpError } = require('../middleware/errors');
const { auth, requireRole } = require('../middleware/auth');
const { rateLimit } = require('../middleware/security');
const { required, pick, num, oneOf, text, temporaryPassword, normalizePhone, localDate } = require('../utils');
const { hasAI } = require('../services/gemini');
const { identifyMachine, cleanNewType } = require('../services/machinePhoto');
const { suggestExercises, cleanExercise, sameName } = require('../services/exerciseSuggest');
const { MUSCLES, PATTERNS, INJURY_ZONES, LEVELS } = require('../services/constants');
const { gymSettings } = require('../services/gymSettings');
const { presentCount } = require('../services/occupancy');
const { STAFF_ROLES } = require('../services/permissions');
const { initials, likeQuery } = require('../services/members');
const { cleanHours } = require('./staff/settings');
const { cleanEmail, assertUnique } = require('./staff/members');
const { BCRYPT_COST } = require('./auth');

router.use(auth, requireRole('ADMIN'));

const TEMP_PASSWORD_DAYS = 7;
const aiLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, key: (req) => `admin-ai:${req.user.id}` });

router.get(
  '/stats',
  ah(async (req, res) => {
    const today = new Date(`${localDate()}T00:00:00`);
    const [sportifs, staff, gyms, exercises, sessions, sessionsToday] = await Promise.all([
      User.count({ where: { role: 'SPORTIF', deletedAt: null } }),
      User.count({ where: { role: STAFF_ROLES, deletedAt: null } }),
      Gym.count(),
      Exercise.count(),
      WorkoutSession.count({ where: { status: 'TERMINEE' } }),
      WorkoutSession.count({ where: { status: 'TERMINEE', finishedAt: { [Op.gte]: today } } }),
    ]);
    res.json({ sportifs, staff, gyms, exercises, sessions, sessionsToday, aiEnabled: hasAI() });
  })
);

// ---------------------------------------------------------------- Salles
function cleanGym(body) {
  const out = {};
  if (body.name !== undefined) {
    out.name = text(body.name, 120);
    if (!out.name) throw new HttpError(400, 'VALIDATION', 'Champ invalide : name');
  }
  if (body.address !== undefined) out.address = text(body.address, 200);
  if (body.city !== undefined) out.city = text(body.city, 80);
  if (body.phone !== undefined) {
    if (body.phone && !normalizePhone(body.phone)) throw new HttpError(400, 'VALIDATION', 'Champ invalide : phone');
    out.phone = text(body.phone, 30);
  }
  if (body.capacity !== undefined) out.capacity = num(body.capacity, 'capacity', { min: 1, max: 5000, integer: true });
  if (body.hours !== undefined) out.hours = cleanHours(body.hours);
  return out;
}

const gymBase = (g) => ({ id: g.id, name: g.name, address: g.address, city: g.city, phone: g.phone, capacity: g.capacity, hours: g.hours, createdAt: g.createdAt });

router.get(
  '/gyms',
  ah(async (req, res) => {
    const gyms = await Gym.findAll({ order: [['name', 'ASC']] });
    const out = [];
    for (const g of gyms) {
      const [manager, members, machines, live] = await Promise.all([
        User.findOne({ where: { gymId: g.id, role: 'GERANT', deletedAt: null }, attributes: ['id', 'name', 'email', 'active', 'mustChangePassword'], order: [['id', 'ASC']] }),
        User.count({ where: { gymId: g.id, role: 'SPORTIF', active: true, deletedAt: null } }),
        Machine.count({ where: { gymId: g.id } }),
        presentCount(g.id, gymSettings(g)),
      ]);
      out.push({ ...gymBase(g), members, machines, liveCount: live, manager });
    }
    res.json(out);
  })
);

// Nouvelle salle + son premier gérant (mot de passe provisoire affiché une seule fois)
router.post(
  '/gyms',
  ah(async (req, res) => {
    required(req.body, ['name', 'managerName', 'managerEmail']);
    const data = cleanGym(req.body);
    const managerName = text(req.body.managerName, 100);
    if (!managerName || managerName.length < 2) throw new HttpError(400, 'VALIDATION', 'Champ invalide : managerName');
    const email = cleanEmail(req.body.managerEmail);
    if (!email) throw new HttpError(400, 'VALIDATION', 'Champ invalide : managerEmail');
    await assertUnique({ email });
    const temp = temporaryPassword();
    const expiresAt = new Date(Date.now() + TEMP_PASSWORD_DAYS * 86400000);
    const passwordHash = await bcrypt.hash(temp, BCRYPT_COST);
    const result = await sequelize.transaction(async (t) => {
      const gym = await Gym.create(
        {
          hours: { week: ['06:00', '23:00'], sat: ['07:00', '21:00'], sun: ['08:00', '14:00'] },
          settings: {},
          ...data,
        },
        { transaction: t }
      );
      const manager = await User.create(
        { name: managerName, email, passwordHash, role: 'GERANT', gymId: gym.id, mustChangePassword: true, tempPasswordExpiresAt: expiresAt },
        { transaction: t }
      );
      await gym.update({ managerId: manager.id }, { transaction: t });
      return { gym, manager };
    });
    res.status(201).json({
      ...gymBase(result.gym),
      manager: { id: result.manager.id, name: result.manager.name, email },
      login: email,
      temporaryPassword: temp,
      temporaryPasswordExpiresAt: expiresAt,
    });
  })
);

async function findGym(id) {
  const gym = await Gym.findByPk(Number(id) || 0);
  if (!gym) throw new HttpError(404, 'NOT_FOUND', 'Salle introuvable.');
  return gym;
}

router.put(
  '/gyms/:id',
  ah(async (req, res) => {
    const gym = await findGym(req.params.id);
    await gym.update(cleanGym(req.body));
    res.json(gymBase(gym));
  })
);

// Suppression seulement sans membre : les paiements et abonnements ne doivent jamais disparaître par accident
router.delete(
  '/gyms/:id',
  ah(async (req, res) => {
    const gym = await findGym(req.params.id);
    if (await User.count({ where: { gymId: gym.id, role: 'SPORTIF', deletedAt: null } })) {
      throw new HttpError(409, 'GYM_NOT_EMPTY', 'La salle a encore des membres : suppression impossible.');
    }
    await sequelize.transaction(async (t) => {
      const staff = await User.findAll({ where: { gymId: gym.id }, transaction: t });
      for (const u of staff) await u.update({ gymId: null, active: false, tokenVersion: u.tokenVersion + 1 }, { transaction: t });
      await gym.destroy({ transaction: t });
    });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------- Machines des salles
router.get(
  '/gyms/:id/machines',
  ah(async (req, res) => {
    const gym = await findGym(req.params.id);
    const machines = await Machine.findAll({ where: { gymId: gym.id }, include: [{ model: Equipment, as: 'equipment' }], order: [['code', 'ASC'], ['label', 'ASC']] });
    res.json(machines);
  })
);

router.post(
  '/gyms/:id/machines',
  ah(async (req, res) => {
    required(req.body, ['equipmentId', 'label']);
    const gym = await findGym(req.params.id);
    const equipment = await Equipment.findByPk(num(req.body.equipmentId, 'equipmentId', { min: 1, integer: true }));
    if (!equipment) throw new HttpError(400, 'VALIDATION', 'Équipement inconnu.');
    const zones = gymSettings(gym).zones;
    const zone = req.body.zone === undefined ? zones[0] : oneOf(req.body.zone, zones, 'zone');
    let code = null;
    if (req.body.code !== undefined) {
      code = String(req.body.code).trim().replace(/^#/, '');
      if (!/^[A-Za-z0-9-]{1,10}$/.test(code)) throw new HttpError(400, 'VALIDATION', 'Champ invalide : code');
      if (await Machine.count({ where: { gymId: gym.id, code } })) throw new HttpError(409, 'CODE_TAKEN', 'Ce code est déjà utilisé dans la salle.');
    }
    // nouveaux exercices proposés par l'IA et gardés par l'administrateur : ajoutés au catalogue
    const codes = (await Equipment.findAll({ attributes: ['code'] })).map((e) => e.code);
    const existing = await Exercise.findAll({ attributes: ['nameFr', 'nameEn'] });
    const toCreate = [];
    for (const item of Array.isArray(req.body.newExercises) ? req.body.newExercises.slice(0, 10) : []) {
      const ex = cleanExercise(item, equipment, codes);
      if (!ex) continue;
      const taken = [...existing, ...toCreate].some((e) => sameName(e.nameFr, ex.nameFr) || sameName(e.nameEn, ex.nameEn));
      if (!taken) toCreate.push(ex);
    }
    const result = await sequelize.transaction(async (t) => {
      const machine = await Machine.create({ gymId: gym.id, equipmentId: equipment.id, label: text(req.body.label, 100) || equipment.nameFr, code, zone, status: 'OK' }, { transaction: t });
      const exercises = await Exercise.bulkCreate(toCreate, { transaction: t });
      return { machine, exercises };
    });
    res.status(201).json({ ...result.machine.toJSON(), createdExercises: result.exercises.length });
  })
);

// Photo d'une machine → type reconnu par l'IA (ou nouveau type proposé)
router.post(
  '/machines/identify',
  aiLimiter,
  ah(async (req, res) => {
    required(req.body, ['image']);
    res.json(await identifyMachine(req.body.image));
  })
);

router.get(
  '/equipment/:id/exercises',
  ah(async (req, res) => {
    const eq = await Equipment.findByPk(Number(req.params.id) || 0);
    if (!eq) throw new HttpError(404, 'NOT_FOUND', 'Équipement introuvable.');
    const all = await Exercise.findAll({ order: [['primaryMuscle', 'ASC'], ['nameFr', 'ASC']] });
    res.json(
      all
        .filter((e) => e.equipmentId === eq.id || (e.accessories || []).includes(eq.code))
        .map((e) => ({ id: e.id, nameFr: e.nameFr, nameAr: e.nameAr, primaryMuscle: e.primaryMuscle, difficulty: e.difficulty, accessory: e.equipmentId !== eq.id }))
    );
  })
);

// Nouveau type d'équipement
router.post(
  '/equipment',
  ah(async (req, res) => {
    const data = cleanNewType(req.body);
    if (!data) throw new HttpError(400, 'VALIDATION', 'Code, nom français et nom arabe obligatoires.');
    const [equipment] = await Equipment.findOrCreate({ where: { code: data.code }, defaults: data });
    res.status(201).json(equipment);
  })
);

// Nouveaux exercices proposés par l'IA pour cet équipement (pas encore enregistrés)
router.get(
  '/equipment/:id/suggestions',
  aiLimiter,
  ah(async (req, res) => {
    const eq = await Equipment.findByPk(Number(req.params.id) || 0);
    if (!eq) throw new HttpError(404, 'NOT_FOUND', 'Équipement introuvable.');
    const suggestions = await suggestExercises(eq);
    if (!suggestions) throw new HttpError(503, 'AI_UNAVAILABLE', 'L’IA est momentanément indisponible. Réessaie dans un instant.');
    res.json(suggestions);
  })
);

// ---------------------------------------------------------------- Utilisateurs
router.get(
  '/users',
  ah(async (req, res) => {
    const where = { deletedAt: null };
    if (req.query.role) where.role = oneOf(req.query.role, ROLES, 'role');
    if (req.query.gymId) where.gymId = num(req.query.gymId, 'gymId', { min: 1, integer: true });
    if (req.query.q) {
      const q = likeQuery(req.query.q);
      where[Op.or] = [{ name: { [Op.like]: q } }, { email: { [Op.like]: q } }, { phone: { [Op.like]: q } }];
    }
    const page = req.query.page === undefined ? 1 : num(req.query.page, 'page', { min: 1, max: 10000, integer: true });
    const pageSize = 50;
    const { rows, count } = await User.findAndCountAll({
      where,
      attributes: ['id', 'name', 'email', 'phone', 'role', 'active', 'gymId', 'lastLoginAt', 'mustChangePassword', 'createdAt'],
      include: [{ model: Gym, as: 'gym', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    res.json({ total: count, page, pageSize, items: rows.map((u) => ({ ...u.toJSON(), initials: initials(u.name) })) });
  })
);

// Activer / désactiver un compte (sessions coupées)
router.patch(
  '/users/:id',
  ah(async (req, res) => {
    const user = await User.findOne({ where: { id: Number(req.params.id) || 0, deletedAt: null } });
    if (!user) throw new HttpError(404, 'NOT_FOUND', 'Utilisateur introuvable.');
    if (user.id === req.user.id) throw new HttpError(400, 'SELF', 'Tu ne peux pas désactiver ton propre compte.');
    if (typeof req.body.active !== 'boolean') throw new HttpError(400, 'VALIDATION', 'Champ invalide : active');
    await user.update({ active: req.body.active, tokenVersion: user.tokenVersion + 1 });
    res.json({ id: user.id, name: user.name, role: user.role, active: user.active });
  })
);

// ---------------------------------------------------------------- Exercices
const EXERCISE_FIELDS = [
  'nameFr', 'nameAr', 'nameEn', 'primaryMuscle', 'secondaryMuscles', 'pattern', 'equipmentId', 'accessories', 'difficulty',
  'injuryZones', 'defaultReps', 'defaultSets', 'alternativeIds', 'benefitsFr', 'benefitsAr', 'mistakesFr', 'mistakesAr', 'videoUrl',
];
const SETS = /^\d{1,2}x\d{1,3}$/;
const list = (v, field, max = 10) => {
  if (!Array.isArray(v) || v.length > max) throw new HttpError(400, 'VALIDATION', `Champ invalide : ${field}`);
  return v;
};

async function validateExercise(raw, selfId = null) {
  const data = { ...raw };
  for (const k of ['nameFr', 'nameAr', 'nameEn']) {
    if (data[k] !== undefined) {
      data[k] = text(data[k], 120);
      if (!data[k]) throw new HttpError(400, 'VALIDATION', `Champ invalide : ${k}`);
    }
  }
  if (data.primaryMuscle !== undefined) oneOf(data.primaryMuscle, Object.keys(MUSCLES), 'primaryMuscle');
  if (data.pattern !== undefined) oneOf(data.pattern, Object.keys(PATTERNS), 'pattern');
  if (data.secondaryMuscles !== undefined) data.secondaryMuscles = [...new Set(list(data.secondaryMuscles, 'secondaryMuscles').map((m) => oneOf(m, Object.keys(MUSCLES), 'secondaryMuscles')))];
  if (data.injuryZones !== undefined) data.injuryZones = [...new Set(list(data.injuryZones, 'injuryZones').map((z) => oneOf(z, Object.keys(INJURY_ZONES), 'injuryZones')))];
  if (data.difficulty !== undefined) data.difficulty = num(data.difficulty, 'difficulty', { min: 1, max: 3, integer: true });
  if (data.equipmentId !== undefined && !(await Equipment.findByPk(num(data.equipmentId, 'equipmentId', { min: 1, integer: true })))) {
    throw new HttpError(400, 'VALIDATION', 'Équipement inconnu.');
  }
  if (data.accessories !== undefined) {
    const codes = new Set((await Equipment.findAll({ attributes: ['code'] })).map((e) => e.code));
    data.accessories = list(data.accessories, 'accessories', 5).map((c) => oneOf(c, [...codes], 'accessories'));
  }
  if (data.defaultReps !== undefined && !/^\d{1,3}(-\d{1,3})?( ?s)?$/.test(String(data.defaultReps).trim())) throw new HttpError(400, 'VALIDATION', 'Champ invalide : defaultReps');
  if (data.defaultSets !== undefined) {
    const ds = data.defaultSets;
    if (!ds || typeof ds !== 'object' || Array.isArray(ds)) throw new HttpError(400, 'VALIDATION', 'Champ invalide : defaultSets');
    data.defaultSets = {};
    for (const level of Object.keys(LEVELS)) {
      if (ds[level] === undefined || ds[level] === null || ds[level] === '') continue;
      const v = String(ds[level]).replace(/\s|×/g, (c) => (c === '×' ? 'x' : '')).toLowerCase();
      if (!SETS.test(v)) throw new HttpError(400, 'VALIDATION', `Champ invalide : defaultSets.${level}`);
      data.defaultSets[level] = v;
    }
  }
  if (data.alternativeIds !== undefined) {
    const ids = [...new Set(list(data.alternativeIds, 'alternativeIds', 6).map((id) => num(id, 'alternativeIds', { min: 1, integer: true })))];
    if (selfId && ids.includes(selfId)) throw new HttpError(400, 'VALIDATION', 'Un exercice ne peut pas être sa propre alternative.');
    if (ids.length && (await Exercise.count({ where: { id: ids } })) !== ids.length) throw new HttpError(400, 'UNKNOWN_EXERCISE', 'Alternative inconnue.');
    data.alternativeIds = ids;
  }
  for (const k of ['benefitsFr', 'benefitsAr', 'mistakesFr', 'mistakesAr']) {
    if (data[k] !== undefined) data[k] = list(data[k], k, 5).map((s) => text(s, 200)).filter(Boolean);
  }
  if (data.videoUrl !== undefined && data.videoUrl !== null && data.videoUrl !== '') {
    if (!/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\/[\w?=&/-]{1,200}$/.test(String(data.videoUrl))) {
      throw new HttpError(400, 'VALIDATION', 'Le lien vidéo doit être un lien YouTube.');
    }
  } else if (data.videoUrl === '') data.videoUrl = null;
  return data;
}

router.get(
  '/exercises',
  ah(async (req, res) => {
    res.json(await Exercise.findAll({ include: [{ model: Equipment, as: 'equipment' }], order: [['primaryMuscle', 'ASC'], ['nameFr', 'ASC']] }));
  })
);

router.post(
  '/exercises',
  ah(async (req, res) => {
    required(req.body, ['nameFr', 'nameAr', 'nameEn', 'primaryMuscle', 'pattern', 'equipmentId']);
    const data = await validateExercise(pick(req.body, EXERCISE_FIELDS));
    const exercise = await Exercise.create({
      secondaryMuscles: [], accessories: [], injuryZones: [], benefitsFr: [], benefitsAr: [], mistakesFr: [], mistakesAr: [], alternativeIds: [], defaultSets: {}, ...data,
    });
    res.status(201).json(exercise);
  })
);

router.put(
  '/exercises/:id',
  ah(async (req, res) => {
    const exercise = await Exercise.findByPk(Number(req.params.id) || 0);
    if (!exercise) throw new HttpError(404, 'NOT_FOUND', 'Exercice introuvable.');
    await exercise.update(await validateExercise(pick(req.body, EXERCISE_FIELDS), exercise.id));
    res.json(exercise);
  })
);

router.delete(
  '/exercises/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id) || 0;
    const used =
      (await ProgramItem.count({ where: { exerciseId: id } })) +
      (await SessionEntry.count({ where: { [Op.or]: [{ exerciseId: id }, { originalExerciseId: id }] } }));
    if (used) throw new HttpError(409, 'IN_USE', 'Exercice utilisé dans des programmes ou des séances : suppression impossible.');
    await Exercise.destroy({ where: { id } });
    res.json({ ok: true });
  })
);

module.exports = router;
