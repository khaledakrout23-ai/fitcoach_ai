// Routes « auth » : accueil, connexions (membre, équipe), premier mot de passe, mot de passe oublié de l'équipe
import { PublicOnly, RequireAuth } from '../../app/guards';
import { Guest } from './shared';
import Welcome from './Welcome';
import MemberLogin from './MemberLogin';
import FirstPassword from './FirstPassword';
import StaffLogin from './StaffLogin';
import StaffForgot from './StaffForgot';

export default [
  {
    path: '/bienvenue',
    element: (
      <PublicOnly>
        <Welcome />
      </PublicOnly>
    ),
  },
  {
    path: '/connexion',
    element: (
      <Guest>
        <MemberLogin />
      </Guest>
    ),
  },
  {
    path: '/premiere-connexion',
    element: (
      <RequireAuth allowPasswordChange>
        <FirstPassword />
      </RequireAuth>
    ),
  },
  {
    path: '/salle/connexion',
    element: (
      <Guest>
        <StaffLogin />
      </Guest>
    ),
  },
  {
    path: '/salle/mot-de-passe-oublie',
    element: (
      <Guest>
        <StaffForgot />
      </Guest>
    ),
  },
];
