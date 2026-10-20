// L'IA propose de nouveaux exercices faisables avec un équipement (ajout de machine par l'administrateur)
const { Equipment, Exercise } = require('../models');
const { generate, hasAI } = require('./gemini');
const { MUSCLES, PATTERNS, INJURY_ZONES } = require('./constants');

const MAX_SUGGESTIONS = 6;

const strings = (v, max = 3) => (Array.isArray(v) ? v.map((s) => String(s).trim().slice(0, 200)).filter(Boolean).slice(0, max) : []);

/**
 * Nettoie un exercice (proposé par l'IA ou renvoyé par le navigateur) : uniquement des valeurs connues.
 * @returns {object|null} données prêtes pour Exercise.create, ou null si invalide
 */
function cleanExercise(raw, equipment, equipmentCodes) {
  if (!raw || typeof raw !== 'object') return null;
  const nameFr = String(raw.nameFr || '').trim().slice(0, 120);
  const nameAr = String(raw.nameAr || '').trim().slice(0, 120);
  const nameEn = String(raw.nameEn || '').trim().slice(0, 120);
  if (!nameFr || !nameAr || !nameEn || !MUSCLES[raw.primaryMuscle] || !PATTERNS[raw.pattern]) return null;
  return {
    nameFr,
    nameAr,
    nameEn,
    primaryMuscle: raw.primaryMuscle,
    secondaryMuscles: strings(raw.secondaryMuscles, 4).filter((m) => MUSCLES[m] && m !== raw.primaryMuscle),
    pattern: raw.pattern,
    equipmentId: equipment.id,
    accessories: strings(raw.accessories, 3).filter((c) => equipmentCodes.includes(c) && c !== equipment.code && c !== 'poids_du_corps'),
    difficulty: Math.min(3, Math.max(1, Math.round(Number(raw.difficulty)) || 1)),
    injuryZones: strings(raw.injuryZones, 4).filter((z) => INJURY_ZONES[z]),
    defaultReps: /^\d{1,3}(-\d{1,3})?( ?s)?$/.test(String(raw.defaultReps || '').trim()) ? String(raw.defaultReps).trim() : '10-12',
    benefitsFr: strings(raw.benefitsFr),
    benefitsAr: strings(raw.benefitsAr),
    mistakesFr: strings(raw.mistakesFr),
    mistakesAr: strings(raw.mistakesAr),
  };
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * @returns {Promise<object[]|null>} exercices proposés (non enregistrés), ou null si l'IA est indisponible
 */
async function suggestExercises(equipment) {
  // l'IA renvoie parfois une réponse inutilisable : un seul nouvel essai
  const first = await askSuggestions(equipment);
  return first && first.length ? first : (await askSuggestions(equipment)) || first;
}

async function askSuggestions(equipment) {
  if (!hasAI()) return null;
  const [all, equipmentList] = await Promise.all([Exercise.findAll({ attributes: ['nameFr', 'nameEn'] }), Equipment.findAll()]);
  const codes = equipmentList.map((e) => e.code);
  const raw = await generate({
    system: 'Tu es un coach sportif diplômé et tu enrichis le catalogue d’exercices d’une application de musculation. Tu réponds uniquement en JSON.',
    messages: [
      {
        role: 'user',
        text: `Équipement : « ${equipment.nameFr} » (code ${equipment.code}).
Propose jusqu'à ${MAX_SUGGESTIONS} exercices sûrs et courants qui se font AVEC cet équipement comme équipement principal.
N'utilise PAS un exercice déjà présent dans le catalogue, ni le même exercice sous un autre nom
(ex. « Tractions en pronation » = « Tractions ») :
${all.map((e) => `- ${e.nameFr} / ${e.nameEn}`).join('\n')}

Valeurs autorisées :
- primaryMuscle et secondaryMuscles : ${Object.keys(MUSCLES).join(', ')}
- pattern : ${Object.keys(PATTERNS).join(', ')}
- injuryZones (zones sollicitées) : ${Object.keys(INJURY_ZONES).join(', ')}
- accessories (autres équipements nécessaires, souvent vide) : ${codes.join(', ')}
- difficulty : 1 (débutant), 2 ou 3 (avancé)
nameAr en arabe, benefits et mistakes : 2 ou 3 phrases courtes chacun, en français (Fr) et en arabe (Ar).
Réponds avec ce JSON exact :
{"exercises": [{"nameFr": "", "nameAr": "", "nameEn": "", "primaryMuscle": "", "secondaryMuscles": [], "pattern": "", "accessories": [], "difficulty": 1, "injuryZones": [], "defaultReps": "10-12", "benefitsFr": [], "benefitsAr": [], "mistakesFr": [], "mistakesAr": []}]}`,
      },
    ],
    json: true,
  });
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const out = [];
  // formats tolérés : {"exercises": [...]}, {"exercices": [...]} ou directement [...]
  const items = Array.isArray(data) ? data : data?.exercises || data?.exercices || [];
  for (const item of Array.isArray(items) ? items : []) {
    const ex = cleanExercise(item, equipment, codes);
    if (!ex) continue;
    const taken = [...all.map((e) => e.nameFr), ...all.map((e) => e.nameEn), ...out.map((e) => e.nameFr)];
    if (taken.some((n) => sameName(n, ex.nameFr) || sameName(n, ex.nameEn))) continue;
    out.push(ex);
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

module.exports = { suggestExercises, cleanExercise, sameName };
