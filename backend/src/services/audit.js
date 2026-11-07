// Journal des actions de l'équipe (écran « Équipe » : « chaque action est enregistrée avec le nom de la personne »)
const { AuditLog } = require('../models');

/**
 * @param {import('express').Request} req   requête de l'auteur (req.user)
 * @param {string} action                   ex. 'member.create', 'payment.create', 'plan.update'
 * @param {{ type?: string, id?: number }} [target]
 * @param {object} [details]                jamais de mot de passe ni de donnée de santé
 * @param {object} [options]                { transaction }
 */
async function audit(req, action, target = {}, details = null, options = {}) {
  try {
    await AuditLog.create(
      {
        gymId: req.user.gymId || null,
        actorId: req.user.id,
        action,
        targetType: target.type || null,
        targetId: target.id || null,
        details,
      },
      options
    );
  } catch (err) {
    // le journal ne doit jamais bloquer l'action elle-même, mais l'échec est visible dans la console
    console.error('[audit] écriture impossible :', err.message);
  }
}

module.exports = { audit };
