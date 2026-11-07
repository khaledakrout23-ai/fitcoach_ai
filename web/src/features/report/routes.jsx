// Routes « report » de l'app membre : tab = avec la barre d'onglets, full = plein écran
import Report from './Report';
import ReportDetail from './ReportDetail';
import MyReports from './MyReports';

export default {
  tab: [{ path: 'signalements', element: <MyReports /> }],
  full: [
    { path: 'panne', element: <Report /> },
    { path: 'panne/:id', element: <ReportDetail /> },
  ],
};
