// B5 — Séance (écran héros, toujours sombre) : un exercice à la fois, séries, repos, alternatives, hors ligne, bilan
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Banner, Button, Empty, ErrorState, Icon, IconButton, OfflineBanner, PageSkeleton, Segments, Sheet, useToast } from '../../components';
import { api } from '../../lib/api';
import { useInterval, useLoad, useNow, useOnline } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';
import { VideoCard, firstNumber, isTimed, useMachineLine, useMetaLabel } from '../training/shared';
import SetsTable from './SetsTable';
import RestTimer from './RestTimer';
import AlternativesSheet from './AlternativesSheet';
import FinishScreen from './FinishScreen';
import { drop, enqueue, flush, pendingCount } from './queue';
import '../training/training.css';
import './session.css';

const REASONS = [
  { reason: 'OCCUPEE', icon: 'users', variant: 'warn-soft' },
  { reason: 'ABSENTE', icon: 'circle-off', variant: 'secondary' },
  { reason: 'PANNE', icon: 'wrench', variant: 'danger' },
];

const rowsKey = (entry) => `${entry.id}:${entry.exercise.id}`;

/** « 52,5 » ↔ 52.5 */
const parseKg = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return String(v ?? '').trim() === '' ? 0 : Number.isFinite(n) ? n : NaN;
};
const toInput = (n, lang) => (n == null || n === '' ? '' : String(n).replace('.', lang === 'en' ? '.' : ','));

/** Lignes de séries : faites (serveur), sinon pré-remplies avec la dernière fois ou la charge conseillée */
function initialRows(entry, lang) {
  const prev = entry.previous?.sets || [];
  const bodyweight = entry.exercise.equipment?.category === 'POIDS_DU_CORPS';
  const baseReps = firstNumber(entry.targetReps);
  const count = Math.max(entry.targetSets, entry.setsDone.length);
  return Array.from({ length: count }, (_, i) => {
    const done = entry.setsDone[i];
    if (done) return { weight: toInput(done.weight, lang), reps: String(done.reps), done: true, auto: false };
    const p = prev[i] || prev[prev.length - 1];
    const w = entry.suggestedKg ?? p?.weight ?? (bodyweight ? 0 : '');
    return { weight: toInput(w, lang), reps: String(p?.reps ?? baseReps ?? ''), done: false, auto: true };
  });
}

