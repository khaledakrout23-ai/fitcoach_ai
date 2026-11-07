// D3 / M7 — Salle en direct : nombre de personnes, courbe du jour, réglages (gérant), affluence habituelle, entrées du jour
import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Button, Empty, ErrorState, Heatmap, IconButton, OfflineBanner, Skeleton, Stepper, Toggle, useToast, Avatar } from '../../../components';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { useInterval, useLoad, useNow } from '../../../lib/hooks';
import { can } from '../../../lib/permissions';
import { EntryStatus } from './shared';
import { BarsLegend, HourlyBars } from './Dashboard';
import './ops.css';

const REFRESH_MS = 30000;

/** « Calme · 9 de moins qu'un mardi habituel » */
export function liveStatus(t, fmt, live) {
  const c = live.comparedToUsual || {};
  const level = t(`ops.level.${live.level}`);
  const day = fmt.weekday(c.weekday ?? 0);
  if (c.trend === 'CALMER') return { text: t('ops.live.less', { level, n: Math.abs(c.diff), day }), tone: 'ok' };
  if (c.trend === 'BUSIER') return { text: t('ops.live.more', { level, n: Math.abs(c.diff), day }), tone: 'warn' };
  return { text: t('ops.live.usual', { level, day }), tone: live.level === 'PLEINE' ? 'danger' : live.level === 'CALME' ? 'ok' : 'muted' };
}

