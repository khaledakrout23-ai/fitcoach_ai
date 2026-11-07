// B6 — Fiche exercice : vidéo, muscles, matériel, bienfaits, erreurs fréquentes, historique de charge, record
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Banner, Empty, ErrorState, Icon, LineChart, Num, PageSkeleton, StatusPill } from '../../components';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';
import { BackButton, ExerciseThumb, VideoCard, useMetaLabel } from './shared';
import './training.css';

/** Texte d'une liste traduite : benefitsAr si présent, sinon le français */
function localList(ex, field, lang) {
  const ar = ex[`${field}Ar`] || [];
  const fr = ex[`${field}Fr`] || [];
  return lang === 'ar' && ar.length ? ar : fr;
}

const MACHINE_TONE = { OK: 'ok', SIGNALEE: 'warn', REPARATION: 'danger' };

export default function Exercise() {
  const { id } = useParams();
  const { t, fmt, name, lang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const metaLabel = useMetaLabel();
  const ex = useLoad(() => api.get(`/exercises/${Number(id) || 0}`), [id]);

  const top = (
    <header className="app-header compact">
      <BackButton fallback="/app/entrainement" navigate={navigate} location={location} />
    </header>
  );

  if (ex.loading && !ex.data) {
    return (
      <div className="page training">
        {top}
        <PageSkeleton cards={3} />
      </div>
    );
  }
  if (!ex.data) {
    return (
      <div className="page training">
        {top}
        {ex.error && ex.error.status === 404 ? (
          <Empty icon="search" title={t('training.notFound')} />
        ) : (
          <ErrorState error={ex.error} onRetry={ex.reload} />
        )}
      </div>
    );
  }

  const e = ex.data;
  const benefits = localList(e, 'benefits', lang);
  const mistakes = localList(e, 'mistakes', lang);
  const personal = e.personal || { best: null, history: [] };
  const suggestedSets = e.defaultSets && user?.level ? e.defaultSets[user.level] : null;

  return (
    <div className="page training exercise-page">
      {top}
      <VideoCard key={e.id} exercise={e} />

      <div className="stack-2">
        <h1 className="h1">{name(e)}</h1>
        <div className="chips" aria-label={t('training.muscles')}>
          <span className="tag primary-muscle">{metaLabel('muscles', e.primaryMuscle)}</span>
          {(e.secondaryMuscles || []).map((m) => (
            <span key={m} className="tag">
              {metaLabel('muscles', m)}
            </span>
          ))}
        </div>
      </div>

      {e.avoidForMe ? (
        <Banner tone="warn" icon="triangle-alert">
          {t('training.avoidText')}
        </Banner>
      ) : null}

      <div className="list">
        <div className="list-row">
          <Icon name="dumbbell" />
          <span className="grow">
            <span className="sub">{t('training.equipment')}</span>
            <span>{e.equipment ? name(e.equipment) : t('training.bodyweight')}</span>
          </span>
        </div>
        <div className="list-row">
          <Icon name="activity" />
          <span className="grow">
            <span className="sub">{t('training.pattern')}</span>
            <span>{metaLabel('patterns', e.pattern)}</span>
          </span>
          <span className="value">{t(`training.level.${Math.min(3, Math.max(1, e.difficulty || 1))}`)}</span>
        </div>
        {suggestedSets ? (
          <div className="list-row">
            <Icon name="target" />
            <span className="grow">
              <span className="sub">{t('training.suggested')}</span>
              <span>
                <Num>{String(suggestedSets).replace('x', ' × ')}</Num>
              </span>
            </span>
          </div>
        ) : null}
        {(e.machines || []).map((m) => (
          <div key={m.id} className="list-row">
            <Icon name="map-pin" />
            <span className="grow">
              <span>
                {m.label} {m.code ? <Num>#{m.code}</Num> : null}
              </span>
              {m.zone ? <span className="sub">{m.zone}</span> : null}
            </span>
            <StatusPill tone={m.outOfService ? 'danger' : MACHINE_TONE[m.status] || ''} led>
              {t(`training.machine.${m.outOfService ? 'OUT' : m.status}`)}
            </StatusPill>
          </div>
        ))}
      </div>

      {personal.best ? (
        <section className="card pad-lg stack-2" aria-labelledby="pb-title">
          <div className="card-head">
            <h2 id="pb-title" className="card-title">
              {t('training.personalBest')}
            </h2>
            <Icon name="trophy" className="ember" />
          </div>
          <div className="big-num">
            <Num>{fmt.num(personal.best.weight, 2)}</Num>
            <span className="num-unit">
              {t('unit.kg')} × <Num>{personal.best.reps}</Num>
            </span>
          </div>
          <span className="caption muted">{fmt.date(personal.best.date)}</span>
          {personal.history.length > 1 ? (
            <div className="stack-2 mt-4">
              <span className="caption muted">{t('training.weightHistory')}</span>
              <LineChart points={personal.history.map((p) => ({ x: p.date, y: p.maxWeight }))} height={120} label={t('training.weightHistory')} />
            </div>
          ) : null}
        </section>
      ) : (
        <p className="small muted">{t('training.noHistory')}</p>
      )}

      {benefits.length ? (
        <section aria-labelledby="ben-title">
          <h2 id="ben-title" className="eyebrow">
            {t('training.benefits')}
          </h2>
          <ul className="bullets">
            {benefits.map((b, i) => (
              <li key={i}>
                <Icon name="circle-check" size={20} className="ok-text" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {mistakes.length ? (
        <section aria-labelledby="mis-title">
          <h2 id="mis-title" className="eyebrow">
            {t('training.mistakes')}
          </h2>
          <ul className="bullets">
            {mistakes.map((m, i) => (
              <li key={i}>
                <Icon name="circle-x" size={20} className="danger-text" />
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(e.alternatives || []).length ? (
        <section aria-labelledby="alt-title">
          <h2 id="alt-title" className="eyebrow">
            {t('training.alternatives')}
          </h2>
          <ul className="ex-list">
            {e.alternatives.map((a) => (
              <li key={a.id}>
                <Link to={`/app/exercice/${a.id}`} className="ex-row" replace>
                  <ExerciseThumb exercise={a} size="sm" />
                  <span className="grow ex-name">{name(a)}</span>
                  <Icon name="chevron-right" size={18} className="faint" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
