const router = require('express').Router();
const { Program, ProgramItem, Exercise, Equipment, User, WorkoutSession } = require('../models');
const { ah, HttpError } = require('../middleware/errors');
const { auth, requireRole } = require('../middleware/auth');
const { loadCatalog, availableEquipment } = require('../services/catalog');
const { isDoable, hitsInjury } = require('../services/substitution');
const { buildProgram } = require('../services/coach');
const { LEVEL_VALUE } = require('../services/constants');

router.use(auth, requireRole('SPORTIF'));

const itemInclude = [{ model: Exercise, as: 'exercise', include: [{ model: Equipment, as: 'equipment' }] }];

async function currentProgram(userId) {
  return Program.findOne({
    where: { userId, active: true },
    include: [
      {
        model: ProgramItem,
        as: 'items',
        separate: true, // requête séparée : permet de trier les lignes du programme
        include: itemInclude,
        order: [['dayIndex', 'ASC'], ['position', 'ASC']],
      },
    ],
    order: [['createdAt', 'DESC']],
  });
}

// Regroupe les lignes du programme par jour
function groupDays(program) {
  const days = [];
  for (const item of program.items) {
    let day = days.find((d) => d.dayIndex === item.dayIndex);
    if (!day) {
      day = { dayIndex: item.dayIndex, labelFr: item.dayLabelFr, labelAr: item.dayLabelAr, items: [] };
      days.push(day);
    }
    day.items.push(item);
  }
  return days;
}

// Générer un programme (RG1 : profil et salle obligatoires)
router.post(
  '/generate',
  ah(async (req, res) => {
    const user = await User.findByPk(req.user.id);
    if (!user.gymId || !user.goal || !user.level || !user.daysPerWeek) {
      throw new HttpError(400, 'PROFILE_INCOMPLETE', 'Complétez votre profil et choisissez votre salle avant de générer un programme.');
    }
    const catalog = await loadCatalog();
    const equipment = await availableEquipment(user.gymId);
    const available = new Set(equipment);
    const levelValue = LEVEL_VALUE[user.level] || 1;
    const candidates = catalog.filter((c) => isDoable(c, available) && !hitsInjury(c, user.injuries) && c.difficulty <= levelValue + 1);

    const { program: plan, source } = await buildProgram({ user, catalog, availableEquipment: equipment, candidates });

    await Program.update({ active: false }, { where: { userId: user.id } });
    const program = await Program.create({
      userId: user.id,
      title: plan.title,
      source,
      goal: user.goal,
      daysPerWeek: plan.days.length,
    });
    const rows = [];
    plan.days.forEach((d) =>
      d.items.forEach((it, pos) =>
        rows.push({ programId: program.id, dayIndex: d.dayIndex, dayLabelFr: d.labelFr, dayLabelAr: d.labelAr, position: pos + 1, ...it })
      )
    );
    await ProgramItem.bulkCreate(rows);
    const fresh = await currentProgram(user.id);
    res.status(201).json({ ...fresh.toJSON(), days: groupDays(fresh) });
  })
);

router.get(
  '/current',
  ah(async (req, res) => {
    const program = await currentProgram(req.user.id);
    if (!program) return res.json(null);
    return res.json({ ...program.toJSON(), days: groupDays(program) });
  })
);

// Séance du jour : la séance en cours, sinon le jour suivant du programme
router.get(
  '/today',
  ah(async (req, res) => {
    const program = await currentProgram(req.user.id);
    if (!program) return res.json(null);
    const inProgress = await WorkoutSession.findOne({ where: { userId: req.user.id, status: 'EN_COURS' }, order: [['startedAt', 'DESC']] });
    const last = await WorkoutSession.findOne({
      where: { userId: req.user.id, programId: program.id, status: 'TERMINEE' },
      order: [['finishedAt', 'DESC']],
    });
    const days = groupDays(program);
    const nextIndex = last ? (last.dayIndex % days.length) + 1 : 1;
    const day = days.find((d) => d.dayIndex === nextIndex) || days[0];
    return res.json({ programId: program.id, inProgressSessionId: inProgress ? inProgress.id : null, day, totalDays: days.length });
  })
);

module.exports = router;
