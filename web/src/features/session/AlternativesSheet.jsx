// Feuille « Machine occupée / absente / en panne » : 3 alternatives + « J'attends »
import { useState } from 'react';
import { Button, ErrorState, Icon, Sheet, Skeleton } from '../../components';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';
import { ExerciseThumb, SetsLine, pickMachine } from '../training/shared';

/** Statut de la machine d'une alternative : « Banc plat · disponible » / « Sans machine » */
function MachineStatus({ exercise }) {
  const { t } = useI18n();
  const bodyweight = !exercise.equipment || exercise.equipment.category === 'POIDS_DU_CORPS';
  const m = pickMachine(exercise);
  if (bodyweight || !m) {
    return (
      <span className="alt-status">
        <span className="led ok" aria-hidden="true" />
        {bodyweight ? t('session.alt.noMachine') : t('session.alt.free')}
      </span>
    );
  }
  const ok = m.status === 'OK' && !m.outOfService;
  return (
    <span className="alt-status">
      <span className={`led ${ok ? 'ok' : 'warn'}`} aria-hidden="true" />
      {m.label} {m.code ? <span className="num">#{m.code}</span> : null} · {ok ? t('session.alt.available') : t('session.alt.reported')}
    </span>
  );
}

export default function AlternativesSheet({ open, sessionId, entry, reason, onClose, onChoose, onWait, busy }) {
  const { t, tp, name, lang } = useI18n();
  const [why, setWhy] = useState({});
  const key = open && entry ? `${entry.id}:${entry.exercise.id}:${reason}` : null;
  const alts = useLoad(() => (key ? api.get(`/sessions/${sessionId}/entries/${entry.id}/alternatives?reason=${reason}`) : null), [key]);
  const list = alts.data?.alternatives || [];

  async function explain(altId) {
    setWhy((w) => ({ ...w, [altId]: { loading: true } }));
    try {
      const res = await api.get(`/exercises/${entry.exercise.id}/explain/${altId}?lang=${lang}`);
      setWhy((w) => ({ ...w, [altId]: { text: res.text } }));
    } catch (err) {
      setWhy((w) => ({ ...w, [altId]: { error: err } }));
    }
  }

  if (!entry) return null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      dark
      title={t(`session.alt.title.${reason}`, { name: name(entry.exercise) })}
      subtitle={alts.data ? (list.length ? tp('session.alt.subtitle', list.length) : t('session.alt.none')) : t('session.alt.loading')}
      footer={
        reason === 'OCCUPEE' ? (
          <>
            <Button variant="secondary" size="lg" block icon="hourglass" disabled={busy} onClick={onWait}>
              {t('session.alt.wait')}
            </Button>
            <p className="caption muted text-center">{t('session.alt.waitNote')}</p>
          </>
        ) : reason === 'PANNE' ? (
          <p className="caption muted text-center">{t('session.alt.panneNote')}</p>
        ) : null
      }
    >
      {alts.loading && !alts.data ? (
        <div className="stack-2" role="status" aria-label={t('state.loading')}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={92} />
          ))}
        </div>
      ) : null}
      {alts.error ? <ErrorState compact error={alts.error} onRetry={alts.reload} /> : null}
      <ul className="alt-list">
        {list.map((a, i) => {
          const w = why[a.exercise.id];
          return (
            <li key={a.exercise.id} className={`alt-card ${i === 0 ? 'best' : ''}`}>
              <div className="alt-main">
                <ExerciseThumb exercise={a.exercise} />
                <div className="grow">
                  <div className="ex-name">{name(a.exercise)}</div>
                  <div className="ex-sub">
                    <MachineStatus exercise={a.exercise} /> · <SetsLine sets={entry.targetSets} reps={entry.targetReps} />
                  </div>
                </div>
                <Button variant={i === 0 ? 'primary' : 'secondary'} size="sm" disabled={busy} onClick={() => onChoose(a.exercise)}>
                  {t('session.alt.choose')}
                </Button>
              </div>
              {a.advice && a.advice !== 'SAME_EFFORT' ? <p className="caption warn-text alt-advice">{t(`session.alt.advice.${a.advice}`)}</p> : null}
              {w?.text ? (
                <p className="small muted alt-why">{w.text}</p>
              ) : (
                <button type="button" className="link-btn muted small alt-why-btn" disabled={w?.loading} onClick={() => explain(a.exercise.id)}>
                  {w?.loading ? t('state.loading') : w?.error ? t('session.alt.whyRetry') : t('session.alt.why')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
