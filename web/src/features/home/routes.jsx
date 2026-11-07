// Routes « home » de l'app membre : tab = avec la barre d'onglets, full = plein écran
import Home from './Home';
import Notifications from './Notifications';

export default {
  tab: [
    { index: true, element: <Home /> },
    { path: 'notifications', element: <Notifications /> },
  ],
  full: [],
};
