// Tests unitaires Kammel (sans base de données) : npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const targets = require('../src/services/targets');
const utils = require('../src/utils');
const { issuePass, verifyPass, STEP_SECONDS } = require('../src/services/accessPass');
const { gymSettings, cleanSettings, DEFAULTS } = require('../src/services/gymSettings');
const { can, permissionsOf } = require('../src/services/permissions');
const rules = require('../src/services/coachRules');
const { levelFor, compareToUsual, presenceMatrix, calmWindow } = require('../src/services/occupancy');
const { csvCell, toCsv } = require('../src/services/csv');
const schedule = require('../src/services/schedule');
const { accessDecision } = require('../src/routes/staff/live');
const { cleanPrefs, cleanProfile } = require('../src/routes/me');

// ---------------------------------------------------------------- Calculs (exemple de référence des maquettes)
test('objectifs : exemple de référence (homme 32 ans, 175 cm, 85 kg)', () => {
  const p = { sex: 'H', age: 32, height: 175, weight: 85, activity: 'SEDENTAIRE', goal: 'PERTE_POIDS', dietStyle: 'EQUILIBRE', sessionMinutes: 60 };
  const t = targets.dailyTarget(p);
  assert.equal(t.maintenance, 2147);
  assert.equal(t.calories, 1647);
  assert.equal(t.protein, 124);
  assert.equal(t.carbs, 185);
  assert.equal(t.fat, 46);
  assert.equal(targets.waterTarget(p, { trainingDay: true }), 3400);
  assert.equal(targets.bmi(p), 27.8);
  assert.deepEqual(targets.healthyRange(175), [56.7, 76.3]);
  assert.equal(targets.weeksToGoal(85, 76.3), 18);
  assert.equal(targets.waterTarget(p, { trainingDay: false }), 2800);
  assert.equal(targets.waterTarget({ weight: 200, sessionMinutes: 90 }, { feelsLike: 36 }), 4000); // borné
});

// ---------------------------------------------------------------- Utilitaires
test('téléphone tunisien normalisé', () => {
  assert.equal(utils.normalizePhone('22 345 678'), '+21622345678');
  assert.equal(utils.normalizePhone('+216 22345678'), '+21622345678');
  assert.equal(utils.normalizePhone('0021622345678'), '+21622345678');
  assert.equal(utils.normalizePhone('216-22-345-678'), '+21622345678');
  assert.equal(utils.normalizePhone('abc'), null);
  assert.equal(utils.normalizePhone('123'), null);
});

test('règles des mots de passe', () => {
  assert.deepEqual(utils.passwordProblems('Kammel2026!'), []);
  assert.ok(utils.passwordProblems('short1').includes('MIN_LENGTH'));
  assert.ok(utils.passwordProblems('abcdefgh').includes('LETTER_AND_DIGIT'));
  assert.ok(utils.passwordProblems('12345678').includes('TOO_COMMON'));
  assert.ok(utils.passwordProblems('K7M4Q2X9', { temporary: 'K7M4Q2X9' }).includes('SAME_AS_TEMPORARY'));
});

