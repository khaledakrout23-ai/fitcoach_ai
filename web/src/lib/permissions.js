// Copie de backend/src/services/permissions.js : sert à afficher les bons menus.
// Le serveur vérifie chaque requête ; cette copie ne protège rien à elle seule.
export const STAFF_ROLES = ['GERANT', 'ACCUEIL', 'TECHNICIEN', 'COACH'];

export const PERMISSIONS = {
  dashboard: STAFF_ROLES,
  live: ['GERANT', 'ACCUEIL'],
  'members.read': ['GERANT', 'ACCUEIL', 'COACH'],
  'members.write': ['GERANT', 'ACCUEIL'],
  'members.health': ['GERANT', 'COACH'],
  payments: ['GERANT', 'ACCUEIL'],
  'plans.read': ['GERANT', 'ACCUEIL'],
  'plans.write': ['GERANT'],
  'machines.read': STAFF_ROLES,
  'machines.write': ['GERANT', 'TECHNICIEN'],
  'reports.read': STAFF_ROLES,
  'reports.write': ['GERANT', 'TECHNICIEN'],
  'reports.create': STAFF_ROLES,
  content: ['GERANT', 'COACH'],
  notifications: ['GERANT', 'ACCUEIL'],
  stats: ['GERANT'],
  team: ['GERANT'],
  settings: ['GERANT'],
  audit: ['GERANT'],
};

/** user.permissions vient du serveur (/auth/me) ; la matrice locale sert de secours */
export function can(user, permission) {
  if (!user) return false;
  if (Array.isArray(user.permissions)) return user.permissions.includes(permission);
  return Boolean(PERMISSIONS[permission]?.includes(user.role));
}

export const isStaff = (user) => Boolean(user && STAFF_ROLES.includes(user.role));
