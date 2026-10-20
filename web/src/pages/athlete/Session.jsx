import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { ErrorText, Spinner, useLoad } from '../../components/ui';

const REASONS = ['OCCUPEE', 'ABSENTE', 'PANNE'];

function firstNumber(text) {
  const n = parseInt(String(text), 10);
  return Number.isNaN(n) ? '' : n;
}

function isDone(entry) {
  return entry.setsDone.length >= entry.targetSets;
}

// ---------------------------------------------------------------- Minuteur de repos
function RestBar({ endsAt, onClose }) {
  const { t } = useI18n();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  useEffect(() => {
    if (left === 0) {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      const id = setTimeout(onClose, 1500);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [left, onClose]);
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className="rest-bar" role="timer" aria-live="polite">
      <span>{left === 0 ? t('session.restDone') : t('session.rest')}</span>
      <span className="rest-time">
        {mm}:{ss}
      </span>
      <button className="btn btn-small btn-ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.3)' }} onClick={onClose}>
        {t('session.skip')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Bloc « machine indisponible »
function SwapPanel({ session, entry, onSession }) {
  const { t, name, lang } = useI18n();
  const [reason, setReason] = useState(null);
  const [alts, setAlts] = useState(null);
  const [why, setWhy] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function pick(r) {
    setReason(r);
    setAlts(null);
    setError(null);
    try {
      const data = await api(`/sessions/${session.id}/entries/${entry.id}/alternatives?reason=${r}`);
      setAlts(data.alternatives);
    } catch (err) {
      setError(err);
    }
  }

  async function choose(exerciseId) {
    setBusy(true);
    try {
      onSession(await api(`/sessions/${session.id}/entries/${entry.id}/substitute`, { method: 'POST', body: { exerciseId, reason } }));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  async function postpone() {
    setBusy(true);
    try {
      onSession(await api(`/sessions/${session.id}/entries/${entry.id}/postpone`, { method: 'POST' }));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  async function explain(altId) {
    setWhy({ ...why, [altId]: '…' });
    try {
      const data = await api(`/exercises/${entry.exerciseId}/explain/${altId}?lang=${lang}`);
      setWhy((w) => ({ ...w, [altId]: data.text }));
    } catch (err) {
      setWhy((w) => ({ ...w, [altId]: '' }));
      setError(err);
    }
  }

  return (
    <div className="swap">
      <h3>{t('swap.question', { machine: name(entry.exercise.equipment) })}</h3>
      <div className="swap-buttons" role="group" aria-label={t('swap.question', { machine: '' })}>
        {REASONS.map((r) => (
          <button
            key={r}
            type="button"
            className={`swap-btn${r === 'PANNE' ? ' panne' : ''}${reason === r ? ' on' : ''}`}
            aria-pressed={reason === r}
            onClick={() => pick(r)}
          >
            {t(`swap.${r}`)}
          </button>
        ))}
      </div>

      {reason === 'PANNE' && <p className="small muted">{t('swap.panneNote')}</p>}

      {reason && !alts && !error && <div className="spinner" />}

      {alts && alts.length === 0 && <p className="muted">{t('swap.none')}</p>}

      {alts && alts.length > 0 && (
        <div className="stack">
          {alts.map((a, i) => (
            <div key={a.exercise.id} className="alt">
              <div className="alt-top">
                <div className="inline" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                  <span className="alt-rank">{i + 1}</span>
                  <div>
                    <div className="row-title">{name(a.exercise)}</div>
                    <div className="row-sub">{name(a.exercise.equipment)}</div>
                  </div>
                </div>
                <button className="btn btn-small" disabled={busy} onClick={() => choose(a.exercise.id)}>
                  {t('swap.choose')}
                </button>
              </div>
              <div className="chips">
                {a.reasons.map((r) => (
                  <span key={r} className="badge badge-brand">
                    {t(`swap.reason.${r}`)}
                  </span>
                ))}
                {a.relaxed && <span className="badge badge-warn">{t('swap.relaxed')}</span>}
              </div>
              {a.advice !== 'SAME_EFFORT' && <p className="small">{t(`swap.advice.${a.advice}`)}</p>}
              {why[a.exercise.id] ? (
                <p className="small muted">{why[a.exercise.id]}</p>
              ) : (
                <button className="link-btn small" onClick={() => explain(a.exercise.id)}>
                  {t('swap.why')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {reason === 'OCCUPEE' && (
        <button className="btn btn-ghost" disabled={busy} onClick={postpone}>
          {t('swap.wait')}
        </button>
      )}
      <ErrorText error={error} />
    </div>
  );
}

// ---------------------------------------------------------------- Un exercice de la séance
function EntryBody({ session, entry, onSession, onRest }) {
  const { t, name } = useI18n();
  const [rows, setRows] = useState(() => {
    const reps = firstNumber(entry.targetReps);
    const count = Math.max(entry.targetSets, entry.setsDone.length);
    let last = '';
    return Array.from({ length: count }, (_, i) => {
      const done = entry.setsDone[i];
      if (done) last = done.weight;
      return done ? { weight: done.weight, reps: done.reps, done: true } : { weight: last, reps, done: false };
    });
  });
  const [error, setError] = useState(null);
  const [showSwap, setShowSwap] = useState(false);
  const timed = /s$/.test(entry.targetReps.trim());

  async function save(next) {
    setRows(next);
    try {
      const setsDone = next.filter((r) => r.done).map((r) => ({ weight: Number(r.weight) || 0, reps: Number(r.reps) || 0 }));
      onSession(await api(`/sessions/${session.id}/entries/${entry.id}`, { method: 'PUT', body: { setsDone } }), entry.id);
    } catch (err) {
      setError(err);
    }
  }

  function edit(i, field, value) {
    setRows(rows.map((r, k) => (k === i ? { ...r, [field]: value } : r)));
  }

  function toggle(i) {
    const next = rows.map((r, k) => (k === i ? { ...r, done: !r.done } : r));
    // la charge validée est reprise pour la série suivante
    if (next[i].done && next[i + 1] && !next[i + 1].done && next[i + 1].weight === '') next[i + 1] = { ...next[i + 1], weight: next[i].weight };
    if (next[i].done) onRest(entry.restSec);
    save(next);
  }

  return (
    <div className="session-body">
      {entry.originalExercise && (
        <p className="replaced-note">
          {t('session.replaces', { name: name(entry.originalExercise), reason: t(`swap.${entry.reason}`).toLowerCase() })}
        </p>
      )}
      <div className="inline" style={{ justifyContent: 'space-between' }}>
        <span className="target">
          {entry.targetSets} × {entry.targetReps}
        </span>
        <Link to={`/app/exercice/${entry.exercise.id}`}>{t('session.sheet')}</Link>
      </div>

      <div className="sets">
        <div className="set-head">
          <span>#</span>
          <span>{t('session.weight')}</span>
          <span>{timed ? t('session.seconds') : t('session.reps')}</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="set-row">
            <span className="set-label">{i + 1}</span>
            <input inputMode="decimal" aria-label={`${t('session.weight')} ${i + 1}`} value={r.weight} placeholder="0" onChange={(e) => edit(i, 'weight', e.target.value)} />
            <input inputMode="numeric" aria-label={`${t('session.reps')} ${i + 1}`} value={r.reps} onChange={(e) => edit(i, 'reps', e.target.value)} />
            <button type="button" className={`set-check${r.done ? ' on' : ''}`} aria-pressed={r.done} aria-label={t('session.validateSet', { n: i + 1 })} onClick={() => toggle(i)}>
              ✓
            </button>
          </div>
        ))}
        <button type="button" className="link-btn small" onClick={() => setRows([...rows, { weight: rows.at(-1)?.weight ?? '', reps: firstNumber(entry.targetReps), done: false }])}>
          {t('session.addSet')}
        </button>
      </div>

      {showSwap ? (
        <SwapPanel session={session} entry={entry} onSession={onSession} />
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => setShowSwap(true)}>
          {t('swap.open')}
        </button>
      )}
      <ErrorText error={error} />
    </div>
  );
}

// ---------------------------------------------------------------- Page
export default function Session() {
  const { id } = useParams();
  const { t, name } = useI18n();
  const navigate = useNavigate();
  const session = useLoad(() => api(`/sessions/${id}`), [id]);
  const [openId, setOpenId] = useState(null);
  const [restEnd, setRestEnd] = useState(null);
  const [error, setError] = useState(null);
  const closeRest = useCallback(() => setRestEnd(null), []);

  const data = session.data;
  const entries = data ? data.entries : [];
  const current = openId ?? entries.find((e) => !isDone(e))?.id ?? null;

  function onSession(fresh, keepOpenId) {
    session.setData(fresh);
    if (keepOpenId) {
      const entry = fresh.entries.find((e) => e.id === keepOpenId);
      if (entry && isDone(entry)) setOpenId(null); // passe automatiquement à l'exercice suivant
    }
  }

  async function finish() {
    try {
      await api(`/sessions/${id}/finish`, { method: 'POST' });
      navigate('/app/progression', { state: { finished: true } });
    } catch (err) {
      setError(err);
    }
  }

  async function abandon() {
    if (!window.confirm(t('session.confirmAbandon'))) return;
    try {
      await api(`/sessions/${id}`, { method: 'DELETE' });
      navigate('/app');
    } catch (err) {
      setError(err);
    }
  }

  if (session.loading) return <Spinner />;
  if (!data) return <ErrorText error={session.error} />;

  const doneCount = entries.filter(isDone).length;
  const finished = data.status === 'TERMINEE';

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1>{name(data, 'dayLabel')}</h1>
          <p className="page-sub">{t('session.progress', { done: doneCount, total: entries.length })}</p>
        </div>
        {!finished && (
          <div className="inline">
            <button className="btn btn-ghost btn-small" onClick={abandon}>
              {t('session.abandon')}
            </button>
            <button className="btn" onClick={finish}>
              {t('session.finish')}
            </button>
          </div>
        )}
      </div>
      <ErrorText error={error} />

      {entries.map((entry, i) => {
        const open = !finished && entry.id === current;
        return (
          <section key={entry.id} className={`session-entry${open ? ' open' : ''}`}>
            <button type="button" className="session-entry-head" aria-expanded={open} onClick={() => setOpenId(open ? -1 : entry.id)}>
              <span className={`entry-num${isDone(entry) ? ' done' : ''}`}>{isDone(entry) ? '✓' : i + 1}</span>
              <span className="row-main">
                <span className="row-title" style={{ display: 'block' }}>
                  {name(entry.exercise)}
                </span>
                <span className="row-sub">
                  {entry.setsDone.length}/{entry.targetSets} · {name(entry.exercise.equipment)}
                </span>
              </span>
              {entry.reason && <span className="badge badge-warn">{t('session.replaced')}</span>}
            </button>
            {open && (
              <EntryBody
                key={`${entry.id}-${entry.exerciseId}`}
                session={data}
                entry={entry}
                onSession={onSession}
                onRest={(s) => setRestEnd(Date.now() + s * 1000)}
              />
            )}
          </section>
        );
      })}

      {restEnd && <RestBar key={restEnd} endsAt={restEnd} onClose={closeRest} />}
    </div>
  );
}
