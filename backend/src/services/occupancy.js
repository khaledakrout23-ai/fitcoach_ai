// Affluence de la salle (« Gym en direct », tableau de bord de l'équipe).
// Une personne est présente si elle est entrée (ENTREE), n'est pas ressortie, et depuis moins de
// settings.live.autoCheckoutHours heures (sortie automatique). On ne renvoie jamais de noms, seulement des nombres.
const { Op } = require('sequelize');
const { localDate, addDays } = require('../utils');
const { weekdayOf, openingFor } = require('./schedule');

const FIRST_HOUR = 6;
const LAST_HOUR = 23;
const HISTORY_WEEKS = 8;
const HOUR_MS = 3600000;

// ---------------------------------------------------------------- Fonctions pures

/** CALME sous le seuil, PLEINE à partir de 80 % de la capacité, sinon FREQUENTEE */
function levelFor(count, { calmThreshold = 25, capacity = 120 } = {}) {
  if (count < calmThreshold) return 'CALME';
  if (capacity > 0 && count >= 0.8 * capacity) return 'PLEINE';
  return 'FREQUENTEE';
}

function isPresentAt(c, t, autoCheckoutHours) {
  const inAt = new Date(c.checkInAt).getTime();
  const outAt = c.checkOutAt ? new Date(c.checkOutAt).getTime() : null;
  const time = t instanceof Date ? t.getTime() : t;
  return inAt <= time && (outAt == null || outAt > time) && time - inAt < autoCheckoutHours * HOUR_MS;
}

const countAt = (checkins, t, auto) => checkins.reduce((n, c) => n + (isPresentAt(c, t, auto) ? 1 : 0), 0);

/**
 * Affluence habituelle : moyenne, par jour de semaine et par heure, du nombre de personnes présentes à hh:30.
 * @param {{checkInAt, checkOutAt}[]} checkins  entrées acceptées de la période
 * @param {{ from: string, to: string, autoCheckoutHours: number }} opts  période [from, to[ en dates locales
 * @returns {number[][]} matrice 7 × 24 (0 = lundi)
 */
function presenceMatrix(checkins, { from, to, autoCheckoutHours = 3 }) {
  const sums = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const first = checkins.reduce((min, c) => Math.min(min, new Date(c.checkInAt).getTime()), Infinity);
  const firstDate = Number.isFinite(first) ? localDate(new Date(first)) : to;
  const startDate = firstDate > from ? firstDate : from;
  // nombre de jours observés pour chaque jour de semaine
  const daysCount = new Array(7).fill(0);
  for (let d = startDate; d < to; d = addDays(d, 1)) daysCount[weekdayOf(d)] += 1;
  const limit = new Date(`${to}T00:00:00`).getTime();
  for (const c of checkins) {
    const inAt = new Date(c.checkInAt);
    const end = Math.min(
      c.checkOutAt ? new Date(c.checkOutAt).getTime() : Infinity,
      inAt.getTime() + autoCheckoutHours * HOUR_MS,
      limit
    );
    const t = new Date(inAt);
    t.setMinutes(30, 0, 0);
    if (t < inAt) t.setTime(t.getTime() + HOUR_MS);
    for (; t.getTime() < end; t.setTime(t.getTime() + HOUR_MS)) {
      sums[(t.getDay() + 6) % 7][t.getHours()] += 1;
    }
  }
  return sums.map((row, wd) => row.map((v) => (daysCount[wd] ? v / daysCount[wd] : 0)));
}

/** Écart avec l'habitude : CALMER (−15 %), BUSIER (+15 %), sinon USUAL */
function compareToUsual(count, usual) {
  const u = Math.round(usual || 0);
  const diff = count - u;
  const margin = Math.max(3, 0.15 * u);
  return { usual: u, diff, trend: diff <= -margin ? 'CALMER' : diff >= margin ? 'BUSIER' : 'USUAL' };
}

