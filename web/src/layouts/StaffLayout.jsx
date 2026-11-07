import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Icon, Avatar, Logo } from '../components';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { can } from '../lib/permissions';
import { api } from '../lib/api';
import { useInterval, useLoad } from '../lib/hooks';

// Menu de l'espace salle (D2) : chaque entrée n'apparaît que si le rôle a la permission
export const STAFF_NAV = [
  { to: '/salle', icon: 'layout-dashboard', label: 'staffnav.dashboard', perm: 'dashboard', end: true },
  { to: '/salle/direct', icon: 'activity', label: 'staffnav.live', perm: 'live' },
  { to: '/salle/membres', icon: 'users', label: 'staffnav.members', perm: 'members.read' },
  { to: '/salle/formules', icon: 'tag', label: 'staffnav.plans', perm: 'plans.read' },
  { to: '/salle/paiements', icon: 'wallet', label: 'staffnav.payments', perm: 'payments' },
  { to: '/salle/machines', icon: 'dumbbell', label: 'staffnav.machines', perm: 'machines.read' },
  { to: '/salle/pannes', icon: 'wrench', label: 'staffnav.reports', perm: 'reports.read', badge: 'newReports' },
  { head: 'staffnav.content' },
  { to: '/salle/exercices', icon: 'list', label: 'staffnav.exercises', perm: 'content' },
  { to: '/salle/programmes', icon: 'clipboard-list', label: 'staffnav.programs', perm: 'content' },
  { to: '/salle/nutrition', icon: 'utensils', label: 'staffnav.nutrition', perm: 'content' },
  { to: '/salle/coach', icon: 'message-circle', label: 'staffnav.coach', perm: 'content' },
  { head: 'staffnav.manage' },
  { to: '/salle/notifications', icon: 'bell', label: 'staffnav.notifications', perm: 'notifications' },
  { to: '/salle/rapports', icon: 'chart-column', label: 'staffnav.stats', perm: 'stats' },
  { to: '/salle/equipe', icon: 'shield', label: 'staffnav.team', perm: 'team' },
  { to: '/salle/parametres', icon: 'settings', label: 'staffnav.settings', perm: 'settings' },
];

// Onglets du téléphone (M) : Accueil · Membres · Scanner · Pannes · Plus
const STAFF_TABS = [
  { to: '/salle', icon: 'layout-dashboard', label: 'staffnav.home', perm: 'dashboard', end: true },
  { to: '/salle/membres', icon: 'users', label: 'staffnav.members', perm: 'members.read' },
  { to: '/salle/scanner', icon: 'scan-line', label: 'staffnav.scanner', perm: 'live' },
  { to: '/salle/machines', icon: 'dumbbell', label: 'staffnav.machines', perm: 'machines.read', onlyIfNo: 'members.read' },
  { to: '/salle/pannes', icon: 'wrench', label: 'staffnav.reports', perm: 'reports.read' },
  { to: '/salle/plus', icon: 'menu', label: 'staffnav.more' },
];

export const ADMIN_NAV = [
  { to: '/admin', icon: 'layout-dashboard', label: 'adminnav.dashboard', end: true },
  { to: '/admin/salles', icon: 'building-2', label: 'adminnav.gyms' },
  { to: '/admin/machines', icon: 'dumbbell', label: 'adminnav.machines' },
  { to: '/admin/exercices', icon: 'list', label: 'adminnav.exercises' },
  { to: '/admin/utilisateurs', icon: 'users', label: 'adminnav.users' },
];

/** Entrées visibles pour cet utilisateur (titres de section retirés s'ils n'ont plus d'entrées) */
export function visibleNav(user, admin) {
  if (admin) return ADMIN_NAV;
  const items = STAFF_NAV.filter((it) => it.head || can(user, it.perm));
  return items.filter((it, i) => !it.head || (items[i + 1] && !items[i + 1].head));
}

export default function StaffLayout({ admin = false }) {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const counts = useLoad(() => (admin ? Promise.resolve({}) : api.get('/staff/nav-counts').catch(() => ({}))), [admin]);
  useInterval(() => !admin && counts.reload(), 60000);

  const nav = visibleNav(user, admin);
  const tabs = admin
    ? ADMIN_NAV.slice(0, 5)
    : STAFF_TABS.filter((it) => (!it.perm || can(user, it.perm)) && (!it.onlyIfNo || !can(user, it.onlyIfNo)));

  async function onLogout() {
    await logout();
    navigate('/salle/connexion', { replace: true });
  }

  return (
    <div className="staff">
      <aside className="sidebar" aria-label={t('nav.menu')}>
        <Logo size={28} wordmark sub={admin ? t('staffnav.adminSpace') : t('staffnav.space')} />
        {!admin && user.gym ? (
          <div className="gym-card">
            <span className="live-dot" aria-hidden="true" />
            <div className="grow">
              <div className="name ellipsis" dir="auto">
                {user.gym.name}
              </div>
              <div className="sub">{user.gym.city || ''}</div>
            </div>
          </div>
        ) : null}
        <nav className="side-nav">
          {nav.map((it) =>
            it.head ? (
              <span key={it.head} className="head">
                {t(it.head)}
              </span>
            ) : (
              <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                <Icon name={it.icon} size={20} />
                <span className="grow">{t(it.label)}</span>
                {it.badge && counts.data?.[it.badge] ? <span className="badge num">{counts.data[it.badge]}</span> : null}
              </NavLink>
            )
          )}
        </nav>
        <div className="side-user">
          <Avatar name={user.name} size="sm" />
          <div className="grow">
            <div className="name ellipsis">{user.name}</div>
            <div className="role">{t(`role.${user.role}`)}</div>
          </div>
          <button type="button" className="icon-btn plain" onClick={onLogout} aria-label={t('action.logout')} title={t('action.logout')}>
            <Icon name="log-out" size={18} />
          </button>
        </div>
      </aside>

      <main className="staff-main">
        <div className="staff-content">
          <Outlet context={{ counts: counts.data || {}, reloadCounts: counts.reload }} />
        </div>
      </main>

      <nav className="staff-tabbar" aria-label={t('nav.menu')}>
        {tabs.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => (isActive ? 'active' : '')} aria-label={t(it.label)}>
            <Icon name={it.icon} size={22} />
            <span className="tab-label">{t(it.label)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
