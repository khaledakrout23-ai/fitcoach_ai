// Membres de la salle (D4 – D7 / M4 – M6) : liste, fiche, création avec encaissement, renouvellement, gel,
// mot de passe provisoire, désactivation, carte d'accès, export CSV. Données de santé : permission members.health seulement.
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const {
  sequelize, User, Subscription, Plan, Payment, CheckIn, WorkoutSession, Program, Report, Machine, Notification,
} = require('../../models');
const { ah, HttpError } = require('../../middleware/errors');
const { requirePermission } = require('../../middleware/auth');
const { can } = require('../../services/permissions');
const {
  required, num, oneOf, text, isoDate, normalizePhone, normEmail, temporaryPassword, localDate, addDays, planEnd, daysBetween,
} = require('../../utils');
const {
  STATUS_FILTERS, memberRows, memberListItem, findMember, subscriptionView, currentSubscription, initials, planName,
} = require('../../services/members');
const { assertMethod, recordPayment, round3 } = require('../../services/payments');
const { notifyUsers } = require('../../services/notifications');
const { audit } = require('../../services/audit');
const { sendCsv } = require('../../services/csv');
const { streakDays, programWeek, dayStart } = require('../../services/schedule');
const { SUBSCRIPTION_STATUSES } = require('../../services/constants');
const { BCRYPT_COST } = require('../auth');

const read = requirePermission('members.read');
const write = requirePermission('members.write');
const TEMP_PASSWORD_DAYS = 7;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function cleanEmail(value) {
  if (value === null || value === '') return null;
  const email = normEmail(value);
  if (!EMAIL.test(email) || email.length > 150) throw new HttpError(400, 'VALIDATION', 'Champ invalide : email');
  return email;
}

function cleanPhone(value) {
  const phone = normalizePhone(value);
  if (!phone) throw new HttpError(400, 'VALIDATION', 'Champ invalide : phone');
  return phone;
}

async function assertUnique({ phone, email }, exceptId = null) {
  const not = exceptId ? { id: { [Op.ne]: exceptId } } : {};
  if (phone && (await User.count({ where: { phone, ...not } }))) throw new HttpError(409, 'PHONE_TAKEN', 'Ce numéro est déjà utilisé.');
  if (email && (await User.count({ where: { email, ...not } }))) throw new HttpError(409, 'EMAIL_TAKEN', 'Cette adresse e-mail est déjà utilisée.');
}

async function gymPlan(req, planId) {
  const plan = await Plan.findOne({ where: { id: num(planId, 'planId', { min: 1, integer: true }), gymId: req.gym.id, archived: false } });
  if (!plan) throw new HttpError(404, 'PLAN_NOT_FOUND', 'Formule introuvable.');
  return plan;
}

const paymentView = (p) => ({
  id: p.id,
  createdAt: p.createdAt,
  amount: p.amount,
  method: p.method,
  kind: p.kind,
  label: p.label,
  plan: planName(p.plan),
  receivedBy: p.receivedBy ? { id: p.receivedBy.id, name: p.receivedBy.name } : null,
});

// ---------------------------------------------------------------- Liste
function filteredRows(rows, query) {
  let list = rows;
  if (query.q) {
    const q = String(query.q).trim().toLowerCase().slice(0, 60);
    const digits = q.replace(/\D/g, '');
    list = list.filter((r) => r.user.name.toLowerCase().includes(q)
      || (r.user.email || '').includes(q)
      || (digits.length >= 2 && (r.user.phone || '').replace(/\D/g, '').includes(digits)));
  }
  if (query.planId) list = list.filter((r) => r.sub && r.sub.planId === Number(query.planId));
  return list;
}

