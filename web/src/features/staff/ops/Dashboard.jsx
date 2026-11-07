// D2 / M2 — Tableau de bord de la salle : chaque bloc n'apparaît que si le rôle y a droit (le serveur omet les autres)
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Avatar, Bars, Button, Empty, ErrorState, Icon, Skeleton, OfflineBanner } from '../../../components';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { useDebounced, useInterval, useLoad, useNow } from '../../../lib/hooks';
import { can } from '../../../lib/permissions';
import { EntryStatus, SubStatus, useMeta } from './shared';
import { ChargeSheet, MessageSheet } from './sheets';
import './ops.css';

const AXIS_HOURS = [6, 9, 12, 15, 18, 21, 23];

/** Courbe d'affluence du jour : passé · maintenant · prévision · plus calme */
export function HourlyBars({ hours, height = 150, compact = false }) {
  const { t } = useI18n();
  const data = hours.map((h) => ({
    value: h.count ?? h.forecast,
    tone: h.phase === 'NOW' ? 'now' : h.calm ? 'calm' : h.phase === 'PAST' ? 'past' : 'forecast',
    label: t('ops.hour', { h: h.hour }),
  }));
  return (
    <Bars
      data={data}
      height={height}
      label={t('ops.dash.affluence')}
      axis={compact ? null : AXIS_HOURS.map((h) => t('ops.hour', { h }))}
    />
  );
}

export function BarsLegend() {
  const { t } = useI18n();
  return (
    <div className="ops-legend" aria-hidden="true">
      <span><i className="past" />{t('ops.legend.past')}</span>
      <span><i className="now" />{t('ops.legend.now')}</span>
      <span><i className="forecast" />{t('ops.legend.forecast')}</span>
      <span><i className="calm" />{t('ops.legend.calm')}</span>
    </div>
  );
}

/** « Calme pour un mardi » / « Plus chargé qu'un mardi habituel » */
export function trendText(t, fmt, compared) {
  if (!compared) return { text: '', tone: '' };
  const day = fmt.weekday(compared.weekday);
  if (compared.trend === 'CALMER') return { text: t('ops.trend.calmer', { day }), tone: 'ok' };
  if (compared.trend === 'BUSIER') return { text: t('ops.trend.busier', { day }), tone: 'warn' };
  return { text: t('ops.trend.usual', { day }), tone: 'muted' };
}

function Tile({ label, value, unit, sub, tone = '', subTone = '', to, className = '' }) {
  const body = (
    <>
      <span className="kpi-label">{label}</span>
      <span className={`kpi-value ${tone ? `${tone}-text` : ''}`}>
        <span className="num">{value}</span>
        {unit ? <small> {unit}</small> : null}
      </span>
      {sub ? <span className={`kpi-sub ${subTone ? `${subTone}-text` : ''}`}>{sub}</span> : null}
    </>
  );
  return to ? (
    <Link to={to} className={`kpi ops-kpi-link ${className}`}>
      {body}
    </Link>
  ) : (
    <div className={`kpi ${className}`}>{body}</div>
  );
}

