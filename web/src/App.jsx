import { lazy, Suspense } from 'react';
import { useRoutes } from 'react-router-dom';
import { RequireAuth, RootRedirect, NotFound } from './app/guards';
import AthleteLayout, { FullscreenLayout } from './layouts/AthleteLayout';
import StaffLayout from './layouts/StaffLayout';

// Chaque fonctionnalité déclare ses routes dans son propre fichier routes.jsx :
// - routes publiques / onboarding : chemins complets ;
// - app membre : { tab: [...] } sous /app avec la barre d'onglets, { full: [...] } sous /app en plein écran ;
// - espace salle et administration : chemins relatifs à /salle et /admin.
import authRoutes from './features/auth/routes';
import onboardingRoutes from './features/onboarding/routes';
import home from './features/home/routes';
import training from './features/training/routes';
import session from './features/session/routes';
import meals from './features/meals/routes';
import coach from './features/coach/routes';
import account from './features/account/routes';
import report from './features/report/routes';
import staffOps from './features/staff/ops/routes';
import staffManage from './features/staff/manage/routes';
import staffContent from './features/staff/content/routes';
import adminRoutes from './features/admin/routes';

const athlete = [home, training, session, meals, coach, account, report];

const routes = [
  { path: '/', element: <RootRedirect /> },
  ...authRoutes,
  ...onboardingRoutes,
  {
    path: '/app',
    element: (
      <RequireAuth roles={['SPORTIF']}>
        <AthleteLayout />
      </RequireAuth>
    ),
    children: athlete.flatMap((f) => f.tab || []),
  },
  {
    path: '/app',
    element: (
      <RequireAuth roles={['SPORTIF']}>
        <FullscreenLayout />
      </RequireAuth>
    ),
    children: athlete.flatMap((f) => f.full || []),
  },
  {
    path: '/salle',
    element: (
      <RequireAuth staff>
        <StaffLayout />
      </RequireAuth>
    ),
    children: [...staffOps, ...staffManage, ...staffContent],
  },
  {
    path: '/admin',
    element: (
      <RequireAuth roles={['ADMIN']}>
        <StaffLayout admin />
      </RequireAuth>
    ),
    children: adminRoutes,
  },
  { path: '*', element: <NotFound /> },
];

// Kit de composants pour le contrôle visuel : développement uniquement (supprimé du build de production)
if (import.meta.env.DEV) {
  const DevKit = lazy(() => import('./app/DevKit'));
  routes.unshift({ path: '/dev/kit', element: <Suspense fallback={null}><DevKit /></Suspense> });
}

export default function App() {
  return useRoutes(routes);
}
