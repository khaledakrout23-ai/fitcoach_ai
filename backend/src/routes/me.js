// Espace du compte connecté : profil, onboarding, préférences, mot de passe, abonnement, carte d'accès,
// signalements de panne, notifications, export et suppression des données.
const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const {
  sequelize, User, Gym, Subscription, Plan, Payment, CheckIn, Machine, Report, Notification, Program, ProgramItem,
  WorkoutSession, SessionEntry, Meal, WaterLog, ChatMessage, NutritionTarget, Food, EmailCode,
} = require('../models');
const { ah, HttpError } = require('../middleware/errors');
const { auth, requireRole, startSession } = require('../middleware/auth');
const { rateLimit, clearSessionCookie } = require('../middleware/security');
const { publicUser, pick, required, checkPassword, num, oneOf, text, localDate, addDays } = require('../utils');
const { INJURY_ZONES, GOALS, LEVELS, ACTIVITIES, DIET_STYLES, ISSUE_TYPES } = require('../services/constants');
const { saveTarget, profileOf } = require('../services/nutrition');
const { dailyTarget, waterTarget, bmi, bmiCategory, healthyRange, weeksToGoal } = require('../services/targets');
const { gymSettings } = require('../services/gymSettings');
const { issuePass } = require('../services/accessPass');
const { parsePhoto, sendPhoto } = require('../services/images');
const { statusOf, initials, planName, currentSubscription } = require('../services/members');
const { generateForUser, programView } = require('../services/programs');
const { BCRYPT_COST } = require('./auth');

router.use(auth);
const sportif = requireRole('SPORTIF');

// ---------------------------------------------------------------- Profil
const BASIC_FIELDS = ['name', 'language', 'theme'];
const PROFILE_FIELDS = [
  ...BASIC_FIELDS, 'sex', 'birthYear', 'weight', 'height', 'goalWeight', 'goal', 'level', 'activity',
  'trainingDays', 'sessionMinutes', 'injuries', 'dietStyle', 'healthConsent',
];
// Données de santé : enregistrées seulement avec l'accord du membre
const CONSENT_FIELDS = ['sex', 'birthYear', 'weight', 'height', 'goalWeight', 'injuries'];
// Champs qui changent l'objectif repas + eau
const TARGET_FIELDS = ['sex', 'birthYear', 'weight', 'height', 'goal', 'activity', 'dietStyle', 'sessionMinutes', 'trainingDays', 'healthConsent'];

const invalid = (field) => new HttpError(400, 'VALIDATION', `Champ invalide : ${field}`);
const bool = (v, field) => {
  if (typeof v !== 'boolean') throw invalid(field);
  return v;
};
const round1 = (n) => Math.round(n * 10) / 10;

