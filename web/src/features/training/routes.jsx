// Routes « training » de l'app membre : tab = avec la barre d'onglets, full = plein écran
import Training from './Training';
import History from './History';
import Exercise from './Exercise';

export default {
  tab: [
    { path: 'entrainement', element: <Training /> },
    { path: 'entrainement/historique', element: <History /> },
  ],
  full: [{ path: 'exercice/:id', element: <Exercise /> }],
};
