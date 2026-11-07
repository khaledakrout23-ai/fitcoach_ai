// Routes « onboarding » : questions de profil du membre (une seule page, étape dans ?step=)
import { RequireAuth } from '../../app/guards';
import Onboarding from './Onboarding';

export default [
  {
    path: '/onboarding',
    element: (
      <RequireAuth roles={['SPORTIF']} allowNotOnboarded>
        <Onboarding />
      </RequireAuth>
    ),
  },
];
