// Nutrition : objectif journalier (IA ou formule) et estimation d'un repas à partir d'une photo
const { HttpError } = require('../middleware/errors');
const { generate, hasAI } = require('./gemini');

const GOALS_FR = { PRISE_MASSE: 'prise de masse', PERTE_POIDS: 'perte de poids', FORCE: 'force', FORME: 'remise en forme' };
const clamp = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));

/**
 * Calories d'entretien (Mifflin-St Jeor, sexe non renseigné → valeur moyenne) : poids stable.
 * @returns {number|null} null si le profil est incomplet
 */
function maintenanceCalories(user) {
  if (!user.weight || !user.height || !user.age) return null;
  const bmr = 10 * user.weight + 6.25 * user.height - 5 * user.age - 78;
  const activity = 1.3 + 0.05 * clamp(user.daysPerWeek || 3, 1, 6); // 3 séances/semaine ≈ 1,45
  return Math.round((bmr * activity) / 10) * 10;
}

// Variation de poids estimée par semaine (≈ 7700 kcal par kg)
const weeklyKg = (dailyCalories, maintenance) => Math.round((((dailyCalories - maintenance) * 7) / 7700) * 100) / 100;

/**
 * Objectif calculé par formule.
 * @returns {{ calories, protein, carbs, fat }}
 */
function ruleTarget(user) {
  const delta = { PRISE_MASSE: 300, PERTE_POIDS: -400, FORCE: 150, FORME: 0 }[user.goal] || 0;
  const calories = maintenanceCalories(user) + delta;
  const protein = Math.round(user.weight * ({ PRISE_MASSE: 2, PERTE_POIDS: 2, FORCE: 1.8, FORME: 1.6 }[user.goal] || 1.6));
  const fat = Math.round(user.weight * 0.9);
  const carbs = Math.max(50, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories, protein, carbs, fat };
}

const within = (value, ref, ratio) => value >= ref * (1 - ratio) && value <= ref * (1 + ratio);

/**
 * Objectif journalier : IA d'abord, contrôlé par la formule (écart max 30 %), sinon formule.
 * @returns {Promise<{ calories, protein, carbs, fat, source: 'IA'|'REGLES', advice: string|null }>}
 */
async function computeTarget(user, language) {
  if (!user.weight || !user.height || !user.age) {
    throw new HttpError(400, 'NUTRITION_PROFILE', 'Renseignez votre âge, votre poids et votre taille dans le profil.');
  }
  const rules = ruleTarget(user);
  if (!hasAI()) return { ...rules, source: 'REGLES', advice: null };
  const raw = await generate({
    system: 'Tu es nutritionniste du sport. Tu calcules des apports journaliers réalistes. Tu réponds uniquement en JSON.',
    messages: [
      {
        role: 'user',
        text: `Sportif : ${user.age} ans, ${user.weight} kg, ${user.height} cm, objectif ${GOALS_FR[user.goal] || 'remise en forme'}, niveau ${user.level || 'DEBUTANT'}, ${user.daysPerWeek || 3} séances de musculation par semaine.
Calcule ses apports journaliers (calories en kcal, protéines, glucides et lipides en grammes).
Donne aussi un conseil court (2 phrases maximum) en ${language === 'ar' ? 'arabe' : 'français'}, avec des aliments courants en Tunisie.
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
  const ai = data && { calories: clamp(data.calories, 1200, 5000), protein: clamp(data.protein, 40, 300), carbs: clamp(data.carbs, 50, 700), fat: clamp(data.fat, 30, 200) };
  // garde-fou : une valeur IA trop éloignée de la formule est ignorée
  if (!ai || !within(ai.calories, rules.calories, 0.3) || !within(ai.protein, rules.protein, 0.3)) {
    return { ...rules, source: 'REGLES', advice: null };
  }
  return { ...ai, source: 'IA', advice: String(data.advice || '').slice(0, 500) || null };
}

const profileComplete = (user) => Boolean(user.weight && user.height && user.age);

/**
 * Calcule et enregistre l'objectif du sportif (création ou mise à jour).
 * @returns {Promise<NutritionTarget|null>} null si âge, poids ou taille manquent
 */
async function saveTarget(user) {
  if (!profileComplete(user)) return null;
  const { NutritionTarget } = require('../models');
  const data = await computeTarget(user, user.language);
  const [target, created] = await NutritionTarget.findOrCreate({ where: { userId: user.id }, defaults: { ...data, userId: user.id } });
  if (!created) await target.update(data);
  return target;
}

/**
 * Estimation d'un repas à partir d'une photo (valeurs approximatives).
 * @param {string} dataUrl « data:image/...;base64,... »
 * @returns {Promise<{ name, items: {name, grams}[], calories, protein, carbs, fat, confidence }>}
 */
async function analyzeMeal(dataUrl, language) {
  const m = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new HttpError(400, 'VALIDATION', 'Photo invalide.');
  if (!hasAI()) throw new HttpError(503, 'NO_AI', 'L’analyse des repas par photo nécessite l’IA (clé GEMINI_API_KEY).');
  const raw = await generate({
    system: 'Tu es nutritionniste. Tu estimes les portions et les apports d’un repas à partir d’une photo. Tu réponds uniquement en JSON.',
    messages: [
      {
        role: 'user',
        image: { mimeType: m[1], data: m[2] },
        text: `Estime ce repas (plats tunisiens possibles : couscous, lablabi, ojja, makarouna, brik, kafteji...).
Pour chaque aliment visible, estime la quantité en grammes, puis le total du repas.
Noms en ${language === 'ar' ? 'arabe' : 'français'}.
Si la photo ne montre pas de nourriture, mets "isFood": false.
Réponds avec ce JSON exact :
{"isFood": true, "name": "nom court du repas", "items": [{"name": "...", "grams": 0}], "calories": 0, "protein": 0, "carbs": 0, "fat": 0, "confidence": 0.0}`,
      },
    ],
    json: true,
  });
  if (!raw) throw new HttpError(503, 'AI_UNAVAILABLE', 'L’IA est momentanément indisponible. Réessayez dans un instant.');
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  if (!data || data.isFood === false || !(Number(data.calories) > 0)) {
    throw new HttpError(422, 'NOT_FOOD', 'Aucun repas reconnu sur la photo. Reprenez la photo de plus près.');
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

module.exports = { maintenanceCalories, weeklyKg, ruleTarget, computeTarget, saveTarget, profileComplete, analyzeMeal };
