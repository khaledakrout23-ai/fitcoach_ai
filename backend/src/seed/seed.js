// Données de démonstration Kammel (cohérentes avec les maquettes) : 3 salles, équipe, membres, abonnements sur 12 mois,
// paiements, caisse, entrées sur 8 semaines, machines et pannes, aliments, modèles de programmes, coach, notifications.
// Tout est relatif à « maintenant » et déterministe (générateur pseudo-aléatoire à graine fixe).
const zlib = require('zlib');
const bcrypt = require('bcryptjs');
const models = require('../models');
const equipmentList = require('./equipment');
const exerciseList = require('./exercises');
const foodList = require('./foods');
const { localDate, addDays, addMonths, planEnd } = require('../utils');
const { cleanSettings } = require('../services/gymSettings');
const { dailyTarget, waterTarget } = require('../services/targets');
const { textFor, campaignTextFor } = require('../services/notifications');
const { detectTopic } = require('../services/coachRules');
const { fallbackReply } = require('../services/coachFallback');
const { referralText, addPainText } = require('../services/coach');
const { loadCatalog, availableEquipment } = require('../services/catalog');
const { adaptTemplateDays, generateForUser } = require('../services/programs');
const { weekdayOf, mondayOf, dayIndexFor, openingFor } = require('../services/schedule');
const { BCRYPT_COST } = require('../routes/auth');

const {
  sequelize, User, Gym, Equipment, Machine, Exercise, Program, ProgramItem, ProgramTemplate, WorkoutSession, SessionEntry,
  Report, Plan, Subscription, Payment, CashSession, CheckIn, ChatMessage, NutritionTarget, Meal, Food, WaterLog,
  Campaign, Notification, AuditLog,
} = models;

const DEMO_PASSWORD = 'Kammel2026!';
const YOUSSEF_TEMP_PASSWORD = 'K7M4Q2X9';

// ---------------------------------------------------------------- Outils
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n) => String(n).padStart(2, '0');
const at = (date, h, m = 0) => new Date(`${date}T${pad(h)}:${pad(m)}:00`);

async function chunked(Model, rows, options = {}) {
  const out = [];
  for (let i = 0; i < rows.length; i += 400) out.push(...(await Model.bulkCreate(rows.slice(i, i + 400), options)));
  return out;
}

