import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bars, Button, ErrorState, Icon, IconButton, MacroBar, Ring, Skeleton, useToast } from '../../components';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { localDate, useInterval, useLoad, weekdayIndex } from '../../lib/hooks';
import GymLiveSheet, { liveStatus } from './GymLiveSheet';
import RenewSheet from '../account/RenewSheet';
import './home.css';

const LIVE_REFRESH_MS = 60000;
const BANNER_STATUSES = ['EXPIRE_BIENTOT', 'GRACE', 'EXPIRE', 'GELE'];
const hhmm = (h) => `${String(h).padStart(2, '0')}:00`;

/** Accueil du membre (B2) */
export default function Home() {
  const { user } = useAuth();
  const { t, fmt } = useI18n();
  const features = user?.gym?.settings?.features || {};
  const liveOn = features.live !== false;
  const mealsOn = features.meals !== false;
  const reportsOn = features.reports !== false;

  const sub = useLoad(() => api.get('/me/subscription'), []);
  const today = useLoad(() => api.get('/programs/today'), []);
  const history = useLoad(() => api.get('/progress/history'), []);
  const live = useLoad(() => (liveOn ? api.get('/gym/live') : null), [liveOn]);
  const nutri = useLoad(() => (mealsOn ? api.get('/nutrition/day') : null), [mealsOn]);
  const notifs = useLoad(() => api.get('/me/notifications'), []);
  const meta = useLoad(() => api.get('/meta'), []);

  const [liveOpen, setLiveOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);

  // le nombre de personnes se met à jour toutes les 60 s (pas quand l'onglet est caché)
  useInterval(
    () => {
      if (!liveOn) return;
      api.get('/gym/live').then(live.setData).catch(() => {});
    },
    liveOn ? LIVE_REFRESH_MS : null
  );

  const unread = notifs.data?.unread || 0;
  const firstName = String(user?.name || '').trim().split(/\s+/)[0];

  return (
    <main className="page home">
      <header className="hm-top">
        <Link to="/app/compte" className="avatar hm-avatar" aria-label={t('nav.account')}>
          {fmt.initials(user?.name)}
        </Link>
        <div className="grow">
          <h1 className="h2">{t('home.hello', { name: firstName })}</h1>
          <p className="small muted">{fmt.date(new Date())}</p>
        </div>
        <IconButton
          icon="bell"
          to="/app/notifications"
          dot={unread > 0}
          label={unread > 0 ? t('home.notificationsUnread', { n: unread }) : t('home.notifications')}
        />
      </header>

      <SubscriptionBanner data={sub.data} onRenew={() => setRenewOpen(true)} />
      <CheckInChip data={sub.data} />

      <TodayCard state={today} meta={meta.data} />

      <WeekStrip history={history} trainingDays={user?.trainingDays || []} />

      {liveOn ? <LiveCard state={live} onOpen={() => setLiveOpen(true)} /> : null}

      {mealsOn ? <NutritionCard state={nutri} /> : null}

      {reportsOn ? (
        <Link to="/app/panne" className="card link hm-report">
          <Icon name="wrench" className="muted" />
          <span className="grow">
            <span className="w500">{t('home.report.title')}</span>
            <span className="small muted hm-block">{t('home.report.sub')}</span>
          </span>
          <Icon name="chevron-right" size={20} className="muted" />
        </Link>
      ) : null}

      {liveOn ? (
        <GymLiveSheet
          open={liveOpen}
          onClose={() => setLiveOpen(false)}
          data={live.data}
          onChange={live.setData}
          error={live.error}
          onRetry={live.reload}
        />
      ) : null}
      <RenewSheet open={renewOpen} onClose={() => setRenewOpen(false)} />
    </main>
  );
}

/* ---------------------------------------------------------------- Abonnement */
function SubscriptionBanner({ data, onRenew }) {
  const { t, tp, fmt, name } = useI18n();
  if (!data || !BANNER_STATUSES.includes(data.status)) return null;
  const s = data.subscription;
  let title;
  let sub = s?.plan ? `${name(s.plan)} · ${fmt.money(s.plan.price)}` : '';
  if (data.status === 'EXPIRE_BIENTOT') {
    title = s.daysLeft <= 0 ? t('home.sub.lastDay') : tp('home.sub.daysLeft', s.daysLeft);
  } else if (data.status === 'GRACE') {
    title = t('home.sub.grace');
    sub = t('home.sub.graceSub', { n: Math.max(0, (s.graceDays || 0) + (s.daysLeft || 0)) });
  } else if (data.status === 'EXPIRE') {
    title = t('home.sub.expired');
    sub = t('home.sub.expiredSub');
  } else {
    title = t('home.sub.frozen', { date: fmt.date(s.frozenUntil, { day: 'numeric', month: 'long' }) });
  }
  const tone = data.status === 'EXPIRE' ? 'danger' : data.status === 'GELE' ? 'hydro' : 'warn';
  return (
    <section className={`card ${tone} hm-sub`} role="status">
      <Icon name={data.status === 'GELE' ? 'snowflake' : 'clock'} className={`${tone === 'hydro' ? 'hydro' : tone}-text`} />
      <div className="grow">
        <div className="w500">{title}</div>
        {sub ? <div className="small muted">{sub}</div> : null}
      </div>
      {data.status !== 'GELE' ? (
        <Button variant={data.status === 'EXPIRE' ? 'danger-solid' : 'warn'} size="sm" onClick={onRenew}>
          {t('home.sub.renew')}
        </Button>
      ) : null}
    </section>
  );
}