test('mot de passe provisoire : 8 caractères lisibles, lettre et chiffre', () => {
  for (let i = 0; i < 300; i += 1) {
    const p = utils.temporaryPassword();
    assert.equal(p.length, 8);
    assert.match(p, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    assert.match(p, /\d/);
    assert.match(p, /[A-Z]/);
    assert.deepEqual(utils.passwordProblems(p), []);
  }
});

test('fin de formule et statut d’abonnement', () => {
  assert.equal(utils.planEnd('2026-10-08', { duration: 1, durationUnit: 'MONTH' }), '2026-11-07');
  assert.equal(utils.planEnd('2026-01-31', { duration: 1, durationUnit: 'MONTH' }), '2026-02-27');
  assert.equal(utils.planEnd('2026-11-03', { duration: 3, durationUnit: 'MONTH' }), '2027-02-02');
  assert.equal(utils.planEnd('2026-11-03', { duration: 1, durationUnit: 'DAY' }), '2026-11-03');
  const today = '2026-11-03';
  const st = (endDate, extra = {}) => utils.subscriptionStatus({ endDate, ...extra }, { today, graceDays: 3 });
  assert.deepEqual(st('2026-11-07'), { status: 'EXPIRE_BIENTOT', daysLeft: 4 });
  assert.equal(st('2026-12-20').status, 'ACTIF');
  assert.equal(st('2026-11-03').status, 'EXPIRE_BIENTOT');
  assert.equal(st('2026-11-01').status, 'GRACE');
  assert.equal(st('2026-10-28').status, 'EXPIRE');
  assert.equal(st('2026-12-20', { frozenFrom: '2026-10-30', frozenUntil: '2026-11-10' }).status, 'GELE');
  assert.equal(utils.subscriptionStatus(null).status, 'AUCUN');
});

// ---------------------------------------------------------------- Carte d'accès
test('carte d’accès : code valide, expiré, modifié, d’un autre membre', () => {
  const now = Date.now();
  const { code } = issuePass(42, now);
  assert.equal(verifyPass(code, now), 42);
  assert.equal(verifyPass(code, now + STEP_SECONDS * 1000), 42); // toléré ~1 min
  assert.equal(verifyPass(code, now + 5 * STEP_SECONDS * 1000), null); // trop ancien
  const [prefix, , step, sig] = code.split('.');
  assert.equal(verifyPass(`${prefix}.43.${step}.${sig}`, now), null); // autre membre, même signature
  const tampered = `${code.slice(0, -1)}${code.endsWith('A') ? 'B' : 'A'}`;
  assert.equal(verifyPass(tampered, now), null);
  assert.equal(verifyPass(`${prefix}.42.${Number(step) + 5}.${sig}`, now), null); // dans le futur
  assert.equal(verifyPass('n’importe quoi'), null);
});

// ---------------------------------------------------------------- Réglages de salle et permissions
test('réglages de salle : clés inconnues ignorées, types vérifiés', () => {
  const s = gymSettings({ settings: { hacker: true, live: { calmThreshold: '30', showCount: 'oui', extra: 1 }, zones: 'Cardio' } });
  assert.equal(s.hacker, undefined);
  assert.equal(s.live.extra, undefined);
  assert.equal(s.live.calmThreshold, 30);
  assert.equal(s.live.showCount, true); // mauvais type → valeur par défaut
  assert.deepEqual(s.zones, DEFAULTS.zones);
  const c = cleanSettings({}, { live: { calmThreshold: -5, autoCheckoutHours: 99 }, rules: { graceDays: 100 }, languages: { default: 'de' } });
  assert.equal(c.live.calmThreshold, 0);
  assert.equal(c.live.autoCheckoutHours, 12);
  assert.equal(c.rules.graceDays, 15);
  assert.equal(c.languages.default, 'fr');
});

test('matrice des rôles', () => {
  assert.equal(can('ACCUEIL', 'members.health'), false);
  assert.equal(can('ACCUEIL', 'plans.write'), false);
  assert.equal(can('ACCUEIL', 'team'), false);
  assert.equal(can('ACCUEIL', 'payments'), true);
  assert.equal(can('TECHNICIEN', 'payments'), false);
  assert.equal(can('TECHNICIEN', 'reports.write'), true);
  assert.equal(can('COACH', 'payments'), false);
  assert.equal(can('COACH', 'members.health'), true);
  assert.equal(can('SPORTIF', 'dashboard'), false);
  assert.ok(permissionsOf('GERANT').includes('audit'));
  assert.equal(can('GERANT', 'inconnue'), false);
});

// ---------------------------------------------------------------- Coach
test('coach : sujet de la question', () => {
  assert.equal(rules.detectTopic('La presse pectorale me fait mal à l’épaule'), 'DOULEUR');
  assert.equal(rules.detectTopic('La machine est occupée, je fais quoi ?'), 'REMPLACER');
  assert.equal(rules.detectTopic('Combien de protéines par jour ?'), 'NUTRITION');
  assert.equal(rules.detectTopic('Je peux changer mon programme ?'), 'PROGRAMME');
  assert.equal(rules.detectTopic('Je suis fatigué aujourd’hui'), 'MOTIVATION');
  assert.equal(rules.detectTopic('Bonjour'), 'AUTRE');
  assert.equal(rules.detectTopic('3andi wja3 fi rkobti'), 'DOULEUR');
  assert.equal(rules.detectTopic('my knee hurts'), 'DOULEUR');
});

test('coach : zones douloureuses, durée, exercice cité', () => {
  assert.deepEqual(rules.detectPainZones('La presse pectorale me fait mal à l’épaule gauche'), ['epaule']);
  assert.deepEqual(rules.detectPainZones('mal au haut du dos'), ['haut_dos']);
  assert.deepEqual(rules.detectPainZones('عندي وجع في الكتف'), ['epaule']);
  assert.deepEqual(rules.detectPainZones('J’adore le couscous'), []); // pas de douleur, pas de « cou »
  assert.deepEqual(rules.detectPainZones('le genou'), []); // zone sans douleur
  assert.equal(rules.painDurationDays('mal au dos depuis 4 jours'), 4);
  assert.equal(rules.painDurationDays('depuis une semaine'), 7);
  assert.equal(rules.painDurationDays('mal au dos'), null);
  const list = [
    { id: 1, nameFr: 'Presse pectorale assise', nameEn: 'Seated chest press' },
    { id: 2, nameFr: 'Presse à cuisses', nameEn: 'Leg press' },
    { id: 3, nameFr: 'Développé couché à la barre', nameEn: 'Barbell bench press' },
  ];
  assert.equal(rules.matchExercise('La presse pectorale me fait mal', list).id, 1);
  assert.equal(rules.matchExercise('the leg press is busy', list).id, 2);
  assert.equal(rules.matchExercise('le développé couché me fait mal', list).id, 3);
  assert.equal(rules.matchExercise('la presse est occupée', list), null); // ambigu : aucune proposition
  assert.equal(rules.refersToCurrentMachine('elle est occupée'), true);
  assert.equal(rules.replyLanguage('my shoulder hurts what should I do', 'fr'), 'en');
  assert.equal(rules.replyLanguage('عندي وجيعة', 'fr'), 'ar');
  assert.equal(rules.replyLanguage('عندي وجيعة', 'fr', { fr: true, derja: false, en: true }), 'fr');
});

// ---------------------------------------------------------------- Affluence
test('affluence : niveau, comparaison, créneau calme', () => {
  assert.equal(levelFor(10, { calmThreshold: 25, capacity: 120 }), 'CALME');
  assert.equal(levelFor(42, { calmThreshold: 25, capacity: 120 }), 'FREQUENTEE');
  assert.equal(levelFor(96, { calmThreshold: 25, capacity: 120 }), 'PLEINE');
  assert.deepEqual(compareToUsual(42, 51), { usual: 51, diff: -9, trend: 'CALMER' });
  assert.equal(compareToUsual(50, 51).trend, 'USUAL');
  const values = [];
  for (let h = 6; h <= 23; h += 1) values.push({ hour: h, value: h >= 14 && h < 16 ? 5 : 40 });
  assert.deepEqual(calmWindow(values, { afterHour: 11, opening: { openMin: 360, closeMin: 1380 } }), { from: '14:00', to: '16:00' });
  // une personne entrée à 18:10 et sortie à 19:40 compte à 18:30 et 19:30
  const m = presenceMatrix([{ checkInAt: new Date('2026-11-02T18:10:00'), checkOutAt: new Date('2026-11-02T19:40:00') }], { from: '2026-11-02', to: '2026-11-03', autoCheckoutHours: 3 });
  assert.equal(m[0][18], 1);
  assert.equal(m[0][19], 1);
  assert.equal(m[0][20], 0);
});

// ---------------------------------------------------------------- Calendrier, série, charge conseillée
test('semaine du programme et série', () => {
  const program = { startedAt: '2026-10-19', weeks: 8, days: [1, 2, 3, 4].map((i) => ({ dayIndex: i, labelFr: `J${i}` })) };
  assert.equal(schedule.programWeek(program, '2026-11-03'), 3);
  const week = schedule.scheduleWeek({ trainingDays: [0, 1, 3, 5], program, doneSessions: [{ date: '2026-11-02', dayIndex: 1 }], today: '2026-11-03' });
  assert.deepEqual(week.map((d) => d.status), ['DONE', 'TODAY', 'REST', 'PLANNED', 'REST', 'PLANNED', 'REST']);
  assert.deepEqual(week.filter((d) => d.dayIndex).map((d) => d.dayIndex), [1, 2, 3, 4]);
  assert.equal(schedule.exerciseCountFor(30), 4);
  assert.equal(schedule.exerciseCountFor(90), 7);
  const streak = schedule.streakDays({ trainingDays: [0, 1, 3, 5], activeDates: ['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-31', '2026-11-02'], today: '2026-11-03' });
  assert.equal(streak, 5);
  assert.equal(schedule.suggestWeight([], { targetSets: 3, targetReps: '10' }), null);
  const done = { setsDone: [{ reps: 10, weight: 50 }, { reps: 10, weight: 50 }, { reps: 10, weight: 50 }] };
  assert.equal(schedule.suggestWeight([done, done], { targetSets: 3, targetReps: '10' }), 52.5);
  assert.equal(schedule.suggestWeight([done, { setsDone: [{ reps: 6, weight: 50 }] }], { targetSets: 3, targetReps: '10' }), 50);
});

// ---------------------------------------------------------------- Accès à l'accueil
test('décision d’accès au scan', () => {
  const member = { active: true, accessActive: true };
  const now = new Date('2026-11-03T10:00:00');
  const sub = (endDate, extra = {}) => ({ startDate: '2026-10-08', endDate, plan: { accessHours: 'ALL' }, ...extra });
  assert.deepEqual(accessDecision({ member, sub: sub('2026-11-07'), graceDays: 3, now }), { result: 'GRANTED', reason: null });
  assert.equal(accessDecision({ member, sub: sub('2026-11-01'), graceDays: 3, now }).result, 'GRANTED_GRACE');
  assert.deepEqual(accessDecision({ member, sub: sub('2026-10-28'), graceDays: 3, now }), { result: 'REFUSED', reason: 'EXPIRE' });
  assert.equal(accessDecision({ member, sub: null, graceDays: 3, now }).reason, 'AUCUN');
  assert.equal(accessDecision({ member: { ...member, active: false }, sub: sub('2026-12-01'), graceDays: 3, now }).reason, 'DESACTIVE');
  assert.equal(accessDecision({ member, sub: sub('2026-12-01', { frozenFrom: '2026-11-01', frozenUntil: '2026-11-10' }), graceDays: 3, now }).reason, 'GELE');
  const evening = new Date('2026-11-03T18:00:00');
  assert.equal(accessDecision({ member, sub: sub('2026-12-01', { plan: { accessHours: 'OFF_PEAK' } }), graceDays: 3, now: evening }).reason, 'HORS_HORAIRES');
});

// ---------------------------------------------------------------- Profil et préférences
test('profil : bornes de l’onboarding', () => {
  const year = new Date().getFullYear();
  assert.deepEqual(cleanProfile({ trainingDays: [5, 0, 3, 1, 1] }).trainingDays, [0, 1, 3, 5]);
  assert.throws(() => cleanProfile({ height: 99 }), /height/);
  assert.throws(() => cleanProfile({ weight: 301 }), /weight/);
  assert.throws(() => cleanProfile({ birthYear: year - 11 }), /birthYear/);
  assert.throws(() => cleanProfile({ injuries: ['genou', 'tete'] }), /injuries/);
  assert.throws(() => cleanProfile({ sessionMinutes: 50 }), /sessionMinutes/);
  assert.throws(() => cleanProfile({ healthConsent: 'yes' }), /healthConsent/);
  assert.deepEqual(cleanProfile({ injuries: ['cou', 'hanche', 'cou'] }).injuries, ['cou', 'hanche']);
});

test('préférences : clés connues seulement', () => {
  const p = cleanPrefs({ evil: 1 }, { calmAlert: true, waterTargetMl: 3420, notifications: { gym: false, hack: true }, other: 'x' });
  assert.equal(p.evil, undefined);
  assert.equal(p.other, undefined);
  assert.equal(p.notifications.hack, undefined);
  assert.equal(p.notifications.gym, false);
  assert.equal(p.waterTargetMl, 3400);
  assert.throws(() => cleanPrefs({}, { waterReminders: { quietFrom: '25:00' } }), /quietFrom/);
});

// ---------------------------------------------------------------- Export CSV
test('CSV : protection contre les formules', () => {
  assert.equal(csvCell('=HYPERLINK("http://x")'), '"\'=HYPERLINK(""http://x"")"');
  assert.equal(csvCell('+21622345678'), "'+21622345678");
  assert.equal(csvCell('-2'), "'-2");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('Ben Salah; Amine'), '"Ben Salah; Amine"');
  assert.equal(csvCell(null), '');
  const csv = toCsv([{ a: '=1+1', b: 'ok' }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]);
  assert.ok(csv.startsWith('﻿A;B\r\n'));
  assert.ok(csv.includes("'=1+1;ok"));
});