/** Recherche rapide d'un membre (en-tête du tableau de bord) */
function QuickSearch() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const query = useDebounced(q.trim(), 250);
  const [items, setItems] = useState([]);
  const box = useRef(null);

  useEffect(() => {
    if (query.length < 2) {
      setItems([]);
      return undefined;
    }
    let alive = true;
    api
      .get(`/staff/members?q=${encodeURIComponent(query)}&pageSize=6&sort=name`)
      .then((r) => alive && setItems(r.items))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [query]);

  useEffect(() => {
    const onDoc = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    if (q.trim()) navigate(`/salle/membres?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <form className="search ops-quick" ref={box} onSubmit={submit} role="search">
      <Icon name="search" size={20} />
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t('ops.dash.search')}
        aria-label={t('ops.dash.search')}
        maxLength={60}
      />
      {open && query.length >= 2 ? (
        <div className="ops-pop" role="listbox">
          {items.length ? (
            items.map((m) => (
              <Link key={m.id} to={`/salle/membres/${m.id}`} className="ops-member-row" role="option" aria-selected="false" onClick={() => setOpen(false)}>
                <Avatar name={m.name} size="sm" />
                <span className="grow w500 ellipsis" dir="auto">
                  {m.name}
                </span>
                <SubStatus status={m.status} daysLeft={m.subscription?.daysLeft} />
              </Link>
            ))
          ) : (
            <p className="small muted ops-pop-empty">{t('ops.search.none')}</p>
          )}
        </div>
      ) : null}
    </form>
  );
}

function TodoItem({ item, onRemind }) {
  const { t, fmt, label, name } = useI18n();
  const fmtName = (plan) => name(plan);
  const { user } = useAuth();
  const meta = useMeta();
  const issue = (code) => label(meta.issueTypes?.[code]) || '';
  const machine = (m) => (m ? `${m.label} #${m.code}` : '');
  const canRenew = can(user, 'members.write') && can(user, 'payments');
  let dot = 'danger';
  let title;
  let sub;
  let action = null;
  switch (item.type) {
    case 'REPORT_NEW':
      title = t('ops.todo.reportNew', { machine: machine(item.machine) });
      sub = [fmt.when(item.at), item.count > 1 ? t('ops.todo.reports', { n: item.count }) : issue(item.issueType)].filter(Boolean).join(' · ');
      action = { to: '/salle/pannes', label: t('ops.todo.see') };
      break;
    case 'REPORT_REPAIR':
      dot = 'muted';
      title = t('ops.todo.repair', { machine: machine(item.machine) });
      sub = [item.assignedTo?.name, item.note || issue(item.issueType)].filter(Boolean).join(' · ');
      action = { to: '/salle/pannes', label: t('ops.todo.follow') };
      break;
    case 'ENTRY_REFUSED':
      title = t('ops.todo.refused', { name: item.member.name });
      sub = [fmt.time(item.at), item.reason === 'EXPIRE' && item.endDate ? t('ops.todo.expiredOn', { date: fmt.shortDate(item.endDate) }) : t(`ops.reason.${item.reason || 'AUCUN'}`)].join(' · ');
      action = canRenew ? { to: `/salle/membres/${item.member.id}?renouveler=1`, label: t('ops.todo.charge') } : { to: `/salle/membres/${item.member.id}`, label: t('ops.todo.see') };
      break;
    case 'EXPIRES_TODAY':
      dot = 'warn';
      title = t('ops.todo.expiresToday', { name: item.member.name });
      sub = [item.plan ? <span key="p" dir="auto">{fmtName(item.plan)}</span> : null, item.lastVisitAt ? t('ops.todo.lastVisit', { when: fmt.when(item.lastVisitAt, { withTime: false }).toLowerCase() }) : null];
      action = can(user, 'notifications') ? { onClick: () => onRemind(item), label: t('ops.todo.remind') } : { to: `/salle/membres/${item.member.id}`, label: t('ops.todo.see') };
      break;
    case 'IN_GRACE':
      dot = 'warn';
      title = t('ops.todo.grace', { name: item.member.name });
      sub = [item.plan ? <span key="p" dir="auto">{fmtName(item.plan)}</span> : null, t('ops.todo.late', { n: item.daysLate })];
      action = canRenew ? { to: `/salle/membres/${item.member.id}?renouveler=1`, label: t('ops.todo.charge') } : { to: `/salle/membres/${item.member.id}`, label: t('ops.todo.see') };
      break;
    default:
      return null;
  }
  const subNode = Array.isArray(sub)
    ? sub.filter(Boolean).flatMap((s, i) => (i ? [' · ', s] : [s]))
    : sub;
  return (
    <li className="ops-todo">
      <span className={`ops-dot ${dot}`} aria-hidden="true" />
      <span className="grow">
        <span className="w500 ops-todo-title" dir="auto">
          {title}
        </span>
        <span className="caption muted">{subNode}</span>
      </span>
      {action ? (
        action.to ? (
          <Link to={action.to} className="link-btn ops-todo-action">
            {action.label}
            <Icon name="chevron-right" size={18} className="ops-phone-only" />
          </Link>
        ) : (
          <button type="button" className="link-btn ops-todo-action" onClick={action.onClick}>
            {action.label}
            <Icon name="chevron-right" size={18} className="ops-phone-only" />
          </button>
        )
      ) : null}
    </li>
  );
}

export default function Dashboard() {
  const { t, fmt, lang } = useI18n();
  const { user } = useAuth();
  const { reloadCounts } = useOutletContext() || {};
  const now = useNow(30000);
  const dash = useLoad(() => api.get('/staff/dashboard'), []);
  useInterval(() => dash.reload(), 60000);
  const [charge, setCharge] = useState(false);
  const [remind, setRemind] = useState(null);
  const [allTodo, setAllTodo] = useState(false);

  const d = dash.data;
  const first = (user.name || '').split(' ')[0];
  const nowDate = new Date(now);

  const head = (
    <header className="page-head">
      <div className="titles">
        <h1>{t('ops.dash.hello', { name: first })}</h1>
        <p className="subtitle">
          <span className="ops-phone-only-inline" dir="auto">
            {user.gym?.name} ·{' '}
          </span>
          {fmt.date(nowDate)} · <span className="num">{fmt.time(nowDate)}</span>
        </p>
      </div>
      <div className="actions ops-desk-only">
        {can(user, 'members.read') ? <QuickSearch /> : null}
        {can(user, 'live') ? (
          <Button to="/salle/scanner" icon="scan-line">
            {t('ops.dash.scan')}
          </Button>
        ) : null}
        {can(user, 'payments') ? (
          <Button variant="primary" icon="banknote" onClick={() => setCharge(true)}>
            {t('ops.dash.charge')}
          </Button>
        ) : null}
      </div>
    </header>
  );

  if (!d) {
    return (
      <div className="stack-4">
        {head}
        {dash.error ? (
          <ErrorState error={dash.error} onRetry={dash.reload} />
        ) : (
          <div className="stack-4" role="status" aria-label={t('state.loading')}>
            <div className="kpi-grid">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} h={110} card />
              ))}
            </div>
            <Skeleton h={260} card />
          </div>
        )}
      </div>
    );
  }

  const trend = trendText(t, fmt, d.presentNow.comparedToUsual);
  const diff = d.entriesToday.diff;
  const lastWeekDay = fmt.weekday(d.presentNow.comparedToUsual?.weekday ?? 0);
  const liveTo = can(user, 'live') ? '/salle/direct' : undefined;
  const months = d.revenue?.months || [];
  const monthName = (m, opts = { month: 'long' }) => fmt.date(`${m}-01`, opts);

  return (
    <div className="stack-4 ops">
      {head}
      <OfflineBanner text={t('ops.offline')} />
      {dash.error ? <ErrorState error={dash.error} onRetry={dash.reload} compact /> : null}

      {/* Téléphone : carte « Salle en direct » (M2) */}
      <Link to={liveTo || '#'} className="card ops-live-card ops-phone-only" aria-disabled={!liveTo || undefined} onClick={(e) => !liveTo && e.preventDefault()}>
        <div className="row between">
          <span className="row-2 w500">
            <span className={`live-dot ${d.gym.open ? '' : 'off'}`} aria-hidden="true" />
            {t('ops.dash.liveTitle')}
          </span>
          {liveTo ? <Icon name="chevron-right" size={20} className="muted" /> : null}
        </div>
        <div className="row between ops-live-row">
          <div>
            <div className="row-2 ops-live-num">
              <span className="big-num">
                <span className="num">{d.presentNow.count}</span>
              </span>
              <span className="muted">{t('ops.people')}</span>
            </div>
            <span className={`small w500 ${trend.tone}-text`}>{trend.text}</span>
          </div>
          <div className="ops-spark">
            <HourlyBars hours={d.hourlyToday.filter((h) => h.hour >= 7 && h.hour <= 22)} height={56} compact />
          </div>
        </div>
      </Link>

      <div className="kpi-grid ops-kpis">
        <Tile className="ops-desk-only" label={t('ops.kpi.present')} value={d.presentNow.count} sub={trend.text} subTone={trend.tone} to={liveTo} />
        <Tile
          label={t('ops.kpi.entries')}
          value={d.entriesToday.count}
          sub={<span className="ops-desk-only-inline">{t(diff >= 0 ? 'ops.kpi.entriesMore' : 'ops.kpi.entriesLess', { n: Math.abs(diff), day: lastWeekDay })}</span>}
          to={liveTo}
        />
        {d.cashedToday ? (
          <Tile
            label={t('ops.kpi.cashed')}
            value={fmt.num(d.cashedToday.amount, 3)}
            unit={t('unit.tnd')}
            sub={<span className="ops-desk-only-inline">{t('ops.kpi.payments', { n: d.cashedToday.count })}</span>}
            to="/salle/paiements"
          />
        ) : null}
        {d.expiringSoon ? (
          <Tile
            label={t('ops.kpi.expiring')}
            value={d.expiringSoon.count}
            tone="warn"
            sub={<span className="ops-desk-only-inline">{t('ops.kpi.remind')}</span>}
            subTone="ember"
            to="/salle/membres?status=expiring"
          />
        ) : null}
        {d.openReports ? (
          <Tile
            label={t('ops.kpi.reports')}
            value={d.openReports.count}
            tone="danger"
            sub={<span className="ops-desk-only-inline">{t('ops.kpi.reportsNew', { n: d.openReports.new })}</span>}
            to="/salle/pannes"
          />
        ) : null}
      </div>

      <div className="split ops-dash-split">
        <section className="card pad-lg ops-desk-only" aria-labelledby="ops-aff">
          <div className="card-head">
            <h2 id="ops-aff" className="card-title">
              {t('ops.dash.affluence')}
            </h2>
            {d.peak ? (
              <span className="small muted">
                {t('ops.dash.peak', { n: d.peak.count, hour: `${String(d.peak.hour).padStart(2, '0')}:00` })}
              </span>
            ) : null}
          </div>
          <HourlyBars hours={d.hourlyToday} height={160} />
          <div className="row between wrap mt-4">
            <BarsLegend />
            {d.calmWindow ? (
              <span className="small ok-text">
                {t('ops.dash.calmWindow', { from: d.calmWindow.from, to: d.calmWindow.to })}
              </span>
            ) : null}
          </div>
        </section>

        <section className="card pad-lg" aria-labelledby="ops-todo">
          <div className="card-head">
            <h2 id="ops-todo" className="card-title">
              {t('ops.dash.todo')}
            </h2>
            <span className="small muted num">{d.todo.count}</span>
          </div>
          {d.todo.items.length ? (
            <ul className="ops-todo-list">
              {(allTodo ? d.todo.items : d.todo.items.slice(0, 5)).map((it, i) => (
                <TodoItem key={`${it.type}-${it.reportId || it.checkinId || it.member?.id || i}`} item={it} onRemind={setRemind} />
              ))}
            </ul>
          ) : null}
          {d.todo.items.length > 5 ? (
            <button type="button" className="link-btn muted small" onClick={() => setAllTodo((x) => !x)}>
              {allTodo ? t('ops.dash.todoLess') : t('ops.dash.todoMore', { n: d.todo.items.length - 5 })}
            </button>
          ) : null}
          {d.todo.items.length ? null : (
            <Empty icon="circle-check" title={t('ops.dash.todoEmpty')} />
          )}
        </section>
      </div>

      {d.lastEntries || d.revenue ? (
        <div className="split even ops-desk-only-grid">
          {d.lastEntries ? (
            <section className="card pad-lg" aria-labelledby="ops-last">
              <div className="card-head">
                <h2 id="ops-last" className="card-title">
                  {t('ops.dash.lastEntries')}
                </h2>
                {liveTo ? (
                  <Link to={liveTo} className="link-btn small">
                    {t('action.seeAll')}
                  </Link>
                ) : null}
              </div>
              {d.lastEntries.length ? (
                <ul className="ops-entries">
                  {d.lastEntries.map((e) => (
                    <li key={e.id}>
                      <span className="num muted ops-time">{fmt.time(e.at)}</span>
                      <Avatar name={e.member.name} size="sm" />
                      <Link to={`/salle/membres/${e.member.id}`} className="grow w500 ellipsis ops-link" dir="auto">
                        {e.member.name}
                      </Link>
                      <EntryStatus entry={e} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty icon="door-open" title={t('ops.dash.noEntries')} />
              )}
            </section>
          ) : null}
          {d.revenue ? (
            <section className="card pad-lg" aria-labelledby="ops-rev">
              <div className="card-head">
                <h2 id="ops-rev" className="card-title">
                  {t('ops.dash.revenue')}
                </h2>
                <span className="small muted">{t('ops.dash.months12')}</span>
              </div>
              <div className="row wrap ops-rev-head">
                <div>
                  <div className="small muted">{monthName(d.revenue.lastMonth.month)}</div>
                  <div className="h2">
                    <span className="num">{fmt.money(d.revenue.lastMonth.total)}</span>
                  </div>
                </div>
                <div>
                  <div className="small muted">{t('ops.dash.toDate', { month: monthName(d.revenue.currentMonthToDate.month) })}</div>
                  <div className="h2">
                    <span className="num">{fmt.money(d.revenue.currentMonthToDate.total)}</span>
                  </div>
                </div>
              </div>
              <Bars
                key={lang}
                height={110}
                label={t('ops.dash.revenue')}
                data={months.map((m, i) => ({ value: m.total, tone: i === months.length - 2 ? 'ember' : i === months.length - 1 ? 'forecast' : '', label: monthName(m.month, { month: 'short' }) }))}
                axis={months.map((m) => monthName(m.month, { month: 'short' }).replace('.', ''))}
              />
            </section>
          ) : null}
        </div>
      ) : null}

      <ChargeSheet
        open={charge}
        onClose={() => setCharge(false)}
        onDone={() => {
          dash.reload();
          reloadCounts?.();
        }}
      />
      <MessageSheet
        open={Boolean(remind)}
        onClose={() => setRemind(null)}
        member={remind?.member}
        preset={remind ? { title: t('ops.remind.title'), body: t('ops.remind.body', { name: remind.member.name.split(' ')[0], gym: user.gym?.name || '' }) } : null}
      />
    </div>
  );
}
