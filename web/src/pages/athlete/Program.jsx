import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { Empty, ErrorText, Spinner, useLoad } from '../../components/ui';
import { profileComplete } from './Home';

export default function Program() {
  const { user } = useAuth();
  const { t, name, muscle } = useI18n();
  const program = useLoad(() => api('/programs/current'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function generate() {
    if (program.data && !window.confirm(t('program.confirmReplace'))) return;
    setBusy(true);
    setError(null);
    try {
      program.setData(await api('/programs/generate', { method: 'POST' }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (program.loading) return <Spinner />;

  if (!profileComplete(user)) {
    return (
      <div className="page">
        <h1>{t('nav.program')}</h1>
        <Empty title={t('home.completeTitle')}>
          <p className="muted">{t('home.completeText')}</p>
          <Link className="btn" to="/app/profil">
            {t('home.completeAction')}
          </Link>
        </Empty>
      </div>
    );
  }

  const p = program.data;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('nav.program')}</h1>
          {p && (
            <p className="page-sub inline">
              {p.title}
              <span className={`badge ${p.source === 'IA' ? 'badge-brand' : ''}`}>{t(`program.source.${p.source}`)}</span>
            </p>
          )}
        </div>
        <button className={p ? 'btn btn-ghost' : 'btn'} onClick={generate} disabled={busy}>
          {busy ? t('program.generating') : p ? t('program.regenerate') : t('program.generate')}
        </button>
      </div>
      <ErrorText error={error} />

      {!p && (
        <Empty title={t('home.noProgramTitle')}>
          <p className="muted">{t('program.explain')}</p>
        </Empty>
      )}

      {p &&
        p.days.map((day) => (
          <section key={day.dayIndex} className="panel">
            <div className="panel-head">
              <h2>
                {t('program.day', { n: day.dayIndex })} · {name(day, 'label')}
              </h2>
            </div>
            <ul className="rows">
              {day.items.map((it) => (
                <li key={it.id} className="row">
                  <div className="row-main">
                    <Link to={`/app/exercice/${it.exercise.id}`} className="row-title" style={{ color: 'inherit' }}>
                      {name(it.exercise)}
                    </Link>
                    <div className="row-sub">
                      {muscle(it.exercise.primaryMuscle)} · {name(it.exercise.equipment)}
                    </div>
                  </div>
                  <span className="badge">
                    {it.sets} × {it.reps}
                  </span>
                  <span className="small muted">{t('program.rest', { s: it.restSec })}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