export default function Session() {
  const { id } = useParams();
  const sessionId = Number(id) || 0;
  const { t, tp, fmt, name, lang, error: errText } = useI18n();
  const navigate = useNavigate();
  const { toast } = useToast();
  const online = useOnline();
  const metaLabel = useMetaLabel();
  const machineLine = useMachineLine();
  const load = useLoad(() => api.get(`/sessions/${sessionId}`), [sessionId]);
  const gym = useLoad(() => api.get('/gym/live').catch(() => null), []);
  useInterval(gym.reload, 120000);

  const [rowsMap, setRowsMap] = useState({});
  const [index, setIndex] = useState(null);
  const [rest, setRest] = useState(null);
  const [sheet, setSheet] = useState(null); // 'quit' | 'list' | { reason }
  const [busy, setBusy] = useState(false);
  const [finish, setFinish] = useState(null);
  const [pending, setPending] = useState(() => pendingCount(sessionId));

  const data = load.data;
  const entries = useMemo(() => (data ? [...data.entries].sort((a, b) => a.position - b.position) : []), [data]);
  const rowsOf = useCallback((entry) => rowsMap[rowsKey(entry)] || initialRows(entry, lang), [rowsMap, lang]);
  const complete = (entry) => rowsOf(entry).every((r) => r.done);

  // exercice affiché au chargement : le premier pas terminé
  useEffect(() => {
    if (data && index == null) {
      const first = entries.findIndex((e) => e.setsDone.length < e.targetSets);
      setIndex(first < 0 ? Math.max(0, entries.length - 1) : first);
    }
  }, [data, entries, index]);

  // séance déjà terminée (lien direct) : bilan sans confettis
  useEffect(() => {
    if (data && data.status === 'TERMINEE' && !finish) {
      api
        .post(`/sessions/${sessionId}/finish`)
        .then((out) => setFinish({ ...out, celebrate: false }))
        .catch(() => {});
    }
  }, [data, finish, sessionId]);

  // chronomètre : temps écoulé donné par le serveur au chargement + horloge locale
  const base = useRef(null);
  useEffect(() => {
    if (data && !base.current) base.current = { sec: data.elapsedSec, at: Date.now() };
  }, [data]);
  const now = useNow(1000);
  const elapsed = base.current ? base.current.sec + Math.floor((now - base.current.at) / 1000) : data?.elapsedSec || 0;

  // l'écran reste allumé pendant la séance
  useEffect(() => {
    let lock = null;
    const request = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch {
        /* refusé (batterie faible) : sans conséquence */
      }
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      document.removeEventListener('visibilitychange', request);
      if (lock) lock.release().catch(() => {});
    };
  }, []);

  // séries en attente : envoyées au chargement et au retour du réseau
  const sync = useCallback(async () => {
    if (!pendingCount(sessionId)) return { remaining: 0 };
    const res = await flush(sessionId);
    setPending(res.remaining);
    if (res.error && res.error.status !== 0) toast({ text: errText(res.error), tone: 'error' });
    return res;
  }, [sessionId, toast, errText]);
  useEffect(() => {
    sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [sync]);

  const entry = index != null ? entries[Math.min(index, entries.length - 1)] : null;
  const rows = entry ? rowsOf(entry) : [];
  const active = rows.findIndex((r) => !r.done);
  const timed = entry ? isTimed(entry.targetReps) : false;
  const pos = entry ? entries.indexOf(entry) : 0;

  function setRows(e, next) {
    setRowsMap((m) => ({ ...m, [rowsKey(e)]: next }));
  }

  function persist(e, next) {
    const setsDone = next.filter((r) => r.done).map((r) => ({ weight: parseKg(r.weight), reps: Number(r.reps) || 0 }));
    enqueue(sessionId, e.id, setsDone); // optimiste : l'écran avance tout de suite
    setPending(pendingCount(sessionId));
    sync();
  }

  function change(i, field, value) {
    setRows(entry, rows.map((r, k) => (k === i ? { ...r, [field]: value, auto: field === 'weight' ? false : r.auto } : r)));
  }

  function validate(i) {
    const r = rows[i];
    const kg = parseKg(r.weight);
    const reps = Number(r.reps);
    if (!(reps > 0) || reps > 200) {
      toast({ text: t(timed ? 'session.secRequired' : 'session.repsRequired'), tone: 'error' });
      return;
    }
    if (!Number.isFinite(kg) || kg < 0 || kg > 500) {
      toast({ text: t('session.kgInvalid'), tone: 'error' });
      return;
    }
    const kgText = toInput(Math.round(kg * 4) / 4, lang);
    // la charge validée est reprise par les séries suivantes non modifiées
    const next = rows.map((x, k) => {
      if (k === i) return { ...x, weight: kgText, reps: String(reps), done: true, auto: false };
      if (k > i && !x.done && x.auto) return { ...x, weight: kgText };
      return x;
    });
    setRows(entry, next);
    persist(entry, next);
    const setsLeft = next.findIndex((x) => !x.done);
    if (entry.restSec > 0 && (setsLeft >= 0 || pos < entries.length - 1)) {
      const nextLabel =
        setsLeft >= 0
          ? t('session.nextSetIs', { n: setsLeft + 1, kg: next[setsLeft].weight || '0', reps: next[setsLeft].reps })
          : t('session.nextExerciseIs', { name: name(entries[pos + 1].exercise) });
      setRest({ endsAt: Date.now() + entry.restSec * 1000, total: entry.restSec, next: nextLabel });
    }
  }

  function toggle(i) {
    if (rows[i].done) {
      const next = rows.map((x, k) => (k === i ? { ...x, done: false } : x));
      setRows(entry, next);
      persist(entry, next);
    } else validate(i);
  }

  function addSet() {
    const last = rows[rows.length - 1];
    setRows(entry, [...rows, { weight: last?.weight ?? '', reps: last?.reps ?? '', done: false, auto: true }]);
  }

  /** Avant une action serveur (remplacer, attendre, terminer) : tout ce qui attend doit être envoyé */
  async function ensureSynced() {
    const res = await sync();
    if (res.remaining || !navigator.onLine) {
      toast({ text: t('session.needNetwork'), icon: 'wifi-off' });
      return false;
    }
    return true;
  }

  async function finishSession() {
    setBusy(true);
    try {
      if (!(await ensureSynced())) return;
      const out = await api.post(`/sessions/${sessionId}/finish`);
      setRest(null);
      setSheet(null);
      setFinish({ ...out, celebrate: true });
    } catch (err) {
      toast({ text: errText(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function substitute(exercise) {
    const reason = sheet?.reason;
    setBusy(true);
    try {
      if (!(await ensureSynced())) return;
      const view = await api.post(`/sessions/${sessionId}/entries/${entry.id}/substitute`, { exerciseId: exercise.id, reason });
      drop(sessionId, entry.id);
      load.setData(view);
      setSheet(null);
      setRest(null);
      toast({ text: view.reportId ? t('session.alt.reportSent') : t('session.alt.swapped', { name: name(exercise) }), icon: 'refresh-cw' });
    } catch (err) {
      toast({ text: errText(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function postpone() {
    setBusy(true);
    try {
      if (!(await ensureSynced())) return;
      const view = await api.post(`/sessions/${sessionId}/entries/${entry.id}/postpone`);
      load.setData(view);
      setSheet(null);
      toast({ text: t('session.alt.postponed'), icon: 'hourglass' });
    } catch (err) {
      toast({ text: errText(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function abandon() {
    setBusy(true);
    try {
      await api.del(`/sessions/${sessionId}`);
      drop(sessionId);
      navigate('/app/entrainement', { replace: true });
    } catch (err) {
      toast({ text: errText(err), tone: 'error' });
      setBusy(false);
    }
  }

  // ------------------------------------------------------------------ rendu
  let content;
  if (finish) {
    content = <FinishScreen session={finish.session} stats={finish.stats} celebrate={finish.celebrate} />;
  } else if (load.loading && !data) {
    content = (
      <div className="page">
        <PageSkeleton cards={3} />
      </div>
    );
  } else if (!data) {
    content = (
      <div className="page">
        {load.error && load.error.status === 404 ? (
          <Empty icon="search" title={t('session.notFound')} action={<Button variant="primary" to="/app/entrainement">{t('session.backToTraining')}</Button>} />
        ) : (
          <ErrorState error={load.error} onRetry={load.reload} />
        )}
      </div>
    );
  } else if (data.status === 'TERMINEE' || !entry) {
    content = (
      <div className="page">
        <PageSkeleton cards={2} />
      </div>
    );
  } else {
    const isLast = pos >= entries.length - 1;
    const primary =
      active >= 0
        ? { label: t('session.nextSet'), icon: 'arrow-right', onClick: () => validate(active) }
        : !isLast
          ? { label: t('session.nextExercise'), icon: 'arrow-right', onClick: () => setIndex(pos + 1) }
          : { label: t('session.finishSession'), icon: 'flag', onClick: finishSession };
    content = (
      <div className="page session-page">
        <header className="session-top">
          <IconButton icon="x" label={t('session.quit')} onClick={() => setSheet('quit')} />
          <button type="button" className="session-title" onClick={() => setSheet('list')} aria-haspopup="dialog">
            {t('session.exerciseOf', { n: pos + 1, total: entries.length })}
            <Icon name="chevron-down" size={18} className="muted" />
          </button>
          <span className="session-timer" role="timer" aria-label={t('session.elapsed')}>
            <Icon name="timer" size={20} />
            <span className="num">{fmt.clock(elapsed)}</span>
          </span>
        </header>
        <Segments
          values={entries.map((e) => {
            const r = rowsOf(e);
            return r.length ? r.filter((x) => x.done).length / r.length : 0;
          })}
          label={t('session.exerciseOf', { n: pos + 1, total: entries.length })}
        />

        <OfflineBanner text={t('session.offline')} />
        {online && pending > 0 ? (
          <Banner icon="refresh-cw">{tp('session.pending', pending)}</Banner>
        ) : null}
        {gym.data && gym.data.level === 'PLEINE' ? (
          <Banner tone="warn" icon="users">
            {t('session.gymFull')}
          </Banner>
        ) : null}

        <VideoCard key={entry.exercise.id} exercise={entry.exercise} onInfo={() => navigate(`/app/exercice/${entry.exercise.id}`)} />

        <div className="stack-2">
          <h1 className="h1 session-name">{name(entry.exercise)}</h1>
          <p className="muted">{machineLine(entry.exercise)}</p>
          {entry.originalExercise ? (
            <p className="caption warn-text row-2">
              <Icon name="refresh-cw" size={14} />
              {t('session.replaces', { name: name(entry.originalExercise), reason: t(`session.reason.${entry.reason}`) })}
            </p>
          ) : null}
          <div className="chips">
            {[entry.exercise.primaryMuscle, ...(entry.exercise.secondaryMuscles || [])].slice(0, 4).map((m) => (
              <span key={m} className="tag">
                {metaLabel('muscles', m)}
              </span>
            ))}
          </div>
        </div>

        <SetsTable key={rowsKey(entry)} entry={entry} rows={rows} timed={timed} active={active} onChange={change} onToggle={toggle} onAdd={addSet} />

        <div className="reason-row" role="group" aria-label={t('session.machineIssue')}>
          {REASONS.map((r) => (
            <Button key={r.reason} variant={r.variant} icon={r.icon} disabled={busy} onClick={() => setSheet({ reason: r.reason })}>
              {t(`session.reason.${r.reason}`)}
            </Button>
          ))}
        </div>

        <div className="sticky-bar">
          <Button variant="primary" size="lg" block iconEnd={primary.icon} loading={busy && active < 0} onClick={primary.onClick}>
            {primary.label}
          </Button>
        </div>

        {rest ? (
          <RestTimer
            endsAt={rest.endsAt}
            total={rest.total}
            next={rest.next}
            onAdd={() => setRest((x) => (x ? { ...x, endsAt: Math.max(x.endsAt, Date.now()) + 15000, total: x.total + 15 } : x))}
            onSkip={() => setRest(null)}
          />
        ) : null}

        <AlternativesSheet
          open={Boolean(sheet && sheet.reason)}
          sessionId={sessionId}
          entry={entry}
          reason={sheet?.reason || 'OCCUPEE'}
          busy={busy}
          onClose={() => setSheet(null)}
          onChoose={substitute}
          onWait={postpone}
        />

        <Sheet
          open={sheet === 'list'}
          onClose={() => setSheet(null)}
          dark
          title={name(data, 'dayLabel') || t('session.title')}
          footer={
            <Button variant="primary" size="lg" block icon="flag" loading={busy} onClick={finishSession}>
              {t('session.finishSession')}
            </Button>
          }
        >
          <ul className="ex-list">
            {entries.map((e, i) => {
              const r = rowsOf(e);
              const done = r.filter((x) => x.done).length;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`ex-row entry-pick ${i === pos ? 'current' : ''}`}
                    onClick={() => {
                      setIndex(i);
                      setSheet(null);
                    }}
                  >
                    <span className={`entry-n ${complete(e) ? 'done' : ''}`}>
                      {complete(e) ? <Icon name="check" size={16} stroke={2.75} /> : <span className="num">{i + 1}</span>}
                    </span>
                    <span className="grow">
                      <span className="ex-name">{name(e.exercise)}</span>
                      <span className="ex-sub">
                        <span className="num">
                          {done}/{r.length}
                        </span>{' '}
                        {tp('session.setsWord', r.length)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Sheet>

        <Sheet
          open={sheet === 'quit'}
          onClose={() => setSheet(null)}
          dark
          title={t('session.quitTitle')}
          subtitle={t('session.quitText')}
          footer={
            <>
              <Button variant="primary" size="lg" block onClick={() => setSheet(null)}>
                {t('session.keepGoing')}
              </Button>
              <Button variant="secondary" size="lg" block onClick={() => navigate('/app/entrainement')}>
                {t('session.later')}
              </Button>
              <Button variant="danger" size="lg" block icon="trash-2" loading={busy} disabled={!online} onClick={abandon}>
                {t('session.abandon')}
              </Button>
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="session-screen" data-theme="dark">
      {content}
    </div>
  );
}
