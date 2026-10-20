// Données de démonstration : comptes, salles, machines, exercices, séances, abonnements...
const bcrypt = require('bcryptjs');
const models = require('../models');
const equipmentList = require('./equipment');
const exerciseList = require('./exercises');
const { generateProgram } = require('../services/programGenerator');
const { normalizeExercise } = require('../services/catalog');

const {
  User, Gym, Equipment, Machine, Exercise, Program, ProgramItem,
  WorkoutSession, SessionEntry, Report, Subscription, CheckIn, ChatMessage,
} = models;

function daysAgo(n, hour = 18, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function isoDate(d) {
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// petit générateur pseudo-aléatoire pour avoir toujours les mêmes données
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

async function seed() {
  const rand = seeded(42);

  // 1. Équipements
  const equipment = await Equipment.bulkCreate(
    equipmentList.map(([code, nameFr, nameAr, category]) => ({ code, nameFr, nameAr, category }))
  );
  const eq = Object.fromEntries(equipment.map((e) => [e.code, e]));

  // 2. Exercices
  await Exercise.bulkCreate(
    exerciseList.map(({ equipment: code, ...rest }) => ({ ...rest, equipmentId: eq[code].id }))
  );

  // 3. Comptes
  const hash = (p) => bcrypt.hashSync(p, 10);
  const admin = await User.create({ name: 'Administrateur', email: 'admin@fitcoach.tn', passwordHash: hash('Admin123!'), role: 'ADMIN' });
  const manager = await User.create({ name: 'Sami Ben Salah', email: 'gerant@fitcoach.tn', passwordHash: hash('Gerant123!'), role: 'GERANT' });
  const manager2 = await User.create({ name: 'Leila Trabelsi', email: 'gerant.sfax@fitcoach.tn', passwordHash: hash('Gerant123!'), role: 'GERANT' });

  // 4. Salles et machines
  const gym = await Gym.create({
    name: 'Atlas Fitness Ennasr',
    address: 'Avenue Hédi Nouira, Ennasr 2',
    city: 'Ariana',
    phone: '+216 71 000 000',
    openingHours: 'Lun-Sam 7h-22h · Dim 9h-14h',
    managerId: manager.id,
  });
  const gym2 = await Gym.create({
    name: 'Carthage Sport Sfax',
    address: 'Route de Tunis km 3',
    city: 'Sfax',
    openingHours: 'Lun-Sam 8h-21h',
    managerId: manager2.id,
  });
  await manager.update({ gymId: gym.id });
  await manager2.update({ gymId: gym2.id });

  const gymMachines = [
    ['barre', 'Barres olympiques (x3)'],
    ['halteres', 'Haltères 2 à 40 kg'],
    ['kettlebell', 'Kettlebells 8 à 24 kg'],
    ['elastique', 'Élastiques de musculation'],
    ['banc', 'Banc réglable n°1'],
    ['banc', 'Banc réglable n°2'],
    ['banc_couche', 'Banc développé couché n°1'],
    ['banc_couche', 'Banc développé couché n°2'],
    ['cage_squat', 'Cage à squat'],
    ['presse_cuisses', 'Presse à cuisses'],
    ['leg_extension', 'Leg extension'],
    ['leg_curl', 'Leg curl'],
    ['poulie', 'Vis-à-vis (poulie double)'],
    ['tirage_vertical', 'Tirage vertical'],
    ['tirage_horizontal', 'Rowing assis'],
    ['machine_pec', 'Butterfly'],
    ['barre_traction', 'Barre de traction'],
    ['barres_paralleles', 'Station dips'],
    ['mollets', 'Machine mollets'],
  ];
  const machines = await Machine.bulkCreate(
    gymMachines.map(([code, label]) => ({ gymId: gym.id, equipmentId: eq[code].id, label, status: code === 'leg_curl' ? 'PANNE' : 'OK' }))
  );
  await Machine.bulkCreate(
    ['barre', 'halteres', 'banc', 'cage_squat', 'poulie', 'barre_traction', 'kettlebell'].map((code) => ({
      gymId: gym2.id,
      equipmentId: eq[code].id,
      label: eq[code].nameFr,
    }))
  );

  // 5. Sportifs
  const athlete = await User.create({
    name: 'Yassine Ben Ali',
    email: 'sportif@fitcoach.tn',
    passwordHash: hash('Sportif123!'),
    role: 'SPORTIF',
    gymId: gym.id,
    age: 21,
    weight: 74,
    height: 178,
    goal: 'PRISE_MASSE',
    level: 'INTERMEDIAIRE',
    daysPerWeek: 4,
    injuries: [],
    healthConsent: true,
  });
  const others = await User.bulkCreate(
    [
      ['Amira Gharbi', 'amira@fitcoach.tn', 'FORME', 'DEBUTANT', 3],
      ['Mehdi Jaziri', 'mehdi@fitcoach.tn', 'FORCE', 'AVANCE', 5],
      ['Nour Hammami', 'nour@fitcoach.tn', 'PERTE_POIDS', 'DEBUTANT', 3],
      ['Karim Mansour', 'karim@fitcoach.tn', 'PRISE_MASSE', 'INTERMEDIAIRE', 4],
      ['Salma Ayari', 'salma@fitcoach.tn', 'FORME', 'INTERMEDIAIRE', 3],
    ].map(([name, email, goal, level, days]) => ({
      name,
      email,
      passwordHash: hash('Sportif123!'),
      role: 'SPORTIF',
      gymId: gym.id,
      goal,
      level,
      daysPerWeek: days,
      injuries: [],
      healthConsent: true,
    }))
  );

  // 6. Abonnements (montants en TND)
  const today = new Date();
  const subs = [
    [athlete, -20, 10, 60],
    [others[0], -28, 2, 60], // expire bientôt
    [others[1], -60, -5, 150], // expiré
    [others[2], -10, 80, 150],
    [others[3], -15, 15, 60],
    [others[4], -3, 27, 60],
  ];
  await Subscription.bulkCreate(
    subs.map(([u, start, end, amount], i) => ({
      userId: u.id,
      gymId: gym.id,
      startDate: isoDate(new Date(today.getTime() + start * 86400000)),
      endDate: isoDate(new Date(today.getTime() + end * 86400000)),
      amount,
      paymentMethod: i % 3 === 2 ? 'CARTE' : 'ESPECES',
    }))
  );

  // 7. Programme du sportif de démo
  const exercises = await Exercise.findAll({ include: [{ model: Equipment, as: 'equipment' }], order: [['id', 'ASC']] });
  const catalog = exercises.map(normalizeExercise);
  const available = [...new Set(['poids_du_corps', ...machines.filter((m) => m.status === 'OK').map((m) => equipment.find((e) => e.id === m.equipmentId).code)])];
  const plan = generateProgram({ profile: athlete, catalog, availableEquipment: available });
  const program = await Program.create({ userId: athlete.id, title: plan.title, source: 'REGLES', goal: athlete.goal, daysPerWeek: plan.days.length });
  const items = [];
  plan.days.forEach((d) =>
    d.items.forEach((it, pos) =>
      items.push({ programId: program.id, dayIndex: d.dayIndex, dayLabelFr: d.labelFr, dayLabelAr: d.labelAr, position: pos + 1, ...it })
    )
  );
  await ProgramItem.bulkCreate(items);

  // 8. Historique : 3 semaines de séances avec progression des charges
  const startWeights = { pectoraux: 40, dos: 45, epaules: 16, biceps: 12, triceps: 20, quadriceps: 60, ischios: 40, fessiers: 50, mollets: 40, abdos: 0 };
  const sessionDays = [21, 19, 17, 15, 12, 10, 8, 6, 4, 2, 1];
  const byId = Object.fromEntries(catalog.map((c) => [c.id, c]));
  for (let s = 0; s < sessionDays.length; s += 1) {
    const dayIndex = (s % plan.days.length) + 1;
    const day = plan.days[dayIndex - 1];
    const start = daysAgo(sessionDays[s], 17 + (s % 3), 15);
    const session = await WorkoutSession.create({
      userId: athlete.id,
      programId: program.id,
      dayIndex,
      dayLabelFr: day.labelFr,
      dayLabelAr: day.labelAr,
      status: 'TERMINEE',
      startedAt: start,
      finishedAt: new Date(start.getTime() + 65 * 60000),
    });
    const entries = day.items.map((it, pos) => {
      const ex = byId[it.exerciseId];
      const base = startWeights[ex.primaryMuscle] || 20;
      const weight = ex.equipmentCode === 'poids_du_corps' ? 0 : Math.round((base + s * 1.25) * 2) / 2;
      const reps = ex.primaryMuscle === 'abdos' && ex.pattern === 'gainage' ? 40 : 10;
      return {
        sessionId: session.id,
        exerciseId: it.exerciseId,
        position: pos + 1,
        targetSets: it.sets,
        targetReps: it.reps,
        restSec: it.restSec,
        setsDone: Array.from({ length: it.sets }, (_, k) => ({ reps: Math.max(6, reps - k), weight })),
      };
    });
    // deux remplacements dans l'historique (pour les statistiques du gérant)
    if (s === 3 || s === 7) {
      const first = entries[0];
      const original = byId[first.exerciseId];
      const alt = catalog.find((c) => c.id !== original.id && c.primaryMuscle === original.primaryMuscle && c.equipmentCode === 'halteres');
      if (alt) {
        first.originalExerciseId = original.id;
        first.exerciseId = alt.id;
        first.reason = 'OCCUPEE';
      }
    }
    await SessionEntry.bulkCreate(entries);
  }

  // 9. Passages en salle sur 30 jours (pour les statistiques d'affluence)
  const members = [athlete, ...others];
  const checkins = [];
  for (let d = 30; d >= 1; d -= 1) {
    for (const m of members) {
      if (rand() < 0.45) {
        const hour = rand() < 0.65 ? 17 + Math.floor(rand() * 4) : 7 + Math.floor(rand() * 9);
        const inAt = daysAgo(d, hour, Math.floor(rand() * 60));
        checkins.push({ userId: m.id, gymId: gym.id, checkInAt: inAt, checkOutAt: new Date(inAt.getTime() + (50 + rand() * 40) * 60000) });
      }
    }
  }
  await CheckIn.bulkCreate(checkins);

  // 10. Une panne signalée et une conversation
  const legCurl = machines.find((m) => m.equipmentId === eq.leg_curl.id);
  await Report.create({ machineId: legCurl.id, gymId: gym.id, userId: athlete.id, description: 'Le câble est coupé.', status: 'CONFIRME' });
  const presse = machines.find((m) => m.equipmentId === eq.presse_cuisses.id);
  await Report.create({ machineId: presse.id, gymId: gym.id, userId: others[1].id, description: 'Bruit bizarre quand on pousse.', status: 'NOUVEAU' });

  await ChatMessage.bulkCreate([
    { userId: athlete.id, role: 'user', content: 'Combien de protéines je dois manger par jour ?' },
    {
      userId: athlete.id,
      role: 'assistant',
      offline: true,
      content: "Visez environ 1,6 g de protéines par kg de poids par jour, réparties sur 3 ou 4 repas : œufs, poulet, thon, lentilles, pois chiches, yaourt. Buvez au moins 1,5 L d'eau par jour.",
    },
  ]);

  // comptes de démonstration : adresses considérées comme déjà vérifiées
  await User.update({ emailVerified: true }, { where: {} });

  return { admin, manager, athlete, gym, exercises: exercises.length };
}

module.exports = { seed };
