import { NavLink, Outlet } from 'react-router-dom';
import { Icon } from '../components';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';

// 5 onglets (B) : Accueil · Entraînement · Repas · Coach · Compte. Onglet actif : pastille ember + icône pleine + libellé.
const TABS = [
  { to: '/app', icon: 'house', label: 'nav.home', end: true },
  { to: '/app/entrainement', icon: 'dumbbell', label: 'nav.training' },
  { to: '/app/repas', icon: 'utensils', label: 'nav.meals', feature: 'meals' },
  { to: '/app/coach', icon: 'message-circle', label: 'nav.coach', feature: 'coach' },
  { to: '/app/compte', icon: 'user', label: 'nav.account' },
];

export default function AthleteLayout() {
  const { t } = useI18n();
  const { user } = useAuth();
  const features = user?.gym?.settings?.features || {};
  const tabs = TABS.filter((tab) => !tab.feature || features[tab.feature] !== false);
  return (
    <div className="app-frame with-tabs">
      <Outlet />
      <nav className="tabbar" aria-label={t('nav.menu')}>
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => (isActive ? 'active' : '')} aria-label={t(tab.label)}>
            {({ isActive }) => (
              <>
                <Icon name={tab.icon} fill={isActive && tab.icon !== 'dumbbell' && tab.icon !== 'utensils'} />
                <span className="tab-label">{t(tab.label)}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Écrans plein écran (séance, fiche exercice) : sans onglets */
export function FullscreenLayout() {
  return (
    <div className="app-frame fullscreen">
      <Outlet />
    </div>
  );
}