router.get(
  '/members',
  read,
  ah(async (req, res) => {
    const status = req.query.status === undefined ? 'all' : oneOf(req.query.status, Object.keys(STATUS_FILTERS), 'status');
    const sort = req.query.sort === undefined ? 'lastVisit' : oneOf(req.query.sort, ['lastVisit', 'name', 'endDate'], 'sort');
    const page = req.query.page === undefined ? 1 : num(req.query.page, 'page', { min: 1, max: 10000, integer: true });
    const pageSize = req.query.pageSize === undefined ? 20 : num(req.query.pageSize, 'pageSize', { min: 5, max: 100, integer: true });
    const rows = await memberRows(req.gym.id, { graceDays: req.settings.rules.graceDays });
    const accountRows = rows.map((r) => ({ ...r, status: r.user.active ? r.status : 'DESACTIVE' }));
    const searched = filteredRows(accountRows, req.query);
    const counts = Object.fromEntries(
      Object.entries(STATUS_FILTERS).map(([k, statuses]) => [k, statuses ? searched.filter((r) => statuses.includes(r.status)).length : searched.length])
    );
    let list = STATUS_FILTERS[status] ? searched.filter((r) => STATUS_FILTERS[status].includes(r.status)) : searched;
    const time = (d) => (d ? new Date(d).getTime() : 0);
    if (sort === 'name') list = [...list].sort((a, b) => a.user.name.localeCompare(b.user.name, 'fr'));
    else if (sort === 'endDate') list = [...list].sort((a, b) => (a.subscription.endDate || '9999').localeCompare(b.subscription.endDate || '9999'));
    else list = [...list].sort((a, b) => time(b.lastVisitAt) - time(a.lastVisitAt));
    res.json({
      total: list.length,
      page,
      pageSize,
      counts,
      items: list.slice((page - 1) * pageSize, page * pageSize).map(memberListItem),
    });
  })
);

// Export CSV des contacts et abonnements (jamais de données de santé), cellules protégées contre les formules
router.get(
  '/members/export.csv',
  write,
  ah(async (req, res) => {
    const rows = await memberRows(req.gym.id, { graceDays: req.settings.rules.graceDays });
    await audit(req, 'member.export', { type: 'Gym', id: req.gym.id }, { count: rows.length });
    sendCsv(
      res,
      `membres-${localDate()}.csv`,
      rows.map((r) => ({
        name: r.user.name,
        phone: r.user.phone,
        email: r.user.email,
        plan: r.subscription.plan ? r.subscription.plan.nameFr : '',
        startDate: r.subscription.startDate || '',
        endDate: r.subscription.endDate || '',
        status: r.user.active ? (SUBSCRIPTION_STATUSES[r.status] || {}).fr || r.status : 'Désactivé',
        lastVisit: r.lastVisitAt ? r.lastVisitAt.toISOString().slice(0, 16).replace('T', ' ') : '',
      })),
      [
        { key: 'name', label: 'Nom' },
        { key: 'phone', label: 'Téléphone' },
        { key: 'email', label: 'E-mail' },
        { key: 'plan', label: 'Formule' },
        { key: 'startDate', label: 'Début' },
        { key: 'endDate', label: 'Fin' },
        { key: 'status', label: 'Statut' },
        { key: 'lastVisit', label: 'Dernière visite' },
      ]
    );
  })
);

