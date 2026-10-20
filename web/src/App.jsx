import { Navigate, Route, Routes } from 'react-router-dom';
import { homeFor, useAuth } from './auth';
import Shell from './components/Shell';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import Home from './pages/athlete/Home';
import Profile from './pages/athlete/Profile';
import Program from './pages/athlete/Program';
import Session from './pages/athlete/Session';
import ExerciseSheet from './pages/athlete/ExerciseSheet';
import Coach from './pages/athlete/Coach';
import Progress from './pages/athlete/Progress';
import ReportMachine from './pages/athlete/ReportMachine';
import ManagerDashboard from './pages/manager/Dashboard';
import Members from './pages/manager/Members';
import Machines from './pages/manager/Machines';
import Reports from './pages/manager/Reports';
import GymSettings from './pages/manager/GymSettings';
import AdminDashboard from './pages/admin/Dashboard';
import Gyms from './pages/admin/Gyms';
import Exercises from './pages/admin/Exercises';
import Users from './pages/admin/Users';
import AdminMachines from './pages/admin/Machines';

// Protège les pages selon le rôle (chaque rôle accède uniquement à ses fonctionnalités)
function RequireRole({ role }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/connexion" replace />;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
  return <Shell />;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/inscription" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/verification" element={<PublicOnly><VerifyEmail /></PublicOnly>} />
      <Route path="/mot-de-passe-oublie" element={<PublicOnly><ForgotPassword /></PublicOnly>} />

      <Route path="/app" element={<RequireRole role="SPORTIF" />}>
        <Route index element={<Home />} />
        <Route path="profil" element={<Profile />} />
        <Route path="programme" element={<Program />} />
        <Route path="seance/:id" element={<Session />} />
        <Route path="exercice/:id" element={<ExerciseSheet />} />
        <Route path="coach" element={<Coach />} />
        <Route path="progression" element={<Progress />} />
        <Route path="panne" element={<ReportMachine />} />
      </Route>

      <Route path="/gerant" element={<RequireRole role="GERANT" />}>
        <Route index element={<ManagerDashboard />} />
        <Route path="abonnes" element={<Members />} />
        <Route path="machines" element={<Machines />} />
        <Route path="pannes" element={<Reports />} />
        <Route path="salle" element={<GymSettings />} />
      </Route>

      <Route path="/admin" element={<RequireRole role="ADMIN" />}>
        <Route index element={<AdminDashboard />} />
        <Route path="salles" element={<Gyms />} />
        <Route path="machines" element={<AdminMachines />} />
        <Route path="exercices" element={<Exercises />} />
        <Route path="utilisateurs" element={<Users />} />
      </Route>

      <Route path="*" element={<Navigate to="/connexion" replace />} />
    </Routes>
  );
}