function CheckInChip({ data }) {
  const { t, fmt } = useI18n();
  const entry = data?.todayCheckIn;
  if (!entry || entry.status !== 'ENTREE') return null;
  return (
    <div className="hm-in">
      <span className="status ok">
        <Icon name="door-open" size={16} />
        {t('home.checkedIn', { time: fmt.time(entry.at), gym: data.gym?.name || '' })}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- Séance du jour */
function TodayCard({ state, meta }) {
  const { t, tp, fmt, name, label, error: errText } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const { data, loading, error, reload } = state;

  if (loading && !data) return <Skeleton card h={260} />;
  if (error) return <ErrorState error={error} onRetry={reload} compact />;

  const start = async (quick) => {
    setBusy(quick ? 'quick' : 'start');
    try {
      const s = await api.post('/sessions', { dayIndex: data.dayIndex, ...(quick ? { quick30: true } : {}) });
      navigate(`/app/seance/${s.id}`);
    } catch (err) {
      toast({ text: errText(err), tone: 'error' });
      setBusy(null);
    }
  };
  const generate = async () => {
    setBusy('gen');
    try {
      await api.post('/programs/generate', {});
      reload();
    } catch (err) {
      toast({ text: errText(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <section className="card hm-session">
        <div className="hm-hero small-hero" aria-hidden="true">
          <Icon name="clipboard-list" size={56} className="hm-hero-icon" />
        </div>
        <div className="stack-2">
          <h2 className="h2">{t('home.today.noProgram')}</h2>
          <p className="small muted">{t('home.today.noProgramText')}</p>
        </div>
        <Button variant="primary" block icon="sparkles" loading={busy === 'gen'} onClick={generate}>
          {t('home.today.generate')}
        </Button>
      </section>
    );
  }

  const sessionName = name(data, 'label') || data.programTitle;
  const muscles = (data.muscles || []).slice(0, 4);
  const dayName = fmt.weekday(data.weekday);
  const inProgress = data.inProgressSessionId;

  const metaRow = (
    <div className="row wrap hm-meta small muted">
      {data.week ? <span>{t('home.today.week', { n: data.week })}</span> : null}
      <span className="row-2">
        <Icon name="timer" size={16} />
        <Num>{`${fmt.num(data.estMinutes)} ${t('unit.min')}`}</Num>
      </span>
      <span className="row-2">
        <Icon name="list" size={16} />
        <span>{tp('home.today.exercises', data.exerciseCount)}</span>
      </span>
    </div>
  );
  const tags = muscles.length ? (
    <div className="row wrap hm-tags">
      {muscles.map((m) => (
        <span key={m} className="tag">
          {label(meta?.muscles?.[m]) || m}
        </span>
      ))}
    </div>
  ) : null;

  if (inProgress) {
    return (
      <section className="card hm-session">
        <div className="hm-hero" aria-hidden="true">
          <Icon name="dumbbell" size={72} className="hm-hero-icon" />
        </div>
        <span className="status ember">
          <span className="led" aria-hidden="true" />
          {t('home.today.resumeHint')}
        </span>
        <h2 className="h1 hm-name">{sessionName}</h2>
        {metaRow}
        <Button variant="primary" size="lg" block icon="play" to={`/app/seance/${inProgress}`}>
          {t('home.today.resume')}
        </Button>
      </section>
    );
  }

  if (data.doneToday) {
    return (
      <section className="card hm-session">
        <div className="row-2">
          <Icon name="circle-check" className="ok-text" size={28} />
          <h2 className="h2">{t('home.today.doneTitle')}</h2>
        </div>
        <p className="small muted">{t('home.today.doneText', { name: sessionName })}</p>
        <Button variant="secondary" block to="/app/entrainement">
          {t('home.today.seeTraining')}
        </Button>
      </section>
    );
  }

  if (!data.isToday) {
    return (
      <section className="card hm-session">
        <div className="row-2">
          <Icon name="moon" className="muted" size={26} />
          <h2 className="h2">{t('home.today.restTitle')}</h2>
        </div>
        <p className="small muted">{t('home.today.restText', { day: dayName, name: sessionName })}</p>
        {metaRow}
        {tags}
        <div className="grid-2">
          <Button variant="secondary" loading={busy === 'start'} onClick={() => start(false)}>
            {t('home.today.startAnyway')}
          </Button>
          <Button variant="ghost" to="/app/entrainement">
            {t('home.today.seeTraining')}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="card hm-session">
      <div className="hm-hero" aria-hidden="true">
        <span className="caption muted">{t('home.today.eyebrow')}</span>
        <Icon name="dumbbell" size={72} className="hm-hero-icon" />
      </div>
      <h2 className="h1 hm-name">{sessionName}</h2>
      {metaRow}
      {tags}
      <div className="hm-actions">
        <Button variant="primary" size="lg" icon="play" loading={busy === 'start'} disabled={Boolean(busy)} onClick={() => start(false)}>
          {t('home.today.start')}
        </Button>
        <Button variant="secondary" size="lg" loading={busy === 'quick'} disabled={Boolean(busy)} onClick={() => start(true)}>
          {t('home.today.quick')}
        </Button>
      </div>
    </section>
  );
}

function Num({ children }) {
  return <span className="num">{children}</span>;
}

/* ---------------------------------------------------------------- Semaine */
/** Série : jours d'entraînement prévus réussis d'affilée (les jours de repos ne cassent pas la série) */
function dayStreak(doneDates, trainingDays) {
  const done = new Set(doneDates);
  if (!done.size) return 0;
  const oldest = [...done].sort()[0];
  const d = new Date();
  let streak = 0;
  if (done.has(localDate(d))) streak += 1;
  for (let i = 0; i < 120; i += 1) {
    d.setDate(d.getDate() - 1);
    const key = localDate(d);
    if (key < oldest) break;
    if (done.has(key)) streak += 1;
    else if (trainingDays.includes(weekdayIndex(d))) break;
  }
  return streak;
}

function WeekStrip({ history, trainingDays }) {
  const { t, tp, fmt } = useI18n();
  const days = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - weekdayIndex(now));
    const doneSet = new Set((history.data || []).map((s) => s.date));
    const todayKey = localDate(now);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = localDate(d);
      return { i, key, date: d.getDate(), done: doneSet.has(key), planned: trainingDays.includes(i), today: key === todayKey };
    });
  }, [history.data, trainingDays]);
  const streak = useMemo(() => dayStreak((history.data || []).map((s) => s.date), trainingDays), [history.data, trainingDays]);

  if (history.loading && !history.data) return <Skeleton card h={120} />;
  if (history.error) return <ErrorState error={history.error} onRetry={history.reload} compact />;

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">{t('home.week.title')}</h2>
        {streak > 0 ? (
          <span className="row-2 ember w500" aria-label={t('home.week.streakLabel', { n: streak })}>
            <Icon name="flame" size={18} />
            <span>{tp('home.week.streak', streak)}</span>
          </span>
        ) : null}
      </div>
      <ol className="hm-week">
        {days.map((d) => {
          const state = d.done ? 'done' : d.planned ? 'planned' : 'rest';
          const cls = `hm-${state}${d.today ? ' hm-today' : ''}`;
          return (
            <li key={d.key} className={cls}>
              <span className={`caption ${d.today ? 'w600' : 'muted'}`} aria-hidden="true">
                {fmt.weekdayLetter(d.i)}
              </span>
              <span className="hm-day">
                {d.done ? <Icon name="check" size={18} stroke={2.5} /> : <span className="num">{d.date}</span>}
              </span>
              <span className="sr-only">
                {fmt.weekday(d.i)} {d.date} · {t(`home.week.${state}`)}
                {d.today ? ` · ${t('home.week.today')}` : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ---------------------------------------------------------------- Gym en direct */
function LiveCard({ state, onOpen }) {
  const { t, fmt } = useI18n();
  const { data, loading, error, reload } = state;
  if (loading && !data) return <Skeleton card h={150} />;
  if (error) {
    if (['FEATURE_DISABLED', 'NO_GYM'].includes(error.code)) return null;
    return <ErrorState error={error} onRetry={reload} compact />;
  }
  if (!data) return null;
  const st = liveStatus(data, t, fmt);
  const bars = (data.hourlyToday || []).map((h) => ({
    value: h.count ?? h.forecast,
    tone: h.phase === 'NOW' ? 'now' : h.phase === 'PAST' ? 'past' : 'forecast',
  }));
  const parts = [];
  if (data.calmWindow) parts.push(t('home.live.calmAt', { time: data.calmWindow.from }));
  if (data.peak) parts.push(t('home.live.peakAt', { time: hhmm(data.peak.hour) }));

  return (
    <button type="button" className="card link hm-live" onClick={onOpen} aria-label={t('home.live.open')}>
      <div className="card-head">
        <span className="row-2 card-title">
          <span className={`live-dot ${st.tone === 'ok' ? '' : st.tone}`} aria-hidden="true" />
          {t('home.live.title')}
        </span>
        <Icon name="chevron-right" size={20} className="muted" />
      </div>
      <div className="hm-live-body">
        <div className="grow">
          {data.count != null ? (
            <div className="row-2 hm-count">
              <span className="big-num">
                <span className="num">{fmt.num(data.count)}</span>
              </span>
              <span className="muted">{t('home.live.people')}</span>
            </div>
          ) : (
            <div className="h1">{t(`home.live.level.${data.level}`)}</div>
          )}
          <div className={`small w500 ${st.tone}-text`}>{st.text}</div>
        </div>
        {bars.length ? (
          <div className="hm-minibars">
            <Bars data={bars} height={48} label={t('home.sheet.chartLabel')} />
          </div>
        ) : null}
      </div>
      {parts.length ? <p className="small muted mt-2">{parts.join(' · ')}</p> : null}
    </button>
  );
}

/* ---------------------------------------------------------------- Nutrition */
function NutritionCard({ state }) {
  const { t, fmt, error: errText } = useI18n();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const { data, loading, error, reload, setData } = state;
  if (loading && !data) return <Skeleton card h={200} />;
  if (error) {
    if (error.code === 'FEATURE_DISABLED') return null;
    return <ErrorState error={error} onRetry={reload} compact />;
  }
  if (!data) return null;

  const bump = (ml) =>
    setData((d) => (d ? { ...d, water: { ...d.water, consumedMl: Math.max(0, d.water.consumedMl + ml) } } : d));

  const addWater = async () => {
    setAdding(true);
    try {
      const log = await api.post('/nutrition/water', { ml: 250 });
      bump(log.ml);
      toast({
        text: t('home.nutri.waterAdded'),
        icon: 'droplet',
        action: {
          label: t('action.undo'),
          onClick: () =>
            api
              .del(`/nutrition/water/${log.id}`)
              .then(() => bump(-log.ml))
              .catch((err) => toast({ text: errText(err), tone: 'error' })),
        },
      });
    } catch (err) {
      toast({ text: errText(err), tone: 'error' });
    } finally {
      setAdding(false);
    }
  };

  const target = data.target;
  const water = data.water;
  const eaten = data.totals?.calories || 0;
  const left = target ? target.calories - eaten : 0;

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">{t('home.nutri.title')}</h2>
        <Link to="/app/repas" className="link-btn">
          {t('home.nutri.see')}
        </Link>
      </div>
      {target ? (
        <div className="hm-nutri">
          <Ring value={eaten} max={target.calories} size={112} stroke={10} color={left < 0 ? 'var(--danger)' : 'var(--ember)'}>
            <span className="h3">
              <span className="num">{fmt.num(Math.abs(left))}</span>
            </span>
            <span className="caption muted hm-block">{left < 0 ? t('home.nutri.over') : t('home.nutri.remaining')}</span>
          </Ring>
          <div className="stack grow">
            <MacroBar label={t('home.nutri.protein')} value={data.totals.protein} target={target.protein} color="var(--protein)" />
            <MacroBar label={t('home.nutri.carbs')} value={data.totals.carbs} target={target.carbs} color="var(--carbs)" />
            <MacroBar label={t('home.nutri.fat')} value={data.totals.fat} target={target.fat} color="var(--fat)" />
          </div>
        </div>
      ) : (
        <p className="small muted">{t('home.nutri.noTarget')}</p>
      )}
      {water ? (
        <div className="hm-water">
          <Ring value={water.consumedMl} max={water.targetMl} size={44} stroke={5} color="var(--hydro)" label={t('home.nutri.water')}>
            <Icon name="droplet" size={18} className="hydro-text" />
          </Ring>
          <span className="grow h3">
            <span className="num">
              {fmt.num(water.consumedMl / 1000, 1)} <span className="muted w300">/ {fmt.liters(water.targetMl)}</span>
            </span>
          </span>
          <Button variant="hydro" icon="plus" loading={adding} onClick={addWater} aria-label={t('home.nutri.addWaterLabel')}>
            <span className="num">
              {fmt.num(250)} {t('unit.ml')}
            </span>
          </Button>
        </div>
      ) : null}
    </section>
  );
}
