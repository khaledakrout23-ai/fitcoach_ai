// Calendrier du membre : semaine du programme, jours d'entraînement, série, charge conseillée.
// Fonctions pures (aucune base de données), testées dans test/.
const { localDate, addDays, daysBetween } = require('../utils');

// Début d'une journée locale (minuit)
const dayStart = (date) => new Date(`${date}T00:00:00`);

// 0 = lundi … 6 = dimanche
const weekdayOf = (date) => (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
const mondayOf = (date) => addDays(date, -weekdayOf(date));

// Durée de séance → nombre d'exercices (30 min : 4 au plus, 45 : 5, 60 : 6, 90 : 7)
const EXERCISES_BY_MINUTES = { 30: 4, 45: 5, 60: 6, 90: 7 };
function exerciseCountFor(minutes) {
  return EXERCISES_BY_MINUTES[minutes] || 6;
}

/** Semaine en cours du programme (1 = semaine du démarrage), bornée à [1, weeks] */
function programWeek(program, today = localDate()) {
  const start = mondayOf(program.startedAt || localDate(new Date(program.createdAt || Date.now())));
  const week = Math.floor(daysBetween(start, mondayOf(today)) / 7) + 1;
  return Math.min(Math.max(1, week), program.weeks || 8);
}

/**
 * Jour du programme prévu pour le n-ième créneau d'entraînement de la semaine.
 * Les jours tournent d'une semaine à l'autre quand le programme a plus de jours que le membre.
 */
function dayIndexFor({ week, slot, slotsPerWeek, programDays }) {
  if (!programDays) return null;
  return (((week - 1) * slotsPerWeek + slot) % programDays) + 1;
}

/**
 * Semaine du membre : un élément par jour (lundi → dimanche).
 * @param {object} p
 * @param {number[]} p.trainingDays  jours d'entraînement (0 = lundi)
 * @param {{ weeks, startedAt, days: {dayIndex, labelFr, labelAr}[] }} p.program
 * @param {{ date: string, dayIndex: number }[]} p.doneSessions séances terminées (date locale)
 * @param {string} p.today
 * @returns {{ weekday, date, dayIndex, labelFr, labelAr, status: 'DONE'|'TODAY'|'PLANNED'|'MISSED'|'REST' }[]}
 */
function scheduleWeek({ trainingDays, program, doneSessions = [], today = localDate() }) {
  const days = [...new Set(trainingDays || [])].sort((a, b) => a - b);
  const monday = mondayOf(today);
  const week = programWeek(program, today);
  const doneByDate = new Map();
  for (const s of doneSessions) if (!doneByDate.has(s.date)) doneByDate.set(s.date, s);
  const label = (dayIndex) => program.days.find((d) => d.dayIndex === dayIndex) || {};
  const out = [];
  for (let wd = 0; wd < 7; wd += 1) {
    const date = addDays(monday, wd);
    const slot = days.indexOf(wd);
    const done = doneByDate.get(date);
    let dayIndex = slot >= 0 ? dayIndexFor({ week, slot, slotsPerWeek: days.length, programDays: program.days.length }) : null;
    let status;
    if (done) {
      status = 'DONE';
      dayIndex = done.dayIndex || dayIndex;
    } else if (slot < 0) status = 'REST';
    else if (date === today) status = 'TODAY';
    else if (date < today) status = 'MISSED';
    else status = 'PLANNED';
    const l = dayIndex ? label(dayIndex) : {};
    out.push({ weekday: wd, date, dayIndex, labelFr: l.labelFr || null, labelAr: l.labelAr || null, status });
  }
  return out;
}

/**
 * Prochaine séance prévue : aujourd'hui si c'est un jour d'entraînement pas encore fait, sinon le prochain jour prévu.
 * @returns {{ date, weekday, dayIndex, isToday } | null}
 */
function nextPlanned({ trainingDays, program, doneSessions = [], today = localDate() }) {
  const days = [...new Set(trainingDays || [])].sort((a, b) => a - b);
  if (!days.length || !program.days.length) return null;
  const doneDates = new Set(doneSessions.map((s) => s.date));
  for (let i = 0; i < 14; i += 1) {
    const date = addDays(today, i);
    const wd = weekdayOf(date);
    const slot = days.indexOf(wd);
    if (slot < 0 || doneDates.has(date)) continue;
    const week = programWeek(program, date);
    return { date, weekday: wd, dayIndex: dayIndexFor({ week, slot, slotsPerWeek: days.length, programDays: program.days.length }), isToday: i === 0 };
  }
  return null;
}

/**
 * Série en cours : nombre de jours d'entraînement prévus réalisés d'affilée (une séance ou un passage en salle).
 * Le jour même ne casse pas la série s'il n'est pas encore fait. Sans jours prévus : jours actifs consécutifs.
 */
function streakDays({ trainingDays, activeDates, today = localDate(), maxDays = 365 }) {
  const active = activeDates instanceof Set ? activeDates : new Set(activeDates);
  const planned = new Set(trainingDays || []);
  let streak = 0;
  for (let i = 0; i < maxDays; i += 1) {
    const date = addDays(today, -i);
    const isPlanned = planned.size ? planned.has(weekdayOf(date)) : true;
    if (active.has(date)) {
      streak += 1;
      continue;
    }
    if (!isPlanned) continue; // jour de repos : ne casse pas la série
    if (i === 0) continue; // aujourd'hui pas encore fait
    break;
  }
  return streak;
}

// Plus petite valeur d'une plage de répétitions « 8-12 » → 8 ; « 30-45 s » → 30
const minReps = (reps) => Number(String(reps || '').match(/\d+/)?.[0] || 0);

/**
 * Charge conseillée à partir des dernières séances (la plus récente d'abord).
 * +2,5 kg quand toutes les séries prévues ont été réussies deux fois de suite à la même charge.
 * @param {{ setsDone: {reps, weight}[] }[]} history
 * @returns {number|null}
 */
function suggestWeight(history, { targetSets, targetReps, step = 2.5 } = {}) {
  const withWeight = (history || []).filter((h) => (h.setsDone || []).some((s) => Number(s.weight) > 0));
  if (!withWeight.length) return null;
  const top = (h) => Math.max(...h.setsDone.map((s) => Number(s.weight) || 0));
  const last = top(withWeight[0]);
  const low = minReps(targetReps);
  const complete = (h) =>
    h.setsDone.length >= (targetSets || 1) && h.setsDone.every((s) => (Number(s.reps) || 0) >= low) && top(h) >= last;
  if (withWeight.length >= 2 && complete(withWeight[0]) && complete(withWeight[1])) return last + step;
  return last;
}

/** Durée estimée d'une séance (min), arrondie à 5 : séries × (45 s d'effort + repos) + 2 min de mise en place par exercice */
function estimateMinutes(items) {
  const sec = items.reduce((s, it) => s + it.sets * (45 + (it.restSec || 60)) + 120, 0);
  return Math.max(10, Math.round(sec / 60 / 5) * 5);
}

/** Horaires du jour : hours = { week: ['06:00','23:00'], sat: [...], sun: [...] } (null = fermé) */
function openingFor(hours, date = localDate()) {
  const wd = weekdayOf(date);
  const range = (hours || {})[wd === 5 ? 'sat' : wd === 6 ? 'sun' : 'week'];
  if (!Array.isArray(range) || range.length !== 2) return null;
  const toMin = (hm) => {
    const [h, m] = String(hm).split(':').map(Number);
    return h * 60 + (m || 0);
  };
  return { open: range[0], close: range[1], openMin: toMin(range[0]), closeMin: toMin(range[1]) };
}

function isOpenAt(hours, d = new Date()) {
  const o = openingFor(hours, localDate(d));
  if (!o) return false;
  const min = d.getHours() * 60 + d.getMinutes();
  return min >= o.openMin && min < o.closeMin;
}

module.exports = {
  dayStart,
  weekdayOf,
  mondayOf,
  exerciseCountFor,
  programWeek,
  dayIndexFor,
  scheduleWeek,
  nextPlanned,
  streakDays,
  suggestWeight,
  estimateMinutes,
  openingFor,
  isOpenAt,
  minReps,
};