// ---------------------------------------------------------------- Fiche membre
router.get(
  '/members/:id',
  read,
  ah(async (req, res) => {
    const gymId = req.gym.id;
    const role = req.user.role;
    const member = await findMember(gymId, req.params.id);
    const today = localDate();
    const graceDays = req.settings.rules.graceDays;
    const [subs, visits, program, reports, lastReminder, totalPaid] = await Promise.all([
      Subscription.findAll({ where: { gymId, userId: member.id }, include: [{ model: Plan, as: 'plan' }], order: [['endDate', 'DESC'], ['id', 'DESC']] }),
      CheckIn.findAll({ where: { gymId, userId: member.id, status: 'ENTREE', checkInAt: { [Op.gte]: dayStart(addDays(today, -120)) } }, order: [['checkInAt', 'DESC']] }),
      Program.findOne({ where: { userId: member.id, active: true }, order: [['createdAt', 'DESC']] }),
      Report.findAll({ where: { gymId, userId: member.id }, include: [{ model: Machine, as: 'machine', attributes: ['id', 'code', 'label'] }], order: [['createdAt', 'DESC']], limit: 10 }),
      Notification.findOne({ attributes: ['createdAt', 'title'], where: { userId: member.id, kind: 'EXPIRY' }, order: [['createdAt', 'DESC']] }),
      Payment.sum('amount', { where: { gymId, userId: member.id } }),
    ]);
    const sessions = await WorkoutSession.findAll({ attributes: ['startedAt', 'programId'], where: { userId: member.id, status: 'TERMINEE', startedAt: { [Op.gte]: dayStart(addDays(today, -120)) } } });
    const sessionsDone = program ? await WorkoutSession.count({ where: { userId: member.id, programId: program.id, status: 'TERMINEE' } }) : 0;
    const activeDates = new Set([...visits.map((v) => localDate(new Date(v.checkInAt))), ...sessions.map((s) => localDate(new Date(s.startedAt)))]);
    const now = Date.now();
    const auto = req.settings.live.autoCheckoutHours * 3600000;
    const latest = subs[0] || null;

    const out = {
      member: {
        id: member.id,
        name: member.name,
        initials: initials(member.name),
        phone: member.phone,
        email: member.email,
        language: member.language,
        createdAt: member.createdAt,
        active: member.active,
        accessActive: member.accessActive,
      },
      account: {
        hasLoggedIn: Boolean(member.lastLoginAt),
        lastLoginAt: member.lastLoginAt,
        mustChangePassword: member.mustChangePassword,
        tempPasswordExpiresAt: member.tempPasswordExpiresAt,
        passwordChangedAt: member.passwordChangedAt,
        onboarded: Boolean(member.onboardedAt),
      },
      subscription: latest ? subscriptionView(latest, { today, graceDays }) : { status: 'AUCUN', daysLeft: null },
      currentSubscriptionId: (currentSubscription(subs, today) || {}).id || null,
      lastExpiryReminder: lastReminder ? { at: lastReminder.createdAt, title: lastReminder.title } : null,
      subscriptions: subs.slice(0, 12).map((s) => subscriptionView(s, { today, graceDays })),
      stats: {
        visits30: visits.filter((v) => new Date(v.checkInAt) >= dayStart(addDays(today, -29))).length,
        lastVisitAt: visits[0] ? visits[0].checkInAt : null,
        sessionsDone,
        sessionsTotal: program ? ((member.trainingDays || []).length || program.daysPerWeek) * program.weeks : null,
        streakDays: streakDays({ trainingDays: member.trainingDays, activeDates, today }),
        totalPaid: round3(totalPaid),
      },
      recentVisits: visits.slice(0, 10).map((v) => {
        const out2 = v.checkOutAt ? new Date(v.checkOutAt) : null;
        return {
          id: v.id,
          at: v.checkInAt,
          checkOutAt: v.checkOutAt,
          inProgress: !out2 && now - new Date(v.checkInAt) < auto,
          durationMin: out2 ? Math.round((out2 - new Date(v.checkInAt)) / 60000) : null,
        };
      }),
      reports: reports.map((r) => ({ id: r.id, machine: r.machine, issueType: r.issueType, status: r.status, createdAt: r.createdAt })),
    };
    if (can(role, 'payments')) {
      const payments = await Payment.findAll({
        where: { gymId, userId: member.id },
        include: [{ model: Plan, as: 'plan' }, { model: User, as: 'receivedBy', attributes: ['id', 'name'] }],
        order: [['createdAt', 'DESC']],
        limit: 20,
      });
      out.payments = payments.map(paymentView);
    }
    // données de santé : gérant et coach seulement, et seulement si le membre a donné son accord
    if (can(role, 'members.health')) {
      out.profile = member.healthConsent
        ? {
          goal: member.goal,
          sex: member.sex,
          age: member.age,
          birthYear: member.birthYear,
          weight: member.weight,
          goalWeight: member.goalWeight,
          height: member.height,
          injuries: member.injuries,
          trainingDays: member.trainingDays,
          sessionMinutes: member.sessionMinutes,
          level: member.level,
          activity: member.activity,
          dietStyle: member.dietStyle,
          healthConsent: true,
          program: program ? { id: program.id, title: program.title, week: programWeek(program, today), weeks: program.weeks } : null,
        }
        : { healthConsent: false, program: program ? { id: program.id, title: program.title, week: programWeek(program, today), weeks: program.weeks } : null };
    }
    res.json(out);
  })
);

