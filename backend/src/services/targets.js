// Calculs de l'écran « Résultats » et du suivi repas + eau. Fonctions pures, testées dans test/.
// Copie identique côté site (aperçu pendant l'onboarding, avant l'envoi) : web/src/lib/targets.js

const ACTIVITY_FACTOR = { SEDENTAIRE: 1.2, LEGER: 1.375, ACTIF: 1.55, TRES_ACTIF: 1.725 };
const GOAL_DELTA = { PERTE_POIDS: -500, PRISE_MASSE: 300, FORME: 0, FORCE: 0 };
// répartition des calories : protéines / glucides / lipides
const MACRO_SPLIT = {
  EQUILIBRE: [0.3, 0.45, 0.25],
  PROTEINES: [0.35, 0.4, 0.25],
  LOW_CARB: [0.35, 0.25, 0.4],
  VEGETARIEN: [0.25, 0.5, 0.25],
};
const SEX_OFFSET = { H: 5, F: -161, NA: -78 }; // NA : moyenne des deux formules

const WATER = { perKg: 33, perSessionMinute: 10, hot30: 500, hot35: 750, min: 1500, max: 4000, step: 50 };
const KG_PER_WEEK = 0.5;
const HEALTHY_BMI = [18.5, 24.9];

const round = (n, step = 1) => Math.round(n / step) * step;
const round1 = (n) => Math.round(n * 10) / 10;

/** Métabolisme de base (Mifflin-St Jeor), kcal */
function bmr({ weight, height, age, sex }) {
  if (!weight || !height || !age) return null;
  return 10 * weight + 6.25 * height - 5 * age + (SEX_OFFSET[sex] ?? SEX_OFFSET.NA);
}

/** Calories pour garder un poids stable */
function maintenance(profile) {
  const b = bmr(profile);
  if (b == null) return null;
  return Math.round(b * (ACTIVITY_FACTOR[profile.activity] || ACTIVITY_FACTOR.SEDENTAIRE));
}

/**
 * Objectif journalier.
 * @returns {{ maintenance, calories, protein, carbs, fat } | null}
 */
function dailyTarget(profile) {
  const m = maintenance(profile);
  if (m == null) return null;
  const calories = Math.max(1200, m + (GOAL_DELTA[profile.goal] ?? 0));
  const [p, c, f] = MACRO_SPLIT[profile.dietStyle] || MACRO_SPLIT.EQUILIBRE;
  return {
    maintenance: m,
    calories,
    protein: Math.round((calories * p) / 4),
    carbs: Math.round((calories * c) / 4),
    fat: Math.round((calories * f) / 9),
  };
}

/**
 * Objectif d'eau (ml). Jour d'entraînement : + 10 ml par minute de séance prévue.
 * @param {{ weight, sessionMinutes }} profile
 * @param {{ trainingDay?: boolean, feelsLike?: number, hotDay?: boolean }} day
 */
function waterTarget(profile, { trainingDay = true, feelsLike = null, hotDay = false } = {}) {
  if (!profile.weight) return null;
  let ml = profile.weight * WATER.perKg;
  if (trainingDay) ml += (profile.sessionMinutes || 0) * WATER.perSessionMinute;
  if ((feelsLike != null && feelsLike >= 35)) ml += WATER.hot35;
  else if (hotDay || (feelsLike != null && feelsLike >= 30)) ml += WATER.hot30;
  return Math.min(WATER.max, Math.max(WATER.min, round(ml, WATER.step)));
}

function bmi({ weight, height }) {
  if (!weight || !height) return null;
  return round1(weight / (height / 100) ** 2);
}

function bmiCategory(value) {
  if (value == null) return null;
  if (value < HEALTHY_BMI[0]) return 'MAIGREUR';
  if (value < 25) return 'NORMAL';
  if (value < 30) return 'SURPOIDS';
  return 'OBESITE';
}

/** Poids sain pour une taille (IMC 18,5 – 24,9), kg à 0,1 près */
function healthyRange(height) {
  if (!height) return null;
  const m2 = (height / 100) ** 2;
  return [round1(HEALTHY_BMI[0] * m2), round1(HEALTHY_BMI[1] * m2)];
}

/** Semaines pour atteindre le poids visé à 0,5 kg par semaine */
function weeksToGoal(weight, goalWeight) {
  if (!weight || !goalWeight) return null;
  return Math.ceil(Math.abs(weight - goalWeight) / KG_PER_WEEK);
}

module.exports = {
  ACTIVITY_FACTOR,
  GOAL_DELTA,
  MACRO_SPLIT,
  WATER,
  KG_PER_WEEK,
  bmr,
  maintenance,
  dailyTarget,
  waterTarget,
  bmi,
  bmiCategory,
  healthyRange,
  weeksToGoal,
};
