// Routes « account » de l'app membre : tab = avec la barre d'onglets, full = plein écran
import Account from './Account';
import Payments from './Payments';
import AccessCard from './AccessCard';

export default {
  tab: [
    { path: 'compte', element: <Account /> },
    { path: 'compte/paiements', element: <Payments /> },
  ],
  full: [{ path: 'carte', element: <AccessCard /> }],
};
