// Tests des algorithmes (sans base de données) : npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const equipmentList = require('../src/seed/equipment');
const exerciseList = require('../src/seed/exercises');
const { findAlternatives } = require('../src/services/substitution');
const { generateProgram } = require('../src/services/programGenerator');
const { fallbackReply } = require('../src/services/coachFallback');
const { validateAIProgram } = require('../src/services/coach');
const { MUSCLES, PATTERNS, INJURY_ZONES } = require('../src/services/constants');

const categories = Object.fromEntries(equipmentList.map(([code, , , cat]) => [code, cat]));
const catalog = exerciseList.map((e, i) => ({
  id: i + 1,
  nameFr: e.nameFr,
  primaryMuscle: e.primaryMuscle,
  secondaryMuscles: e.secondaryMuscles,
  pattern: e.pattern,
  equipmentCode: e.equipment,
  equipmentCategory: categories[e.equipment],
  accessories: e.accessories,
  difficulty: e.difficulty,
  injuryZones: e.injuryZones,
}));
const byName = (name) => catalog.find((c) => c.nameFr === name);

// Salle de démo (sans Smith machine ni machine épaules, leg curl en panne)
const demoGym = ['barre', 'halteres', 'kettlebell', 'elastique', 'banc', 'banc_couche', 'cage_squat', 'presse_cuisses', 'leg_extension',
  'poulie', 'tirage_vertical', 'tirage_horizontal', 'machine_pec', 'barre_traction', 'barres_paralleles', 'mollets'];

test('données de départ cohérentes', () => {
  const codes = new Set(equipmentList.map((e) => e[0]));
  for (const e of exerciseList) {
    assert.ok(MUSCLES[e.primaryMuscle], `muscle ${e.primaryMuscle}`);
    e.secondaryMuscles.forEach((m) => assert.ok(MUSCLES[m], `muscle secondaire ${m} (${e.nameFr})`));
    assert.ok(PATTERNS[e.pattern], `mouvement ${e.pattern}`);
    assert.ok(codes.has(e.equipment), `équipement ${e.equipment}`);
    e.accessories.forEach((a) => assert.ok(codes.has(a), `accessoire ${a}`));
    e.injuryZones.forEach((z) => assert.ok(INJURY_ZONES[z], `zone ${z}`));
    assert.equal(e.benefitsFr.length, 3, `3 bénéfices FR : ${e.nameFr}`);
    assert.equal(e.benefitsAr.length, 3, `3 bénéfices AR : ${e.nameFr}`);
    assert.equal(e.mistakesFr.length, 2, `2 erreurs FR : ${e.nameFr}`);
    assert.equal(e.mistakesAr.length, 2, `2 erreurs AR : ${e.nameFr}`);
  }
  assert.ok(exerciseList.length >= 50);
});

test('presse à cuisses occupée : 3 exercices pour les quadriceps, sans la presse', () => {
  const original = byName('Presse à cuisses');
  const res = findAlternatives({ original, catalog, availableEquipment: demoGym, level: 'INTERMEDIAIRE' });
  assert.equal(res.length, 3);
  for (const r of res) {
    assert.equal(r.exercise.primaryMuscle, 'quadriceps');
    assert.notEqual(r.exercise.equipmentCode, 'presse_cuisses');
  }
  assert.equal(res[0].exercise.nameFr, 'Squat à la barre'); // même mouvement + mêmes muscles secondaires
  assert.ok(!res.some((r) => r.exercise.equipmentCode === 'smith'), 'pas de Smith dans cette salle');
});

test('les blessures sont respectées (RG5)', () => {
  const original = byName('Développé couché à la barre');
  const res = findAlternatives({ original, catalog, availableEquipment: demoGym, level: 'INTERMEDIAIRE', injuries: ['epaule'] });
  for (const r of res) assert.ok(!r.exercise.injuryZones.includes('epaule'), r.exercise.nameFr);
  assert.ok(res.length >= 1);
  assert.equal(res[0].exercise.nameFr, 'Pompes');
});

test('salle sans matériel : uniquement des exercices au poids du corps', () => {
  const original = byName('Développé couché à la barre');
  const res = findAlternatives({ original, catalog, availableEquipment: [], level: 'DEBUTANT' });
  assert.ok(res.length >= 1);
  for (const r of res) assert.equal(r.exercise.equipmentCode, 'poids_du_corps');
});

