// Espace administrateur : salles, gérants, utilisateurs, exercices
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { sequelize, User, Gym, Machine, Exercise, Equipment, WorkoutSession, ProgramItem, SessionEntry } = require('../models');
const { ah, HttpError } = require('../middleware/errors');
const { auth, requireRole } = require('../middleware/auth');
const { required, pick, publicUser, checkPassword } = require('../utils');
const { hasAI } = require('../services/gemini');
const { identifyMachine, cleanNewType } = require('../services/machinePhoto');
const { suggestExercises, cleanExercise, sameName } = require('../services/exerciseSuggest');
const { MUSCLES, PATTERNS, INJURY_ZONES } = require('../services/constants');

router.use(auth, requireRole('ADMIN'));

router.get(
  '/stats',
  ah(async (req, res) => {
    const [sportifs, gerants, gyms, exercises, sessions] = await Promise.all([
      User.count({ where: { role: 'SPORTIF' } }),
      User.count({ where: { role: 'GERANT' } }),
      Gym.count(),
      Exercise.count(),
      WorkoutSession.count({ where: { status: 'TERMINEE' } }),
    ]);
    res.json({ sportifs, gerants, gyms, exercises, sessions, aiEnabled: hasAI() });
  })
);

// ---------------------------------------------------------------- Salles + gérants
router.get(
  '/gyms',
  ah(async (req, res) => {
    const gyms = await Gym.findAll({ order: [['name', 'ASC']] });
    const out = [];
    for (const g of gyms) {
      const [manager, members, machines] = await Promise.all([
        g.managerId ? User.findByPk(g.managerId, { attributes: ['id', 'name', 'email'] }) : null,
        User.count({ where: { gymId: g.id, role: 'SPORTIF' } }),
        Machine.count({ where: { gymId: g.id } }),
      ]);
      out.push({ ...g.toJSON(), manager, members, machines });
    }
    res.json(out);
  })
);

// Crée une salle et son compte gérant (RG7 : les gérants sont créés par l'administrateur)
router.post(
  '/gyms',
  ah(async (req, res) => {
    required(req.body, ['name', 'managerName', 'managerEmail', 'managerPassword']);
    checkPassword(req.body.managerPassword);
    const result = await sequelize.transaction(async (t) => {
      const gym = await Gym.create(pick(req.body, ['name', 'address', 'city', 'phone', 'openingHours']), { transaction: t });
      const manager = await User.create(
        {
          name: req.body.managerName,
          email: String(req.body.managerEmail).toLowerCase().trim(),
          passwordHash: await bcrypt.hash(String(req.body.managerPassword), 10),
          role: 'GERANT',
          gymId: gym.id,
          emailVerified: true, // compte créé par l'administrateur
        },
        { transaction: t }
      );
      await gym.update({ managerId: manager.id }, { transaction: t });
      return { gym, manager };
    });
    res.status(201).json({ ...result.gym.toJSON(), manager: publicUser(result.manager) });
  })
);

router.put(
  '/gyms/:id',
  ah(async (req, res) => {
    const gym = await Gym.findByPk(req.params.id);
    if (!gym) throw new HttpError(404, 'NOT_FOUND', 'Salle introuvable.');
    await gym.update(pick(req.body, ['name', 'address', 'city', 'phone', 'openingHours']));
    res.json(gym);
  })
);

router.delete(
  '/gyms/:id',
  ah(async (req, res) => {
    const gym = await Gym.findByPk(req.params.id);
    if (!gym) throw new HttpError(404, 'NOT_FOUND', 'Salle introuvable.');
    await gym.destroy();
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------- Machines des salles
router.get(
  '/gyms/:id/machines',
  ah(async (req, res) => {
    const machines = await Machine.findAll({
      where: { gymId: req.params.id },
      include: [{ model: Equipment, as: 'equipment' }],
      order: [['label', 'ASC']],
    });
    res.json(machines);
  })
);

router.post(
  '/gyms/:id/machines',
  ah(async (req, res) => {
    required(req.body, ['equipmentId', 'label']);
    const gym = await Gym.findByPk(req.params.id);
    if (!gym) throw new HttpError(404, 'NOT_FOUND', 'Salle introuvable.');
    const equipment = await Equipment.findByPk(req.body.equipmentId);
    if (!equipment) throw new HttpError(400, 'VALIDATION', 'Équipement inconnu.');

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
      const machine = await Machine.create({ gymId: gym.id, equipmentId: equipment.id, label: req.body.label, status: 'OK' }, { transaction: t });
      const exercises = await Exercise.bulkCreate(toCreate, { transaction: t });
      return { machine, exercises };
    });
    res.status(201).json({ ...result.machine.toJSON(), createdExercises: result.exercises.length });
  })
);

// Photo d'une machine → type reconnu par l'IA + tous les exercices du catalogue faisables avec elle
router.post(
  '/machines/identify',
  ah(async (req, res) => {
    res.json(await identifyMachine(req.body.image));
  })
);

router.get(
  '/equipment/:id/exercises',
  ah(async (req, res) => {
    const eq = await Equipment.findByPk(req.params.id);
    if (!eq) throw new HttpError(404, 'NOT_FOUND', 'Équipement introuvable.');
    // équipement principal de l'exercice, ou accessoire (ex. banc pour le développé aux haltères)
    const all = await Exercise.findAll({ order: [['primaryMuscle', 'ASC'], ['nameFr', 'ASC']] });
    res.json(
      all
        .filter((e) => e.equipmentId === eq.id || (e.accessories || []).includes(eq.code))
        .map((e) => ({ id: e.id, nameFr: e.nameFr, nameAr: e.nameAr, primaryMuscle: e.primaryMuscle, difficulty: e.difficulty, accessory: e.equipmentId !== eq.id }))
    );
  })
);

// Nouveau type d'équipement (proposé par l'IA quand aucun type existant ne correspond à la photo)
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
  ah(async (req, res) => {
    const eq = await Equipment.findByPk(req.params.id);
    if (!eq) throw new HttpError(404, 'NOT_FOUND', 'Équipement introuvable.');
    const suggestions = await suggestExercises(eq);
    if (!suggestions) throw new HttpError(503, 'AI_UNAVAILABLE', 'L’IA est momentanément indisponible. Réessayez dans un instant.');
    res.json(suggestions);
  })
);