function SettingsCard({ live, onSaved }) {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const editable = can(user, 'settings');
  const initial = { ...live.settings };
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm({ ...live.settings }), [live.settings]);
  const dirty = ['calmThreshold', 'alertAbove', 'showCount', 'autoCheckoutHours', 'capacity'].some((k) => form[k] !== live.settings[k]);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/staff/settings', {
        gym: { capacity: form.capacity },
        settings: { live: { calmThreshold: form.calmThreshold, alertAbove: form.alertAbove, showCount: form.showCount, autoCheckoutHours: form.autoCheckoutHours } },
      });
      toast({ text: t('ops.saved'), icon: 'check' });
      onSaved();
      refresh().catch(() => {});
    } catch (err) {
      toast({ text: t('ops.saveFailed'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (!editable) {
    return (
      <section className="card pad-lg" aria-labelledby="ops-live-set">
        <h2 id="ops-live-set" className="card-title mb-4">
          {t('ops.live.settings')}
        </h2>
        <dl className="ops-dl">
          <div>
            <dt>{t('ops.live.calm')}</dt>
            <dd>{t('ops.live.peopleN', { n: live.settings.calmThreshold })}</dd>
          </div>
          <div>
            <dt>{t('ops.live.capacity')}</dt>
            <dd className="num">{live.settings.capacity}</dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <section className="card pad-lg stack-4" aria-labelledby="ops-live-set">
      <h2 id="ops-live-set" className="card-title">
        {t('ops.live.settings')}
      </h2>
      <div className="ops-set-row">
        <div className="grow">
          <div className="w500">{t('ops.live.calm')}</div>
          <div className="caption muted">{t('ops.live.calmSub', { n: live.calmAlertMembers })}</div>
        </div>
        <Stepper value={form.calmThreshold} onChange={set('calmThreshold')} min={0} max={2000} label={t('ops.live.calm')} />
      </div>
      <div className="ops-set-row">
        <div className="grow">
          <div className="w500">{t('ops.live.capacity')}</div>
          <div className="caption muted">{t('ops.live.capacitySub')}</div>
        </div>
        <Stepper value={form.capacity} onChange={set('capacity')} min={1} max={5000} step={5} label={t('ops.live.capacity')} />
      </div>
      <div className="ops-set-row">
        <div className="grow">
          <div className="w500">{t('ops.live.alert')}</div>
          <div className="caption muted">{t('ops.live.alertSub')}</div>
        </div>
        <Stepper value={form.alertAbove} onChange={set('alertAbove')} min={1} max={5000} step={5} label={t('ops.live.alert')} />
      </div>
      <div className="ops-set-row">
        <div className="grow">
          <div className="w500">{t('ops.live.show')}</div>
          <div className="caption muted">{t('ops.live.showSub')}</div>
        </div>
        <Toggle checked={form.showCount} onChange={set('showCount')} label={t('ops.live.show')} />
      </div>
      <div className="ops-set-row">
        <div className="grow">
          <div className="w500">{t('ops.live.auto')}</div>
          <div className="caption muted">{t('ops.live.autoSub', { n: form.autoCheckoutHours })}</div>
        </div>
        <Stepper value={form.autoCheckoutHours} onChange={set('autoCheckoutHours')} min={1} max={12} unit={` ${t('unit.h')}`} label={t('ops.live.auto')} />
      </div>
      {dirty ? (
        <div className="row-2 ops-set-save">
          <Button variant="secondary" onClick={() => setForm({ ...live.settings })}>
            {t('action.cancel')}
          </Button>
          <Button variant="primary" className="grow" loading={busy} onClick={save}>
            {t('action.save')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function Entries({ data, onCheckout, busyId }) {
  const { t, fmt } = useI18n();
  const [all, setAll] = useState(false);
  const items = all ? data.items : data.items.slice(0, 12);
  if (!items.length) return <Empty icon="door-open" title={t('ops.dash.noEntries')} />;
  return (
    <>
    <ul className="ops-entries">
      {items.map((e) => (
        <li key={e.id}>
          <span className="num muted ops-time">{fmt.time(e.at)}</span>
          {e.member ? <Avatar name={e.member.name} size="sm" /> : null}
          <span className="grow min0">
            {e.member ? (
              <Link to={`/salle/membres/${e.member.id}`} className="w500 ellipsis ops-link" dir="auto">
                {e.member.name}
              </Link>
            ) : (
              <span className="muted">—</span>
            )}
            {e.checkOutAt ? <span className="caption muted">{t('ops.live.out', { time: fmt.time(e.checkOutAt), d: fmt.duration(e.durationMin) })}</span> : null}
          </span>
          <EntryStatus entry={e} />
          {e.present ? (
            <IconButton icon="log-out" size={18} label={t('ops.live.checkout')} onClick={() => onCheckout(e)} disabled={busyId === e.id} className="ops-checkout" />
          ) : null}
        </li>
      ))}
    </ul>
    {data.items.length > 12 ? (
      <button type="button" className="link-btn muted small" onClick={() => setAll((x) => !x)}>
        {all ? t('ops.dash.todoLess') : t('ops.dash.todoMore', { n: data.items.length - 12 })}
      </button>
    ) : null}
    </>
  );
}

export default function Live() {
  const { t, fmt } = useI18n();
  const { reloadCounts } = useOutletContext() || {};
  const { toast } = useToast();
  const live = useLoad(() => api.get('/staff/live'), []);
  const entries = useLoad(() => api.get('/staff/checkins'), []);
  const [busyId, setBusyId] = useState(null);
  const now = useNow(5000);
  useInterval(() => {
    live.reload();
    entries.reload();
    reloadCounts?.();
  }, REFRESH_MS);

  const checkout = async (e) => {
    setBusyId(e.id);
    try {
      await api.post(`/staff/checkins/${e.id}/checkout`);
      toast({ text: t('ops.live.checkedOut', { name: e.member?.name || '' }), icon: 'log-out' });
      entries.reload();
      live.reload();
    } catch (err) {
      toast({ text: t('ops.saveFailed'), tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const l = live.data;
  const ago = l ? Math.max(0, Math.round((now - new Date(l.updatedAt).getTime()) / 1000)) : 0;

  const head = (
    <header className="page-head">
      <IconButton icon="arrow-left" label={t('action.back')} to="/salle" className="ops-phone-only" />
      <div className="titles">
        <h1>{t('ops.live.title')}</h1>
        {l ? <p className="subtitle ops-desk-only">{t('ops.live.updated', { s: ago < 60 ? t('ops.live.sec', { n: ago }) : t('ops.live.min', { n: Math.round(ago / 60) }) })}</p> : null}
      </div>
      <div className="actions ops-desk-only">
        <Button to="/salle/direct/ecran" icon="monitor">
          {t('ops.live.screen')}
        </Button>
      </div>
    </header>
  );

  if (!l) {
    return (
      <div className="stack-4">
        {head}
        {live.error ? <ErrorState error={live.error} onRetry={live.reload} /> : <Skeleton h={300} card />}
      </div>
    );
  }

  const status = liveStatus(t, fmt, l);
  const rowLabels = l.heatmap.rows.map((r) => fmt.weekdayShort(r.weekday));
  const max = Math.max(1, l.heatmap.max);

  return (
    <div className="stack-4 ops">
      {head}
      <OfflineBanner text={t('ops.offline')} />
      <div className="split ops-live-split">
        <section className="card pad-lg" aria-labelledby="ops-live-count">
          <div className="ops-live-top">
            <div className="row-2 ops-live-big">
              <span className="ops-giant">
                <span className="num">{l.count}</span>
              </span>
              <span id="ops-live-count" className="ops-live-unit">
                {t('ops.live.people')}
              </span>
            </div>
            <div className="ops-live-status">
              <div className={`w500 ${status.tone}-text`}>{status.text}</div>
              <div className="small muted">
                {t('ops.live.delta', { n: `${l.deltaSince.count >= 0 ? '+' : '−'}${Math.abs(l.deltaSince.count)}`, since: l.deltaSince.since, cap: l.capacity })}
              </div>
            </div>
          </div>
          <HourlyBars hours={l.hourlyToday} height={130} />
          <div className="row between wrap mt-4 ops-desk-only-flex">
            <BarsLegend />
            {l.calmWindow ? <span className="small ok-text">{t('ops.dash.calmWindow', { from: l.calmWindow.from, to: l.calmWindow.to })}</span> : null}
          </div>
        </section>
        <SettingsCard live={l} onSaved={live.reload} />
      </div>

      <div className="split ops-live-split">
        <section className="card pad-lg ops-desk-only" aria-labelledby="ops-heat">
          <div className="card-head">
            <h2 id="ops-heat" className="card-title">
              {t('ops.live.usualTitle')}
            </h2>
            <span className="small muted">{t('ops.live.weeks', { n: l.heatmap.weeks })}</span>
          </div>
          <Heatmap
            values={l.heatmap.rows.map((r) => r.values.map((v) => v / max))}
            rowLabels={rowLabels}
            colLabels={l.heatmap.hours.map((h) => t('ops.hour', { h }))}
            label={t('ops.live.usualTitle')}
          />
          <div className="ops-heat-axis caption muted" dir="ltr" aria-hidden="true" style={{ gridTemplateColumns: `40px repeat(${l.heatmap.hours.length}, minmax(0, 1fr))` }}>
            <span />
            {l.heatmap.hours.map((h) => (
              <span key={h}>{h % 3 === 0 ? t('ops.hour', { h }) : ''}</span>
            ))}
          </div>
          <div className="row-2 caption muted mt-4">
            <span>{t('ops.live.calmShort')}</span>
            <span className="ops-heat-scale" aria-hidden="true" />
            <span>{t('ops.live.full')}</span>
          </div>
        </section>

        <section className="card pad-lg" aria-labelledby="ops-today">
          <div className="card-head">
            <h2 id="ops-today" className="card-title">
              {t('ops.live.entries')}
            </h2>
            <span className="small muted">
              <span className="num">{l.entriesToday}</span>
              {l.refusedToday ? (
                <>
                  {' · '}
                  <span className="danger-text">{t('ops.live.refusedN', { n: l.refusedToday })}</span>
                </>
              ) : null}
            </span>
          </div>
          {entries.data ? (
            <Entries data={entries.data} onCheckout={checkout} busyId={busyId} />
          ) : entries.error ? (
            <ErrorState error={entries.error} onRetry={entries.reload} compact />
          ) : (
            <div className="stack-2">
              <Skeleton h={40} />
              <Skeleton h={40} />
              <Skeleton h={40} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
