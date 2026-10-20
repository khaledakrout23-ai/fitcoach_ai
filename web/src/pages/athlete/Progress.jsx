import { Link, useLocation } from 'react-router-dom';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { BarChart, HBars } from '../../components/Charts';
import { Empty, Spinner, Stat, useLoad } from '../../components/ui';

export default function Progress() {
  const { t, name, muscle, meta, date, num } = useI18n();
  const location = useLocation();
  const progress = useLoad(() => api('/progress'));

  if (progress.loading) return <Spinner />;
  const p = progress.data;
  if (!p) return null;

  const muscles = Object.keys(meta.muscles).map((m) => ({ label: muscle(m), value: p.musclesThisWeek[m] || 0 }));
  const forgotten = muscles.filter((m) => m.value === 0).map((m) => m.label);

  return (
    <div className="page">
      {location.state?.finished && <div className="notice">{t('progress.finished')}</div>}
      <div>
        <h1>{t('nav.progress')}</h1>
        <p className="page-sub">{t('progress.sub')}</p>
      </div>

      <div className="stats">
        <Stat value={p.totalSessions} label={t('progress.total')} />
        <Stat value={`${p.thisWeekSessions}/${p.weeklyTarget}`} label={t('home.sessionsWeek')} />
        <Stat value={p.streakWeeks} label={t('home.streak')} />
        <Stat value={p.records.length} label={t('progress.recordsCount')} />
      </div>

      {p.totalSessions === 0 ? (
        <Empty title={t('progress.emptyTitle')}>
          <p className="muted">{t('progress.emptyText')}</p>
          <Link className="btn" to="/app">
            {t('nav.home')}
          </Link>
        </Empty>
      ) : (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2>{t('progress.volume')}</h2>
              <span className="small muted">{t('progress.volumeHint')}</span>
            </div>
            <BarChart
              ariaLabel={t('progress.volume')}
              data={p.weeks.map((w) => ({ label: date(w.week), value: w.volume }))}
              highlight={p.weeks.length - 1}
              format={(v) => (v >= 1000 ? `${num(v / 1000)} t` : `${v} kg`)}
            />
          </section>

          <div className="grid-2">
            <section className="panel">
              <h2 style={{ marginBottom: 6 }}>{t('progress.muscles')}</h2>
              <p className="small muted" style={{ marginBottom: 14 }}>
                {forgotten.length ? t('progress.forgotten', { list: forgotten.join(', ') }) : t('progress.allWorked')}
              </p>
              <HBars data={muscles} format={(v) => v} />
            </section>

            <section className="panel">
              <h2 style={{ marginBottom: 10 }}>{t('progress.records')}</h2>
              <ul className="rows">
                {p.records.map((r) => (
                  <li key={r.exercise.id} className="row">
                    <div className="row-main">
                      <Link to={`/app/exercice/${r.exercise.id}`} className="row-title" style={{ color: 'inherit' }}>
                        {name(r.exercise)}
                      </Link>
                      <div className="row-sub">{date(r.date)}</div>
                    </div>
                    <span className="target" style={{ fontSize: '1.25rem' }}>
                      {num(r.weight)} kg × {r.reps}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