// ---------------------------------------------------------------- Utilisateurs
router.get(
  '/users',
  ah(async (req, res) => {
    const where = {};
    if (req.query.role) where.role = req.query.role;
    if (req.query.q) where[Op.or] = [{ name: { [Op.like]: `%${req.query.q}%` } }, { email: { [Op.like]: `%${req.query.q}%` } }];
    const users = await User.findAll({ where, include: [{ model: Gym, as: 'gym', attributes: ['id', 'name'] }], order: [['createdAt', 'DESC']] });
    res.json(users);
  })
);

router.patch(
  '/users/:id',
  ah(async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (!user) throw new HttpError(404, 'NOT_FOUND', 'Utilisateur introuvable.');
    if (user.id === req.user.id) throw new HttpError(400, 'SELF', 'Vous ne pouvez pas désactiver votre propre compte.');
    await user.update(pick(req.body, ['active']));
    res.json(publicUser(user));
  })
);

// ---------------------------------------------------------------- Exercices
const EXERCISE_FIELDS = [
  'nameFr', 'nameAr', 'nameEn', 'primaryMuscle', 'secondaryMuscles', 'pattern', 'equipmentId', 'accessories',
  'difficulty', 'injuryZones', 'defaultReps', 'benefitsFr', 'benefitsAr', 'mistakesFr', 'mistakesAr', 'videoUrl',
];

async function validateExercise(data) {
  if (data.primaryMuscle && !MUSCLES[data.primaryMuscle]) throw new HttpError(400, 'VALIDATION', 'Muscle inconnu.');
  if (data.pattern && !PATTERNS[data.pattern]) throw new HttpError(400, 'VALIDATION', 'Type de mouvement inconnu.');
  if (data.secondaryMuscles) data.secondaryMuscles = data.secondaryMuscles.filter((m) => MUSCLES[m]);
  if (data.injuryZones) data.injuryZones = data.injuryZones.filter((z) => INJURY_ZONES[z]);
  if (data.difficulty !== undefined) data.difficulty = Math.min(3, Math.max(1, Number(data.difficulty) || 1));
  if (data.equipmentId && !(await Equipment.findByPk(data.equipmentId))) throw new HttpError(400, 'VALIDATION', 'Équipement inconnu.');
  if (data.videoUrl && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(data.videoUrl)) {
    throw new HttpError(400, 'VALIDATION', 'Le lien vidéo doit être un lien YouTube.');
  }
  return data;
}

router.post(
  '/exercises',
  ah(async (req, res) => {
    required(req.body, ['nameFr', 'nameAr', 'nameEn', 'primaryMuscle', 'pattern', 'equipmentId']);
    const data = await validateExercise(pick(req.body, EXERCISE_FIELDS));
    const exercise = await Exercise.create({ secondaryMuscles: [], accessories: [], injuryZones: [], benefitsFr: [], benefitsAr: [], mistakesFr: [], mistakesAr: [], ...data });
    res.status(201).json(exercise);
  })
);

router.put(
  '/exercises/:id',
  ah(async (req, res) => {
    const exercise = await Exercise.findByPk(req.params.id);
    if (!exercise) throw new HttpError(404, 'NOT_FOUND', 'Exercice introuvable.');
    await exercise.update(await validateExercise(pick(req.body, EXERCISE_FIELDS)));
    res.json(exercise);
  })
);

router.delete(
  '/exercises/:id',
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const used =
      (await ProgramItem.count({ where: { exerciseId: id } })) +
      (await SessionEntry.count({ where: { [Op.or]: [{ exerciseId: id }, { originalExerciseId: id }] } }));
    if (used) throw new HttpError(409, 'IN_USE', 'Exercice utilisé dans des programmes ou des séances : suppression impossible.');
    await Exercise.destroy({ where: { id } });
    res.json({ ok: true });
  })
);

module.exports = router;