// ---------------------------------------------------------------- Nouveau membre (compte + abonnement + paiement, une transaction)
router.post(
  '/members',
  write,
  ah(async (req, res) => {
    required(req.body, ['firstName', 'lastName', 'phone', 'planId', 'paymentMethod']);
    const firstName = text(req.body.firstName, 50);
    const lastName = text(req.body.lastName, 50);
    if (!firstName || !lastName) throw new HttpError(400, 'VALIDATION', 'Champ invalide : name');
    const phone = cleanPhone(req.body.phone);
    const email = req.body.email === undefined ? null : cleanEmail(req.body.email);
    const plan = await gymPlan(req, req.body.planId);
    const method = assertMethod(req.settings, req.body.paymentMethod);
    const today = localDate();
    const startDate = req.body.startDate ? isoDate(req.body.startDate, 'startDate') : today;
    if (startDate < addDays(today, -31) || startDate > addDays(today, 60)) throw new HttpError(400, 'VALIDATION', 'Date invalide : startDate');
    let birthYear = null;
    if (req.body.birthDate) {
      birthYear = Number(isoDate(req.body.birthDate, 'birthDate').slice(0, 4));
      const year = new Date().getFullYear();
      if (birthYear < year - 90 || birthYear > year - 12) throw new HttpError(400, 'VALIDATION', 'Date invalide : birthDate');
    }
    const language = req.body.language === undefined ? req.settings.languages.default : oneOf(req.body.language, ['fr', 'ar', 'en'], 'language');
    const chargeFee = req.body.chargeRegistrationFee !== false;
    await assertUnique({ phone, email });

    const temp = temporaryPassword();
    const passwordHash = await bcrypt.hash(temp, BCRYPT_COST);
    const expiresAt = new Date(Date.now() + TEMP_PASSWORD_DAYS * 86400000);
    const fee = chargeFee ? Number(req.settings.rules.registrationFee) || 0 : 0;
    const result = await sequelize.transaction(async (t) => {
      const user = await User.create(
        {
          name: `${firstName} ${lastName}`,
          phone,
          email,
          passwordHash,
          role: 'SPORTIF',
          gymId: req.gym.id,
          language,
          birthYear,
          mustChangePassword: true,
          tempPasswordExpiresAt: expiresAt,
        },
        { transaction: t }
      );
      const sub = await Subscription.create(
        { userId: user.id, gymId: req.gym.id, planId: plan.id, startDate, endDate: planEnd(startDate, plan), amount: plan.price, paymentMethod: method, createdById: req.user.id },
        { transaction: t }
      );
      const base = { gymId: req.gym.id, userId: user.id, method, receivedById: req.user.id };
      const payments = [await recordPayment({ ...base, amount: plan.price, kind: 'ABONNEMENT', label: plan.nameFr, planId: plan.id, subscriptionId: sub.id }, { transaction: t })];
      if (fee > 0) payments.push(await recordPayment({ ...base, amount: fee, kind: 'INSCRIPTION', label: 'Frais d’inscription' }, { transaction: t }));
      if (req.settings.automations.welcome.enabled) {
        await notifyUsers([user], 'WELCOME', { gym: req.gym.name }, { gymId: req.gym.id, transaction: t });
      }
      return { user, sub, payments };
    });
    const total = round3(result.payments.reduce((s, p) => s + p.amount, 0));
    await audit(req, 'member.create', { type: 'User', id: result.user.id }, { planId: plan.id, method, total });
    result.sub.plan = plan;
    res.status(201).json({
      member: { id: result.user.id, name: result.user.name, initials: initials(result.user.name), phone, email, language },
      login: phone,
      temporaryPassword: temp, // affiché une seule fois à l'accueil, jamais stocké en clair
      temporaryPasswordExpiresAt: expiresAt,
      subscription: subscriptionView(result.sub, { graceDays: req.settings.rules.graceDays }),
      payments: result.payments.map((p) => ({ id: p.id, amount: p.amount, method: p.method, kind: p.kind, label: p.label })),
      total,
    });
  })
);

// Coordonnées
router.put(
  '/members/:id',
  write,
  ah(async (req, res) => {
    const member = await findMember(req.gym.id, req.params.id);
    const data = {};
    if (req.body.firstName !== undefined || req.body.lastName !== undefined) {
      const [first, ...rest] = member.name.split(' ');
      const firstName = req.body.firstName === undefined ? first : text(req.body.firstName, 50);
      const lastName = req.body.lastName === undefined ? rest.join(' ') : text(req.body.lastName, 50);
      if (!firstName || !lastName) throw new HttpError(400, 'VALIDATION', 'Champ invalide : name');
      data.name = `${firstName} ${lastName}`;
    } else if (req.body.name !== undefined) {
      const name = text(req.body.name, 100);
      if (!name || name.length < 2) throw new HttpError(400, 'VALIDATION', 'Champ invalide : name');
      data.name = name;
    }
    if (req.body.phone !== undefined) data.phone = cleanPhone(req.body.phone);
    if (req.body.email !== undefined) data.email = cleanEmail(req.body.email);
    await assertUnique(data, member.id);
    await member.update(data);
    await audit(req, 'member.update', { type: 'User', id: member.id }, { fields: Object.keys(data) });
    res.json({ id: member.id, name: member.name, initials: initials(member.name), phone: member.phone, email: member.email });
  })
);