// Petite image PNG (dégradé) pour les photos de pannes de démonstration
function demoPng(width = 48, height = 36, [r, g, b] = [80, 90, 100]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = Math.min(255, r + x * 2);
      raw[o + 1] = Math.min(255, g + y * 2);
      raw[o + 2] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Répartition des entrées par heure (poids) : pic vers 18-19 h, creux 14-16 h
const HOUR_WEIGHTS = {
  week: { 6: 3, 7: 5, 8: 6, 9: 6, 10: 6, 11: 5, 12: 5, 13: 4, 14: 2, 15: 2.5, 16: 5, 17: 9, 18: 12, 19: 12, 20: 9, 21: 5, 22: 2 },
  sat: { 7: 4, 8: 7, 9: 9, 10: 10, 11: 9, 12: 7, 13: 5, 14: 3, 15: 3, 16: 5, 17: 6, 18: 6, 19: 4, 20: 2 },
  sun: { 8: 6, 9: 9, 10: 10, 11: 8, 12: 5, 13: 2 },
};

const FIRST_NAMES_M = ['Ahmed', 'Mohamed', 'Youssef', 'Aziz', 'Fares', 'Oussama', 'Hamza', 'Bilel', 'Skander', 'Wassim', 'Nizar', 'Seif', 'Anis', 'Haythem', 'Ghassen', 'Malek', 'Rami', 'Khalil', 'Moez', 'Slim', 'Firas', 'Zied', 'Achraf', 'Mahdi', 'Iheb', 'Ayoub', 'Marouane', 'Houssem', 'Taher', 'Chokri'];
const FIRST_NAMES_F = ['Yasmine', 'Salma', 'Rim', 'Ines', 'Nour', 'Sarra', 'Rania', 'Mariem', 'Amira', 'Eya', 'Olfa', 'Hela', 'Asma', 'Chaima', 'Emna', 'Fatma', 'Ghada', 'Hiba', 'Khaoula', 'Lina', 'Molka', 'Nada', 'Oumayma', 'Rahma', 'Sana', 'Wiem', 'Yosra', 'Zeineb', 'Dorra', 'Siwar'];
const LAST_NAMES = ['Ben Salah', 'Trabelsi', 'Gharbi', 'Jaziri', 'Ben Ali', 'Mansouri', 'Haddad', 'Chaabane', 'Ayari', 'Bouazizi', 'Mejri', 'Hammami', 'Belhaj', 'Feki', 'Sassi', 'Karoui', 'Ben Amor', 'Jlassi', 'Khelifi', 'Dridi', 'Mabrouk', 'Zouari', 'Ben Youssef', 'Gabsi', 'Riahi', 'Hamdi', 'Chebbi', 'Maaloul', 'Masmoudi', 'Ben Romdhane', 'Lahmar', 'Toumi', 'Sfar', 'Baccouche', 'Nasri', 'Ferchichi', 'Guesmi', 'Kallel', 'Oueslati', 'Selmi'];

// Questions au coach (statistiques de l'écran Coach) : le sujet est détecté comme dans l'app
const COACH_QUESTIONS = {
  REMPLACER: ['La presse à cuisses est occupée, je fais quoi ?', 'Le tirage vertical est en panne, une alternative ?', 'الماكينة مشغولة شنعمل؟', 'Machine occupée, je remplace par quoi ?'],
  NUTRITION: ['Combien de protéines après la séance ?', 'Je peux manger un lablabi le soir ?', 'شنوة ناكل قبل الحصة؟', 'Idée de repas avant l’entraînement ?'],
  DOULEUR: ['J’ai mal au genou quand je fais des squats', 'Mal au bas du dos depuis 4 jours', 'عندي وجع في الكتف', 'J’ai mal au poignet sur les pompes'],
  PROGRAMME: ['Je peux changer mes jours de programme ?', 'C’est quoi ma séance de demain ?', 'Mon programme est trop long'],
  MOTIVATION: ['Je suis fatigué, pas de motivation aujourd’hui', 'ta3ban barcha lyoum'],
  AUTRE: ['Bonjour coach', 'Merci !'],
};
const TOPIC_WEIGHTS = [['REMPLACER', 34], ['NUTRITION', 28], ['DOULEUR', 14], ['PROGRAMME', 12], ['MOTIVATION', 7], ['AUTRE', 5]];

// ---------------------------------------------------------------- Seed
async function seed({ now = new Date() } = {}) {
  const rand = mulberry32(20261103);
  const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const chance = (p) => rand() < p;
  const weighted = (pairs) => {
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let x = rand() * total;
    for (const [v, w] of pairs) {
      x -= w;
      if (x <= 0) return v;
    }
    return pairs[pairs.length - 1][0];
  };
  const today = localDate(now);
  const minutesAgo = (m) => new Date(now.getTime() - m * 60000);
  // événement « aujourd'hui à hh:mm » ; s'il n'est pas encore passé, la veille à la même heure
  const recent = (h, m) => {
    const d = at(today, h, m);
    return d <= minutesAgo(2) ? d : at(addDays(today, -1), h, m);
  };
  const clampPast = (d) => (d > minutesAgo(1) ? minutesAgo(int(2, 30)) : d);
  const windowStart = addMonths(today, -13);

  // 1. Équipements et exercices
  const equipment = await Equipment.bulkCreate(equipmentList.map(([code, nameFr, nameAr, category]) => ({ code, nameFr, nameAr, category })));
  const eq = Object.fromEntries(equipment.map((e) => [e.code, e]));
  const exercises = await Exercise.bulkCreate(exerciseList.map(({ equipment: code, ...rest }) => ({ ...rest, equipmentId: eq[code].id })));
  const exByName = Object.fromEntries(exercises.map((e) => [e.nameFr, e]));
  const exId = (name) => {
    if (!exByName[name]) throw new Error(`Exercice inconnu dans le seed : ${name}`);
    return exByName[name].id;
  };
  const ALTERNATIVES = {
    'Presse pectorale assise': ['Développé couché aux haltères', 'Machine pectoraux (butterfly)', 'Pompes inclinées'],
    'Développé couché à la barre': ['Développé couché aux haltères', 'Presse pectorale assise', 'Pompes'],
    'Machine pectoraux (butterfly)': ['Écarté à la poulie (vis-à-vis)', 'Presse pectorale assise'],
    'Squat à la barre': ['Squat à la Smith', 'Goblet squat', 'Presse à cuisses'],
    'Presse à cuisses': ['Squat à la Smith', 'Goblet squat'],
    'Tirage vertical à la machine': ['Tractions assistées à l’élastique', 'Tirage poulie bras tendus', 'Rowing haltère un bras'],
    'Soulevé de terre': ['Soulevé de terre roumain', 'Soulevé de terre roumain aux haltères'],
    'Hip thrust à la barre': ['Pont fessier', 'Kickback fessier à la poulie'],
    'Leg curl': ['Soulevé de terre roumain aux haltères'],
  };
  for (const [name, alts] of Object.entries(ALTERNATIVES)) await exByName[name].update({ alternativeIds: alts.map(exId) });

  // 2. Salles
  const hash = bcrypt.hashSync(DEMO_PASSWORD, BCRYPT_COST);
  const lacHours = { week: ['06:00', '23:00'], sat: ['07:00', '21:00'], sun: ['08:00', '14:00'] };
  const lac = await Gym.create({
    name: 'Kammel Gym Lac 2',
    address: 'Les Berges du Lac 2, Tunis',
    city: 'Tunis',
    phone: '+216 71 860 100',
    capacity: 120,
    hours: lacHours,
    settings: cleanSettings({}, { coach: { physio: { name: 'Cabinet du Lac', phone: '+216 71 860 214' } } }),
  });
  const ennasr = await Gym.create({
    name: 'Kammel Ennasr',
    address: 'Avenue Hédi Nouira, Ennasr 2',
    city: 'Ariana',
    phone: '+216 71 820 300',
    capacity: 80,
    hours: { week: ['06:30', '22:00'], sat: ['08:00', '20:00'], sun: null },
    settings: cleanSettings({}, { live: { calmThreshold: 15 } }),
  });
  const sousse = await Gym.create({
    name: 'Kammel Sousse',
    address: 'Boulevard du 14 Janvier, Khezama',
    city: 'Sousse',
    phone: '+216 73 240 500',
    capacity: 60,
    hours: { week: ['07:00', '22:00'], sat: ['08:00', '20:00'], sun: ['09:00', '13:00'] },
    settings: cleanSettings({}, { live: { calmThreshold: 12 }, features: { coach: false } }),
  });

  // 3. Équipe et administrateur
  const staffRow = (name, email, role, gymId, lastLoginAt) => ({ name, email, role, gymId, passwordHash: hash, lastLoginAt, passwordChangedAt: addMonthsDate(now, -2), language: 'fr' });
  function addMonthsDate(d, n) {
    return new Date(`${addMonths(localDate(d), n)}T10:00:00`);
  }
  const [admin, sami, leila, mariem, walid, hichem, nizar, olfa] = await User.bulkCreate([
    staffRow('Admin Kammel', 'admin@kammel.tn', 'ADMIN', null, minutesAgo(180)),
    staffRow('Sami Trabelsi', 'sami@kammelgym.tn', 'GERANT', lac.id, minutesAgo(2)),
    staffRow('Leila Ben Amor', 'leila@kammelgym.tn', 'ACCUEIL', lac.id, minutesAgo(5)),
    staffRow('Mariem Jlassi', 'mariem@kammelgym.tn', 'ACCUEIL', lac.id, at(addDays(today, -1), 22, 10)),
    staffRow('Walid Khelifi', 'walid@kammelgym.tn', 'TECHNICIEN', lac.id, minutesAgo(60)),
    staffRow('Hichem Dridi', 'hichem@kammelgym.tn', 'COACH', lac.id, at(addDays(today, -1), 17, 30)),
    staffRow('Nizar Gharbi', 'nizar@kammelgym.tn', 'GERANT', ennasr.id, minutesAgo(600)),
    staffRow('Olfa Ben Romdhane', 'olfa@kammelgym.tn', 'GERANT', sousse.id, minutesAgo(1500)),
  ]);
  // invitation en attente (écran Équipe) : mot de passe provisoire inconnu, jamais affiché
  await User.create({
    name: 'Nadia Ferchichi',
    email: 'nadia@kammelgym.tn',
    role: 'COACH',
    gymId: lac.id,
    passwordHash: bcrypt.hashSync(`invite-${now.getTime()}`, 4),
    mustChangePassword: true,
    tempPasswordExpiresAt: new Date(now.getTime() + 6 * 86400000),
  });
  await lac.update({ managerId: sami.id });
  await ennasr.update({ managerId: nizar.id });
  await sousse.update({ managerId: olfa.id });
  const receivers = [[leila, 45], [mariem, 35], [sami, 20]];

  // 4. Formules
  const planRows = (gymId, list) => list.map((p, i) => ({ gymId, position: i, visible: true, archived: false, accessHours: 'ALL', inApp: false, freezeDays: 0, ...p }));
  const lacPlans = await Plan.bulkCreate(
    planRows(lac.id, [
      { nameFr: 'Mensuel', nameAr: 'شهري', nameEn: 'Monthly', duration: 1, durationUnit: 'MONTH', price: 90 },
      { nameFr: 'Trimestriel', nameAr: 'ثلاثي', nameEn: 'Quarterly', duration: 3, durationUnit: 'MONTH', price: 240, freezeDays: 15 },
      { nameFr: 'Annuel', nameAr: 'سنوي', nameEn: 'Yearly', duration: 12, durationUnit: 'MONTH', price: 850, freezeDays: 30, noteFr: '30 jours de gel inclus', noteAr: '30 يوم تجميد' },
      { nameFr: 'Étudiant', nameAr: 'طالب', nameEn: 'Student', duration: 1, durationUnit: 'MONTH', price: 60, noteFr: 'Carte étudiant demandée', noteAr: 'لازم بطاقة طالب' },
      { nameFr: 'Séance unique', nameAr: 'حصة وحدة', nameEn: 'Single session', duration: 1, durationUnit: 'DAY', price: 10, noteFr: 'Visiteurs', noteAr: 'الزوار' },
      { nameFr: 'Été 2026', nameAr: 'صيف 2026', nameEn: 'Summer 2026', duration: 2, durationUnit: 'MONTH', price: 150, visible: false, archived: true },
    ])
  );
  const P = Object.fromEntries(lacPlans.map((p) => [p.nameFr, p]));
  const smallPlans = async (gymId) =>
    Plan.bulkCreate(
      planRows(gymId, [
        { nameFr: 'Mensuel', nameAr: 'شهري', nameEn: 'Monthly', duration: 1, durationUnit: 'MONTH', price: 80 },
        { nameFr: 'Trimestriel', nameAr: 'ثلاثي', nameEn: 'Quarterly', duration: 3, durationUnit: 'MONTH', price: 210, freezeDays: 10 },
        { nameFr: 'Séance unique', nameAr: 'حصة وحدة', nameEn: 'Single session', duration: 1, durationUnit: 'DAY', price: 8 },
      ])
    );
  const ennasrPlans = await smallPlans(ennasr.id);
  const soussePlans = await smallPlans(sousse.id);

  // 5. Machines (codes affichés « #09 »)
  const lacMachines = [
    ['01', 'Tapis de course', 'tapis', 'Cardio', 'SIGNALEE', -56],
    ['02', 'Tapis de course', 'tapis', 'Cardio', 'OK', -20],
    ['03', 'Tapis de course', 'tapis', 'Cardio', 'OK', -20],
    ['04', 'Chest Press', 'chest_press', 'Machines', 'OK', -32],
    ['05', 'Vélo elliptique', 'elliptique', 'Cardio', 'OK', -2],
    ['06', 'Vélo elliptique', 'elliptique', 'Cardio', 'OK', -40],
    ['07', 'Pec deck', 'machine_pec', 'Machines', 'OK', -32],
    ['08', 'Machine épaules', 'machine_epaules', 'Machines', 'OK', -32],
    ['09', 'Tirage vertical', 'tirage_vertical', 'Machines', 'SIGNALEE', -32],
    ['10', 'Rowing assis', 'tirage_horizontal', 'Machines', 'OK', -32],
    ['11', 'Leg press', 'presse_cuisses', 'Machines', 'REPARATION', -4],
    ['12', 'Smith machine', 'smith', 'Poids libres', 'OK', -46],
    ['13', 'Leg extension', 'leg_extension', 'Machines', 'OK', -32],
    ['14', 'Rameur', 'rameur', 'Cardio', 'OK', -5],
    ['15', 'Poulie vis-à-vis', 'poulie', 'Machines', 'OK', -32],
    ['16', 'Vélo assis', 'velo', 'Cardio', 'SIGNALEE', -56],
    ['17', 'Leg curl', 'leg_curl', 'Machines', 'OK', -32],
    ['18', 'Machine mollets', 'mollets', 'Machines', 'OK', -60],
    ['19', 'Banc développé couché', 'banc_couche', 'Poids libres', 'OK', -46],
    ['20', 'Rack à squat', 'cage_squat', 'Poids libres', 'OK', -46],
    ['21', 'Haltères 2 à 40 kg', 'halteres', 'Poids libres', 'OK', -46],
    ['22', 'Barres olympiques', 'barre', 'Poids libres', 'OK', -46],
    ['23', 'Bancs réglables', 'banc', 'Poids libres', 'OK', -46],
    ['24', 'Barre de traction', 'barre_traction', 'Machines', 'OK', -60],
    ['25', 'Station dips', 'barres_paralleles', 'Machines', 'OK', -60],
    ['26', 'Kettlebells', 'kettlebell', 'Poids libres', 'OK', -60],
    ['27', 'Élastiques', 'elastique', 'Poids libres', 'OK', -60],
  ];
  const machines = await Machine.bulkCreate(
    lacMachines.map(([code, label, eqCode, zone, status, maint]) => ({
      gymId: lac.id,
      code,
      label,
      equipmentId: eq[eqCode].id,
      zone,
      status,
      outOfService: status === 'REPARATION',
      lastMaintenanceAt: addDays(today, maint),
    }))
  );
  const M = Object.fromEntries(machines.map((m) => [m.code, m]));
  const smallMachines = (gymId, list) =>
    Machine.bulkCreate(list.map(([code, label, eqCode, zone], i) => ({ gymId, code, label, equipmentId: eq[eqCode].id, zone, status: i === 1 ? 'SIGNALEE' : 'OK', lastMaintenanceAt: addDays(today, -30) })));
  const ennasrMachines = await smallMachines(ennasr.id, [
    ['01', 'Tapis de course', 'tapis', 'Cardio'], ['02', 'Tirage vertical', 'tirage_vertical', 'Machines'], ['03', 'Presse à cuisses', 'presse_cuisses', 'Machines'],
    ['04', 'Haltères', 'halteres', 'Poids libres'], ['05', 'Rack à squat', 'cage_squat', 'Poids libres'], ['06', 'Barres', 'barre', 'Poids libres'],
    ['07', 'Bancs', 'banc', 'Poids libres'], ['08', 'Poulie', 'poulie', 'Machines'],
  ]);
  await smallMachines(sousse.id, [
    ['01', 'Vélo assis', 'velo', 'Cardio'], ['02', 'Leg curl', 'leg_curl', 'Machines'], ['03', 'Haltères', 'halteres', 'Poids libres'],
    ['04', 'Bancs', 'banc', 'Poids libres'], ['05', 'Barre de traction', 'barre_traction', 'Machines'], ['06', 'Kettlebells', 'kettlebell', 'Poids libres'],
  ]);

  // 6. Aliments (catalogue Kammel + un plat ajouté par la salle)
  const foods = await Food.bulkCreate(foodList.map((f) => ({ ...f, gymId: null, userId: null })));
  await Food.create({ nameFr: 'Mloukhia', nameAr: 'ملوخية', nameEn: 'Mloukhia', portion: '1 assiette', calories: 450, protein: 28, carbs: 12, fat: 32, gymId: lac.id });
  const F = Object.fromEntries(foods.map((f) => [f.nameFr, f]));

  // 7. Modèles de programmes de Lac 2 (écran Programmes)
  const day = (labelFr, labelAr, focusFr, focusAr, items) => ({
    labelFr, labelAr, focusFr, focusAr,
    items: items.map(([name, sets, reps, restSec = 60]) => ({ exerciseId: exId(name), sets, reps, restSec })),
  });
  const PUSH = day('Push', 'دفع', 'Poitrine, triceps', 'الصدر والتراي', [
    ['Développé couché à la barre', 4, '8', 90], ['Presse pectorale assise', 3, '10'], ['Développé incliné aux haltères', 3, '10'],
    ['Élévations latérales', 3, '12'], ['Extension triceps à la poulie', 3, '12'], ['Dips sur banc', 3, '10'],
  ]);
  const PULL = day('Pull', 'سحب', 'Dos, biceps', 'الظهر والباي', [
    ['Tirage vertical à la machine', 4, '10'], ['Rowing haltère un bras', 3, '10'], ['Rowing assis à la machine', 3, '12'],
    ['Face pull à la poulie', 3, '15'], ['Curl haltères', 3, '12'],
  ]);
  const LEGS = day('Jambes', 'ساقين', 'Adaptée aux genoux', 'مناسبة للركبة', [
    ['Presse à cuisses', 4, '10', 90], ['Hip thrust à la barre', 3, '10'], ['Leg curl', 3, '12'], ['Step-up bas', 3, '10'], ['Mollets debout aux haltères', 3, '15', 45],
  ]);
  const FULL = day('Full body', 'الجسم كامل', 'Tout le corps', 'الجسم كامل', [
    ['Goblet squat', 3, '10'], ['Pompes', 3, '12'], ['Rowing haltère un bras', 3, '10'], ['Gainage (planche)', 3, '40 s', 45], ['Crunch', 3, '15', 45],
  ]);
  const UPPER = day('Haut du corps', 'الجزء العلوي', 'Poitrine, dos, épaules', 'الصدر والظهر والأكتاف', [
    ['Développé couché aux haltères', 4, '10'], ['Tirage vertical à la machine', 4, '10'], ['Développé épaules aux haltères', 3, '10'],
    ['Rowing assis à la machine', 3, '12'], ['Curl marteau', 3, '12'], ['Extension haltère au-dessus de la tête', 3, '12'],
  ]);
  const LOWER = day('Bas du corps', 'الجزء السفلي', 'Jambes, fessiers', 'الساقين والأرداف', [
    ['Squat à la barre', 4, '8', 120], ['Soulevé de terre roumain', 3, '10', 90], ['Fentes marchées aux haltères', 3, '12'], ['Leg extension', 3, '12'], ['Mollets à la machine', 4, '15', 45],
  ]);
  const templates = await ProgramTemplate.bulkCreate([
    { gymId: lac.id, nameFr: 'Perte de poids', nameAr: 'نقص الوزن', goal: 'PERTE_POIDS', level: null, daysPerWeek: 4, weeks: 8, published: true, days: [LEGS, PUSH, PULL, FULL] },
    { gymId: lac.id, nameFr: 'Prise de muscle', nameAr: 'زيادة العضل', goal: 'PRISE_MASSE', level: null, daysPerWeek: 5, weeks: 12, published: true, days: [PUSH, PULL, LOWER, UPPER, LEGS] },
    { gymId: lac.id, nameFr: 'Rester en forme', nameAr: 'الفورمة', goal: 'FORME', level: null, daysPerWeek: 3, weeks: 6, published: true, days: [FULL, UPPER, LOWER] },
    {
      gymId: lac.id, nameFr: 'Débutant full body', nameAr: 'مبتدئ الجسم كامل', goal: 'FORME', level: 'DEBUTANT', daysPerWeek: 3, weeks: 4, published: true,
      days: [FULL, day('Full body B', 'الجسم كامل ب', 'Tout le corps', 'الجسم كامل', [['Presse à cuisses', 3, '12'], ['Presse pectorale assise', 3, '12'], ['Tirage vertical à la machine', 3, '12'], ['Pont fessier', 3, '15'], ['Gainage latéral', 3, '30 s', 45]]), FULL],
    },
    { gymId: lac.id, nameFr: 'Performance', nameAr: 'الأداء', goal: 'FORCE', level: 'AVANCE', daysPerWeek: 5, weeks: 10, published: false, days: [LOWER, PUSH, PULL, UPPER, LEGS] },
  ]);

  // 8. Membres de Lac 2 : personnages des maquettes + membres générés
  const usedPhones = new Set();
  const phoneOf = (digits) => {
    const p = `+216${digits}`;
    usedPhones.add(p);
    return p;
  };
  const NAMED = [
    { key: 'amine', name: 'Amine Ben Salah', phone: '22345678', email: 'amine.bensalah@gmail.com', plan: 'Mensuel', end: 4, sex: 'H', join: -240, freq: 4 },
    { key: 'yasmine', name: 'Yasmine Gharbi', phone: '55120447', plan: 'Trimestriel', end: 68, sex: 'F', language: 'ar', freq: 4 },
    { key: 'mehdi', name: 'Mehdi Jaziri', phone: '98761302', plan: 'Annuel', end: 299, sex: 'H', freq: 5 },
    { key: 'salma', name: 'Salma Ben Ali', phone: '23908115', plan: 'Mensuel', end: -6, sex: 'F', freq: 3 },
    { key: 'oussama', name: 'Oussama Trabelsi', phone: '50333821', plan: 'Étudiant', end: 23, sex: 'H', freq: 5 },
    { key: 'rim', name: 'Rim Mansouri', phone: '29640018', plan: 'Mensuel', end: 2, sex: 'F', freq: 3 },
    { key: 'karim', name: 'Karim Haddad', phone: '97225690', plan: 'Trimestriel', end: 43, sex: 'H', freq: 3, frozen: true },
    { key: 'nour', name: 'Nour Chaabane', phone: '52781404', plan: 'Mensuel', end: 'renewToday', sex: 'F', freq: 4 },
    { key: 'hamza', name: 'Hamza Ayari', phone: '21456973', plan: 'Annuel', end: 128, sex: 'H', freq: 2, absentDays: 12 },
    { key: 'ines', name: 'Ines Bouazizi', phone: '58012336', plan: 'Mensuel', end: 0, sex: 'F', freq: 3 },
    { key: 'aziz', name: 'Aziz Mejri', phone: '22874105', plan: 'Mensuel', end: 'renewYesterday', sex: 'H', freq: 4 },
    { key: 'sarra', name: 'Sarra Hammami', phone: '55607213', plan: 'Mensuel', end: 26, sex: 'F', freq: 4 },
    { key: 'fares', name: 'Fares Belhaj', phone: '98112409', plan: 'Trimestriel', end: 'renewToday', sex: 'H', freq: 5 },
    { key: 'rania', name: 'Rania Feki', phone: '29550871', plan: 'Annuel', end: 'renew-2', sex: 'F', freq: 3 },
    { key: 'bilel', name: 'Bilel Sassi', phone: '20111222', plan: 'Mensuel', end: 18, sex: 'H', freq: 3 },
    { key: 'youssef', name: 'Youssef Karoui', phone: '24117590', plan: 'Trimestriel', end: 'newToday', sex: 'H', freq: 0 },
    { key: 'lina', name: 'Lina Gharsallah', phone: '50220981', plan: null, sex: 'F', freq: 0 },
  ];
  for (const n of NAMED) phoneOf(n.phone);

  const specs = NAMED.map((n) => ({ ...n }));
  const GENERATED = 145;
  for (let i = 0; i < GENERATED; i += 1) {
    const sex = chance(0.55) ? 'H' : 'F';
    const first = pick(sex === 'H' ? FIRST_NAMES_M : FIRST_NAMES_F);
    let digits;
    do digits = `${pick(['2', '5', '9', '4'])}${String(int(0, 9999999)).padStart(7, '0')}`;
    while (usedPhones.has(`+216${digits}`));
    phoneOf(digits);
    const plan = weighted([['Mensuel', 50], ['Trimestriel', 22], ['Annuel', 13], ['Étudiant', 15]]);
    const fate = weighted([['active', 72], ['expiring', 8], ['grace', 2], ['expired', 11], ['frozen', 2.5], ['new', 5]]);
    const length = { Mensuel: 30, Trimestriel: 90, Annuel: 364, 'Étudiant': 30 }[plan];
    let end;
    if (fate === 'active') end = int(8, length);
    else if (fate === 'expiring') end = int(0, 7);
    else if (fate === 'grace') end = -int(1, 3);
    else if (fate === 'expired') end = -int(4, 200);
    else if (fate === 'frozen') end = int(15, length + 10);
    else end = 'new';
    specs.push({
      key: `g${i}`,
      name: `${first} ${pick(LAST_NAMES)}`,
      phone: digits,
      plan,
      end,
      sex,
      frozen: fate === 'frozen',
      freq: pick([2, 3, 3, 4, 4, 4, 5, 6]),
      language: chance(0.25) ? 'ar' : chance(0.06) ? 'en' : 'fr',
      email: chance(0.3) ? `${first.toLowerCase()}.${i}@exemple.tn` : null,
    });
  }

  // abonnements de chaque membre (chaîne de renouvellements, la plus ancienne d'abord)
  const monthStart = `${today.slice(0, 7)}-01`;
  for (const s of specs) {
    s.subs = [];
    if (!s.plan) {
      s.join = addDays(today, -int(5, 20));
      continue;
    }
    const plan = P[s.plan];
    if (s.end === 'new' || s.end === 'newToday') {
      const start = s.end === 'newToday' ? today : addDays(monthStart, int(0, Math.max(0, Number(today.slice(8)) - 1)));
      s.subs.push({ start, end: planEnd(start, plan) });
      s.join = start;
      continue;
    }
    let lastEnd;
    if (typeof s.end === 'number') lastEnd = addDays(today, s.end);
    else {
      // renouvelé aujourd'hui / hier / avant-hier : le nouvel abonnement commence ce jour-là
      const startOffset = { renewToday: 0, renewYesterday: -1, 'renew-2': -2 }[s.end];
      lastEnd = planEnd(addDays(today, startOffset), plan);
    }
    const join = s.join !== undefined ? addDays(today, s.join) : chance(0.7) ? windowStart : addDays(today, -int(40, 380));
    let end = lastEnd;
    for (;;) {
      const start = plan.durationUnit === 'DAY' ? end : addMonths(addDays(end, 1), -plan.duration);
      s.subs.unshift({ start, end });
      if (start <= join || start <= windowStart) break;
      end = addDays(start, -1);
    }
    s.join = s.subs[0].start < join ? s.subs[0].start : join;
  }

  const year = new Date(now).getFullYear();
  const userRows = specs.map((s) => {
    const onboarded = s.key === 'amine' || (s.plan && !['youssef'].includes(s.key) && chance(0.75));
    s.onboarded = onboarded;
    const row = {
      name: s.name,
      phone: `+216${s.phone}`,
      email: s.email || null,
      passwordHash: hash,
      role: 'SPORTIF',
      gymId: lac.id,
      language: s.language || 'fr',
      createdAt: at(s.join, int(9, 19), int(0, 59)),
      lastLoginAt: s.freq && chance(0.75) ? minutesAgo(int(30, 6 * 1440)) : s.freq ? minutesAgo(int(8 * 1440, 40 * 1440)) : null,
      passwordChangedAt: at(s.join, 20, 0),
      prefs: { calmAlert: chance(0.4), notifications: { sessions: true, water: true, gym: true, meals: false } },
    };
    if (onboarded) {
      const goal = weighted([['PERTE_POIDS', 40], ['PRISE_MASSE', 32], ['FORME', 20], ['FORCE', 8]]);
      const weight = s.sex === 'H' ? int(62, 98) : int(50, 82);
      const height = s.sex === 'H' ? int(166, 190) : int(155, 175);
      const days = pick([[0, 2, 4], [0, 1, 3, 5], [1, 3, 5], [0, 2, 4, 5], [0, 1, 2, 3, 4]]);
      Object.assign(row, {
        sex: s.sex,
        birthYear: year - int(18, 48),
        weight,
        height,
        goalWeight: goal === 'PERTE_POIDS' ? weight - int(4, 12) : goal === 'PRISE_MASSE' ? weight + int(2, 6) : null,
        goal,
        level: weighted([['DEBUTANT', 35], ['INTERMEDIAIRE', 45], ['AVANCE', 20]]),
        activity: weighted([['SEDENTAIRE', 40], ['LEGER', 35], ['ACTIF', 20], ['TRES_ACTIF', 5]]),
        trainingDays: days,
        daysPerWeek: days.length,
        sessionMinutes: pick([45, 60, 60, 60, 90]),
        injuries: weighted([[[], 55], [['genou'], 14], [['dos'], 11], [['epaule'], 8], [['poignet'], 4], [['cou'], 3], [['cheville'], 3], [['genou', 'dos'], 2]]),
        dietStyle: weighted([['EQUILIBRE', 60], ['PROTEINES', 25], ['LOW_CARB', 10], ['VEGETARIEN', 5]]),
        healthConsent: true,
        onboardedAt: at(s.join, 21, 0),
      });
    }
    if (s.key === 'amine') {
      Object.assign(row, {
        sex: 'H', birthYear: 1994, height: 175, weight: 85, goalWeight: 76.3, activity: 'SEDENTAIRE', goal: 'PERTE_POIDS', level: 'INTERMEDIAIRE',
        trainingDays: [0, 1, 3, 5], daysPerWeek: 4, sessionMinutes: 60, injuries: ['genou'], dietStyle: 'EQUILIBRE',
        lastLoginAt: minutesAgo(15), prefs: { calmAlert: true, notifications: { sessions: true, water: true, gym: true, meals: false } },
      });
    }
    if (s.key === 'youssef') {
      Object.assign(row, {
        passwordHash: bcrypt.hashSync(YOUSSEF_TEMP_PASSWORD, BCRYPT_COST),
        mustChangePassword: true,
        tempPasswordExpiresAt: new Date(now.getTime() + 7 * 86400000),
        lastLoginAt: null,
        passwordChangedAt: null,
        createdAt: minutesAgo(int(30, 90)),
      });
    }
    if (s.key === 'lina') row.lastLoginAt = null;
    return row;
  });
  const lacMembers = await chunked(User, userRows);
  specs.forEach((s, i) => {
    s.user = lacMembers[i];
  });
  const S = Object.fromEntries(specs.map((s) => [s.key, s]));

  // abonnements, paiements (12 mois), frais d'inscription
  const subRows = [];
  const paymentRows = [];
  const randomTime = (date) => {
    const o = openingFor(lacHours, date) || { openMin: 8 * 60, closeMin: 20 * 60 };
    const min = int(o.openMin + 60, o.closeMin - 60);
    return clampPast(at(date, Math.floor(min / 60), min % 60));
  };
  const method = () => weighted([['ESPECES', 46], ['CARTE', 28], ['D17', 17], ['FLOUCI', 9]]);
  for (const s of specs) {
    const plan = s.plan && P[s.plan];
    s.subs.forEach((sub, idx) => {
      const isLast = idx === s.subs.length - 1;
      const m = method();
      const row = { userId: s.user.id, gymId: lac.id, planId: plan.id, startDate: sub.start, endDate: sub.end, amount: plan.price, paymentMethod: m, createdById: weighted(receivers).id };
      if (isLast && s.frozen) {
        const from = addDays(today, -8);
        Object.assign(row, { frozenFrom: from, frozenUntil: addDays(from, 14), freezeDaysUsed: 15 });
      }
      subRows.push(row);
      sub.row = row;
      sub.method = m;
    });
  }
  const subs = await chunked(Subscription, subRows);
  subRows.forEach((row, i) => {
    row.id = subs[i].id;
  });
  for (const s of specs) {
    const plan = s.plan && P[s.plan];
    for (const sub of s.subs) {
      if (sub.start > today || sub.start < addMonths(today, -12)) continue;
      const createdAt = randomTime(sub.start);
      paymentRows.push({ gymId: lac.id, userId: s.user.id, amount: plan.price, method: sub.method, kind: 'ABONNEMENT', label: plan.nameFr, planId: plan.id, subscriptionId: sub.row.id, receivedById: weighted(receivers).id, createdAt });
    }
    if (s.subs.length && s.join >= addMonths(today, -12)) {
      paymentRows.push({ gymId: lac.id, userId: s.user.id, amount: 20, method: s.subs[0].method, kind: 'INSCRIPTION', label: 'Frais d’inscription', receivedById: weighted(receivers).id, createdAt: randomTime(s.join) });
    }
  }
  // visiteurs (séance unique)
  for (let d = addMonths(today, -12); d < today; d = addDays(d, 1)) {
    if (chance(0.9)) paymentRows.push({ gymId: lac.id, amount: 10, method: chance(0.85) ? 'ESPECES' : 'D17', kind: 'SEANCE', label: 'Visiteur', planId: P['Séance unique'].id, receivedById: weighted(receivers).id, createdAt: randomTime(d) });
  }
  // paiements du jour des maquettes : Nour (D17, 10:20) et Fares (carte, 09:02), encaissés par Leila
  for (const p of paymentRows) {
    if (p.userId === S.nour.user.id && p.kind === 'ABONNEMENT' && localDate(p.createdAt) === today) Object.assign(p, { method: 'D17', receivedById: leila.id, createdAt: recent(10, 20) });
    if (p.userId === S.fares.user.id && p.kind === 'ABONNEMENT' && localDate(p.createdAt) === today) Object.assign(p, { method: 'CARTE', receivedById: leila.id, createdAt: recent(9, 2) });
    if (p.userId === S.aziz.user.id && p.kind === 'ABONNEMENT' && p.createdAt >= at(addDays(today, -1), 0)) Object.assign(p, { method: 'ESPECES', receivedById: mariem.id, createdAt: at(addDays(today, -1), 19, 40) });
    if (p.userId === S.rania.user.id && p.kind === 'ABONNEMENT' && p.createdAt >= at(addDays(today, -2), 0)) Object.assign(p, { method: 'CARTE', receivedById: sami.id, createdAt: at(addDays(today, -2), 10, 5) });
  }
  // aujourd'hui : pas d'espèces avant l'ouverture de la caisse (maquette « Espèces encaissées 0 TND »)
  for (const p of paymentRows) if (localDate(p.createdAt) === today && p.method === 'ESPECES') p.createdAt = at(addDays(today, -1), int(17, 20), int(0, 59));
  await chunked(Payment, paymentRows);

  // caisse : ouverte par Leila à 07:58 avec 50 TND ; sessions fermées les jours précédents
  const cashRows = [];
  for (let i = 7; i >= 1; i -= 1) {
    const d = addDays(today, -i);
    cashRows.push({ gymId: lac.id, openedAt: at(d, 7, 58), openingFloat: 50, openedById: leila.id, closedAt: at(d, 22, 50), closedById: mariem.id, expectedCash: 50, countedCash: 50, note: null });
  }
  await CashSession.bulkCreate(cashRows);
  await CashSession.create({ gymId: lac.id, openedAt: recent(7, 58), openingFloat: 50, openedById: leila.id });

  // 9. Programme, séances et records d'Amine (programme « Perte de poids · 4 jours », semaine 3 sur 8)
  const amine = await User.findByPk(S.amine.user.id);
  const amineProgram = await generateForUser(amine);
  const programStart = addDays(mondayOf(today), -14);
  await amineProgram.update({ startedAt: programStart, createdAt: at(programStart, 9) });
  const amineItems = await ProgramItem.findAll({ where: { programId: amineProgram.id }, order: [['dayIndex', 'ASC'], ['position', 'ASC']] });
  const catalog = await loadCatalog();
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const START_KG = { pectoraux: 40, dos: 45, epaules: 8, biceps: 10, triceps: 20, quadriceps: 60, ischios: 30, fessiers: 50, mollets: 20, abdos: 0 };
  const amineDates = [];
  for (let d = programStart; d < today; d = addDays(d, 1)) {
    const slot = [0, 1, 3, 5].indexOf(weekdayOf(d));
    if (slot < 0) continue;
    if (d === addDays(programStart, 10)) continue; // jeudi de la semaine 2 : séance manquée
    const week = Math.floor((new Date(`${d}T12:00:00`) - new Date(`${programStart}T12:00:00`)) / (7 * 86400000)) + 1;
    amineDates.push({ date: d, dayIndex: dayIndexFor({ week, slot, slotsPerWeek: 4, programDays: amineProgram.daysPerWeek }) });
  }
  let sessionCount = 0;
  for (const { date, dayIndex } of amineDates) {
    const start = at(date, 18, int(5, 15));
    const duration = int(58, 72);
    const session = await WorkoutSession.create({
      userId: amine.id, programId: amineProgram.id, dayIndex, status: 'TERMINEE', startedAt: start, finishedAt: new Date(start.getTime() + duration * 60000),
      dayLabelFr: amineItems.find((i) => i.dayIndex === dayIndex).dayLabelFr, dayLabelAr: amineItems.find((i) => i.dayIndex === dayIndex).dayLabelAr, rating: int(3, 5),
    });
    await SessionEntry.bulkCreate(
      amineItems.filter((i) => i.dayIndex === dayIndex).map((it, pos) => {
        const ex = byId.get(it.exerciseId);
        const bodyweight = ex.equipmentCode === 'poids_du_corps';
        const weight = bodyweight ? 0 : Math.round((START_KG[ex.primaryMuscle] + Math.floor(sessionCount / 2) * 2.5) * 2) / 2;
        const reps = Number(String(it.reps).match(/\d+/)[0]);
        return {
          sessionId: session.id, exerciseId: it.exerciseId, position: pos + 1, targetSets: it.sets, targetReps: it.reps, restSec: it.restSec,
          setsDone: Array.from({ length: it.sets }, (_, k) => ({ reps: Math.max(1, reps - (k === it.sets - 1 ? 2 : 0)), weight })),
        };
      })
    );
    sessionCount += 1;
  }
  await NutritionTarget.create({ userId: amine.id, ...dailyTarget({ ...amine.get({ plain: true }), age: amine.age }), waterMl: waterTarget(amine, { trainingDay: true }), source: 'REGLES' });

  // 10. Programmes, séances, objectifs repas des autres membres (statistiques de l'app)
  const equipmentCodes = await availableEquipment(lac.id);
  const tplByGoal = (goal) => templates.find((t) => t.published && t.goal === goal) || templates[2];
  const others = specs.filter((s) => s.onboarded && s.key !== 'amine' && s.subs.length && s.subs[s.subs.length - 1].end >= today);
  const programRows = [];
  for (const s of others) {
    if (!chance(0.8)) continue;
    const u = s.user;
    const template = tplByGoal(u.goal);
    const days = adaptTemplateDays(template, { catalog, equipment: equipmentCodes, user: u });
    programRows.push({ s, template, days });
  }
  const programs = await chunked(
    Program,
    programRows.map(({ s, template, days }) => ({
      userId: s.user.id, title: `${template.nameFr} · ${days.length} jours`, source: 'MODELE', goal: s.user.goal, daysPerWeek: days.length,
      weeks: template.weeks, startedAt: addDays(mondayOf(today), -7 * int(0, Math.max(0, template.weeks - 1))), templateId: template.id, active: true,
    }))
  );
  const itemRows = [];
  programRows.forEach(({ days }, i) => {
    days.forEach((d) => d.items.forEach((it, pos) => itemRows.push({ programId: programs[i].id, dayIndex: d.dayIndex, dayLabelFr: d.labelFr, dayLabelAr: d.labelAr, position: pos + 1, ...it })));
  });
  await chunked(ProgramItem, itemRows);
  const targetRows = others.map((s) => {
    const t = dailyTarget({ ...s.user.get({ plain: true }), age: s.user.age });
    return t && { userId: s.user.id, ...t, waterMl: waterTarget(s.user, { trainingDay: true }), source: 'REGLES' };
  }).filter(Boolean);
  await chunked(NutritionTarget, targetRows);

  // séances des 30 derniers jours (avec quelques remplacements « machine occupée »)
  const sessionRows = [];
  const sessionPlans = [];
  programRows.forEach(({ s, days }, i) => {
    if (!chance(0.65)) return;
    const n = int(3, 10);
    for (let k = 0; k < n; k += 1) {
      const d = addDays(today, -int(1, 30));
      const dayObj = pick(days);
      const startedAt = at(d, int(7, 20), int(0, 59));
      sessionRows.push({ userId: s.user.id, programId: programs[i].id, dayIndex: dayObj.dayIndex, dayLabelFr: dayObj.labelFr, dayLabelAr: dayObj.labelAr, status: 'TERMINEE', startedAt, finishedAt: new Date(startedAt.getTime() + int(40, 80) * 60000), rating: chance(0.6) ? int(3, 5) : null });
      sessionPlans.push(dayObj);
    }
  });
  const sessions = await chunked(WorkoutSession, sessionRows);
  const entryRows = [];
  sessions.forEach((session, i) => {
    sessionPlans[i].items.forEach((it, pos) => {
      const ex = byId.get(it.exerciseId);
      const swapped = chance(0.08) && ex.alternativeIds.length ? ex.alternativeIds[0] : null;
      entryRows.push({
        sessionId: session.id, exerciseId: swapped || it.exerciseId, originalExerciseId: swapped ? it.exerciseId : null, reason: swapped ? 'OCCUPEE' : null,
        position: pos + 1, targetSets: it.sets, targetReps: it.reps, restSec: it.restSec,
        setsDone: Array.from({ length: it.sets }, () => ({ reps: int(8, 12), weight: ex.equipmentCode === 'poids_du_corps' ? 0 : int(4, 30) * 2.5 })),
      });
    });
  });
  await chunked(SessionEntry, entryRows);

  // 11. Entrées : 8 semaines d'historique + aujourd'hui (environ 42 personnes présentes si la salle est ouverte)
  const checkinRows = [];
  const coverage = new Map(specs.map((s) => [s.key, s.subs]));
  const covered = (s, d) => {
    const sub = (coverage.get(s.key) || []).find((x) => x.start <= d && x.end >= d);
    if (!sub) return false;
    if (sub.row && sub.row.frozenFrom && d >= sub.row.frozenFrom && d <= sub.row.frozenUntil) return false;
    return true;
  };
  const weightsFor = (d) => HOUR_WEIGHTS[weekdayOf(d) === 5 ? 'sat' : weekdayOf(d) === 6 ? 'sun' : 'week'];
  const amineVisitDates = new Set(amineDates.map((x) => x.date));
  for (let d = addDays(today, -56); d < today; d = addDays(d, 1)) {
    const hours = Object.entries(weightsFor(d)).map(([h, w]) => [Number(h), w]);
    for (const s of specs) {
      if (s.key === 'amine') {
        if (amineVisitDates.has(d)) {
          const inAt = at(d, 18, int(0, 8));
          checkinRows.push({ userId: s.user.id, gymId: lac.id, checkInAt: inAt, checkOutAt: new Date(inAt.getTime() + int(62, 75) * 60000), status: 'ENTREE', source: 'SCAN', byStaffId: leila.id });
        }
        continue;
      }
      if (!s.freq || !covered(s, d)) continue;
      if (s.absentDays && d >= addDays(today, -s.absentDays + 1)) continue;
      if (!chance(s.freq / 7)) continue;
      const h = weighted(hours);
      const inAt = at(d, h, int(0, 59));
      checkinRows.push({ userId: s.user.id, gymId: lac.id, checkInAt: inAt, checkOutAt: new Date(inAt.getTime() + int(50, 120) * 60000), status: 'ENTREE', source: chance(0.85) ? 'SCAN' : 'MANUEL', byStaffId: weighted(receivers).id });
    }
    // quelques entrées refusées (abonnements expirés)
    const expired = specs.filter((s) => s.subs.length && s.subs[s.subs.length - 1].end < d && s.subs[s.subs.length - 1].end >= addDays(d, -10));
    if (expired.length && chance(0.4)) {
      checkinRows.push({ userId: pick(expired).user.id, gymId: lac.id, checkInAt: at(d, int(9, 20), int(0, 59)), status: 'REFUSEE', refusalReason: 'EXPIRE', source: 'SCAN', byStaffId: weighted(receivers).id });
    }
  }
  // aujourd'hui
  const opening = openingFor(lacHours, today);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayRows = [];
  if (opening && nowMin > opening.openMin) {
    const hours = Object.entries(weightsFor(today)).map(([h, w]) => [Number(h), w]).filter(([h]) => h * 60 < nowMin);
    const inToday = new Set([S.amine.key]);
    for (const s of specs) {
      if (!s.freq || s.key === 'amine' || !covered(s, today) || !hours.length) continue;
      if (s.absentDays) continue;
      if (!chance((s.freq / 7) * 1.1)) continue;
      const h = weighted(hours);
      const inAt = at(today, h, int(0, 59));
      if (inAt >= minutesAgo(3)) continue;
      const out = new Date(inAt.getTime() + int(50, 120) * 60000);
      todayRows.push({ s, row: { userId: s.user.id, gymId: lac.id, checkInAt: inAt, checkOutAt: out < now ? out : null, status: 'ENTREE', source: 'SCAN', byStaffId: weighted(receivers).id } });
      inToday.add(s.key);
    }
    // Amine entré à 10:52 (encore là), Salma refusée à 10:47 (abonnement expiré)
    const amineIn = at(today, 10, 52) < minutesAgo(3) ? at(today, 10, 52) : minutesAgo(int(10, 40));
    todayRows.push({ s: S.amine, row: { userId: S.amine.user.id, gymId: lac.id, checkInAt: amineIn, checkOutAt: null, status: 'ENTREE', source: 'SCAN', byStaffId: leila.id } });
    todayRows.push({ s: S.salma, row: { userId: S.salma.user.id, gymId: lac.id, checkInAt: recent(10, 47) > at(today, 0) ? recent(10, 47) : minutesAgo(int(5, 30)), status: 'REFUSEE', refusalReason: 'EXPIRE', source: 'SCAN', byStaffId: leila.id } });
    // ajuste le nombre de présents à ~42 quand la salle est ouverte depuis plus d'une heure
    const presentNow = (r) => r.status === 'ENTREE' && !r.checkOutAt && now - r.checkInAt < 3 * 3600000;
    if (nowMin < opening.closeMin && nowMin - opening.openMin >= 60) {
      let present = todayRows.filter(({ row }) => presentNow(row));
      const candidates = specs.filter((s) => s.freq && !inToday.has(s.key) && covered(s, today) && !s.absentDays);
      while (present.length < 42 && candidates.length) {
        const s = candidates.splice(Math.floor(rand() * candidates.length), 1)[0];
        const row = { userId: s.user.id, gymId: lac.id, checkInAt: minutesAgo(int(5, Math.min(110, nowMin - opening.openMin))), checkOutAt: null, status: 'ENTREE', source: 'SCAN', byStaffId: leila.id };
        todayRows.push({ s, row });
        present.push({ s, row });
      }
      present = present.filter(({ s }) => s.key !== 'amine').sort((a, b) => a.row.checkInAt - b.row.checkInAt);
      while (present.length + 1 > 42) {
        const { row } = present.shift();
        row.checkOutAt = new Date(Math.max(row.checkInAt.getTime() + 30 * 60000, now.getTime() - int(2, 20) * 60000));
        if (row.checkOutAt > now) row.checkOutAt = minutesAgo(1);
      }
    } else {
      // salle fermée : journée terminée, tout le monde est sorti (sauf Amine si l'heure le permet)
      for (const { row } of todayRows) if (row.status === 'ENTREE' && !row.checkOutAt && row.userId !== S.amine.user.id) row.checkOutAt = minutesAgo(int(5, 60));
    }
  }
  await chunked(CheckIn, [...checkinRows, ...todayRows.map((t) => t.row)]);

  // 12. Pannes (toutes les étapes du suivi)
  const photo = demoPng(48, 36, [70, 80, 95]);
  const member = (key) => S[key].user.id;
  const anyMember = () => pick(specs.filter((s) => s.freq)).user.id;
  const reportRows = [
    { machineId: M['09'].id, userId: member('amine'), issueType: 'CABLE', description: 'Le câble saute de la poulie en haut du mouvement.', status: 'NOUVEAU', notify: true, createdAt: recent(11, 24), photo, photoType: 'image/png' },
    { machineId: M['16'].id, userId: member('yasmine'), issueType: 'ECRAN', description: 'L’écran reste noir.', status: 'NOUVEAU', notify: true, createdAt: recent(9, 10) },
    { machineId: M['16'].id, userId: member('mehdi'), issueType: 'ECRAN', description: null, status: 'NOUVEAU', notify: false, createdAt: recent(8, 35) },
    { machineId: M['01'].id, userId: member('sarra'), issueType: 'NE_MARCHE_PAS', description: 'Le tapis s’arrête tout seul.', status: 'VU', notify: true, createdAt: at(addDays(today, -1), 18, 5), seenAt: at(addDays(today, -1), 19, 0), assignedToId: walid.id },
    { machineId: M['01'].id, userId: anyMember(), issueType: 'NE_MARCHE_PAS', description: null, status: 'VU', notify: false, createdAt: at(addDays(today, -1), 17, 30), seenAt: at(addDays(today, -1), 19, 0), assignedToId: walid.id },
    { machineId: M['01'].id, userId: anyMember(), issueType: 'NE_MARCHE_PAS', description: null, status: 'VU', notify: true, createdAt: at(addDays(today, -1), 16, 10), seenAt: at(addDays(today, -1), 19, 0), assignedToId: walid.id },
    { machineId: M['11'].id, userId: walid.id, issueType: 'REGLAGE', description: 'Le réglage du dossier est bloqué.', status: 'REPARATION', notify: false, createdAt: at(addDays(today, -4), 10, 0), seenAt: at(addDays(today, -4), 10, 5), repairStartedAt: at(addDays(today, -4), 11, 0), assignedToId: walid.id, internalNote: 'Pièce commandée · livraison prévue jeudi' },
    ...[5, 4, 4, 3].map((d, i) => ({ machineId: M['05'].id, userId: anyMember(), issueType: 'BRUIT', description: i === 0 ? 'Grincement à chaque tour.' : null, status: 'REPAREE', notify: true, createdAt: at(addDays(today, -d), 10 + i, 15), seenAt: at(addDays(today, -3), 12, 0), repairStartedAt: at(addDays(today, -3), 14, 0), repairedAt: at(addDays(today, -2), 16, 0), assignedToId: walid.id })),
    ...[7, 6].map((d, i) => ({ machineId: M['14'].id, userId: anyMember(), issueType: 'CABLE', description: null, status: 'REPAREE', notify: true, createdAt: at(addDays(today, -d), 18, 20 + i), seenAt: at(addDays(today, -6), 9, 0), repairStartedAt: at(addDays(today, -6), 10, 0), repairedAt: at(addDays(today, -5), 11, 0), assignedToId: walid.id })),
    ...[12, 18, 25].map((d) => ({ machineId: M['11'].id, userId: anyMember(), issueType: 'BRUIT', description: null, status: 'REPAREE', notify: false, createdAt: at(addDays(today, -d), 17, 0), seenAt: at(addDays(today, -d), 18, 0), repairedAt: at(addDays(today, -d + 1), 12, 0) })),
    { machineId: M['21'].id, userId: anyMember(), issueType: 'AUTRE', description: 'Il manque une paire de 12 kg.', status: 'REJETE', notify: false, createdAt: at(addDays(today, -9), 19, 0), seenAt: at(addDays(today, -8), 9, 0) },
  ].map((r) => ({ gymId: lac.id, ...r }));
  await Report.bulkCreate(reportRows);
  // Ennasr : une panne avec photo (tests d'isolement entre salles)
  const ennasrMembers = await User.bulkCreate(
    Array.from({ length: 14 }, (_, i) => {
      const sex = i % 2 ? 'F' : 'H';
      let digits;
      do digits = `9${String(int(0, 9999999)).padStart(7, '0')}`;
      while (usedPhones.has(`+216${digits}`));
      phoneOf(digits);
      return { name: `${pick(sex === 'H' ? FIRST_NAMES_M : FIRST_NAMES_F)} ${pick(LAST_NAMES)}`, phone: `+216${digits}`, passwordHash: hash, role: 'SPORTIF', gymId: ennasr.id, language: 'fr' };
    })
  );
  const soussMembers = await User.bulkCreate(
    Array.from({ length: 10 }, (_, i) => {
      let digits;
      do digits = `4${String(int(0, 9999999)).padStart(7, '0')}`;
      while (usedPhones.has(`+216${digits}`));
      phoneOf(digits);
      return { name: `${pick(i % 2 ? FIRST_NAMES_F : FIRST_NAMES_M)} ${pick(LAST_NAMES)}`, phone: `+216${digits}`, passwordHash: hash, role: 'SPORTIF', gymId: sousse.id, language: 'fr' };
    })
  );
  const smallGymData = async (gym, gymMembers, plans, receiver) => {
    const rows = gymMembers.map((u, i) => {
      const plan = plans[i % 2];
      const start = addDays(today, -int(5, 70));
      return { userId: u.id, gymId: gym.id, planId: plan.id, startDate: start, endDate: planEnd(start, plan), amount: plan.price, paymentMethod: 'ESPECES', createdById: receiver.id };
    });
    const created = await Subscription.bulkCreate(rows);
    await Payment.bulkCreate(created.map((s, i) => ({ gymId: gym.id, userId: s.userId, amount: s.amount, method: 'ESPECES', kind: 'ABONNEMENT', label: plans[i % 2].nameFr, planId: plans[i % 2].id, subscriptionId: s.id, receivedById: receiver.id, createdAt: randomTime(s.startDate) })));
    const ci = [];
    for (let d = addDays(today, -14); d < today; d = addDays(d, 1)) {
      for (const u of gymMembers) if (chance(0.4)) {
        const inAt = at(d, int(8, 20), int(0, 59));
        ci.push({ userId: u.id, gymId: gym.id, checkInAt: inAt, checkOutAt: new Date(inAt.getTime() + 70 * 60000), status: 'ENTREE', source: 'SCAN', byStaffId: receiver.id });
      }
    }
    await CheckIn.bulkCreate(ci);
  };
  await smallGymData(ennasr, ennasrMembers, ennasrPlans, nizar);
  await smallGymData(sousse, soussMembers, soussePlans, olfa);
  await Report.create({ gymId: ennasr.id, machineId: ennasrMachines[1].id, userId: ennasrMembers[0].id, issueType: 'CABLE', description: 'Câble usé.', status: 'NOUVEAU', notify: true, photo: demoPng(32, 32, [120, 60, 60]), photoType: 'image/png', createdAt: minutesAgo(200) });

  // 13. Repas et eau (Amine aujourd'hui : bsissa, yaourt + dattes, 1,4 L d'eau)
  const mealRows = [];
  const waterRows = [];
  const foodMeal = (userId, date, mealType, food, servings = 1, createdAt) => ({
    userId, date, mealType, foodId: food.id, name: food.nameFr, quantity: servings === 1 ? food.portion : `${servings} × ${food.portion}`,
    calories: Math.round(food.calories * servings), protein: Math.round(food.protein * servings), carbs: Math.round(food.carbs * servings), fat: Math.round(food.fat * servings), createdAt,
  });
  mealRows.push(foodMeal(amine.id, today, 'PETIT_DEJ', F['Bsissa au lait'], 1, clampPast(at(today, 7, 40))));
  mealRows.push({
    userId: amine.id, date: today, mealType: 'COLLATION', name: 'Yaourt nature + 2 dattes', quantity: '1 pot + 2 pièces',
    calories: F['Yaourt nature'].calories + F['Dattes Deglet Nour'].calories, protein: F['Yaourt nature'].protein + F['Dattes Deglet Nour'].protein,
    carbs: F['Yaourt nature'].carbs + F['Dattes Deglet Nour'].carbs, fat: F['Yaourt nature'].fat + F['Dattes Deglet Nour'].fat, createdAt: clampPast(at(today, 10, 15)),
  });
  for (const [ml, drink, h] of [[250, 'EAU', 7], [500, 'EAU', 9], [330, 'EAU', 11], [330, 'THE', 13]]) waterRows.push({ userId: amine.id, date: today, ml, drink, kcal: 0, createdAt: clampPast(at(today, h, 5)) });
  const mealFoods = { PETIT_DEJ: ['Bsissa au lait', 'Œufs durs', 'Pain complet', 'Yaourt nature'], DEJEUNER: ['Couscous au poulet', 'Poulet grillé', 'Riz blanc', 'Salade méchouia', 'Lablabi'], DINER: ['Ojja merguez', 'Soupe de lentilles', 'Thon en boîte', 'Salade tunisienne'], COLLATION: ['Dattes Deglet Nour', 'Banane', 'Amandes'] };
  const eaters = [S.amine, ...others.filter(() => chance(0.4))];
  for (const s of eaters) {
    const nDays = s.key === 'amine' ? 12 : int(3, 15);
    for (let k = 1; k <= nDays; k += 1) {
      const d = addDays(today, -k);
      for (const [type, list] of Object.entries(mealFoods)) {
        if (type === 'COLLATION' && chance(0.5)) continue;
        mealRows.push(foodMeal(s.user.id, d, type, F[pick(list)], pick([1, 1, 1, 1.5]), at(d, { PETIT_DEJ: 8, DEJEUNER: 13, DINER: 20, COLLATION: 16 }[type], int(0, 50))));
      }
      for (let w = 0; w < int(3, 8); w += 1) waterRows.push({ userId: s.user.id, date: d, ml: pick([250, 330, 500]), drink: weighted([['EAU', 80], ['THE', 10], ['CAFE', 5], ['JUS', 5]]), kcal: 0, createdAt: at(d, 8 + w * 2, 0) });
    }
  }
  for (const w of waterRows) if (w.drink === 'JUS') w.kcal = Math.round(w.ml * 0.45);
  await chunked(Meal, mealRows);
  await chunked(WaterLog, waterRows);

  // 14. Coach : conversation d'Amine (avec un changement de séance et une douleur à ajouter en attente) + statistiques
  const pushItem = amineItems.find((i) => i.exerciseId === exId('Presse pectorale assise'));
  const pressee = exByName['Presse pectorale assise'];
  const inclinees = exByName['Pompes inclinées'];
  const chat = [];
  const yesterday = addDays(today, -1);
  chat.push({ userId: amine.id, role: 'user', content: 'Combien de protéines je dois manger par jour ?', topic: 'NUTRITION', createdAt: at(yesterday, 20, 12) });
  chat.push({ userId: amine.id, role: 'assistant', offline: true, topic: 'NUTRITION', content: 'Pour toi, vise environ 124 g de protéines par jour, sur 3 ou 4 repas : œufs, poulet, thon, lentilles, yaourt. Une ojja ou un poulet grillé le soir t’aide à y arriver.', createdAt: at(yesterday, 20, 12) });
  const painAt = recent(11, 20);
  chat.push({ userId: amine.id, role: 'user', content: 'La presse pectorale me fait mal à l’épaule gauche. J’arrête ?', topic: 'DOULEUR', createdAt: painAt });
  chat.push({
    userId: amine.id, role: 'assistant', offline: true, topic: 'DOULEUR', createdAt: painAt,
    content: 'Oui, arrête-la pour aujourd’hui. Souvent, le siège est trop bas : les poignées doivent arriver à hauteur de poitrine.',
    proposal: pushItem ? {
      type: 'SWAP', reason: 'DOULEUR', programItemId: pushItem.id, fromExerciseId: pressee.id, toExerciseId: inclinees.id,
      fromName: { fr: pressee.nameFr, ar: pressee.nameAr, en: pressee.nameEn }, toName: { fr: inclinees.nameFr, ar: inclinees.nameAr, en: inclinees.nameEn }, sets: 3, reps: '12',
    } : null,
    proposalState: pushItem ? 'PENDING' : null,
  });
  chat.push({ userId: amine.id, role: 'assistant', offline: true, topic: 'DOULEUR', content: addPainText('fr', 'epaule'), proposal: { type: 'ADD_PAIN', zone: 'epaule' }, proposalState: 'PENDING', createdAt: painAt });
  for (const s of others.filter(() => chance(0.55))) {
    const n = int(1, 4);
    for (let k = 0; k < n; k += 1) {
      const topicKey = weighted(TOPIC_WEIGHTS);
      const content = pick(COACH_QUESTIONS[topicKey]);
      const createdAt = clampPast(at(addDays(today, -int(0, 6)), int(7, 22), int(0, 59)));
      const topic = detectTopic(content);
      const lang = /[؀-ۿ]/.test(content) ? 'ar' : 'fr';
      const referral = topic === 'DOULEUR' && /4 jours/.test(content);
      const applied = topic === 'REMPLACER' && chance(0.5);
      chat.push({ userId: s.user.id, role: 'user', content, topic, createdAt });
      chat.push({
        userId: s.user.id, role: 'assistant', offline: true, createdAt, topic: referral ? 'ORIENTATION' : topic,
        content: referral ? `${fallbackReply(content, lang, topic)}\n\n${referralText(lang, { name: 'Cabinet du Lac', phone: '+216 71 860 214' })}` : fallbackReply(content, lang, topic),
        proposal: applied ? { type: 'SWAP', reason: 'OCCUPEE', fromExerciseId: exId('Presse à cuisses'), toExerciseId: exId('Goblet squat'), fromName: { fr: 'Presse à cuisses' }, toName: { fr: 'Goblet squat' }, sets: 3, reps: '10' } : null,
        proposalState: applied ? 'APPLIED' : null,
      });
    }
  }
  await chunked(ChatMessage, chat);

  // 15. Notifications : historique des envois (écran Notifications) + rappels reçus par les membres
  const current = specs.filter((s) => s.subs.length && s.subs[s.subs.length - 1].end >= addDays(today, -3) && s.user.active);
  const userById = new Map(specs.map((s) => [s.user.id, s.user]));
  const notifRows = [];
  const addCampaign = async (data, users, readPct, kind, textKey, params, linkOf) => {
    const sentAt = data.sentAt;
    const campaign = await Campaign.create({ gymId: lac.id, channel: 'APP', recipients: data.sentAt ? users.length : 0, ...data });
    if (!sentAt) return campaign;
    for (const u of users) {
      const text = textKey ? textFor(textKey, u.language, typeof params === 'function' ? params(u) : params) : campaignTextFor(campaign, u.language);
      notifRows.push({ userId: u.id, gymId: lac.id, campaignId: campaign.id, kind, ...text, link: linkOf ? linkOf(u) : '/app/notifications', createdAt: sentAt, readAt: chance(readPct) ? new Date(sentAt.getTime() + int(5, 600) * 60000) : null });
    }
    return campaign;
  };
  const calmUsers = current.filter((s) => s.user.prefs.calmAlert).map((s) => s.user);
  const fr = (key, params) => textFor(key, 'fr', params);
  const ar = (key, params) => textFor(key, 'ar', params);
  const calmFr = fr('CALM', { count: 21, gym: lac.name });
  const calmAr = ar('CALM', { count: 21, gym: lac.name });
  await addCampaign({ audience: 'ALL', kind: 'CALM', auto: true, titleFr: calmFr.title, bodyFr: calmFr.body, titleAr: calmAr.title, bodyAr: calmAr.body, sentAt: at(yesterday, 14, 5) }, calmUsers, 0.62, 'CALM', 'CALM', { count: 21, gym: lac.name });
  // rappel J-4 de ce matin (Amine et les autres abonnements qui finissent dans 4 jours)
  const expiringIn4 = specs.filter((s) => s.subs.length && s.subs[s.subs.length - 1].end === addDays(today, 4));
  const expFr = fr('EXPIRY', { days: 4, plan: 'Mensuel', date: addDays(today, 4) });
  const expAr = ar('EXPIRY', { days: 4, plan: 'Mensuel', date: addDays(today, 4) });
  const lastSub = (u) => specs.find((s) => s.user.id === u.id).subs.slice(-1)[0];
  await addCampaign(
    { audience: 'EXPIRING', kind: 'EXPIRY', auto: true, titleFr: expFr.title, bodyFr: expFr.body, titleAr: expAr.title, bodyAr: expAr.body, sentAt: recent(9, 0) },
    expiringIn4.map((s) => s.user), 0.58, 'EXPIRY', 'EXPIRY',
    (u) => ({ days: 4, plan: P[specs.find((s) => s.user.id === u.id).plan].nameFr, date: addDays(today, 4) }),
    (u) => `/app/account/subscription?s=${lastSub(u).row.id}`
  );
  const repairedReporters = [...new Set(reportRows.filter((r) => r.machineId === M['05'].id).map((r) => r.userId))].map((id) => userById.get(id)).filter(Boolean);
  const repFr = fr('REPAIRED', { machine: 'Vélo elliptique #05' });
  const repAr = ar('REPAIRED', { machine: 'Vélo elliptique #05' });
  await addCampaign({ audience: 'REPORTERS', kind: 'REPAIRED', auto: true, titleFr: repFr.title, bodyFr: repFr.body, titleAr: repAr.title, bodyAr: repAr.body, sentAt: at(addDays(today, -2), 16, 20) }, repairedReporters, 0.75, 'REPAIRED', 'REPAIRED', { machine: 'Vélo elliptique #05' });
  const allUsers = current.map((s) => s.user);
  await addCampaign({ audience: 'ALL', kind: 'MESSAGE', auto: false, titleFr: 'Nouveaux horaires du week-end', bodyFr: 'À partir de samedi, la salle ouvre à 07:00 et ferme à 21:00. Le dimanche : 08:00 – 14:00.', titleAr: 'أوقات جديدة في الويكاند', bodyAr: 'من السبت، القاعة تحل على 07:00 وتسكّر على 21:00. الأحد: 08:00 – 14:00.', sentAt: at(addDays(today, -4), 12, 0), createdById: sami.id }, allUsers, 0.49, 'MESSAGE');
  const inactiveUsers = current.filter((s) => s.freq <= 2 || s.absentDays).map((s) => s.user);
  const inFr = fr('INACTIVE', { days: 14 });
  const inAr = ar('INACTIVE', { days: 14 });
  await addCampaign({ audience: 'INACTIVE', kind: 'INACTIVE', auto: true, titleFr: inFr.title, bodyFr: inFr.body, titleAr: inAr.title, bodyAr: inAr.body, sentAt: at(addDays(today, -5), 10, 0) }, inactiveUsers, 0.31, 'INACTIVE', 'INACTIVE', { days: 14 });
  await addCampaign({ audience: 'ALL', kind: 'MESSAGE', auto: false, titleFr: 'Cours de mobilité samedi', bodyFr: 'Samedi à 10:00, Hichem anime un cours de mobilité gratuit (30 min). Places limitées : inscris-toi à l’accueil.', titleAr: 'كور موبيليتي نهار السبت', bodyAr: 'السبت على 10:00، هشام يعمل كور موبيليتي بلاش (30 دقيقة). البلايص محدودة: سجّل في الاستقبال.', sentAt: at(addDays(today, -6), 18, 30), createdById: hichem.id }, allUsers, 0.44, 'MESSAGE');
  // message programmé demain 13:30 (pas encore envoyé)
  await addCampaign({ audience: 'INACTIVE', kind: 'MESSAGE', auto: false, titleFr: 'Ça fait un moment !', bodyFr: 'Ta séance Jambes t’attend. La salle est calme entre 14:00 et 16:00.', titleAr: 'توحّشناك!', bodyAr: 'حصّة الساقين تستنّى فيك. القاعة هادية بين 14:00 و16:00.', scheduledAt: at(addDays(today, 1), 13, 30), sentAt: null, createdById: sami.id }, [], 0, 'MESSAGE');
  // bienvenue des nouveaux membres
  for (const s of specs.filter((x) => x.user.createdAt >= at(monthStart, 0))) {
    notifRows.push({ userId: s.user.id, gymId: lac.id, kind: 'WELCOME', ...textFor('WELCOME', s.user.language, { gym: lac.name }), link: '/app', createdAt: s.user.createdAt, readAt: s.key === 'youssef' ? null : s.user.createdAt });
  }
  await chunked(Notification, notifRows);

  // 16. Journal de l'équipe (quelques actions récentes)
  await AuditLog.bulkCreate([
    { gymId: lac.id, actorId: leila.id, action: 'cash.open', targetType: 'CashSession', details: { openingFloat: 50 }, createdAt: recent(7, 58) },
    { gymId: lac.id, actorId: leila.id, action: 'member.renew', targetType: 'User', targetId: S.fares.user.id, details: { method: 'CARTE', amount: 240 }, createdAt: recent(9, 2) },
    { gymId: lac.id, actorId: leila.id, action: 'member.renew', targetType: 'User', targetId: S.nour.user.id, details: { method: 'D17', amount: 90 }, createdAt: recent(10, 20) },
    { gymId: lac.id, actorId: walid.id, action: 'report.update', targetType: 'Report', details: { status: 'REPARATION' }, createdAt: at(addDays(today, -4), 11, 0) },
    { gymId: lac.id, actorId: sami.id, action: 'plan.update', targetType: 'Plan', targetId: P.Trimestriel.id, details: { fields: ['freezeDays'] }, createdAt: at(addDays(today, -9), 16, 0) },
  ]);

  return {
    exercises: exercises.length,
    members: specs.length + ennasrMembers.length + soussMembers.length,
    checkins: checkinRows.length + todayRows.length,
    payments: paymentRows.length,
    gyms: { lac: lac.id, ennasr: ennasr.id, sousse: sousse.id },
    accounts: { admin, sami, leila, mariem, walid, hichem, nizar, olfa, amine: S.amine.user, youssef: S.youssef.user },
  };
}

// Comptes affichés à la fin de « npm run db:setup »
const DEMO_ACCOUNTS = [
  ['Administrateur Kammel', 'admin@kammel.tn', DEMO_PASSWORD],
  ['Gérant · Kammel Gym Lac 2', 'sami@kammelgym.tn', DEMO_PASSWORD],
  ['Accueil · Lac 2', 'leila@kammelgym.tn', DEMO_PASSWORD],
  ['Accueil (soir) · Lac 2', 'mariem@kammelgym.tn', DEMO_PASSWORD],
  ['Technicien · Lac 2', 'walid@kammelgym.tn', DEMO_PASSWORD],
  ['Coach · Lac 2', 'hichem@kammelgym.tn', DEMO_PASSWORD],
  ['Gérant · Kammel Ennasr', 'nizar@kammelgym.tn', DEMO_PASSWORD],
  ['Gérant · Kammel Sousse', 'olfa@kammelgym.tn', DEMO_PASSWORD],
  ['Membre (référence) · Amine Ben Salah', '+216 22 345 678', DEMO_PASSWORD],
  ['Membre · Yasmine Gharbi (arabe)', '+216 55 120 447', DEMO_PASSWORD],
  ['Membre expiré · Salma Ben Ali', '+216 23 908 115', DEMO_PASSWORD],
  ['Nouveau membre (mot de passe provisoire)', '+216 24 117 590', YOUSSEF_TEMP_PASSWORD],
];

module.exports = { seed, DEMO_PASSWORD, YOUSSEF_TEMP_PASSWORD, DEMO_ACCOUNTS, sequelize };
