// Permet d'utiliser async/await dans les routes Express 4 sans oublier les erreurs
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function notFound(req, res) {
  res.status(404).json({ code: 'NOT_FOUND', message: 'Ressource introuvable.' });
}

// Réponses d'erreur sans détail interne (pas de pile, pas de requête SQL)
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) {
    return res.status(err.status).json({ code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ code: 'TOO_LARGE', message: 'Fichier ou requête trop volumineux.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'BAD_JSON', message: 'Requête invalide.' });
  }
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ code: 'DUPLICATE', message: 'Cette valeur existe déjà.' });
  }
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({ code: 'VALIDATION', message: 'Données invalides.' });
  }
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(409).json({ code: 'IN_USE', message: 'Élément utilisé ailleurs, suppression impossible.' });
  }
  if (err.name === 'SequelizeDatabaseError' && /Data truncated|Incorrect .* value/i.test(err.message)) {
    return res.status(400).json({ code: 'VALIDATION', message: 'Données invalides.' });
  }
  console.error(err);
  return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erreur du serveur.' });
}

module.exports = { ah, HttpError, notFound, errorHandler };