/**
 * Créneau de 2 h le plus calme parmi les heures d'ouverture restantes (toute la journée si la salle est fermée).
 * @param {{hour, value}[]} values
 */
function calmWindow(values, { afterHour = -1, opening = null, size = 2 } = {}) {
  const openH = opening ? Math.ceil(opening.openMin / 60) : FIRST_HOUR;
  const closeH = opening ? Math.floor(opening.closeMin / 60) : LAST_HOUR + 1;
  const pick = (from) => {
    let best = null;
    for (let h = Math.max(from, openH); h + size <= closeH; h += 1) {
      const slice = values.filter((v) => v.hour >= h && v.hour < h + size);
      if (slice.length < size) continue;
      const sum = slice.reduce((s, v) => s + v.value, 0);
      if (!best || sum < best.sum) best = { hour: h, sum };
    }
    return best;
  };
  const best = pick(afterHour + 1) || pick(openH);
  if (!best) return null;
  const pad = (h) => `${String(h).padStart(2, '0')}:00`;
  return { from: pad(best.hour), to: pad(best.hour + size) };
}

/**
 * Courbe du jour (6 h → 23 h) : passé = mesuré à hh:30, heure en cours = maintenant, futur = habitude.
 */
function hourlyCurve({ todayCheckins, typicalRow, now, autoCheckoutHours, opening, presentNow }) {
  const currentHour = now.getHours();
  const out = [];
  for (let h = FIRST_HOUR; h <= LAST_HOUR; h += 1) {
    const forecast = Math.round(typicalRow[h] || 0);
    let count = null;
    let phase = 'FUTURE';
    if (h < currentHour) {
      const t = new Date(now);
      t.setHours(h, 30, 0, 0);
      count = countAt(todayCheckins, t, autoCheckoutHours);
      phase = 'PAST';
    } else if (h === currentHour) {
      count = presentNow;
      phase = 'NOW';
    }
    const open = Boolean(opening) && h * 60 + 59 >= opening.openMin && h * 60 < opening.closeMin;
    out.push({ hour: h, count, forecast, phase, open });
  }
  return out;
}

// ---------------------------------------------------------------- Accès à la base

const typicalCache = new Map(); // gymId → { at, key, matrix }
const CACHE_MS = 10 * 60 * 1000;

async function typicalMatrix(gymId, autoCheckoutHours, today = localDate()) {
  const key = `${today}:${autoCheckoutHours}`;
  const hit = typicalCache.get(gymId);
  if (hit && hit.key === key && Date.now() - hit.at < CACHE_MS) return hit.matrix;
  const { CheckIn } = require('../models');
  const from = addDays(today, -7 * HISTORY_WEEKS);
  const rows = await CheckIn.findAll({
    attributes: ['checkInAt', 'checkOutAt'],
    where: { gymId, status: 'ENTREE', checkInAt: { [Op.gte]: new Date(`${from}T00:00:00`), [Op.lt]: new Date(`${today}T00:00:00`) } },
    raw: true,
  });
  const matrix = presenceMatrix(rows, { from, to: today, autoCheckoutHours });
  typicalCache.set(gymId, { at: Date.now(), key, matrix });
  return matrix;
}

// Entrées acceptées qui peuvent encore compter aujourd'hui (depuis minuit − durée de sortie automatique)
async function recentCheckins(gymId, autoCheckoutHours, now = new Date()) {
  const { CheckIn } = require('../models');
  const start = new Date(`${localDate(now)}T00:00:00`).getTime() - autoCheckoutHours * HOUR_MS;
  return CheckIn.findAll({
    attributes: ['id', 'checkInAt', 'checkOutAt'],
    where: { gymId, status: 'ENTREE', checkInAt: { [Op.gte]: new Date(start), [Op.lte]: now } },
    raw: true,
  });
}

