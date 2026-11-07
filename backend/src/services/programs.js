// Programme du membre : création (modèle de la salle, IA ou règles), semaine en cours, séance du jour.
const { Op } = require('sequelize');
const { sequelize, Program, ProgramItem, ProgramTemplate, Exercise, WorkoutSession } = require('../models');
const { HttpError } = require('../middleware/errors');
const { localDate } = require('../utils');
const { loadCatalog, availableEquipment, machinesByEquipment, performanceHistory, exerciseSummary, exerciseInclude } = require('./catalog');
const { isDoable, hitsInjury, findAlternatives, BODYWEIGHT } = require('./substitution');
const { buildProgram } = require('./coach');
const { LEVEL_VALUE } = require('./constants');
const {
  exerciseCountFor, programWeek, scheduleWeek, nextPlanned, suggestWeight, estimateMinutes, weekdayOf, mondayOf,
} = require('./schedule');

/** Profil suffisant pour générer un programme (RG1) */
function assertProfileReady(user) {
  if (!user.gymId || !user.goal || !user.level || !(user.trainingDays || []).length) {
    throw new HttpError(400, 'PROFILE_INCOMPLETE', 'Complète ton profil (objectif, niveau, jours) avant de générer un programme.');
  }
}

/**
 * Modèle publié de la salle le plus proche du profil : même objectif, niveau compatible, nombre de jours le plus proche.
 */
async function pickTemplate(user) {
  const templates = await ProgramTemplate.findAll({ where: { gymId: user.gymId, published: true, goal: user.goal }, order: [['id', 'ASC']] });
  const days = (user.trainingDays || []).length || user.daysPerWeek || 3;
  const usable = templates.filter((t) => !t.level || t.level === user.level);
  const ranked = usable
    .map((t) => ({ t, score: Math.abs(t.daysPerWeek - days) * 10 + (t.level === user.level ? 0 : 1) }))
    .sort((a, b) => a.score - b.score || a.t.id - b.t.id);
  return ranked.length ? ranked[0].t : null;
}

/**
 * Jours d'un modèle adaptés au membre : exercices qui chargent une zone douloureuse ou impossibles dans la salle
 * remplacés automatiquement (findAlternatives), nombre d'exercices selon la durée de séance.
 */
function adaptTemplateDays(template, { catalog, equipment, user }) {
  const available = new Set([...equipment, BODYWEIGHT]);
  const injuries = user.injuries || [];
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const max = exerciseCountFor(user.sessionMinutes);
  return template.days.map((day, i) => {
    const used = new Set();
    const items = [];
    for (const it of day.items || []) {
      let ex = byId.get(Number(it.exerciseId));
      if (!ex) continue;
      if (!isDoable(ex, available) || hitsInjury(ex, injuries) || used.has(ex.id)) {
        const alt = findAlternatives({ original: ex, catalog, availableEquipment: equipment, level: user.level, injuries, limit: 10 })
          .map((r) => r.exercise)
          .find((c) => !used.has(c.id));
        if (!alt) continue;
        ex = alt;
      }
      used.add(ex.id);
      items.push({ exerciseId: ex.id, sets: it.sets, reps: it.reps, restSec: it.restSec ?? 60 });
      if (items.length >= max) break;
    }
    return {
      dayIndex: i + 1,
      labelFr: String(day.labelFr || `Jour ${i + 1}`).slice(0, 60),
      labelAr: String(day.labelAr || `اليوم ${i + 1}`).slice(0, 60),
      items,
    };
  });
}

/**
 * Crée le programme actif du membre (les anciens sont désactivés).
 * @param {object} user
 * @param {{ source?: 'AI'|'RULES'|'TEMPLATE' }} options source souhaitée ; par défaut modèle de la salle, sinon IA, sinon règles
 */
