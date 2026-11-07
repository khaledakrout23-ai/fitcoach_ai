// Matrice des rôles de l'espace salle (écran « Équipe » : Gérant · Accueil · Technicien · Coach).
// Copie côté site : web/src/lib/permissions.js (sert seulement à masquer les menus ; le serveur décide).

const STAFF_ROLES = ['GERANT', 'ACCUEIL', 'TECHNICIEN', 'COACH'];

const PERMISSIONS = {
  dashboard: STAFF_ROLES,
  live: ['GERANT', 'ACCUEIL'], // salle en direct, entrées, scanner
  'members.read': ['GERANT', 'ACCUEIL', 'COACH'],
  'members.write': ['GERANT', 'ACCUEIL'], // créer, renouveler, geler, réinitialiser le mot de passe
  'members.health': ['GERANT', 'COACH'], // objectif, poids, douleurs : jamais l'accueil ni le technicien
  payments: ['GERANT', 'ACCUEIL'], // paiements et caisse
  'plans.read': ['GERANT', 'ACCUEIL'],
  'plans.write': ['GERANT'],
  'machines.read': STAFF_ROLES,
  'machines.write': ['GERANT', 'TECHNICIEN'],
  'reports.read': STAFF_ROLES, // pannes
  'reports.write': ['GERANT', 'TECHNICIEN'],
  'reports.create': STAFF_ROLES, // signaler une panne depuis l'espace salle
  content: ['GERANT', 'COACH'], // exercices, programmes, nutrition, réglages du coach
  notifications: ['GERANT', 'ACCUEIL'],
  stats: ['GERANT'], // rapports et revenus
  team: ['GERANT'],
  settings: ['GERANT'],
  audit: ['GERANT'],
};

function can(role, permission) {
  return Boolean(PERMISSIONS[permission] && PERMISSIONS[permission].includes(role));
}

// Liste des permissions d'un rôle (envoyée au site avec /auth/me)
function permissionsOf(role) {
  return Object.keys(PERMISSIONS).filter((p) => PERMISSIONS[p].includes(role));
}

module.exports = { STAFF_ROLES, PERMISSIONS, can, permissionsOf };