/** Valide et nettoie les champs de profil envoyés (bornes de l'onboarding) */
function cleanProfile(body) {
  const year = new Date().getFullYear();
  const out = {};
  const has = (k) => body[k] !== undefined;
  if (has('name')) {
    const name = text(body.name, 100);
    if (!name || name.length < 2) throw invalid('name');
    out.name = name;
  }
  if (has('language')) out.language = oneOf(body.language, ['fr', 'ar', 'en'], 'language');
  if (has('theme')) out.theme = oneOf(body.theme, ['dark', 'light', 'system'], 'theme');
  if (has('sex')) out.sex = oneOf(body.sex, ['H', 'F', 'NA'], 'sex');
  if (has('birthYear')) out.birthYear = num(body.birthYear, 'birthYear', { min: year - 90, max: year - 12, integer: true });
  if (has('weight')) out.weight = round1(num(body.weight, 'weight', { min: 30, max: 300 }));
  if (has('height')) out.height = num(body.height, 'height', { min: 100, max: 250, integer: true });
  if (has('goalWeight')) out.goalWeight = body.goalWeight === null ? null : round1(num(body.goalWeight, 'goalWeight', { min: 30, max: 300 }));
  if (has('goal')) out.goal = oneOf(body.goal, Object.keys(GOALS), 'goal');
  if (has('level')) out.level = oneOf(body.level, Object.keys(LEVELS), 'level');
  if (has('activity')) out.activity = oneOf(body.activity, Object.keys(ACTIVITIES), 'activity');
  if (has('dietStyle')) out.dietStyle = oneOf(body.dietStyle, Object.keys(DIET_STYLES), 'dietStyle');
  if (has('sessionMinutes')) out.sessionMinutes = oneOf(Number(body.sessionMinutes), [30, 45, 60, 90], 'sessionMinutes');
  if (has('trainingDays')) {
    if (!Array.isArray(body.trainingDays) || body.trainingDays.length > 7) throw invalid('trainingDays');
    const days = [...new Set(body.trainingDays.map((d) => num(d, 'trainingDays', { min: 0, max: 6, integer: true })))].sort((a, b) => a - b);
    if (days.length < 2 || days.length > 6) throw invalid('trainingDays');
    out.trainingDays = days;
    out.daysPerWeek = days.length;
  }
  if (has('injuries')) {
    if (!Array.isArray(body.injuries) || body.injuries.length > Object.keys(INJURY_ZONES).length) throw invalid('injuries');
    out.injuries = [...new Set(body.injuries.map((z) => oneOf(z, Object.keys(INJURY_ZONES), 'injuries')))];
  }
  if (has('healthConsent')) out.healthConsent = bool(body.healthConsent, 'healthConsent');
  return out;
}

// Accord santé : refus si une donnée de santé est envoyée sans accord ; retrait de l'accord → données effacées
function applyConsent(user, data) {
  const consent = data.healthConsent ?? user.healthConsent;
  const sendsHealth = CONSENT_FIELDS.some((f) => data[f] != null && !(Array.isArray(data[f]) && !data[f].length));
  if (sendsHealth && !consent) throw new HttpError(400, 'CONSENT_REQUIRED', 'Accord requis pour enregistrer tes données de santé.');
  if (data.healthConsent === false) {
    for (const f of CONSENT_FIELDS) data[f] = f === 'injuries' ? [] : null;
  }
  return data;
}

/** Valeurs de l'écran « Résultats » (calculées, jamais stockées) */
function computedOf(user) {
  const p = profileOf(user);
  const target = dailyTarget(p);
  const weeks = weeksToGoal(user.weight, user.goalWeight);
  return {
    bmi: bmi(p),
    bmiCategory: bmiCategory(bmi(p)),
    healthyRange: healthyRange(user.height),
    kgToChange: user.weight && user.goalWeight ? round1(user.goalWeight - user.weight) : null,
    weeksToGoal: weeks,
    goalDate: weeks != null ? addDays(localDate(), weeks * 7) : null,
    maintenance: target ? target.maintenance : null,
    target: target ? { calories: target.calories, protein: target.protein, carbs: target.carbs, fat: target.fat } : null,
    waterMl: { trainingDay: waterTarget(p, { trainingDay: true }), restDay: waterTarget(p, { trainingDay: false }) },
  };
}

const gymView = (gym) =>
  gym ? { id: gym.id, name: gym.name, address: gym.address, city: gym.city, phone: gym.phone, capacity: gym.capacity, hours: gym.hours } : null;

async function profileView(userId) {
  const user = await User.findByPk(userId, { include: [{ model: Gym, as: 'gym' }] });
  const data = publicUser(user);
  data.initials = initials(user.name);
  data.gym = gymView(user.gym);
  if (user.role === 'SPORTIF') data.computed = computedOf(user);
  return data;
}

router.get(
  '/profile',
  ah(async (req, res) => {
    res.json(await profileView(req.user.id));
  })
);