// ---------------------------------------------------------------- Renouvellement
router.post(
  '/members/:id/renew',
  write,
  ah(async (req, res) => {
    required(req.body, ['planId', 'method']);
    const member = await findMember(req.gym.id, req.params.id);
    const plan = await gymPlan(req, req.body.planId);
    const method = assertMethod(req.settings, req.body.method);
    const start = req.body.start === undefined ? 'AFTER' : oneOf(req.body.start, ['AFTER', 'TODAY'], 'start');
    const today = localDate();
    const latest = await Subscription.findOne({ where: { gymId: req.gym.id, userId: member.id }, order: [['endDate', 'DESC'], ['id', 'DESC']] });
    const startDate = start === 'AFTER' && latest && latest.endDate >= today ? addDays(latest.endDate, 1) : today;
    const result = await sequelize.transaction(async (t) => {
      const sub = await Subscription.create(
        { userId: member.id, gymId: req.gym.id, planId: plan.id, startDate, endDate: planEnd(startDate, plan), amount: plan.price, paymentMethod: method, createdById: req.user.id },
        { transaction: t }
      );
      const payment = await recordPayment(
        { gymId: req.gym.id, userId: member.id, amount: plan.price, method, kind: 'ABONNEMENT', label: plan.nameFr, planId: plan.id, subscriptionId: sub.id, receivedById: req.user.id },
        { transaction: t }
      );
      return { sub, payment };
    });
    await audit(req, 'member.renew', { type: 'User', id: member.id }, { planId: plan.id, method, amount: plan.price, startDate });
    result.sub.plan = plan;
    res.status(201).json({
      subscription: subscriptionView(result.sub, { graceDays: req.settings.rules.graceDays }),
      payment: { id: result.payment.id, amount: result.payment.amount, method: result.payment.method, kind: result.payment.kind, label: result.payment.label, createdAt: result.payment.createdAt },
    });
  })
);

// ---------------------------------------------------------------- Gel
// Décale aussi les renouvellements déjà enregistrés après cet abonnement
async function shiftLater(sub, days, transaction) {
  const later = await Subscription.findAll({ where: { userId: sub.userId, gymId: sub.gymId, id: { [Op.ne]: sub.id }, startDate: { [Op.gt]: sub.startDate } }, transaction });
  for (const s of later) await s.update({ startDate: addDays(s.startDate, days), endDate: addDays(s.endDate, days) }, { transaction });
}

router.post(
  '/members/:id/freeze',
  write,
  ah(async (req, res) => {
    const member = await findMember(req.gym.id, req.params.id);
    const today = localDate();
    const days = num(req.body.days, 'days', { min: 1, max: 180, integer: true });
    const from = req.body.from ? isoDate(req.body.from, 'from') : today;
    if (from < today || from > addDays(today, 60)) throw new HttpError(400, 'VALIDATION', 'Date invalide : from');
    const subs = await Subscription.findAll({ where: { gymId: req.gym.id, userId: member.id }, include: [{ model: Plan, as: 'plan' }] });
    const sub = currentSubscription(subs, today);
    if (!sub || sub.endDate < today || from > sub.endDate) throw new HttpError(409, 'NO_ACTIVE_SUBSCRIPTION', 'Aucun abonnement en cours à geler.');
    if (sub.frozenFrom && sub.frozenUntil && sub.frozenUntil >= today) throw new HttpError(409, 'ALREADY_FROZEN', 'Abonnement déjà gelé.');
    const allowedByPlan = (sub.plan ? sub.plan.freezeDays : 0) - sub.freezeDaysUsed;
    const usedThisYear = subs.filter((s) => s.startDate >= addDays(today, -365)).reduce((n, s) => n + s.freezeDaysUsed, 0);
    const allowed = Math.min(allowedByPlan, req.settings.rules.maxFreezeDaysPerYear - usedThisYear);
    if (days > allowed) {
      const err = new HttpError(400, 'FREEZE_LIMIT', 'Gel impossible : limite de jours atteinte.');
      err.details = { allowed: Math.max(0, allowed) };
      throw err;
    }
    await sequelize.transaction(async (t) => {
      await shiftLater(sub, days, t);
      await sub.update({ frozenFrom: from, frozenUntil: addDays(from, days - 1), freezeDaysUsed: sub.freezeDaysUsed + days, endDate: addDays(sub.endDate, days) }, { transaction: t });
    });
    await audit(req, 'member.freeze', { type: 'Subscription', id: sub.id }, { days, from });
    res.json(subscriptionView(sub, { today, graceDays: req.settings.rules.graceDays }));
  })
);