/** Nombre de personnes présentes maintenant */
async function presentCount(gymId, settings, now = new Date()) {
  const { CheckIn } = require('../models');
  const auto = settings.live.autoCheckoutHours;
  return CheckIn.count({
    where: {
      gymId,
      status: 'ENTREE',
      checkInAt: { [Op.gt]: new Date(now.getTime() - auto * HOUR_MS), [Op.lte]: now },
      [Op.or]: [{ checkOutAt: null }, { checkOutAt: { [Op.gt]: now } }],
    },
  });
}

/**
 * Photo complète de l'affluence d'une salle.
 * @returns {{ count, capacity, level, deltaSince, comparedToUsual, hourlyToday, peak, calmWindow, open, opening }}
 */
async function liveSnapshot(gym, settings, now = new Date()) {
  const auto = settings.live.autoCheckoutHours;
  const today = localDate(now);
  const [matrix, todayCheckins] = await Promise.all([typicalMatrix(gym.id, auto, today), recentCheckins(gym.id, auto, now)]);
  const count = countAt(todayCheckins, now, auto);
  const since = new Date(now.getTime() - 15 * 60000);
  since.setMinutes(Math.floor(since.getMinutes() / 5) * 5, 0, 0);
  const sinceCount = countAt(todayCheckins, since, auto);
  const opening = openingFor(gym.hours, today);
  const typicalRow = matrix[weekdayOf(today)];
  const hourlyToday = hourlyCurve({ todayCheckins, typicalRow, now, autoCheckoutHours: auto, opening, presentNow: count });
  const values = hourlyToday.map((h) => ({ hour: h.hour, value: h.count ?? h.forecast }));
  const peakItem = values.reduce((best, v) => (!best || v.value > best.value ? v : best), null);
  const window = calmWindow(
    hourlyToday.map((h) => ({ hour: h.hour, value: h.forecast })),
    { afterHour: now.getHours(), opening }
  );
  if (window) {
    const fromH = Number(window.from.slice(0, 2));
    const toH = Number(window.to.slice(0, 2));
    for (const h of hourlyToday) h.calm = h.hour >= fromH && h.hour < toH;
  }
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return {
    count,
    capacity: gym.capacity,
    level: levelFor(count, { calmThreshold: settings.live.calmThreshold, capacity: gym.capacity }),
    calmThreshold: settings.live.calmThreshold,
    deltaSince: { count: count - sinceCount, since: `${String(since.getHours()).padStart(2, '0')}:${String(since.getMinutes()).padStart(2, '0')}` },
    comparedToUsual: { weekday: weekdayOf(today), hour: now.getHours(), ...compareToUsual(count, typicalRow[now.getHours()]) },
    hourlyToday,
    peak: peakItem && peakItem.value > 0 ? { hour: peakItem.hour, count: Math.round(peakItem.value) } : null,
    calmWindow: window,
    open: Boolean(opening) && nowMin >= opening.openMin && nowMin < opening.closeMin,
    opening: opening ? { open: opening.open, close: opening.close } : null,
    updatedAt: now.toISOString(),
  };
}

/** Carte de chaleur pour l'équipe : moyenne par jour × heure (6 h → 23 h) sur 8 semaines */
async function weeklyHeatmap(gym, settings, today = localDate()) {
  const matrix = await typicalMatrix(gym.id, settings.live.autoCheckoutHours, today);
  const hours = [];
  for (let h = FIRST_HOUR; h <= LAST_HOUR; h += 1) hours.push(h);
  return {
    weeks: HISTORY_WEEKS,
    hours,
    rows: matrix.map((row, weekday) => ({ weekday, values: hours.map((h) => Math.round(row[h] * 10) / 10) })),
    max: Math.round(Math.max(0, ...matrix.flatMap((row) => hours.map((h) => row[h])))),
  };
}

module.exports = {
  levelFor,
  isPresentAt,
  presenceMatrix,
  compareToUsual,
  calmWindow,
  hourlyCurve,
  presentCount,
  liveSnapshot,
  weeklyHeatmap,
  typicalMatrix,
  FIRST_HOUR,
  LAST_HOUR,
};
