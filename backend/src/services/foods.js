// Aliments (catalogue Kammel, salle, membre) : validation des formulaires
const { HttpError } = require('../middleware/errors');
const { required, num, text } = require('../utils');

function requiredText(value, max, field) {
  const s = text(value, max);
  if (!s) throw new HttpError(400, 'VALIDATION', `Champ invalide : ${field}`);
  return s;
}

/** Aliment envoyé par un formulaire (membre ou équipe) : valeurs bornées. partial = mise à jour */
function cleanFood(body, { partial = false } = {}) {
  if (!partial) required(body, ['nameFr', 'portion', 'calories']);
  const out = {};
  if (body.nameFr !== undefined) out.nameFr = requiredText(body.nameFr, 120, 'nameFr');
  if (body.nameAr !== undefined) out.nameAr = text(body.nameAr, 120);
  if (body.nameEn !== undefined) out.nameEn = text(body.nameEn, 120);
  if (body.portion !== undefined) out.portion = requiredText(body.portion, 60, 'portion');
  if (body.calories !== undefined) out.calories = Math.round(num(body.calories, 'calories', { min: 0, max: 3000 }));
  for (const k of ['protein', 'carbs', 'fat']) if (body[k] !== undefined) out[k] = Math.round(num(body[k], k, { min: 0, max: 400 }));
  if (!partial) {
    out.nameAr = out.nameAr || out.nameFr;
    for (const k of ['protein', 'carbs', 'fat']) out[k] = out[k] ?? 0;
  } else if (out.nameAr === null) delete out.nameAr; // le nom arabe est obligatoire en base
  return out;
}

module.exports = { cleanFood };
