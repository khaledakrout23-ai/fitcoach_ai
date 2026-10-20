// Reconnaissance d'un équipement de salle à partir d'une photo (Gemini, vision)
const { Op } = require('sequelize');
const { Equipment } = require('../models');
const { HttpError } = require('../middleware/errors');
const { generate, hasAI } = require('./gemini');

/**
 * @param {string} dataUrl  photo « data:image/...;base64,... »
 * @returns {Promise<{ equipmentId: number, label: string, confidence: number }
 *   | { equipmentId: null, newType: { code: string, nameFr: string, nameAr: string, category: string }, label: string, confidence: number }>}
 *   newType : aucun type existant ne correspond, l'IA en propose un nouveau
 */
async function identifyMachine(dataUrl) {
  const m = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new HttpError(400, 'VALIDATION', 'Photo invalide.');
  if (!hasAI()) throw new HttpError(503, 'NO_AI', 'La reconnaissance par photo nécessite l’IA (clé GEMINI_API_KEY).');
  const equipment = await Equipment.findAll({ where: { code: { [Op.ne]: 'poids_du_corps' } } });
  const list = equipment.map((e) => `${e.code} | ${e.nameFr}`).join('\n');
  const raw = await generate({
    system: 'Tu reconnais les équipements de salle de sport sur des photos. Tu réponds uniquement en JSON.',
    messages: [
      {
        role: 'user',
        image: { mimeType: m[1], data: m[2] },
        text: `Quel équipement est sur cette photo ? Types d'équipement existants (code | nom) :
${list}

Choisis un code de la liste UNIQUEMENT si c'est exactement ce type d'équipement (mêmes exercices possibles).
Exemples : une machine de tractions/dips assistée n'est PAS une machine de tirage vertical (poulie haute) ;
une hack squat n'est PAS une presse à cuisses.
Si aucun type ne correspond exactement, mets "code": null et propose un nouveau type dans "newType"
(code en snake_case sans accent, nom français, nom arabe, catégorie MACHINE ou LIBRE).
Si la photo ne montre pas d'équipement de musculation, mets "code": null et "newType": null.
Réponds avec ce JSON exact :
{"code": "...", "newType": {"code": "...", "nameFr": "...", "nameAr": "...", "category": "MACHINE"}, "label": "nom court en français pour cette machine (marque/modèle si visible)", "confidence": 0.0}`,
      },
    ],
    json: true,
  });
  if (!raw) throw new HttpError(503, 'AI_UNAVAILABLE', 'L’IA est momentanément indisponible. Réessayez dans un instant.');
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    // réponse illisible : traitée comme « non reconnu »
  }
  const confidence = Math.min(1, Math.max(0, Number(data?.confidence) || 0));
  const found = data && equipment.find((e) => e.code === data.code);
  if (found) return { equipmentId: found.id, label: String(data.label || found.nameFr).slice(0, 100), confidence };
  const newType = cleanNewType(data?.newType);
  if (!newType) throw new HttpError(422, 'NOT_RECOGNIZED', 'Équipement non reconnu. Choisissez le type à la main.');
  // le type proposé existe peut-être déjà sous ce code
  const same = equipment.find((e) => e.code === newType.code);
  if (same) return { equipmentId: same.id, label: String(data.label || same.nameFr).slice(0, 100), confidence };
  return { equipmentId: null, newType, label: String(data.label || newType.nameFr).slice(0, 100), confidence };
}

// Nouveau type d'équipement (proposé par l'IA ou envoyé par l'administrateur) : valeurs sûres uniquement
function cleanNewType(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const code = String(raw.code || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  const nameFr = String(raw.nameFr || '').trim().slice(0, 80);
  const nameAr = String(raw.nameAr || '').trim().slice(0, 80);
  if (!code || !nameFr || !nameAr) return null;
  return { code, nameFr, nameAr, category: raw.category === 'LIBRE' ? 'LIBRE' : 'MACHINE' };
}

module.exports = { identifyMachine, cleanNewType };
