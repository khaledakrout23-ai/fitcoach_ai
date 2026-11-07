// Test d'intégration de l'API (base MySQL/MariaDB réelle). Ignoré sauf avec KAMMEL_API_TEST=1.
// Refuse de tourner si DB_NAME ne se termine pas par « _test » (la base est entièrement recréée).
//   DB_NAME=kammel_be_test KAMMEL_API_TEST=1 npm run test:api
const test = require('node:test');
const assert = require('node:assert/strict');

const RUN = process.env.KAMMEL_API_TEST === '1';

test('API Kammel (intégration)', { skip: RUN ? false : 'définir KAMMEL_API_TEST=1 et DB_NAME=..._test' }, async (t) => {
  if (!/_test$/.test(process.env.DB_NAME || '')) throw new Error('DB_NAME doit se terminer par _test : cette base est supprimée puis recréée.');
  process.env.TRUST_PROXY = '1'; // une adresse IP par client de test (X-Forwarded-For), pour ne pas déclencher les limites de débit
  process.env.GEMINI_API_KEY = ''; // pas d'appel réseau à l'IA
  process.env.NODE_ENV = 'test';

  const models = require('../src/models');
  const { seed, DEMO_PASSWORD, YOUSSEF_TEMP_PASSWORD } = require('../src/seed/seed');
  await models.sequelize.sync({ force: true });
  const data = await seed();
  const app = require('../src/app');
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.close();
    await models.sequelize.close();
  });

  let ipCounter = 10;
  // client HTTP avec un petit pot à cookies
  function client() {
    const jar = new Map();
    const ip = `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter += 1) % 250}`;
    return {
      jar,
      async req(method, path, body, { csrf = true, headers = {} } = {}) {
        const h = { 'X-Forwarded-For': ip, ...headers };
        if (jar.size) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
        if (body !== undefined) h['Content-Type'] = 'application/json';
        if (csrf && method !== 'GET') h['X-Requested-With'] = 'kammel';
        const res = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
        for (const c of res.headers.getSetCookie()) {
          const [pair] = c.split(';');
          const i = pair.indexOf('=');
          const name = pair.slice(0, i);
          const value = pair.slice(i + 1);
          if (/Max-Age=0/i.test(c) || !value) jar.delete(name);
          else jar.set(name, value);
        }
        const type = res.headers.get('content-type') || '';
        const out = { status: res.status, headers: res.headers };
        if (type.includes('application/json')) out.body = await res.json();
        else if (type.startsWith('image/')) out.buffer = Buffer.from(await res.arrayBuffer());
        else out.text = await res.text();
        return out;
      },
      get(path) { return this.req('GET', path); },
      post(path, body = {}) { return this.req('POST', path, body); },
      put(path, body = {}) { return this.req('PUT', path, body); },
    };
  }
  async function login(identifier, password = DEMO_PASSWORD) {
    const c = client();
    const res = await c.post('/api/auth/login', { identifier, password });
    assert.equal(res.status, 200, `connexion ${identifier} : ${JSON.stringify(res.body)}`);
    c.me = res.body;
    return c;
  }

  const { User, Machine, Report, Plan, Gym } = models;
  const userByPhone = (phone) => User.findOne({ where: { phone } });
  const lac = await Gym.findByPk(data.gyms.lac);
  const amineUser = await userByPhone('+21622345678');

  await t.test('connexion par téléphone et par e-mail, erreurs génériques', async () => {
    const a = await login('22 345 678');
    assert.equal(a.me.role, 'SPORTIF');
    assert.equal(a.me.passwordHash, undefined);
    assert.ok(a.jar.has('kammel_session'));
    const s = await login('SAMI@kammelgym.tn');
    assert.equal(s.me.role, 'GERANT');
    assert.ok(s.me.permissions.includes('team'));
    const wrong = await client().post('/api/auth/login', { identifier: '+21622345678', password: 'Mauvais2026' });
    const unknown = await client().post('/api/auth/login', { identifier: '+21699999999', password: 'Mauvais2026' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(wrong.body, unknown.body);
    assert.equal(wrong.body.code, 'BAD_CREDENTIALS');
  });

  await t.test('compte bloqué après 5 échecs', async () => {
    const c = client();
    for (let i = 0; i < 5; i += 1) assert.equal((await c.post('/api/auth/login', { identifier: '20111222', password: `Faux${i}2026` })).status, 401);
    const locked = await c.post('/api/auth/login', { identifier: '20111222', password: DEMO_PASSWORD });
    assert.equal(locked.status, 429);
    assert.equal(locked.body.code, 'ACCOUNT_LOCKED');
  });

  await t.test('en-tête anti-CSRF obligatoire sur les écritures', async () => {
    const a = await login('22345678');
    const res = await a.req('PUT', '/api/me/prefs', { calmAlert: true }, { csrf: false });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'CSRF');
    assert.equal((await a.put('/api/me/prefs', { calmAlert: true })).status, 200);
  });

  await t.test('mot de passe provisoire : tout est bloqué avant le premier mot de passe', async () => {
    const y = await login('+216 24 117 590', YOUSSEF_TEMP_PASSWORD);
    assert.equal(y.me.mustChangePassword, true);
    const blocked = await y.get('/api/me/profile');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED');
    const same = await y.post('/api/auth/first-password', { currentPassword: YOUSSEF_TEMP_PASSWORD, newPassword: YOUSSEF_TEMP_PASSWORD });
    assert.equal(same.status, 400);
    const ok = await y.post('/api/auth/first-password', { currentPassword: YOUSSEF_TEMP_PASSWORD, newPassword: 'Youssef2026ok' });
    assert.equal(ok.status, 200);
    assert.equal((await y.get('/api/me/profile')).status, 200);
  });

  await t.test('rôles : membre, accueil, technicien, coach', async () => {
    const a = await login('22345678');
    assert.equal((await a.get('/api/staff/dashboard')).status, 403);
    assert.equal((await a.get('/api/staff/members')).status, 403);
    const leila = await login('leila@kammelgym.tn');
    const plan = await leila.post('/api/staff/plans', { nameFr: 'Test', nameAr: 'تجربة', duration: 1, durationUnit: 'MONTH', price: 50 });
    assert.equal(plan.status, 403);
    const detail = await leila.get(`/api/staff/members/${amineUser.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.profile, undefined, 'pas de données de santé pour l’accueil');
    assert.ok(Array.isArray(detail.body.payments));
    assert.equal(JSON.stringify(detail.body).includes('"weight"'), false);
    const coach = await login('hichem@kammelgym.tn');
    const coachView = await coach.get(`/api/staff/members/${amineUser.id}`);
    assert.equal(coachView.body.profile.weight, 85);
    assert.equal(coachView.body.payments, undefined);
    const walid = await login('walid@kammelgym.tn');
    assert.equal((await walid.get('/api/staff/payments')).status, 403);
    assert.equal((await walid.get('/api/staff/reports')).status, 200);
    const nav = await walid.get('/api/staff/nav-counts');
    assert.equal(nav.body.expiringSoon, undefined);
    assert.equal(typeof nav.body.openReports, 'number');
    const dash = await walid.get('/api/staff/dashboard');
    assert.equal(dash.status, 200);
    assert.equal(dash.body.revenue, undefined);
    assert.equal(dash.body.lastEntries, undefined);
  });

  await t.test('isolement des salles : aucune donnée d’une autre salle', async () => {
    const nizar = await login('nizar@kammelgym.tn');
    const lacMachine = await Machine.findOne({ where: { gymId: lac.id } });
    const lacReport = await Report.findOne({ where: { gymId: lac.id } });
    assert.equal((await nizar.get(`/api/staff/members/${amineUser.id}`)).status, 404);
    assert.equal((await nizar.put(`/api/staff/machines/${lacMachine.id}`, { label: 'Piraté' })).status, 404);
    assert.equal((await nizar.get(`/api/staff/reports/${lacReport.id}`)).status, 404);
    assert.equal((await nizar.put(`/api/staff/reports/${lacReport.id}`, { status: 'REPAREE' })).status, 404);
    assert.equal((await nizar.post(`/api/staff/members/${amineUser.id}/reset-password`)).status, 404);
    const list = await nizar.get('/api/staff/members?pageSize=100');
    assert.ok(list.body.items.every((m) => m.id !== amineUser.id));
    const sami = await login('sami@kammelgym.tn');
    const ennasrReport = await Report.findOne({ where: { gymId: data.gyms.ennasr } });
    assert.equal((await sami.get(`/api/staff/reports/${ennasrReport.id}/photo`)).status, 404);
    // carte d'accès d'un membre de Lac 2 scannée à Ennasr : refusée sans information
    const a = await login('22345678');
    const pass = await a.get('/api/me/access-pass');
    const scan = await nizar.post('/api/staff/checkins', { code: pass.body.code });
    assert.equal(scan.body.result, 'REFUSED');
    assert.equal(scan.body.reason, 'CODE_INVALIDE');
    assert.equal(scan.body.member, null);
  });

  await t.test('photo de panne : seulement pour son auteur', async () => {
    const report = await Report.findOne({ where: { userId: amineUser.id, photoType: 'image/png' } });
    const a = await login('22345678');
    const own = await a.get(`/api/me/reports/${report.id}/photo`);
    assert.equal(own.status, 200);
    assert.equal(own.headers.get('content-type'), 'image/png');
    const y = await login('55120447');
    assert.equal((await y.get(`/api/me/reports/${report.id}/photo`)).status, 404);
  });

  await t.test('compte désactivé : la session ouverte est refusée', async () => {
    const rim = await login('29640018');
    assert.equal((await rim.get('/api/me/profile')).status, 200);
    const rimUser = await userByPhone('+21629640018');
    const sami = await login('sami@kammelgym.tn');
    assert.equal((await sami.post(`/api/staff/members/${rimUser.id}/deactivate`)).status, 200);
    const after = await rim.get('/api/me/profile');
    assert.equal(after.status, 401);
    assert.equal(after.body.code, 'AUTH_INVALID');
    await sami.post(`/api/staff/members/${rimUser.id}/reactivate`);
  });

  await t.test('changement de mot de passe : les autres sessions sont coupées', async () => {
    const first = await login('98761302');
    const second = await login('98761302');
    const change = await first.put('/api/me/password', { currentPassword: DEMO_PASSWORD, newPassword: 'Mehdi2026nouveau' });
    assert.equal(change.status, 200);
    assert.equal((await second.get('/api/me/profile')).status, 401);
    assert.equal((await first.get('/api/me/profile')).status, 200);
    // l'équipe aussi peut changer son mot de passe et sa langue
    const walid = await login('walid@kammelgym.tn');
    assert.equal((await walid.put('/api/me/profile', { language: 'ar', theme: 'light', weight: 80 })).body.language, 'ar');
    assert.equal((await walid.put('/api/me/password', { currentPassword: DEMO_PASSWORD, newPassword: 'Walid2026tech' })).status, 200);
  });

  await t.test('scan à l’accueil : valide, expiré, falsifié', async () => {
    const leila = await login('leila@kammelgym.tn');
    const a = await login('22345678');
    const pass = (await a.get('/api/me/access-pass')).body;
    assert.match(pass.code, /^K1\.\d+\.\d+\.[\w-]{16}$/);
    const granted = await leila.post('/api/staff/checkins', { code: pass.code });
    assert.ok([200, 201].includes(granted.status));
    assert.equal(granted.body.result, 'GRANTED');
    assert.equal(granted.body.member.name, 'Amine Ben Salah');
    const again = await leila.post('/api/staff/checkins', { code: pass.code });
    assert.equal(again.body.duplicate, true);
    const salma = await login('23908115');
    const salmaPass = (await salma.get('/api/me/access-pass')).body;
    assert.equal(salmaPass.status, 'EXPIRE');
    const refused = await leila.post('/api/staff/checkins', { code: salmaPass.code });
    assert.equal(refused.body.result, 'REFUSED');
    assert.equal(refused.body.reason, 'EXPIRE');
    const forged = pass.code.replace(/\.(\d+)\./, (m, id) => `.${Number(id) + 1}.`);
    const bad = await leila.post('/api/staff/checkins', { code: forged });
    assert.equal(bad.body.result, 'REFUSED');
    assert.equal(bad.body.reason, 'CODE_INVALIDE');
  });

  await t.test('nouveau membre : mot de passe provisoire donné une fois, seul le hash est stocké', async () => {
    const leila = await login('leila@kammelgym.tn');
    const mensuel = await Plan.findOne({ where: { gymId: lac.id, nameFr: 'Mensuel' } });
    const created = await leila.post('/api/staff/members', { firstName: '=HYPERLINK("x")', lastName: 'Test', phone: '26 000 111', planId: mensuel.id, paymentMethod: 'ESPECES' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const temp = created.body.temporaryPassword;
    assert.match(temp, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    assert.equal(created.body.total, 110); // 90 + 20 de frais d'inscription
    const stored = await User.scope('withPassword').findByPk(created.body.member.id);
    assert.ok(stored.passwordHash.startsWith('$2'));
    assert.notEqual(stored.passwordHash, temp);
    assert.equal(stored.mustChangePassword, true);
    const detail = await leila.get(`/api/staff/members/${created.body.member.id}`);
    assert.equal(JSON.stringify(detail.body).includes(temp), false);
    const dup = await leila.post('/api/staff/members', { firstName: 'Autre', lastName: 'Test', phone: '+21626000111', planId: mensuel.id, paymentMethod: 'ESPECES' });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.code, 'PHONE_TAKEN');
    const newcomer = await login('26000111', temp);
    assert.equal(newcomer.me.mustChangePassword, true);
    // export CSV : cellules protégées
    const csv = await leila.get('/api/staff/members/export.csv');
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-disposition'), /^attachment; filename="membres-/);
    assert.ok(csv.text.includes(`"'=HYPERLINK(""x"") Test"`));
    assert.ok(csv.text.includes("'+21626000111"));
    assert.ok(!/[;\n]=/.test(csv.text));
  });

  await t.test('parcours membre : programme, séance, coach, repas, salle en direct', async () => {
    const a = await login('22345678');
    const program = await a.get('/api/programs/current');
    assert.equal(program.body.week, 3);
    assert.equal(program.body.sessionsTotal, 32);
    assert.equal(program.body.schedule.length, 7);
    const today = await a.get('/api/programs/today');
    assert.ok(today.body.items.length >= 3);
    const live = await a.get('/api/gym/live');
    assert.equal(live.status, 200);
    assert.equal(live.body.hourlyToday.length, 18);
    assert.equal(JSON.stringify(live.body).includes('Amine'), false);
    const day = await a.get('/api/nutrition/day');
    assert.equal(day.body.target.calories, 1647);
    const water = await a.post('/api/nutrition/water', { ml: 250 });
    assert.equal(water.status, 201);
    assert.equal((await a.req('DELETE', `/api/nutrition/water/${water.body.id}`)).status, 200);
    const session = await a.post('/api/sessions', { quick30: true });
    assert.equal(session.status, 201);
    assert.equal(session.body.entries.length, 3);
    const entry = session.body.entries[0];
    const put = await a.put(`/api/sessions/${session.body.id}/entries/${entry.id}`, { setsDone: [{ reps: 10, weight: 500 }, { reps: 10, weight: 600 }] });
    assert.equal(put.status, 400); // charge hors bornes
    const alt = await a.get(`/api/sessions/${session.body.id}/entries/${entry.id}/alternatives?reason=OCCUPEE`);
    assert.equal(alt.status, 200);
    const forbidden = await a.post(`/api/sessions/${session.body.id}/entries/${entry.id}/substitute`, { exerciseId: entry.exercise.id, reason: 'OCCUPEE' });
    assert.equal(forbidden.status, 400);
    const finish = await a.post(`/api/sessions/${session.body.id}/finish`);
    assert.equal(finish.status, 200);
    assert.equal(typeof finish.body.stats.kcal, 'number');
    const msg = await a.post('/api/coach/messages', { content: 'J’ai mal au dos depuis 5 jours' });
    assert.equal(msg.status, 201);
    assert.ok(msg.body.answers.length >= 1);
    const pending = (await a.get('/api/coach/messages')).body.messages.find((m) => m.proposal && m.proposal.type === 'ADD_PAIN' && m.proposalState === 'PENDING');
    const applied = await a.post(`/api/coach/messages/${pending.id}/proposal`, { action: 'APPLY' });
    assert.equal(applied.status, 200);
    assert.ok(applied.body.applied.injuries.length >= 2);
    assert.equal((await a.put('/api/me/profile', { gymId: data.gyms.ennasr })).status, 403);
  });
});
