import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { ErrorText, Spinner, useLoad } from '../../components/ui';

export function profileComplete(user) {
  return Boolean(user.gymId && user.goal && user.level && user.daysPerWeek);
}

export default function Home() {
  const { user } = useAuth();
  const { t, name } = useI18n();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const complete = profileComplete(user);
  const today = useLoad(() => (complete ? api('/programs/today') : Promise.resolve(null)), [complete]);
  const sub = useLoad(() => api('/me/subscription'));
  const progress = useLoad(() => api('/progress'));
  const occupancy = useLoad(() => (user.gymId ? api(`/gyms/${user.gymId}/occupancy`) : Promise.resolve(null)), [user.gymId]);
  const checkin = useLoad(() => api('/me/checkin'));

  async function start(quick30) {
    setBusy(true);
    setError(null);
    try {
      const session = await api('/sessions', { method: 'POST', body: { dayIndex: today.data.day.dayIndex, quick30 } });
      navigate(`/app/seance/${session.id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  async function toggleCheckin() {
    try {
      if (checkin.data) await api('/me/checkout', { method: 'POST' });
      else await api('/me/checkin', { method: 'POST' });
      checkin.reload();
      occupancy.reload();
    } catch (err) {
      setError(err);
    }
  }

  const firstName = user.name.split(' ')[0];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('home.hello', { name: firstName })}</h1>
          <p className="page-sub">{user.gym ? user.gym.name : t('home.noGym')}</p>
        </div>
      </div>

      {sub.data && sub.data.status !== 'ACTIF' && (
        <div className={`notice ${sub.data.status === 'EXPIRE' ? 'notice-danger' : 'notice-warn'}`}>
          {sub.data.status === 'EXPIRE' ? t('home.subExpired') : t('home.subSoon', { n: sub.data.daysLeft })}
        </div>
      )}

      {!complete && (
        <div className="empty">
          <h2>{t('home.completeTitle')}</h2>
          <p className="muted">{t('home.completeText')}</p>
          <Link className="btn" to="/app/profil">
            {t('home.completeAction')}
          </Link>
        </div>
      )}

      {complete && today.loading && <Spinner />}

      {complete && !today.loading && !today.data && (
        <div className="empty">
          <h2>{t('home.noProgramTitle')}</h2>
          <p className="muted">{t('home.noProgramText')}</p>
          <Link className="btn" to="/app/programme">
            {t('program.generate')}
          </Link>
        </div>
      )}

      {today.data && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="muted small">{t('home.today', { n: today.data.day.dayIndex, total: today.data.totalDays })}</p>
              <h2 style={{ fontSize: '1.4rem' }}>{name(today.data.day, 'label')}</h2>
            </div>
            {today.data.inProgressSessionId ? (
              <Link className="btn" to={`/app/seance/${today.data.inProgressSessionId}`}>
                {t('home.resume')}
              </Link>
            ) : (
              <div className="inline">
                <button className="btn btn-ghost" disabled={busy} onClick={() => start(true)}>
                  {t('home.quick30')}
                </button>
                <button className="btn" disabled={busy} onClick={() => start(false)}>
                  {t('home.start')}
                </button>
              </div>
            )}
          </div>
          <ul className="rows">
            {today.data.day.items.map((it) => (
              <li key={it.id} className="row">
                <div className="row-main">
                  <Link className="row-title" to={`/app/exercice/${it.exercise.id}`} style={{ color: 'inherit' }}>
                    {name(it.exercise)}
                  </Link>
                  <div className="row-sub">{name(it.exercise.equipment)}</div>
                </div>
                <span className="badge">
                  {it.sets} × {it.reps}
                </span>
              </li>
            ))}
          </ul>
          <ErrorText error={error} />
        </section>
      )}

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h2>{t('home.week')}</h2>
            <Link to="/app/progression">{t('home.seeProgress')}</Link>
          </div>
          {progress.data && (
            <div className="stats">
              <div className="stat">
                <div className="stat-value">
                  {progress.data.thisWeekSessions}/{progress.data.weeklyTarget}
                </div>
                <div className="stat-label">{t('home.sessionsWeek')}</div>
              </div>
              <div className="stat">
                <div className="stat-value">{progress.data.streakWeeks}</div>
                <div className="stat-label">{t('home.streak')}</div>
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>{t('home.gymNow')}</h2>
            {occupancy.data && (
              <span className={`badge ${occupancy.data.level === 'CHARGE' ? 'badge-danger' : occupancy.data.level === 'MOYEN' ? 'badge-warn' : 'badge-ok'}`}>
                {t(`occupancy.${occupancy.data.level}`)}
              </span>
            )}
          </div>
          {occupancy.data ? (
            <div className="stack">
              <p>{t('home.peopleNow', { n: occupancy.data.count })}</p>
              <div className="inline">
                <button className="btn btn-ghost btn-small" onClick={toggleCheckin}>
                  {checkin.data ? t('home.checkout') : t('home.checkin')}
                </button>
                <Link className="btn btn-ghost btn-small" to="/app/panne">
                  {t('home.reportMachine')}
                </Link>
              </div>
            </div>
          ) : (
            <p className="muted">{t('home.noGym')}</p>
          )}
        </section>
      </div>
    </div>
  );
}