async function generateForUser(user, { source } = {}) {
  assertProfileReady(user);
  const catalog = await loadCatalog();
  const equipment = await availableEquipment(user.gymId);
  const profile = { ...user.get({ plain: true }), daysPerWeek: (user.trainingDays || []).length || user.daysPerWeek };
  let plan = null;
  let kind = null;
  let template = null;
  let weeks = 8;

  if (!source || source === 'TEMPLATE') {
    template = await pickTemplate(user);
    if (template) {
      const days = adaptTemplateDays(template, { catalog, equipment, user });
      if (days.every((d) => d.items.length >= 2)) {
        const n = days.length;
        plan = { title: `${template.nameFr} · ${n} jours`, days };
        kind = 'MODELE';
        weeks = template.weeks;
      } else template = null;
    }
  }
  if (!plan) {
    const available = new Set(equipment);
    const levelValue = LEVEL_VALUE[user.level] || 1;
    const candidates = catalog.filter((c) => isDoable(c, available) && !hitsInjury(c, user.injuries || []) && c.difficulty <= levelValue + 1);
    const built = source === 'RULES'
      ? await buildProgram({ user: profile, catalog, availableEquipment: equipment, candidates: [] })
      : await buildProgram({ user: profile, catalog, availableEquipment: equipment, candidates });
    const max = exerciseCountFor(user.sessionMinutes);
    plan = { ...built.program, days: built.program.days.map((d) => ({ ...d, items: d.items.slice(0, max) })) };
    kind = built.source;
  }

  return sequelize.transaction(async (t) => {
    await Program.update({ active: false }, { where: { userId: user.id, active: true }, transaction: t });
    const program = await Program.create(
      {
        userId: user.id,
        title: plan.title.slice(0, 150),
        source: kind,
        goal: user.goal,
        daysPerWeek: plan.days.length,
        weeks,
        startedAt: mondayOf(localDate()),
        templateId: template ? template.id : null,
      },
      { transaction: t }
    );
    const rows = [];
    plan.days.forEach((d) =>
      d.items.forEach((it, pos) =>
        rows.push({
          programId: program.id,
          dayIndex: d.dayIndex,
          dayLabelFr: d.labelFr,
          dayLabelAr: d.labelAr,
          position: pos + 1,
          exerciseId: it.exerciseId,
          sets: it.sets,
          reps: it.reps,
          restSec: it.restSec,
        })
      )
    );
    await ProgramItem.bulkCreate(rows, { transaction: t });
    return program;
  });
}

async function currentProgram(userId) {
  return Program.findOne({
    where: { userId, active: true },
    include: [
      {
        model: ProgramItem,
        as: 'items',
        separate: true,
        include: [{ model: Exercise, as: 'exercise', include: exerciseInclude }],
        order: [['dayIndex', 'ASC'], ['position', 'ASC']],
      },
    ],
    order: [['createdAt', 'DESC']],
  });
}

// Muscles principaux d'un jour, dans l'ordre d'apparition
const musclesOf = (items) => [...new Set(items.map((it) => it.exercise && it.exercise.primaryMuscle).filter(Boolean))];

function groupDays(program, machines, minutes) {
  const days = [];
  for (const item of program.items) {
    let day = days.find((d) => d.dayIndex === item.dayIndex);
    if (!day) {
      day = { dayIndex: item.dayIndex, labelFr: item.dayLabelFr, labelAr: item.dayLabelAr, items: [] };
      days.push(day);
    }
    day.items.push({
      id: item.id,
      position: item.position,
      sets: item.sets,
      reps: item.reps,
      restSec: item.restSec,
      exercise: exerciseSummary(item.exercise, machines),
    });
  }
  for (const d of days) {
    d.muscles = musclesOf(d.items);
    d.exerciseCount = d.items.length;
    d.estMinutes = minutes || estimateMinutes(d.items);
  }
  return days;
}

// Séances terminées du programme (date locale de début)
async function doneSessions(userId, programId) {
  const sessions = await WorkoutSession.findAll({
    attributes: ['id', 'dayIndex', 'startedAt'],
    where: { userId, programId, status: 'TERMINEE' },
    order: [['startedAt', 'ASC']],
  });
  return sessions.map((s) => ({ id: s.id, dayIndex: s.dayIndex, date: localDate(new Date(s.startedAt)) }));
}

