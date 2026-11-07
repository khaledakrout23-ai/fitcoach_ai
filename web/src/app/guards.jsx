import { Navigate, useLocation } from 'react-router-dom';
import { homeFor, loginPathFor, useAuth } from '../lib/auth';
import { can, isStaff } from '../lib/permissions';
import { Empty } from '../components';
import { useI18n } from '../lib/i18n';

function Splash() {
  return (
    <div className="splash" role="status" aria-label="Kammel">
      <img src="/brand/kammel-symbol.png" alt="" width="96" height="98" />
    </div>
  );
}

/**
 * Protège une zone de l'app.
 * roles : rôles autorisés ; staff : tout membre de l'équipe d'une salle ; permission : clé de la matrice
 * allowPasswordChange : page « Choisis ton mot de passe » ; allowNotOnboarded : questions de profil
 */
export function RequireAuth({ children, roles, staff = false, permission, allowPasswordChange = false, allowNotOnboarded = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) {
    const wantsStaff = location.pathname.startsWith('/salle') || location.pathname.startsWith('/admin');
    return <Navigate to={wantsStaff ? '/salle/connexion' : loginPathFor('SPORTIF')} replace state={{ from: location.pathname }} />;
  }
  if (user.mustChangePassword && !allowPasswordChange) return <Navigate to="/premiere-connexion" replace />;
  if (!user.mustChangePassword && allowPasswordChange) return <Navigate to={homeFor(user)} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  if (staff && !isStaff(user)) return <Navigate to={homeFor(user)} replace />;
  if (user.role === 'SPORTIF' && !user.onboardedAt && !allowNotOnboarded && !allowPasswordChange) return <Navigate to="/onboarding" replace />;
  if (permission && !can(user, permission)) return <Forbidden />;
  return children;
}

/** Pages publiques (bienvenue, connexion) : un compte déjà connecté va directement chez lui */
export function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to={homeFor(user)} replace />;
  return children;
}

/** Page de l'espace salle réservée à certaines permissions */
export function Permission({ name, children }) {
  const { user } = useAuth();
  if (!can(user, name)) return <Forbidden />;
  return children;
}

export function Forbidden() {
  const { t } = useI18n();
  return <Empty icon="lock" title={t('err.FORBIDDEN')} />;
}

export function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  return <Navigate to={homeFor(user)} replace />;
}

export function NotFound() {
  const { user } = useAuth();
  const { t } = useI18n();
  return (
    <div className="auth">
      <Empty icon="map-pin" title={t('err.NOT_FOUND')}>
        <a href={homeFor(user)}>{t('action.back')}</a>
      </Empty>
    </div>
  );
}
