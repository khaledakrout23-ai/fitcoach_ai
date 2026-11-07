// Historique : séances terminées + progression (volume / séances par semaine, records, courbe par exercice)
import { useState } from 'react';
import { Bars, Button, Empty, ErrorState, Icon, IconButton, LineChart, Num, PageSkeleton, Sheet, Skeleton, StatusPill } from '../../components';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';
import { Stars, isTimed } from './shared';
import './training.css';

/** Courbe de charge d'un exercice (tap sur un record) */
function ExerciseChartSheet({ record, onClose }) {
  const { t, fmt, name } = useI18n();
  const id = record?.exercise.id;
  const points = useLoad(() => (id ? api.get(`/progress/exercise/${id}`) : null), [id]);
  return (
    <Sheet
      open={Boolean(record)}
      onClose={onClose}
      title={record ? name(record.exercise) : ''}
      subtitle={record ? t('training.bestLine', { kg: fmt.kg(record.weight), reps: record.reps }) : ''}
      footer={
        record ? (
          <Button block to={`/app/exercice/${record.exercise.id}`} iconEnd="arrow-right">
            {t('training.openSheet')}
          </Button>
        ) : null
      }
    >
      {points.loading ? <Skeleton h={160} /> : null}
      {points.error ? <ErrorState compact error={points.error} onRetry={points.reload} /> : null}
      {points.data && points.data.length ? (
        <div className="stack-2">
          <span className="caption muted">{t('training.maxWeight')}</span>
          <LineChart points={points.data.map((p) => ({ x: p.date, y: p.maxWeight }))} height={160} label={t('training.maxWeight')} />
          <div className="row between caption muted">
            <span>{fmt.shortDate(points.data[0].date)}</span>
            <span>{fmt.shortDate(points.data[points.data.length - 1].date)}</span>
          </div>
        </div>
      ) : null}
      {points.data && !points.data.length ? <p className="muted">{t('training.noHistory')}</p> : null}
    </Sheet>
  );
}

