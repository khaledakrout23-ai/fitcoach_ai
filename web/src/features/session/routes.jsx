// Routes « session » de l'app membre : tab = avec la barre d'onglets, full = plein écran
import Session from './Session';

export default { tab: [], full: [{ path: 'seance/:id', element: <Session /> }] };
