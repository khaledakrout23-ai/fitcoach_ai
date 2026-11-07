// Tableau de bord de l'administration Kammel : chiffres de la plateforme et salles
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/hooks';
import { Button, Kpi, StatusPill, PageSkeleton, ErrorState, Empty } from '../../components';
import { PageHead } from '../staff/manage/shared';

export default function Dashboard() {
  const { t, fmt } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const stats = useLoad(() => api.get('/admin/stats'), []);
  const gyms = useLoad(() => api.get('/admin/gyms'), []);
  const s = stats.data;

  return (
    <>
      <PageHead
        title={t('admin.dash.hello', { name: user.name.split(' ')[0] })}
        subtitle={t('admin.dash.subtitle')}
        actions={
          <Button
            variant="ghost"
            icon="log-out"
            className="only-phone"
            onClick={async () => {
              await logout();
              navigate('/salle/connexion', { replace: true });
            }}
          >
            {t('action.logout')}
          </Button>
        }
      />
      {stats.loading && !s ? (
        <PageSkeleton cards={2} />
      ) : stats.error && !s ? (
        <ErrorState error={stats.error} onRetry={stats.reload} />
      ) : (
        <div className="kpi-grid">
          <Kpi label={t('admin.dash.gyms')} value={fmt.num(s.gyms)} to="/admin/salles" />
          <Kpi label={t('admin.dash.members')} value={fmt.num(s.sportifs)} to="/admin/utilisateurs" />
          <Kpi label={t('admin.dash.staff')} value={fmt.num(s.staff)} />
          <Kpi label={t('admin.dash.exercises')} value={fmt.num(s.exercises)} to="/admin/exercices" />
          <Kpi label={t('admin.dash.sessions')} value={fmt.num(s.sessions)} sub={t('admin.dash.today', { n: fmt.num(s.sessionsToday) })} />
          <Kpi label={t('admin.dash.ai')} value={s.aiEnabled ? t('admin.dash.aiOn') : t('admin.dash.aiOff')} subTone={s.aiEnabled ? 'ok' : 'warn'} sub={s.aiEnabled ? t('admin.dash.aiOnSub') : t('admin.dash.aiOffSub')} />
        </div>
      )}
      <section className="card pad-lg stack">
        <div className="row between">
          <h2 className="card-title">{t('admin.dash.gymList')}</h2>
          <Link to="/admin/salles" className="link-btn">
            {t('action.seeAll')}
          </Link>
        </div>
        {gyms.loading && !gyms.data ? (
          <PageSkeleton cards={1} />
        ) : gyms.error && !gyms.data ? (
          <ErrorState compact error={gyms.error} onRetry={gyms.reload} />
        ) : gyms.data.length === 0 ? (
          <Empty icon="building-2" title={t('admin.gyms.empty')} />
        ) : (
          <div className="table-wrap">
            <table className="table responsive">
              <thead>
                <tr>
                  <th>{t('admin.gyms.gym')}</th>
                  <th>{t('admin.gyms.members')}</th>
                  <th>{t('admin.gyms.machines')}</th>
                  <th>{t('admin.gyms.live')}</th>
                </tr>
              </thead>
              <tbody>
                {gyms.data.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <span className="w500" style={{ display: 'block' }} dir="auto">{g.name}</span>
                      <span className="caption muted">{g.city}</span>
                    </td>
                    <td data-label={t('admin.gyms.members')}><span className="num">{fmt.num(g.members)}</span></td>
                    <td data-label={t('admin.gyms.machines')}><span className="num">{fmt.num(g.machines)}</span></td>
                    <td data-label={t('admin.gyms.live')}>
                      <StatusPill tone={g.liveCount ? 'ok' : ''} led>
                        <span className="num">{fmt.num(g.liveCount)}</span>
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
