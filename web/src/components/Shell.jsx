import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { ChangePasswordModal } from './Password';
import { useToast } from './ui';

// Icônes (traits simples)
const PATHS = {
  home: 'M4 11 12 4l8 7v9h-5v-6H9v6H4z',
  program: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
  coach: 'M4 5h16v11H9l-5 4z',
  progress: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6',
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  members: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c.8-3.5 3.5-5 7-5s6.2 1.5 7 5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 15c2 .6 3.4 2.2 4 5',
  machines: 'M3 10h3v4H3zM18 10h3v4h-3zM6 8h3v8H6zM15 8h3v8h-3zM9 11h6v2H9z',
  reports: 'M12 3 2 20h20zM12 10v4M12 17v.5',
  gym: 'M3 21V9l9-5 9 5v12M8 21v-7h8v7',
  exercises: 'M6.5 6.5h11v11h-11zM3 9v6M21 9v6',
  users: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
};

export function Icon({ name }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#1F6F78" />
      <rect x="10" y="22" width="8" height="20" rx="2" fill="#F2B705" />
      <rect x="46" y="22" width="8" height="20" rx="2" fill="#F2B705" />
      <rect x="18" y="29" width="28" height="6" rx="2" fill="#fff" />
    </svg>
  );
}

const MENUS = {
  SPORTIF: [
    ['/app', 'home', 'nav.home', true],
    ['/app/programme', 'program', 'nav.program'],
    ['/app/coach', 'coach', 'nav.coach'],
    ['/app/progression', 'progress', 'nav.progress'],
    ['/app/profil', 'profile', 'nav.profile'],
  ],
  GERANT: [
    ['/gerant', 'dashboard', 'nav.dashboard', true],
    ['/gerant/abonnes', 'members', 'nav.members'],
    ['/gerant/machines', 'machines', 'nav.machines'],
    ['/gerant/pannes', 'reports', 'nav.reports'],
    ['/gerant/salle', 'gym', 'nav.gym'],
  ],
  ADMIN: [
    ['/admin', 'dashboard', 'nav.dashboard', true],
    ['/admin/salles', 'gym', 'nav.gyms'],
    ['/admin/machines', 'machines', 'nav.machines'],
    ['/admin/exercices', 'exercises', 'nav.exercises'],
    ['/admin/utilisateurs', 'users', 'nav.users'],
  ],
};

export function LangSwitch({ dark }) {
  const { lang, setLang } = useI18n();
  return (
    <button
      type="button"
      className={dark ? 'btn btn-small btn-ghost' : 'btn btn-small btn-ghost'}
      style={dark ? { color: '#fff', borderColor: 'rgba(255,255,255,.25)' } : undefined}
      onClick={() => setLang(lang === 'fr' ? 'ar' : 'fr')}
    >
      {lang === 'fr' ? 'العربية' : 'Français'}
    </button>
  );
}

export default function Shell() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const menu = MENUS[user.role] || [];
  const [pwOpen, setPwOpen] = useState(false);
  const [toast, showToast] = useToast();
  const lightBtn = { color: '#fff', borderColor: 'rgba(255,255,255,.25)' };

  const links = menu.map(([to, icon, label, end]) => (
    <NavLink key={to} to={to} end={end} className="nav-link">
      <Icon name={icon} />
      <span>{t(label)}</span>
    </NavLink>
  ));

  return (
    <div className="shell">
      <aside className="sidebar">
        <span className="brand">
          <BrandMark /> FitCoach AI
        </span>
        <nav aria-label={t('nav.menu')}>{links}</nav>
        <div className="sidebar-foot">
          <div>
            <div className="sidebar-user">{user.name}</div>
            <div className="sidebar-role">{t(`role.${user.role}`)}</div>
          </div>
          <div className="inline">
            <LangSwitch dark />
            <button type="button" className="btn btn-small btn-ghost" style={lightBtn} onClick={logout}>
              {t('nav.logout')}
            </button>
          </div>
          <button type="button" className="btn btn-small btn-ghost" style={{ ...lightBtn, justifySelf: 'start' }} onClick={() => setPwOpen(true)}>
            🔒 {t('pw.changeTitle')}
          </button>
        </div>
      </aside>

      <header className="topbar">
        <span className="brand">
          <BrandMark /> FitCoach AI
        </span>
        <div className="inline">
          <LangSwitch dark />
          <button type="button" className="btn btn-small btn-ghost" style={lightBtn} onClick={() => setPwOpen(true)} aria-label={t('pw.changeTitle')}>
            🔒
          </button>
          <button type="button" className="btn btn-small btn-ghost" style={lightBtn} onClick={logout} aria-label={t('nav.logout')}>
            <Icon name="logout" />
          </button>
        </div>
      </header>

      <main className="main">
        {toast}
        <Outlet />
      </main>

      {pwOpen && (
        <ChangePasswordModal
          onClose={() => setPwOpen(false)}
          onDone={() => {
            setPwOpen(false);
            showToast(t('pw.changed'));
          }}
        />
      )}

      <nav className="tabbar" aria-label={t('nav.menu')}>
        {links}
      </nav>
    </div>
  );
}
