// Routes « staff/manage » (relatives à /salle)
import { Permission } from '../../../app/guards';
import Machines from './Machines';
import MachineQr from './MachineQr';
import Reports from './Reports';
import Team from './Team';
import Settings from './Settings';
import Notifications from './Notifications';
import Stats from './Stats';

export default [
  { path: 'machines', element: <Permission name="machines.read"><Machines /></Permission> },
  { path: 'machines/qr', element: <Permission name="machines.read"><MachineQr /></Permission> },
  { path: 'pannes', element: <Permission name="reports.read"><Reports /></Permission> },
  { path: 'equipe', element: <Permission name="team"><Team /></Permission> },
  { path: 'parametres', element: <Permission name="settings"><Settings /></Permission> },
  { path: 'notifications', element: <Permission name="notifications"><Notifications /></Permission> },
  { path: 'rapports', element: <Permission name="stats"><Stats /></Permission> },
];
