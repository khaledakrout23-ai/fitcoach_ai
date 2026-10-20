import { api } from '../../api';
import { useI18n } from '../../i18n';
import { Spinner, Stat, useLoad } from '../../components/ui';

export default function AdminDashboard() {
  const { t } = useI18n();
  const stats = useLoad(() => api('/admin/stats'));
  if (stats.loading) return <Spinner />;
  const s = stats.data;
  if (!s) return null;
  return (
    <div className="page">
      <div>
        <h1>{t('nav.dashboard')}</h1>
        <p className="page-sub">{t('admin.sub')}</p>
      </div>
      <div className="stats">
        <Stat value={s.sportifs} label={t('admin.sportifs')} />
        <Stat value={s.gerants} label={t('admin.gerants')} />
        <Stat value={s.gyms} label={t('nav.gyms')} />
        <Stat value={s.exercises} label={t('nav.exercises')} />
        <Stat value={s.sessions} label={t('admin.sessions')} />
      </div>
      <div className={`notice ${s.aiEnabled ? '' : 'notice-warn'}`}>{s.aiEnabled ? t('admin.aiOn') : t('admin.aiOff')}</div>
    </div>
  );
}
