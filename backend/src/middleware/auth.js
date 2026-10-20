const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'fitcoach-dev-secret';

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, gymId: user.gymId || null }, SECRET, { expiresIn: '7d' });
}

// Vérifie le jeton JWT envoyé dans l'en-tête "Authorization: Bearer <jeton>"
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Connexion requise.' });
  try {
    req.user = jwt.verify(token, SECRET);
    return next();
  } catch {
    return res.status(401).json({ code: 'AUTH_INVALID', message: 'Session expirée, reconnectez-vous.' });
  }
}

// Autorise seulement certains rôles (RG : chaque rôle n'accède qu'à ses fonctionnalités)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Accès refusé.' });
    }
    return next();
  };
}

module.exports = { auth, requireRole, signToken };