router.post(
  '/members/:id/unfreeze',
  write,
  ah(async (req, res) => {
    const member = await findMember(req.gym.id, req.params.id);
    const today = localDate();
    const subs = await Subscription.findAll({ where: { gymId: req.gym.id, userId: member.id }, include: [{ model: Plan, as: 'plan' }] });
    const sub = subs.find((s) => s.frozenFrom && s.frozenUntil && s.frozenUntil >= today);
    if (!sub) throw new HttpError(409, 'NOT_FROZEN', 'Cet abonnement n’est pas gelé.');
    const total = daysBetween(sub.frozenFrom, sub.frozenUntil) + 1;
    const used = sub.frozenFrom > today ? 0 : daysBetween(sub.frozenFrom, today); // jours de gel déjà passés (aujourd'hui non compris)
    const unused = total - used;
    await sequelize.transaction(async (t) => {
      await shiftLater(sub, -unused, t);
      await sub.update(
        {
          endDate: addDays(sub.endDate, -unused),
          freezeDaysUsed: Math.max(0, sub.freezeDaysUsed - unused),
          frozenFrom: used ? sub.frozenFrom : null,
          frozenUntil: used ? addDays(today, -1) : null,
        },
        { transaction: t }
      );
    });
    await audit(req, 'member.unfreeze', { type: 'Subscription', id: sub.id }, { unusedDays: unused });
    res.json(subscriptionView(sub, { today, graceDays: req.settings.rules.graceDays }));
  })
);

// ---------------------------------------------------------------- Compte
// Nouveau mot de passe provisoire (membre qui a oublié le sien) : donné une seule fois, sessions coupées
router.post(
  '/members/:id/reset-password',
  write,
  ah(async (req, res) => {
    const member = await findMember(req.gym.id, req.params.id);
    const temp = temporaryPassword();
    const expiresAt = new Date(Date.now() + TEMP_PASSWORD_DAYS * 86400000);
    await member.update({
      passwordHash: await bcrypt.hash(temp, BCRYPT_COST),
      mustChangePassword: true,
      tempPasswordExpiresAt: expiresAt,
      failedLogins: 0,
      lockedUntil: null,
      tokenVersion: member.tokenVersion + 1,
    });
    await audit(req, 'member.reset_password', { type: 'User', id: member.id });
    res.json({ login: member.phone, temporaryPassword: temp, temporaryPasswordExpiresAt: expiresAt });
  })
);

async function setActive(req, res, active) {
  const member = await findMember(req.gym.id, req.params.id);
  await member.update({ active, tokenVersion: member.tokenVersion + 1 });
  await audit(req, active ? 'member.reactivate' : 'member.deactivate', { type: 'User', id: member.id });
  res.json({ id: member.id, active: member.active });
}

router.post('/members/:id/deactivate', write, ah((req, res) => setActive(req, res, false)));
router.post('/members/:id/reactivate', write, ah((req, res) => setActive(req, res, true)));

// Carte d'accès (QR) activée ou non
router.put(
  '/members/:id/access',
  write,
  ah(async (req, res) => {
    const member = await findMember(req.gym.id, req.params.id);
    if (typeof req.body.accessActive !== 'boolean') throw new HttpError(400, 'VALIDATION', 'Champ invalide : accessActive');
    await member.update({ accessActive: req.body.accessActive });
    await audit(req, 'member.access', { type: 'User', id: member.id }, { accessActive: member.accessActive });
    res.json({ id: member.id, accessActive: member.accessActive });
  })
);

// Message à un membre (fiche membre : « Envoyer un message »)
router.post(
  '/members/:id/message',
  requirePermission('notifications'),
  ah(async (req, res) => {
    required(req.body, ['title', 'body']);
    const member = await findMember(req.gym.id, req.params.id);
    const notification = await Notification.create({
      userId: member.id,
      gymId: req.gym.id,
      kind: 'MESSAGE',
      title: text(req.body.title, 120),
      body: String(req.body.body).trim().slice(0, 500),
      link: '/app/notifications',
    });
    await audit(req, 'member.message', { type: 'User', id: member.id });
    res.status(201).json({ id: notification.id, createdAt: notification.createdAt });
  })
);

module.exports = router;
module.exports.cleanPhone = cleanPhone;
module.exports.cleanEmail = cleanEmail;
module.exports.assertUnique = assertUnique;