/** Détail d'une séance terminée */
function SessionSheet({ item, onClose }) {
  const { t, fmt, name } = useI18n();
  const id = item?.id;
  const detail = useLoad(() => (id ? api.get(`/sessions/${id}`) : null), [id]);
  return (
    <Sheet
      open={Boolean(item)}
      onClose={onClose}
      title={item ? name(item, 'dayLabel') || t('training.session') : ''}
      subtitle={item ? `${fmt.date(item.startedAt)} · ${fmt.time(item.startedAt)}` : ''}
    >
      {detail.loading ? <Skeleton h={180} /> : null}
      {detail.error ? <ErrorState compact error={detail.error} onRetry={detail.reload} /> : null}
      {detail.data ? (
        <ul className="ex-list">
          {detail.data.entries.map((e) => (
            <li key={e.id} className="ex-row static">
              <span className="grow">
                <span className="ex-name">{name(e.exercise)}</span>
                <span className="ex-sub">
                  {e.setsDone.length
                    ? e.setsDone.map((s, i) => (
                        <span key={i}>
                          {i ? ' · ' : ''}
                          <Num>
                            {Number(s.weight) > 0 ? `${fmt.num(s.weight, 2)} × ` : ''}
                            {s.reps}
                            {isTimed(e.targetReps) ? ` ${t('training.sec')}` : ''}
                          </Num>
                        </span>
                      ))
                    : t('training.notDone')}
                </span>
                {e.originalExercise ? (
                  <span className="caption faint">{t('training.replaced', { name: name(e.originalExercise) })}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Sheet>
  );
}

export default function History() {
  const { t, tp, fmt, name } = useI18n();
  const progress = useLoad(() => api.get('/progress'), []);
  const history = useLoad(() => api.get('/progress/history'), []);
  const [record, setRecord] = useState(null);
  const [session, setSession] = useState(null);

  const loading = (progress.loading && !progress.data) || (history.loading && !history.data);
  const error = progress.error || history.error;
  const p = progress.data;
  const list = history.data || [];
  const retry = () => {
    progress.reload();
    history.reload();
  };

  let body;
  if (loading) body = <PageSkeleton cards={3} />;
  else if (error && (!p || !history.data)) body = <ErrorState error={error} onRetry={retry} />;
  else if (!list.length) {
    body = (
      <Empty icon="calendar" title={t('training.historyEmpty')} action={<Button variant="primary" to="/app/entrainement">{t('training.backToProgram')}</Button>}>
        {t('training.historyEmptyText')}
      </Empty>
    );
  } else {
    const axis = p.weeks.map((w, i) => (i === p.weeks.length - 1 ? t('training.thisWeekShort') : fmt.shortDate(w.week)));
    const sparse = axis.map((a, i) => (i % 2 === p.weeks.length % 2 || i === p.weeks.length - 1 ? a : ''));
    body = (
      <>
        <div className="grid-3 kpi-row">
          <div className="card mini-kpi">
            <span className="big-num sm">
              <Num>{fmt.num(p.totalSessions)}</Num>
            </span>
            <span className="caption muted">{t('training.kpi.sessions')}</span>
          </div>
          <div className="card mini-kpi">
            <span className="big-num sm">
              <Num>
                {p.thisWeekSessions}/{p.weeklyTarget}
              </Num>
            </span>
            <span className="caption muted">{t('training.kpi.week')}</span>
          </div>
          <div className="card mini-kpi">
            <span className="big-num sm">
              <Num>{p.streakWeeks}</Num>
            </span>
            <span className="caption muted">{tp('training.kpi.streak', p.streakWeeks)}</span>
          </div>
        </div>

        <section className="card pad-lg stack-2" aria-labelledby="vol-title">
          <div className="card-head">
            <h2 id="vol-title" className="card-title">
              {t('training.volume')}
            </h2>
            <span className="small muted">
              <Num>{fmt.kg(p.weeks[p.weeks.length - 1].volume)}</Num>
            </span>
          </div>
          <Bars
            height={120}
            label={t('training.volume')}
            axis={sparse}
            data={p.weeks.map((w, i) => ({ value: w.volume, tone: i === p.weeks.length - 1 ? 'ember' : '', label: fmt.shortDate(w.week) }))}
          />
        </section>

        <section className="card pad-lg stack-2" aria-labelledby="freq-title">
          <div className="card-head">
            <h2 id="freq-title" className="card-title">
              {t('training.perWeek')}
            </h2>
            <span className="small muted">{t('training.target', { n: p.weeklyTarget })}</span>
          </div>
          <Bars
            height={90}
            label={t('training.perWeek')}
            axis={sparse}
            max={Math.max(p.weeklyTarget, ...p.weeks.map((w) => w.sessions))}
            data={p.weeks.map((w, i) => ({ value: w.sessions, tone: w.sessions >= p.weeklyTarget ? 'calm' : i === p.weeks.length - 1 ? 'ember' : '', label: fmt.shortDate(w.week) }))}
          />
        </section>

        {p.records.length ? (
          <section aria-labelledby="rec-title">
            <h2 id="rec-title" className="eyebrow">
              {t('training.records')}
            </h2>
            <div className="list">
              {p.records.map((r) => (
                <button key={r.exercise.id} type="button" className="list-row" onClick={() => setRecord(r)}>
                  <Icon name="trophy" className="ember" />
                  <span className="grow">
                    <span>{name(r.exercise)}</span>
                    <span className="sub">{fmt.shortDate(r.date)}</span>
                  </span>
                  <span className="value w500">
                    <Num>
                      {fmt.kg(r.weight)} × {r.reps}
                    </Num>
                  </span>
                  <Icon name="chart-line" size={18} className="chev" />
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="done-title">
          <h2 id="done-title" className="eyebrow">
            {tp('training.historySub', list.length)}
          </h2>
          <div className="list">
            {list.map((s) => (
              <button key={s.id} type="button" className="list-row session-row" onClick={() => setSession(s)}>
                <span className="session-date">
                  <span className="caption muted">{fmt.shortDate(s.date)}</span>
                </span>
                <span className="grow">
                  <span className="row-2 wrap">
                    <span className="w500">{name(s, 'dayLabel') || t('training.session')}</span>
                    {s.quick ? <StatusPill tone="hydro">{t('training.quickTag')}</StatusPill> : null}
                    {s.substitutions ? (
                      <StatusPill icon="refresh-cw">{tp('training.swaps', s.substitutions)}</StatusPill>
                    ) : null}
                  </span>
                  <span className="sub">
                    {s.durationMin ? fmt.duration(s.durationMin) : '–'} · <Num>{fmt.kg(s.volumeKg)}</Num> · {tp('training.sets', s.sets)}
                  </span>
                </span>
                <Stars value={s.rating} />
              </button>
            ))}
          </div>
        </section>
      </>
    );
  }

  return (
    <div className="page training">
      <header className="app-header compact">
        <IconButton icon="arrow-left" label={t('action.back')} to="/app/entrainement" />
        <h1>{t('training.history')}</h1>
      </header>
      {body}
      <ExerciseChartSheet record={record} onClose={() => setRecord(null)} />
      <SessionSheet item={session} onClose={() => setSession(null)} />
    </div>
  );
}