// Tous les rôles : nom, langue, thème. Membres : aussi les données sportives et de santé.
router.put(
  '/profile',
  ah(async (req, res) => {
    const user = req.user;
    if (req.body.gymId !== undefined) throw new HttpError(403, 'GYM_LOCKED', 'Seule ta salle peut changer ton rattachement.');
    if (user.role !== 'SPORTIF') {
      await user.update(cleanProfile(pick(req.body, BASIC_FIELDS)));
      return res.json(await profileView(user.id));
    }
    const data = applyConsent(user, cleanProfile(pick(req.body, PROFILE_FIELDS)));
    await user.update(data);
    if (TARGET_FIELDS.some((f) => data[f] !== undefined)) await saveTarget(user, { useAI: false });
    return res.json(await profileView(user.id));
  })
);

// Toutes les réponses de l'onboarding en une fois (accord santé obligatoire)
const ONBOARDING_REQUIRED = ['goal', 'sex', 'birthYear', 'height', 'weight', 'activity', 'level', 'trainingDays', 'sessionMinutes', 'dietStyle', 'healthConsent'];
router.put(
  '/onboarding',
  sportif,
  ah(async (req, res) => {
    required(req.body, ONBOARDING_REQUIRED);
    if (req.body.healthConsent !== true) throw new HttpError(400, 'CONSENT_REQUIRED', 'Accord requis pour enregistrer tes données de santé.');
    const data = cleanProfile(pick(req.body, PROFILE_FIELDS));
    if (!data.injuries) data.injuries = [];
    if (data.goal === 'FORME' && data.goalWeight === undefined) data.goalWeight = null;
    const user = req.user;
    await user.update({ ...data, onboardedAt: user.onboardedAt || new Date() });
    const target = await saveTarget(user, { useAI: false });
    let program = await Program.findOne({ where: { userId: user.id, active: true } });
    if (!program && user.gymId) {
      try {
        program = await generateForUser(user);
      } catch (err) {
        if (!(err instanceof HttpError)) throw err; // profil incomplet : pas de programme, l'app propose de le générer
      }
    }
    res.json({ profile: await profileView(user.id), target, program: program ? await programView(user) : null });
  })
);

// ---------------------------------------------------------------- Préférences
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const PREF_DEFAULTS = {
  notifications: { sessions: true, water: true, gym: true, meals: false },
  calmAlert: false,
  waterTargetMl: null,
  hotDay: false,
  units: 'METRIC',
  waterReminders: { enabled: true, everyHours: 2, quietFrom: '23:00', quietTo: '07:00' },
  ramadan: false,
};

// Préférences connues uniquement, valeurs vérifiées ; les clés inconnues sont ignorées
function cleanPrefs(current, body) {
  const base = { ...PREF_DEFAULTS, ...pick(current, Object.keys(PREF_DEFAULTS)) };
  const out = {
    ...base,
    notifications: { ...PREF_DEFAULTS.notifications, ...pick(base.notifications || {}, Object.keys(PREF_DEFAULTS.notifications)) },
    waterReminders: { ...PREF_DEFAULTS.waterReminders, ...pick(base.waterReminders || {}, Object.keys(PREF_DEFAULTS.waterReminders)) },
  };
  if (body.notifications !== undefined) {
    if (!body.notifications || typeof body.notifications !== 'object') throw invalid('notifications');
    for (const k of Object.keys(PREF_DEFAULTS.notifications)) {
      if (body.notifications[k] !== undefined) out.notifications[k] = bool(body.notifications[k], `notifications.${k}`);
    }
  }
  if (body.calmAlert !== undefined) out.calmAlert = bool(body.calmAlert, 'calmAlert');
  if (body.hotDay !== undefined) out.hotDay = bool(body.hotDay, 'hotDay');
  if (body.ramadan !== undefined) out.ramadan = bool(body.ramadan, 'ramadan');
  if (body.units !== undefined) out.units = oneOf(body.units, ['METRIC', 'IMPERIAL'], 'units');
  if (body.waterTargetMl !== undefined) {
    out.waterTargetMl = body.waterTargetMl === null ? null : Math.round(num(body.waterTargetMl, 'waterTargetMl', { min: 1000, max: 6000 }) / 50) * 50;
  }
  if (body.waterReminders !== undefined) {
    const w = body.waterReminders;
    if (!w || typeof w !== 'object') throw invalid('waterReminders');
    if (w.enabled !== undefined) out.waterReminders.enabled = bool(w.enabled, 'waterReminders.enabled');
    if (w.everyHours !== undefined) out.waterReminders.everyHours = num(w.everyHours, 'waterReminders.everyHours', { min: 1, max: 4, integer: true });
    for (const k of ['quietFrom', 'quietTo']) {
      if (w[k] !== undefined) {
        if (!HHMM.test(String(w[k]))) throw invalid(`waterReminders.${k}`);
        out.waterReminders[k] = w[k];
      }
    }
  }
  return out;
}

