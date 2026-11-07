// Routes « admin » (relatives à /admin, rôle ADMIN vérifié par App.jsx et par le serveur)
import Dashboard from './Dashboard';
import Gyms from './Gyms';
import Machines from './Machines';
import Exercises from './Exercises';
import Users from './Users';

export default [
  { index: true, element: <Dashboard /> },
  { path: 'salles', element: <Gyms /> },
  { path: 'machines', element: <Machines /> },
  { path: 'exercices', element: <Exercises /> },
  { path: 'utilisateurs', element: <Users /> },
];
