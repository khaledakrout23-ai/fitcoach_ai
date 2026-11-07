// Nutrition : objectif journalier (formule de services/targets.js, IA optionnelle bornée), conseil du jour,
// estimation d'un repas à partir d'une photo.
const { HttpError } = require('../middleware/errors');
const { generate, hasAI } = require('./gemini');
const { parsePhoto } = require('./images');
const { dailyTarget, waterTarget } = require('./targets');

const clamp = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
const within = (value, ref, ratio) => value >= ref * (1 - ratio) && value <= ref * (1 + ratio);

const profileOf = (user) => ({
  weight: user.weight,
  height: user.height,
  age: user.age,
  sex: user.sex,
  activity: user.activity,
  goal: user.goal,
  dietStyle: user.dietStyle,
  sessionMinutes: user.sessionMinutes,
});

const profileComplete = (user) => Boolean(user.weight && user.height && user.age);

// Variation de poids estimée par semaine (≈ 7700 kcal par kg)
const weeklyKg = (dailyCalories, maintenance) => Math.round((((dailyCalories - maintenance) * 7) / 7700) * 100) / 100;

/**
 * Objectif journalier : formule (Mifflin-St Jeor × activité), éventuellement ajusté par l'IA
 * mais jamais à plus de 30 % de la formule.
 * @returns {Promise<{ calories, protein, carbs, fat, maintenance, waterMl, source, advice } | null>}
 */
async function computeTarget(user, { useAI = true } = {}) {
  if (!profileComplete(user)) return null;
  const rules = dailyTarget(profileOf(user));
  const base = { ...rules, waterMl: waterTarget(profileOf(user), { trainingDay: true }), source: 'REGLES', advice: null };
  if (!useAI || !hasAI()) return base;
  const language = user.language === 'ar' ? 'arabe (derja tunisienne)' : user.language === 'en' ? 'anglais' : 'français';
  const raw = await generate({
    system: 'Tu es nutritionniste du sport. Tu calcules des apports journaliers réalistes. Tu réponds uniquement en JSON.',
    messages: [
      {
        role: 'user',
        text: `Sportif : ${user.age} ans, ${user.weight} kg, ${user.height} cm, objectif ${user.goal || 'FORME'}, activité ${user.activity || 'SEDENTAIRE'}, style ${user.dietStyle || 'EQUILIBRE'}, ${(user.trainingDays || []).length || 3} séances par semaine.
Référence calculée (Mifflin-St Jeor) : ${rules.calories} kcal, ${rules.protein} g de protéines.
Donne ses apports journaliers et un conseil court (2 phrases maximum) en ${language}, avec des aliments courants en Tunisie, sans compléments alimentaires.
Réponds avec ce JSON exact :
{"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "advice": "..."}`,
      },
    ],
    json: true,
  });
  let data = null;
  try {
    data = raw && JSON.parse(raw);
  } catch {
    data = null;
  }
  const ai = data && { calories: clamp(data.calories, 1200, 5000), protein: clamp(data.protein, 40, 300), carbs: clamp(data.carbs, 30, 700), fat: clamp(data.fat, 20, 200) };
  // garde-fou : une valeur IA trop éloignée de la formule est ignorée
  if (!ai || !within(ai.calories, rules.calories, 0.3) || !within(ai.protein, rules.protein, 0.3)) return base;
  return { ...base, ...ai, source: 'IA', advice: String(data.advice || '').slice(0, 500) || null };
}

/**
 * Calcule et enregistre l'objectif du membre (création ou mise à jour).
 * @returns {Promise<NutritionTarget|null>} null si âge, poids ou taille manquent (l'ancien objectif est supprimé)
 */
async function saveTarget(user, options) {
  const { NutritionTarget } = require('../models');
  const data = await computeTarget(user, options);
  if (!data) {
    await NutritionTarget.destroy({ where: { userId: user.id } });
    return null;
  }
  const [target, created] = await NutritionTarget.findOrCreate({ where: { userId: user.id }, defaults: { ...data, userId: user.id } });
  if (!created) await target.update(data);
  return target;
}

/** Objectif d'eau d'un jour : objectif manuel du membre, sinon calcul (jour d'entraînement si prévu ce jour-là) */
function waterForDay(user, { trainingDay }) {
  const prefs = user.prefs || {};
  const computed = waterTarget(profileOf(user), { trainingDay, hotDay: Boolean(prefs.hotDay) });
  const manual = Number(prefs.waterTargetMl) || null;
  return { targetMl: manual || computed || 2000, computedTargetMl: computed, manual: Boolean(manual), trainingDay };
}

