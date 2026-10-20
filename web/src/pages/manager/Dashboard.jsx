import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { BarChart, HBars } from '../../components/Charts';
import { Spinner, Stat, useLoad } from '../../components/ui';

export default function ManagerDashboard() {
  const { t, name, money, num } = useI18n();
  const gym = useLoad(() => api('/manager/gym'));
  const stats = useLoad(() => api('/manager/stats'));

  if (stats.loading) return <Spinner />;
  const s = stats.data;
  if (!s) return null;

  const hours = s.byHour.filter((h) => h.hour >= 6 && h.hour <= 23);
  const nowHour = new Date().getHours();
  const peak = hours.reduce((best, h) => (h.avg > best.avg ? h : best), hours[0]);
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ label: t(`weekday.${d}`), value: s.byWeekday[d].visits }));

  return (
    <div className="page">
      <div>
        <h1>{gym.data?.name || t('nav.dashboard')}</h1>
        <p className="page-sub">{t('manager.sub')}</p>
      </div>

      <div className="stats">
        <Stat value={s.presentNow} label={t('manager.presentNow')} />
        <Stat value={s.members} label={t('manager.members')} />
        <Stat value={s.activeSubscriptions} label={t('manager.activeSubs')} />
        <Stat value={s.expiringSoon} label={t('manager.expiring')} alert={s.expiringSoon > 0} />
        <Stat value={money(s.revenueMonth)} label={t('manager.revenue')} />
        <Stat value={s.openReports} label={t('manager.openReports')} alert={s.openReports > 0} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>{t('manager.byHour')}</h2>
          {peak && <span className="small muted">{t('manager.peak', { h: peak.hour })}</span>}
        </div>
        <BarChart
          ariaLabel={t('manager.byHour')}
          data={hours.map((h) => ({ label: `${h.hour}h`, value: h.avg }))}
          highlight={hours.findIndex((h) => h.hour === nowHour)}
          format={(v) => num(v)}
        />
        <p className="small muted">{t('manager.byHourHint')}</p>
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2 style={{ marginBottom: 12 }}>{t('manager.byWeekday')}</h2>
          <HBars data={days} />
        </section>

        <section className="panel">
          <h2 style={{ marginBottom: 4 }}>{t('manager.substituted')}</h2>
          <p className="small muted" style={{ marginBottom: 12 }}>
            {t('manager.substitutedHint')}
          </p>
          {s.mostSubstituted.length === 0 ? (
            <p className="muted">{t('manager.noSubstitution')}</p>
          ) : (
            <ul className="rows">
              {s.mostSubstituted.map((m) => (
                <li key={m.code} className="row">
                  <div className="row-main">
                    <div className="row-title">{name(m)}</div>
                    <div className="row-sub">
                      {t('swap.OCCUPEE')} {m.OCCUPEE} · {t('swap.ABSENTE')} {m.ABSENTE} · {t('swap.PANNE')} {m.PANNE}
                    </div>
                  </div>
                  <span className="target" style={{ fontSize: '1.3rem' }}>
                    {m.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {s.openReports > 0 && (
        <div className="notice notice-danger">
          <span>{t('manager.reportsNotice', { n: s.openReports })}</span>
          <Link className="btn btn-small btn-danger" to="/gerant/pannes">
            {t('manager.seeReports')}
          </Link>
        </div>
      )}
    </div>
  );
}