/** Programme en cours + semaine + calendrier de la semaine (GET /programs/current) */
async function programView(user, today = localDate()) {
  const program = await currentProgram(user.id);
  if (!program) return null;
  const machines = await machinesByEquipment(user.gymId);
  const days = groupDays(program, machines, user.sessionMinutes);
  const done = await doneSessions(user.id, program.id);
  const trainingDays = user.trainingDays || [];
  const week = programWeek(program, today);
  const schedule = scheduleWeek({ trainingDays, program: { ...program.get({ plain: true }), days }, doneSessions: done, today });
  return {
    id: program.id,
    title: program.title,
    source: program.source,
    goal: program.goal,
    templateId: program.templateId || null,
    daysPerWeek: program.daysPerWeek,
    weeks: program.weeks,
    week,
    startedAt: program.startedAt,
    sessionsDone: done.length,
    sessionsTotal: (trainingDays.length || program.daysPerWeek) * program.weeks,
    days,
    schedule,
    doneThisWeek: schedule.filter((s) => s.status === 'DONE').length,
    plannedThisWeek: schedule.filter((s) => s.status !== 'REST').length,
    restDays: schedule.filter((s) => s.status === 'REST').map((s) => s.weekday),
    createdAt: program.createdAt,
  };
}

/** Séance du jour (ou la prochaine prévue) avec la charge conseillée (GET /programs/today) */
async function todayView(user, today = localDate()) {
  const program = await currentProgram(user.id);
  if (!program) return null;
  const machines = await machinesByEquipment(user.gymId);
  const days = groupDays(program, machines, user.sessionMinutes);
  const done = await doneSessions(user.id, program.id);
  const inProgress = await WorkoutSession.findOne({ where: { userId: user.id, status: 'EN_COURS' }, order: [['startedAt', 'DESC']] });
  const next = nextPlanned({ trainingDays: user.trainingDays, program: { ...program.get({ plain: true }), days }, doneSessions: done, today });
  let dayIndex = next ? next.dayIndex : null;
  if (!dayIndex) {
    // pas de jours d'entraînement choisis : on enchaîne les jours du programme
    const last = done[done.length - 1];
    dayIndex = last ? (last.dayIndex % days.length) + 1 : 1;
  }
  const day = days.find((d) => d.dayIndex === dayIndex) || days[0];
  if (!day) return null;
  const history = await performanceHistory(user.id, day.items.map((it) => it.exercise.id), { perExercise: 2 });
  const items = day.items.map((it) => {
    const h = history.get(it.exercise.id) || [];
    const last = h[0];
    const best = last ? last.setsDone.reduce((b, s) => (Number(s.weight) > (b ? b.weight : -1) ? s : b), null) : null;
    return {
      programItemId: it.id,
      position: it.position,
      sets: it.sets,
      reps: it.reps,
      restSec: it.restSec,
      exercise: it.exercise,
      suggestedKg: suggestWeight(h, { targetSets: it.sets, targetReps: it.reps }),
      lastPerformance: last && best ? { date: last.date, weight: Number(best.weight) || 0, reps: Number(best.reps) || 0 } : null,
    };
  });
  return {
    programId: program.id,
    programTitle: program.title,
    week: programWeek(program, today),
    weeks: program.weeks,
    date: next ? next.date : today,
    weekday: next ? next.weekday : weekdayOf(today),
    isToday: next ? next.isToday : true,
    doneToday: done.some((s) => s.date === today),
    dayIndex: day.dayIndex,
    labelFr: day.labelFr,
    labelAr: day.labelAr,
    muscles: day.muscles,
    exerciseCount: items.length,
    estMinutes: day.estMinutes,
    inProgressSessionId: inProgress ? inProgress.id : null,
    items,
  };
}

/** Membres actifs par modèle (écran Programmes du coach) */
async function templateMemberCounts(templateIds) {
  if (!templateIds.length) return new Map();
  const rows = await Program.findAll({
    attributes: ['templateId'],
    where: { templateId: { [Op.in]: templateIds }, active: true },
    raw: true,
  });
  const map = new Map();
  for (const r of rows) map.set(r.templateId, (map.get(r.templateId) || 0) + 1);
  return map;
}

module.exports = {
  assertProfileReady,
  pickTemplate,
  adaptTemplateDays,
  generateForUser,
  currentProgram,
  programView,
  todayView,
  doneSessions,
  musclesOf,
  templateMemberCounts,
};