test('débutant : pas d’exercice de difficulté 3', () => {
  const original = byName('Tirage vertical à la machine');
  const res = findAlternatives({ original, catalog, availableEquipment: demoGym, level: 'DEBUTANT', limit: 20 });
  assert.ok(res.every((r) => r.exercise.difficulty <= 2));
  assert.ok(!res.some((r) => r.exercise.nameFr === 'Tractions'));
});

test('conseil de charge quand on passe d’une machine aux haltères', () => {
  const original = byName('Machine pectoraux (butterfly)');
  const res = findAlternatives({ original, catalog, availableEquipment: demoGym, level: 'INTERMEDIAIRE', limit: 10 });
  const db = res.find((r) => r.exercise.equipmentCode === 'halteres');
  assert.ok(db);
  assert.equal(db.advice, 'START_LIGHTER');
});

test('programme par règles : bon nombre de jours, exercices faisables, sans doublon', () => {
  for (const days of [2, 3, 4, 5, 6]) {
    for (const level of ['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE']) {
      const p = generateProgram({
        profile: { goal: 'PRISE_MASSE', level, daysPerWeek: days, injuries: ['genou'] },
        catalog,
        availableEquipment: demoGym,
      });
      assert.equal(p.days.length, days);
      for (const d of p.days) {
        assert.ok(d.items.length >= 4, `${days} jours, ${level}, ${d.labelFr} : ${d.items.length} exercices`);
        const ids = d.items.map((i) => i.exerciseId);
        assert.equal(new Set(ids).size, ids.length, 'pas de doublon dans la journée');
        for (const it of d.items) {
          const ex = catalog.find((c) => c.id === it.exerciseId);
          assert.ok(!ex.injuryZones.includes('genou'), `${ex.nameFr} sollicite le genou`);
          assert.ok([ex.equipmentCode, ...ex.accessories].every((c) => c === 'poids_du_corps' || demoGym.includes(c)));
        }
      }
    }
  }
});

test('programme débutant : une série de moins', () => {
  const p = generateProgram({ profile: { goal: 'PRISE_MASSE', level: 'DEBUTANT', daysPerWeek: 3 }, catalog, availableEquipment: demoGym });
  assert.equal(p.days[0].items[0].sets, 3);
  assert.equal(p.days[0].items[0].reps, '8-12');
});

test('jours répétés : exercices variés entre les deux "Haut du corps"', () => {
  const p = generateProgram({ profile: { goal: 'FORME', level: 'INTERMEDIAIRE', daysPerWeek: 4 }, catalog, availableEquipment: demoGym });
  const a = p.days[0].items.map((i) => i.exerciseId).join();
  const b = p.days[2].items.map((i) => i.exerciseId).join();
  assert.notEqual(a, b);
});

test('réponse IA invalide rejetée, réponse valide acceptée', () => {
  const allowed = new Set([1, 2, 3, 4]);
  assert.equal(validateAIProgram('pas du json', allowed, 1), null);
  assert.equal(validateAIProgram(JSON.stringify({ days: [{ items: [{ exerciseId: 99 }, { exerciseId: 1 }, { exerciseId: 2 }] }] }), allowed, 1), null);
  const ok = validateAIProgram(
    JSON.stringify({ title: 'Test', days: [{ labelFr: 'Jour 1', labelAr: 'اليوم 1', items: [{ exerciseId: 1, sets: 3, reps: '10', restSec: 60 }, { exerciseId: 2 }, { exerciseId: 3, sets: 50 }] }] }),
    allowed,
    1
  );
  assert.equal(ok.days[0].items.length, 3);
  assert.equal(ok.days[0].items[2].sets, 6); // borné
});

test('coach en mode simple : comprend le français, l’arabe et la derja', () => {
  assert.match(fallbackReply('la machine est occupée', 'fr'), /Occupée/);
  assert.match(fallbackReply('شنوة نأكل بعد الحصة؟ بروتين', 'ar'), /البروتين/);
  assert.match(fallbackReply('3andi wja3 fi rkobti', 'fr'), /médecin/);
  assert.match(fallbackReply('bonjour', 'fr'), /coach FitCoach/);
});