const INSIGHTS = {
  START: {
    fr: () => 'Note ton premier repas : on suit tes calories et tes protéines.',
    ar: () => 'سجّل أول ماكلة: نتبّعو الكالوريات والبروتين متاعك.',
    en: () => 'Log your first meal: we track your calories and protein.',
  },
  PROTEIN_GAP: {
    fr: (p) => `Encore ${p.grams} g de protéines à prendre. Pense au poulet ou à une ojja ${p.evening ? 'ce soir' : 'ce midi'}.`,
    ar: (p) => `مازالك ${p.grams} غ بروتين. فكّر في الدجاج ولا عجّة ${p.evening ? 'الليلة' : 'في الغداء'}.`,
    en: (p) => `${p.grams} g of protein still to go. Think chicken or an ojja ${p.evening ? 'tonight' : 'for lunch'}.`,
  },
  OVER: {
    fr: (p) => `Tu as dépassé ton objectif de ${p.kcal} kcal. Demain, mise sur des légumes et des protéines maigres.`,
    ar: (p) => `فتّ الهدف بـ ${p.kcal} كالوري. غدوة ركّز على الخضرة والبروتين الخفيف.`,
    en: (p) => `You went ${p.kcal} kcal over your target. Tomorrow, focus on vegetables and lean protein.`,
  },
  WATER: {
    fr: (p) => `Il te reste ${p.liters} L d'eau à boire aujourd'hui. Garde une bouteille à portée de main.`,
    ar: (p) => `مازالك ${p.liters} ل ماء اليوم. خلّي دبوزة قريبة منك.`,
    en: (p) => `${p.liters} L of water left today. Keep a bottle within reach.`,
  },
  ON_TRACK: {
    fr: () => 'Belle journée : tu es dans tes objectifs. Kammel !',
    ar: () => 'نهار مزيان: إنت في الأهداف متاعك. كمّل!',
    en: () => 'Great day: you are on target. Keep going!',
  },
};

/**
 * Conseil d'une ligne pour l'écran Repas (règles simples, dans la langue du membre).
 * @returns {{ code: string, text: string } | null}
 */
function dayInsight({ target, totals, mealsCount, water, language = 'fr', isToday = true, hour = new Date().getHours() }) {
  const lang = ['fr', 'ar', 'en'].includes(language) ? language : 'fr';
  const make = (code, params = {}) => ({ code, text: INSIGHTS[code][lang](params) });
  if (!mealsCount) return isToday ? make('START') : null;
  if (target) {
    const over = totals.calories - target.calories;
    if (over > target.calories * 0.1) return make('OVER', { kcal: Math.round(over) });
    const gap = target.protein - totals.protein;
    if (gap >= 30 && (!isToday || hour < 22)) return make('PROTEIN_GAP', { grams: Math.round(gap), evening: !isToday || hour >= 15 });
  }
  if (isToday && water && hour >= 15 && water.consumedMl < water.targetMl * 0.5) {
    return make('WATER', { liters: (Math.round((water.targetMl - water.consumedMl) / 100) / 10).toLocaleString('fr-FR') });
  }
  return make('ON_TRACK');
}

/**
 * Estimation d'un repas à partir d'une photo (valeurs approximatives, non enregistrées).
 * @param {string} dataUrl « data:image/...;base64,... »
 */
async function analyzeMeal(dataUrl, language) {
  const photo = parsePhoto(dataUrl);
  if (!hasAI()) throw new HttpError(503, 'NO_AI', 'L’analyse des repas par photo nécessite l’IA.');
  const raw = await generate({
    system: 'Tu es nutritionniste. Tu estimes les portions et les apports d’un repas à partir d’une photo. Tu réponds uniquement en JSON.',
    messages: [
      {
        role: 'user',
        image: { mimeType: photo.mimeType, data: photo.base64 },
        text: `Estime ce repas (plats tunisiens possibles : couscous, lablabi, ojja, makarouna, brik, kafteji, mloukhia...).
Pour chaque aliment visible, estime la quantité en grammes, puis le total du repas.
Noms en ${language === 'ar' ? 'arabe' : language === 'en' ? 'anglais' : 'français'}.
Si la photo ne montre pas de nourriture, mets "isFood": false.
Réponds avec ce JSON exact :
{"isFood": true, "name": "nom court du repas", "items": [{"name": "...", "grams": 0}], "calories": 0, "protein": 0, "carbs": 0, "fat": 0, "confidence": 0.0}`,
      },
    ],
    json: true,
  });
  if (!raw) throw new HttpError(503, 'AI_UNAVAILABLE', 'L’IA est momentanément indisponible. Réessaie dans un instant.');
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  if (!data || data.isFood === false || !(Number(data.calories) > 0)) {
    throw new HttpError(422, 'NOT_FOOD', 'Aucun repas reconnu sur la photo. Reprends la photo de plus près.');
  }
  return {
    name: String(data.name || 'Repas').slice(0, 150),
    items: (Array.isArray(data.items) ? data.items : [])
      .slice(0, 10)
      .map((it) => ({ name: String(it.name || '').slice(0, 80), grams: clamp(it.grams, 0, 2000) }))
      .filter((it) => it.name),
    calories: clamp(data.calories, 0, 5000),
    protein: clamp(data.protein, 0, 400),
    carbs: clamp(data.carbs, 0, 800),
    fat: clamp(data.fat, 0, 400),
    confidence: Math.min(1, Math.max(0, Number(data.confidence) || 0)),
  };
}

module.exports = { profileOf, profileComplete, weeklyKg, computeTarget, saveTarget, waterForDay, dayInsight, analyzeMeal };
