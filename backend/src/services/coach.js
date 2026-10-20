// Coach IA : génération de programme et conversation.
// Utilise Gemini quand une clé est configurée, sinon les règles (mode simple).
const { generate, hasAI } = require('./gemini');
const { generateProgram } = require('./programGenerator');
const { fallbackReply } = require('./coachFallback');
const { MUSCLES } = require('./constants');

const GOALS_FR = {
  PRISE_MASSE: 'prise de masse',
  PERTE_POIDS: 'perte de poids',
  FORCE: 'force',
  FORME: 'remise en forme',
};

function profileText(user) {
  return [
    `Objectif : ${GOALS_FR[user.goal] || 'remise en forme'}`,
    `Niveau : ${user.level || 'DEBUTANT'}`,
    `Jours par semaine : ${user.daysPerWeek || 3}`,
    user.age ? `Âge : ${user.age} ans` : null,
    user.weight ? `Poids : ${user.weight} kg` : null,
    user.height ? `Taille : ${user.height} cm` : null,
    `Zones blessées : ${(user.injuries || []).join(', ') || 'aucune'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// Vérifie que la réponse de l'IA est un programme valide, construit uniquement avec des exercices autorisés
function validateAIProgram(raw, allowedIds, days) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || !Array.isArray(data.days) || data.days.length !== days) return null;
  const result = [];
  for (let i = 0; i < data.days.length; i += 1) {
    const day = data.days[i];
    if (!Array.isArray(day.items) || day.items.length < 3) return null;
    const items = [];
    for (const it of day.items) {
      const id = Number(it.exerciseId);
      if (!allowedIds.has(id)) return null; // RG2 : uniquement des exercices faisables dans la salle
      items.push({
        exerciseId: id,
        sets: Math.min(6, Math.max(1, Number(it.sets) || 3)),
        reps: String(it.reps || '8-12').slice(0, 20),
        restSec: Math.min(300, Math.max(20, Number(it.restSec) || 90)),
      });
    }
    result.push({
      dayIndex: i + 1,
      labelFr: String(day.labelFr || `Jour ${i + 1}`).slice(0, 60),
      labelAr: String(day.labelAr || `اليوم ${i + 1}`).slice(0, 60),
      items,
    });
  }
  return { title: String(data.title || 'Programme personnalisé').slice(0, 150), days: result };
}

/**
 * Construit un programme : IA d'abord (si disponible), sinon règles.
 * @returns {{ program, source: 'IA'|'REGLES' }}
 */
async function buildProgram({ user, catalog, availableEquipment, candidates }) {
  const rules = generateProgram({ profile: user, catalog, availableEquipment });
  if (!hasAI() || candidates.length < 8) return { program: rules, source: 'REGLES' };

  const days = rules.days.length;
  const list = candidates
    .map((c) => `${c.id} | ${c.nameFr} | ${MUSCLES[c.primaryMuscle].fr} | ${c.pattern} | difficulté ${c.difficulty}`)
    .join('\n');
  const system =
    "Tu es un coach sportif diplômé. Tu crées des programmes de musculation sûrs et équilibrés. Tu réponds uniquement en JSON.";
  const prompt = `Profil du sportif :
${profileText(user)}

Exercices autorisés (id | nom | muscle | mouvement | difficulté) — utilise UNIQUEMENT ces id :
${list}

Crée un programme de ${days} jours. Chaque jour contient 5 ou 6 exercices, sans doublon dans la même journée.
Réponds avec ce JSON exact :
{"title": "...", "days": [{"labelFr": "...", "labelAr": "...", "items": [{"exerciseId": 1, "sets": 3, "reps": "8-12", "restSec": 90}]}]}`;

  const raw = await generate({ system, messages: [{ role: 'user', text: prompt }], json: true });
  const program = raw ? validateAIProgram(raw, new Set(candidates.map((c) => c.id)), days) : null;
  return program ? { program, source: 'IA' } : { program: rules, source: 'REGLES' };
}

const ARABIC = /[؀-ۿ]/;

/**
 * Réponse du coach dans le chat.
 * @returns {{ content: string, offline: boolean }}
 */
async function chatReply({ user, history, message, todayText }) {
  const language = ARABIC.test(message) ? 'ar' : user.language || 'fr';
  if (hasAI()) {
    const system = `Tu es "Coach FitCoach", un coach sportif bienveillant dans une salle de sport en Tunisie.
Réponds en ${language === 'ar' ? 'arabe (tu peux comprendre la derja tunisienne)' : 'français (tu comprends aussi la derja tunisienne écrite en lettres latines)'}, en 4 phrases maximum.
Tu donnes des conseils d'entraînement, de technique, de récupération et d'alimentation simple (plats tunisiens bienvenus).
Tu ne fais jamais de diagnostic médical : en cas de douleur, conseille d'arrêter et de consulter un médecin.
Profil :
${profileText(user)}
${todayText ? `Séance du jour : ${todayText}` : ''}`;
    const messages = [
      ...history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', text: m.content })),
      { role: 'user', text: message },
    ];
    const text = await generate({ system, messages });
    if (text) return { content: text, offline: false };
  }
  return { content: fallbackReply(message, language), offline: true };
}

// Explication courte d'un remplacement (IA si possible, sinon phrase construite)
async function explainSubstitution({ original, alternative, sharedMuscles, language }) {
  const muscle = MUSCLES[original.primaryMuscle];
  const sharedFr = sharedMuscles.map((m) => MUSCLES[m].fr.toLowerCase()).join(', ');
  const sharedAr = sharedMuscles.map((m) => MUSCLES[m].ar).join('، ');
  const simple =
    language === 'ar'
      ? `«${alternative.nameAr}» يعمل على ${muscle.ar} مثل «${original.nameAr}»${sharedAr ? `، ويشغّل أيضاً ${sharedAr}` : ''}.`
      : `« ${alternative.nameFr} » travaille les ${muscle.fr.toLowerCase()} comme « ${original.nameFr} »${sharedFr ? `, et sollicite aussi : ${sharedFr}` : ''}.`;
  if (!hasAI()) return simple;
  const text = await generate({
    system: 'Tu es un coach sportif. Réponds en 2 phrases maximum.',
    messages: [
      {
        role: 'user',
        text: `${language === 'ar' ? 'بالعربية' : 'En français'} : explique pourquoi "${alternative.nameFr}" remplace bien "${original.nameFr}" (même muscle : ${muscle.fr}).`,
      },
    ],
  });
  return text || simple;
}

module.exports = { buildProgram, chatReply, explainSubstitution, validateAIProgram };
