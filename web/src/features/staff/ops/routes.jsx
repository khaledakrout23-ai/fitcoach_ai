// Routes « staff/ops » (relatives à /salle) : tableau de bord, salle en direct, scanner, membres, formules, paiements, menu Plus
import { Permission } from '../../../app/guards';
import Dashboard from './Dashboard';
import Live from './Live';
import LiveScreen from './LiveScreen';
import Scanner from './Scanner';
import Members from './Members';
import MemberDetail from './MemberDetail';
import Plans from './Plans';
import Payments from './Payments';
import More from './More';

export default [
  { index: true, element: <Permission name="dashboard"><Dashboard /></Permission> },
  { path: 'direct', element: <Permission name="live"><Live /></Permission> },
  { path: 'direct/ecran', element: <Permission name="live"><LiveScreen /></Permission> },
  { path: 'scanner', element: <Permission name="live"><Scanner /></Permission> },
  { path: 'membres', element: <Permission name="members.read"><Members /></Permission> },
  { path: 'membres/nouveau', element: <Permission name="members.write"><Members creating /></Permission> },
  { path: 'membres/:id', element: <Permission name="members.read"><MemberDetail /></Permission> },
  { path: 'formules', element: <Permission name="plans.read"><Plans /></Permission> },
  { path: 'paiements', element: <Permission name="payments"><Payments /></Permission> },
  { path: 'plus', element: <More /> },
];