router.get(
  '/prefs',
  ah(async (req, res) => {
    res.json(cleanPrefs(req.user.prefs, {}));
  })
);

router.put(
  '/prefs',
  ah(async (req, res) => {
    const prefs = cleanPrefs(req.user.prefs, req.body || {});
    await req.user.update({ prefs });
    res.json(prefs);
  })
);

// ---------------------------------------------------------------- Mot de passe (tous les rôles)
router.put(
  '/password',
  ah(async (req, res) => {
    required(req.body, ['currentPassword', 'newPassword']);
    const user = await User.scope('withPassword').findByPk(req.user.id);
    if (!(await bcrypt.compare(String(req.body.currentPassword).slice(0, 200), user.passwordHash))) {
      throw new HttpError(400, 'BAD_PASSWORD', 'Mot de passe actuel incorrect.');
    }
    checkPassword(req.body.newPassword);
    if (req.body.newPassword === req.body.currentPassword) {
      throw new HttpError(400, 'SAME_PASSWORD', 'Le nouveau mot de passe doit être différent de l’ancien.');
    }
    await user.update({
      passwordHash: await bcrypt.hash(String(req.body.newPassword), BCRYPT_COST),
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      tempPasswordExpiresAt: null,
      tokenVersion: user.tokenVersion + 1, // toutes les autres sessions sont coupées
    });
    startSession(res, user); // cette session continue avec un nouveau jeton
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------- Abonnement et paiements
router.get(
  '/subscription',
  sportif,
  ah(async (req, res) => {
    const gym = req.user.gymId ? await Gym.findByPk(req.user.gymId) : null;
    const settings = gymSettings(gym);
    const sub = await Subscription.findOne({
      where: { userId: req.user.id },
      include: [{ model: Plan, as: 'plan' }],
      order: [['endDate', 'DESC'], ['id', 'DESC']],
    });
    const today = localDate();
    let subscription = null;
    if (sub) {
      const total = Math.max(1, (new Date(`${sub.endDate}T12:00:00`) - new Date(`${sub.startDate}T12:00:00`)) / 86400000 + 1);
      const elapsed = (new Date(`${today}T12:00:00`) - new Date(`${sub.startDate}T12:00:00`)) / 86400000 + 1;
      subscription = {
        id: sub.id,
        startDate: sub.startDate,
        endDate: sub.endDate,
        amount: sub.amount,
        paymentMethod: sub.paymentMethod,
        frozenFrom: sub.frozenFrom,
        frozenUntil: sub.frozenUntil,
        plan: sub.plan ? { ...planName(sub.plan), duration: sub.plan.duration, durationUnit: sub.plan.durationUnit, price: sub.plan.price } : null,
        progress: Math.min(1, Math.max(0, Math.round((elapsed / total) * 100) / 100)),
        ...statusOf(sub, { today, graceDays: settings.rules.graceDays }),
      };
    }
    // dernière entrée acceptée aujourd'hui (puce « Entré à 10:52 » de l'accueil)
    const entry = await CheckIn.findOne({
      where: { userId: req.user.id, status: 'ENTREE', checkInAt: { [Op.gte]: new Date(`${today}T00:00:00`) } },
      order: [['checkInAt', 'DESC']],
    });
    res.json({
      subscription,
      status: subscription ? subscription.status : 'AUCUN',
      gym: gym ? { id: gym.id, name: gym.name, phone: gym.phone } : null,
      inAppPurchase: settings.features.inAppPurchase,
      todayCheckIn: entry ? { at: entry.checkInAt, checkOutAt: entry.checkOutAt, status: entry.status } : null,
    });
  })
);

router.get(
  '/payments',
  sportif,
  ah(async (req, res) => {
    const payments = await Payment.findAll({
      where: { userId: req.user.id },
      include: [{ model: Plan, as: 'plan' }],
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
    res.json(payments.map((p) => ({ id: p.id, createdAt: p.createdAt, amount: p.amount, method: p.method, kind: p.kind, label: p.label, plan: planName(p.plan) })));
  })
);

// Carte d'accès : QR qui change toutes les 30 s. Abonnement expiré : le code est donné avec son statut (refusé au scan).
router.get(
  '/access-pass',
  sportif,
  ah(async (req, res) => {
    const user = req.user;
    if (!user.accessActive) throw new HttpError(403, 'ACCESS_DISABLED', 'Carte d’accès désactivée. Passe à l’accueil.');
    const gym = user.gymId ? await Gym.findByPk(user.gymId) : null;
    const settings = gymSettings(gym);
    const subs = await Subscription.findAll({ where: { userId: user.id }, include: [{ model: Plan, as: 'plan' }], order: [['endDate', 'DESC'], ['id', 'DESC']] });
    // l'abonnement commencé compte pour l'entrée ; un renouvellement futur ne compte pas encore
    const sub = currentSubscription(subs) || subs[0] || null;
    const st = sub ? statusOf(sub, { graceDays: settings.rules.graceDays }) : { status: 'AUCUN', daysLeft: null };
    res.json({
      ...issuePass(user.id),
      status: st.status,
      valid: ['ACTIF', 'EXPIRE_BIENTOT', 'GRACE'].includes(st.status),
      subscription: sub ? { endDate: sub.endDate, daysLeft: st.daysLeft, frozenUntil: st.frozenUntil || null, plan: planName(sub.plan) } : null,
      member: { id: user.id, name: user.name, initials: initials(user.name) },
      gym: gym ? { id: gym.id, name: gym.name } : null,
    });
  })
);

// ---------------------------------------------------------------- Signalements de panne
const OPEN_REPORT = ['NOUVEAU', 'VU', 'REPARATION'];
const reportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, key: (req) => `report:${req.user.id}` });

function memberReportView(r) {
  const order = ['NOUVEAU', 'VU', 'REPARATION', 'REPAREE'];
  const reached = (step) => r.status !== 'REJETE' && order.indexOf(r.status) >= order.indexOf(step);
  return {
    id: r.id,
    ticket: `P-${String(r.id).padStart(5, '0')}`,
    machine: r.machine ? { id: r.machine.id, code: r.machine.code, label: r.machine.label, zone: r.machine.zone } : null,
    issueType: r.issueType,
    description: r.description,
    status: r.status,
    notify: r.notify,
    hasPhoto: r.hasPhoto,
    createdAt: r.createdAt,
    timeline: [
      { step: 'ENVOYE', at: r.createdAt, done: true },
      { step: 'VU', at: r.seenAt || null, done: reached('VU') },
      { step: 'REPARATION', at: r.repairStartedAt || null, done: reached('REPARATION') },
      { step: 'REPAREE', at: r.repairedAt || null, done: reached('REPAREE') },
    ],
  };
}

const reportInclude = [{ model: Machine, as: 'machine', attributes: ['id', 'code', 'label', 'zone'] }];

router.get(
  '/reports',
  sportif,
  ah(async (req, res) => {
    const reports = await Report.findAll({ where: { userId: req.user.id }, include: reportInclude, order: [['createdAt', 'DESC']], limit: 50 });
    res.json(reports.map(memberReportView));
  })
);

router.post(
  '/reports',
  sportif,
  reportLimiter,
  ah(async (req, res) => {
    const user = req.user;
    const settings = gymSettings(user.gymId ? await Gym.findByPk(user.gymId) : null);
    if (!settings.features.reports) throw new HttpError(403, 'FEATURE_DISABLED', 'Fonction désactivée par ta salle.');
    required(req.body, ['machineId', 'issueType']);
    const machine = await Machine.findOne({ where: { id: Number(req.body.machineId) || 0, gymId: user.gymId || 0 } });
    if (!machine) throw new HttpError(404, 'NOT_FOUND', 'Machine introuvable dans ta salle.');
    const data = {
      machineId: machine.id,
      gymId: machine.gymId,
      userId: user.id,
      issueType: oneOf(req.body.issueType, Object.keys(ISSUE_TYPES), 'issueType'),
      description: text(req.body.description, 500),
      notify: req.body.notify === undefined ? true : bool(req.body.notify, 'notify'),
    };
    if (req.body.photo) {
      const photo = parsePhoto(req.body.photo);
      data.photo = photo.buffer;
      data.photoType = photo.mimeType;
    }
    const report = await sequelize.transaction(async (t) => {
      const created = await Report.create(data, { transaction: t });
      // un autre signalement ouvert compte comme un signalement de plus : l'état de la machine ne change qu'une fois
      if (machine.status === 'OK') await machine.update({ status: 'SIGNALEE' }, { transaction: t });
      return created;
    });
    const fresh = await Report.findByPk(report.id, { include: reportInclude });
    const others = await Report.count({ where: { machineId: machine.id, status: OPEN_REPORT, id: { [Op.ne]: report.id } } });
    res.status(201).json({ ...memberReportView(fresh), otherOpenReports: others });
  })
);

router.get(
  '/reports/:id/photo',
  sportif,
  ah(async (req, res) => {
    const report = await Report.scope('withPhoto').findOne({ where: { id: Number(req.params.id) || 0, userId: req.user.id } });
    if (!report) throw new HttpError(404, 'NOT_FOUND', 'Photo introuvable.');
    sendPhoto(res, report.photo, report.photoType);
  })
);

// ---------------------------------------------------------------- Notifications
router.get(
  '/notifications',
  ah(async (req, res) => {
    const [items, unread] = await Promise.all([
      Notification.findAll({
        attributes: ['id', 'kind', 'title', 'body', 'link', 'createdAt', 'readAt'],
        where: { userId: req.user.id },
        order: [['createdAt', 'DESC'], ['id', 'DESC']],
        limit: 50,
      }),
      Notification.count({ where: { userId: req.user.id, readAt: null } }),
    ]);
    res.json({ items, unread });
  })
);

router.post(
  '/notifications/read',
  ah(async (req, res) => {
    const where = { userId: req.user.id, readAt: null };
    if (req.body.all !== true) {
      if (!Array.isArray(req.body.ids) || !req.body.ids.length || req.body.ids.length > 100) throw invalid('ids');
      where.id = req.body.ids.map((id) => num(id, 'ids', { min: 1, integer: true }));
    }
    const [updated] = await Notification.update({ readAt: new Date() }, { where });
    const unread = await Notification.count({ where: { userId: req.user.id, readAt: null } });
    res.json({ updated, unread });
  })
);

// ---------------------------------------------------------------- Mes données (export et suppression)
router.get(
  '/export',
  sportif,
  ah(async (req, res) => {
    const userId = req.user.id;
    const [user, subscriptions, payments, checkins, programs, sessions, meals, water, messages, reports, notifications, target, foods] = await Promise.all([
      User.findByPk(userId, { include: [{ model: Gym, as: 'gym', attributes: ['id', 'name', 'city'] }] }),
      Subscription.findAll({ where: { userId }, include: [{ model: Plan, as: 'plan', attributes: ['nameFr'] }], order: [['startDate', 'ASC']] }),
      Payment.findAll({ where: { userId }, attributes: ['id', 'createdAt', 'amount', 'method', 'kind', 'label'], order: [['createdAt', 'ASC']] }),
      CheckIn.findAll({ where: { userId }, attributes: ['checkInAt', 'checkOutAt', 'status', 'refusalReason'], order: [['checkInAt', 'ASC']] }),
      Program.findAll({ where: { userId }, include: [{ model: ProgramItem, as: 'items' }] }),
      WorkoutSession.findAll({ where: { userId }, include: [{ model: SessionEntry, as: 'entries' }], order: [['startedAt', 'ASC']] }),
      Meal.findAll({ where: { userId }, order: [['date', 'ASC']] }),
      WaterLog.findAll({ where: { userId }, order: [['date', 'ASC']] }),
      ChatMessage.findAll({ where: { userId }, attributes: ['role', 'content', 'createdAt', 'proposal', 'proposalState'], order: [['createdAt', 'ASC']] }),
      Report.findAll({ where: { userId }, attributes: ['id', 'issueType', 'description', 'status', 'createdAt', 'repairedAt'] }),
      Notification.findAll({ where: { userId }, attributes: ['kind', 'title', 'body', 'createdAt', 'readAt'] }),
      NutritionTarget.findOne({ where: { userId } }),
      Food.findAll({ where: { userId } }),
    ]);
    const data = {
      exportedAt: new Date().toISOString(),
      account: publicUser(user),
      subscriptions,
      payments,
      checkins,
      programs,
      sessions,
      nutritionTarget: target,
      meals,
      water,
      foods,
      coachMessages: messages,
      reports,
      notifications,
    };
    res.setHeader('Content-Disposition', `attachment; filename="kammel-mes-donnees-${localDate()}.json"`);
    res.json(data);
  })
);

// Suppression du compte : données personnelles effacées ; abonnements et paiements gardés (comptabilité de la salle),
// rattachés à un compte anonyme
router.delete(
  '/',
  sportif,
  ah(async (req, res) => {
    required(req.body, ['password']);
    const user = await User.scope('withPassword').findByPk(req.user.id);
    if (!(await bcrypt.compare(String(req.body.password).slice(0, 200), user.passwordHash))) {
      throw new HttpError(400, 'BAD_PASSWORD', 'Mot de passe incorrect.');
    }
    await sequelize.transaction(async (t) => {
      const where = { userId: user.id };
      const opts = { where, transaction: t };
      const sessionIds = (await WorkoutSession.findAll({ attributes: ['id'], ...opts })).map((s) => s.id);
      if (sessionIds.length) await SessionEntry.destroy({ where: { sessionId: sessionIds }, transaction: t });
      await WorkoutSession.destroy(opts);
      const programIds = (await Program.findAll({ attributes: ['id'], ...opts })).map((p) => p.id);
      if (programIds.length) await ProgramItem.destroy({ where: { programId: programIds }, transaction: t });
      await Program.destroy(opts);
      for (const Model of [Meal, WaterLog, ChatMessage, NutritionTarget, Notification, EmailCode, Food]) await Model.destroy(opts);
      await Report.update({ description: null, photo: null, photoType: null, notify: false }, opts);
      await user.update(
        {
          name: 'Membre supprimé',
          email: null,
          phone: null,
          passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 4),
          sex: null,
          birthYear: null,
          weight: null,
          height: null,
          goalWeight: null,
          goal: null,
          level: null,
          activity: null,
          trainingDays: [],
          daysPerWeek: null,
          sessionMinutes: null,
          injuries: [],
          dietStyle: null,
          healthConsent: false,
          prefs: {},
          accessActive: false,
          active: false,
          deletedAt: new Date(),
          tokenVersion: user.tokenVersion + 1,
        },
        { transaction: t }
      );
    });
    clearSessionCookie(res);
    res.json({ ok: true });
  })
);

module.exports = router;
module.exports.cleanProfile = cleanProfile;
module.exports.cleanPrefs = cleanPrefs;
