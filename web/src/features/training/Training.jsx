// B4 — Entraînement : programme, semaine, séance du jour, calendrier, liens Historique / Exercices
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Empty, ErrorState, Icon, IconButton, ListRow, Num, PageSkeleton, Segmented, Segments, Sheet, Skeleton, useToast } from '../../components';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad, useOnline } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';
import { ExerciseThumb, SetsLine, listFormat, useDayTitle, useMetaLabel } from './shared';
import Library from './Library';
import './training.css';

const dayOfMonth = (date) => Number(String(date || '').slice(8, 10)) || '';

/** Choix IA / règles + génération (programme vide ou « Modifier ») */
function GenerateForm({ hasProgram, onDone }) {
  const { t, error: errText } = useI18n();
  const online = useOnline();
  const [source, setSource] = useState('AI');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function generate() {
    if (hasProgram && !confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const program = await api.post('/programs/generate', { source });
      onDone(program);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Segmented
        label={t('training.gen.source')}
        value={source}
        onChange={(v) => {
          setSource(v);
          setConfirming(false);
        }}
        options={[
          { value: 'AI', label: t('training.gen.ai') },
          { value: 'RULES', label: t('training.gen.rules') },
        ]}
      />
      <p className="small muted">{t(source === 'AI' ? 'training.gen.aiHint' : 'training.gen.rulesHint')}</p>
      {confirming ? (
        <div className="banner warn" role="alert">
          <Icon name="triangle-alert" size={20} />
          <span className="grow">{t('training.gen.confirm')}</span>
        </div>
      ) : null}
      {error ? (
        <div className="banner danger" role="alert">
          <Icon name="circle-alert" size={20} />
          <span className="grow">{errText(error)}</span>
        </div>
      ) : null}
      <Button variant="primary" block size="lg" icon="sparkles" loading={busy} disabled={!online} onClick={generate}>
        {confirming ? t('training.gen.replace') : t('training.gen.go')}
      </Button>
    </div>
  );
}

/** Détail d'un jour du programme (tap sur une ligne de la semaine) */
function DaySheet({ day, entry, program, onClose, onStart, starting }) {
  const { t, tp, fmt, name } = useI18n();
  const dayTitle = useDayTitle();
  const open = Boolean(day);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="center"
      title={day ? dayTitle(day, day.muscles) : ''}
      subtitle={
        day && entry ? `${fmt.weekday(entry.weekday)} ${dayOfMonth(entry.date)} · ${fmt.duration(day.estMinutes)} · ${tp('training.exercises', day.exerciseCount)}` : ''
      }
      footer={
        day && entry && entry.status !== 'DONE' && program ? (
          <Button variant="primary" block size="lg" icon="play" loading={starting} onClick={() => onStart(day.dayIndex)}>
            {t('training.startThisDay')}
          </Button>
        ) : null
      }
    >
      {day ? (
        <ul className="ex-list">
          {day.items.map((it) => (
            <li key={it.id}>
              <Link to={`/app/exercice/${it.exercise.id}`} className="ex-row">
                <ExerciseThumb exercise={it.exercise} />
                <span className="grow">
                  <span className="ex-name">{name(it.exercise)}</span>
                  <span className="ex-sub">
                    <SetsLine sets={it.sets} reps={it.reps} />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Sheet>
  );
}

/** Carte « Aujourd'hui » : exercices avec séries × reps · charge conseillée, Commencer / Rapide 30 min / Reprendre */
function TodayCard({ today, onStart, starting }) {
  const { t, tp, fmt, name } = useI18n();
  const dayTitle = useDayTitle();
  const navigate = useNavigate();
  const eyebrow = `${today.isToday ? t('time.today') : t('training.next')} · ${fmt.weekday(today.weekday)} ${dayOfMonth(today.date)}`;
  return (
    <section className="card pad-lg today-card" aria-labelledby="today-title">
      <div className="today-eyebrow small">{eyebrow}</div>
      <h2 id="today-title" className="h2 today-title">
        {dayTitle(today, today.muscles)}
      </h2>
      <div className="row today-meta small muted">
        <span className="row-2">
          <Icon name="timer" size={16} />
          <span>{fmt.duration(today.estMinutes)}</span>
        </span>
        <span className="row-2">
          <Icon name="list" size={16} />
          <span>{tp('training.exercises', today.exerciseCount)}</span>
        </span>
      </div>
      <ul className="ex-list">
        {today.items.map((it) => (
          <li key={it.programItemId}>
            <Link to={`/app/exercice/${it.exercise.id}`} className="ex-row">
              <ExerciseThumb exercise={it.exercise} />
              <span className="grow">
                <span className="ex-name">{name(it.exercise)}</span>
                <span className="ex-sub">
                  <SetsLine sets={it.sets} reps={it.reps} kg={it.suggestedKg} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {today.inProgressSessionId ? (
        <Button variant="primary" size="lg" block icon="play" onClick={() => navigate(`/app/seance/${today.inProgressSessionId}`)}>
          {t('training.resume')}
        </Button>
      ) : (
        <div className="today-actions">
          <Button variant="primary" size="lg" icon="play" loading={starting === 'full'} disabled={Boolean(starting)} onClick={() => onStart(today.dayIndex, false)}>
            {t('training.start')}
          </Button>
          <Button variant="secondary" size="lg" loading={starting === 'quick'} disabled={Boolean(starting)} onClick={() => onStart(today.dayIndex, true)}>
            {t('training.quick')}
          </Button>
        </div>
      )}
    </section>
  );
}

/** « Cette semaine » : jours faits / aujourd'hui / prévus + jours de repos */
function WeekCard({ program, history, onOpenDay }) {
  const { t, fmt, lang, name } = useI18n();
  const metaLabel = useMetaLabel();
  const durationOn = (date) => (history || []).find((h) => h.date === date)?.durationMin;
  const sessionDays = program.schedule.filter((s) => s.status !== 'REST');
  return (
    <section className="card pad-lg" aria-labelledby="week-title">
      <div className="card-head">
        <h2 id="week-title" className="card-title">
          {t('training.thisWeek')}
        </h2>
        <span className="small muted">{t('training.weekDone', { done: program.doneThisWeek, total: program.plannedThisWeek })}</span>
      </div>
      <ul className="week-list">
        {sessionDays.map((s) => {
          const day = program.days.find((d) => d.dayIndex === s.dayIndex);
          const muscles = day ? day.muscles.slice(0, 2).map((m) => metaLabel('muscles', m)) : [];
          const minutes = s.status === 'DONE' ? durationOn(s.date) || day?.estMinutes : day?.estMinutes;
          const musclesText = muscles.map((m, i) => (i ? m.toLocaleLowerCase(lang) : m)).join(', ');
          const sub = [musclesText || null, minutes ? fmt.duration(minutes) : null].filter(Boolean).join(' · ');
          return (
            <li key={s.date}>
              <button type="button" className={`week-row ${s.status.toLowerCase()}`} onClick={() => day && onOpenDay(day, s)} disabled={!day}>
                <span className="week-date">
                  <span className="caption">{fmt.weekdayShort(s.weekday)}</span>
                  <span className="h3">
                    <Num>{dayOfMonth(s.date)}</Num>
                  </span>
                </span>
                <span className="grow">
                  <span className="w500 week-label">{name(s, 'label')}</span>
                  {sub ? <span className="caption muted week-sub">{sub}</span> : null}
                </span>
                {s.status === 'DONE' ? (
                  <span className="week-check done" role="img" aria-label={t('training.status.DONE')}>
                    <Icon name="check" size={18} stroke={2.5} />
                  </span>
                ) : s.status === 'TODAY' ? (
                  <span className="small ember w500">{t('time.today')}</span>
                ) : s.status === 'MISSED' ? (
                  <span className="caption faint">{t('training.status.MISSED')}</span>
                ) : (
                  <span className="week-check" role="img" aria-label={t('training.status.PLANNED')} />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {program.restDays.length ? (
        <p className="small muted mt-2">{t('training.restDays', { days: listFormat(lang, program.restDays.map((d) => fmt.weekday(d))) })}</p>
      ) : null}
    </section>
  );
}

export default function Training() {
  const { t, tp, lang, error: errText } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const metaLabel = useMetaLabel();
  const [params, setParams] = useSearchParams();
  const program = useLoad(() => api.get('/programs/current'), []);
  const today = useLoad(() => api.get('/programs/today'), []);
  const history = useLoad(() => api.get('/progress/history').catch(() => []), []);
  const [editOpen, setEditOpen] = useState(false);
  const [openDay, setOpenDay] = useState(null);
  const [starting, setStarting] = useState(null);

  const library = params.get('exercices'); // « tous » | « sans-douleur » : bibliothèque ouverte (gardée au retour d'une fiche)
  const openLibrary = (mode) => setParams(mode ? { exercices: mode } : {}, { replace: !mode });

  async function start(dayIndex, quick30) {
    setStarting(quick30 ? 'quick' : 'full');
    try {
      const session = await api.post('/sessions', { dayIndex, quick30 });
      navigate(`/app/seance/${session.id}`);
    } catch (err) {
      setStarting(null);
      toast({ text: errText(err), tone: 'error' });
    }
  }

  function generated() {
    setEditOpen(false);
    program.reload();
    today.reload();
    toast({ text: t('training.gen.done'), icon: 'sparkles' });
  }

  const injuries = user?.injuries || [];
  const p = program.data;
  const doneCount = (history.data || []).length;

  let body;
  if (program.loading && p === null && !program.error) body = <PageSkeleton cards={3} />;
  else if (program.error && !p) body = <ErrorState error={program.error} onRetry={program.reload} />;
  else if (!p) {
    body = (
      <section className="card pad-lg">
        <Empty icon="dumbbell" title={t('training.empty.title')}>
          {t('training.empty.text')}
        </Empty>
        <GenerateForm hasProgram={false} onDone={generated} />
      </section>
    );
  } else {
    const weekValues = Array.from({ length: p.weeks }, (_, i) => {
      if (i + 1 < p.week) return 1;
      if (i + 1 > p.week) return 0;
      return p.plannedThisWeek ? p.doneThisWeek / p.plannedThisWeek : 0;
    });
    body = (
      <>
        <section className="card program-card" aria-labelledby="program-title">
          <div className="row between row-top">
            <div className="grow">
              <div className="small muted">{t('training.yourProgram')}</div>
              <h2 id="program-title" className="h3 program-title">
                {p.title}
              </h2>
            </div>
            <button type="button" className="link-btn" onClick={() => setEditOpen(true)}>
              {t('action.edit')}
            </button>
          </div>
          <Segments values={weekValues} label={t('training.weekOf', { week: p.week, weeks: p.weeks })} />
          <div className="row between small muted">
            <span>{t('training.weekOf', { week: p.week, weeks: p.weeks })}</span>
            <span>{t('training.sessionsOf', { done: p.sessionsDone, total: p.sessionsTotal })}</span>
          </div>
        </section>

        {today.loading && !today.data ? <Skeleton card h={320} /> : null}
        {today.error && !today.data ? <ErrorState compact error={today.error} onRetry={today.reload} /> : null}
        {today.data ? <TodayCard today={today.data} onStart={start} starting={starting} /> : null}

        <WeekCard program={p} history={history.data} onOpenDay={(day, entry) => setOpenDay({ day, entry })} />

        <div className="list">
          <ListRow
            icon="calendar"
            title={t('training.history')}
            sub={tp('training.historySub', doneCount)}
            to="/app/entrainement/historique"
          />
          <ListRow
            icon="dumbbell"
            title={t('training.allExercises')}
            sub={
              injuries.length
                ? t('training.safeSub', { zones: listFormat(lang, injuries.map((z) => metaLabel('injuryZones', z).toLocaleLowerCase(lang))) })
                : t('training.librarySub')
            }
            onClick={() => openLibrary(injuries.length ? 'sans-douleur' : 'tous')}
          />
        </div>
      </>
    );
  }

  return (
    <div className="page training">
      <header className="app-header">
        <h1>{t('training.title')}</h1>
        <IconButton icon="search" label={t('training.searchExercises')} onClick={() => openLibrary('tous')} />
      </header>
      {body}

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title={t('training.gen.title')} subtitle={t('training.gen.text')}>
        {editOpen ? <GenerateForm hasProgram onDone={generated} /> : null}
      </Sheet>

      <DaySheet
        day={openDay?.day}
        entry={openDay?.entry}
        program={p}
        starting={Boolean(starting)}
        onClose={() => setOpenDay(null)}
        onStart={(dayIndex) => start(dayIndex, false)}
      />

      <Library open={Boolean(library)} safeDefault={library === 'sans-douleur'} injuries={injuries} onClose={() => openLibrary(null)} />
    </div>
  );
}
