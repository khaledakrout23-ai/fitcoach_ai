// Rapports du mois (D17 / M12) : indicateurs avec écarts, revenus 12 mois, par formule, entrées par jour, utilisation de l'app.
// « Exporter en PDF » = impression du navigateur (feuille de style d'impression).
import { useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { useLoad } from '../../../lib/hooks';
import { Button, IconButton, Select, Kpi, Bars, PageSkeleton, ErrorState, Empty } from '../../../components';
import { PageHead, BarRow, printLight } from './shared';

const DATE_LOCALE = { fr: 'fr-FR', ar: 'ar-TN-u-nu-latn', en: 'en-GB' };

function lastMonths(n) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i += 1) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export default function Stats() {
  const { t, fmt, lang, name } = useI18n();
  const months = useMemo(() => lastMonths(13), []);
  const [month, setMonth] = useState(months[1]);
  const stats = useLoad(() => api.get(`/staff/stats?month=${month}`), [month]);
  const monthLabel = (m, opts = { month: 'long', year: 'numeric' }) => {
    const s = new Intl.DateTimeFormat(DATE_LOCALE[lang], opts).format(new Date(`${m}-15T12:00:00`));
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const d = stats.data;
  const signed = (n, unit = '') => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt.num(Math.abs(n), 1)}${unit}`;
  const tone = (n) => (n > 0 ? 'ok' : n < 0 ? 'danger' : '');

  const head = (
    <PageHead
      title={t('manage.stats.title')}
      subtitle={d ? t('manage.stats.compared', { month: monthLabel(d.month), prev: monthLabel(d.previousMonth, { month: 'long' }) }) : monthLabel(month)}
      back="/salle/plus"
      actions={
        <>
          <Select value={month} onChange={(e) => setMonth(e.target.value)} aria-label={t('manage.stats.month')} style={{ minWidth: 170 }}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </Select>
          <Button icon="download" onClick={printLight} disabled={!d} className="hide-phone">
            {t('manage.stats.pdf')}
          </Button>
          <IconButton icon="download" label={t('manage.stats.pdf')} onClick={printLight} disabled={!d} className="only-phone" />
        </>
      }
    />
  );
  if (stats.loading && !d) return (<>{head}<PageSkeleton cards={4} /></>);
  if (stats.error && !d) return (<>{head}<ErrorState error={stats.error} onRetry={stats.reload} /></>);

  const revenueBars = d.revenueByMonth.map((r) => ({
    value: r.total,
    tone: r.month === d.month ? 'ember' : 'past',
    label: monthLabel(r.month),
    marker: r.total ? fmt.num(r.total) : null,
  }));
  const weekdayBars = d.entriesByWeekday.map((w) => ({ value: w.average, tone: 'past', label: fmt.weekday(w.weekday), marker: fmt.num(w.average) }));
  const visitsDelta = d.visitsPerMemberWeek.delta;

  return (
    <div className="stack mg-print-cols">
      {head}
      <div className="kpi-grid">
        <Kpi
          label={t('manage.stats.revenue')}
          value={fmt.num(d.revenue.total)}
          unit={t('unit.tnd')}
          sub={d.revenue.deltaPct != null ? <span className="num">{signed(d.revenue.deltaPct, ' %')}</span> : t('manage.stats.noCompare')}
          subTone={tone(d.revenue.deltaPct)}
        />
        <Kpi label={t('manage.stats.active')} value={fmt.num(d.activeMembers.count)} sub={<span className="num">{signed(d.activeMembers.delta)}</span>} subTone={tone(d.activeMembers.delta)} />
        <Kpi label={t('manage.stats.new')} value={fmt.num(d.newMembers.count)} sub={t('manage.stats.departures', { n: d.newMembers.departures })} />
        <Kpi
          label={t('manage.stats.renewals')}
          value={d.renewals.rate != null ? fmt.percent(d.renewals.rate) : '–'}
          sub={d.renewals.deltaPoints != null ? t('manage.stats.points', { n: signed(d.renewals.deltaPoints) }) : t('manage.stats.noCompare')}
          subTone={tone(d.renewals.deltaPoints)}
        />
        <Kpi
          label={t('manage.stats.visits')}
          value={fmt.num(d.visitsPerMemberWeek.value, 1)}
          unit={t('manage.stats.perWeek')}
          sub={Math.abs(visitsDelta) < 0.1 ? t('manage.stats.stable') : <span className="num">{signed(visitsDelta)}</span>}
          subTone={Math.abs(visitsDelta) < 0.1 ? '' : tone(visitsDelta)}
        />
      </div>

      <div className="mg-cols wide-first">
        <section className="card pad-lg stack mg-vbars">
          <div className="row between">
            <h2 className="card-title">{t('manage.stats.byMonth')}</h2>
            <span className="caption muted">{t('unit.tnd')}</span>
          </div>
          <Bars data={revenueBars} height={200} axis={d.revenueByMonth.map((r) => monthLabel(r.month, { month: 'short' }).replace('.', ''))} label={t('manage.stats.byMonth')} />
        </section>
        <section className="card pad-lg stack">
          <h2 className="card-title">{t('manage.stats.byPlan')}</h2>
          {d.revenueByPlan.length === 0 ? (
            <Empty icon="tag" title={t('manage.stats.noPayments')} />
          ) : (
            d.revenueByPlan.map((p) => <BarRow key={p.plan?.id || name(p.plan)} label={name(p.plan) || t('manage.stats.otherPlan')} value={fmt.percent(p.pct)} pct={p.pct} />)
          )}
        </section>
      </div>

      <div className="mg-cols two">
        <section className="card pad-lg stack mg-vbars">
          <div className="row between">
            <h2 className="card-title">{t('manage.stats.entries')}</h2>
            <span className="caption muted">{t('manage.stats.average', { month: monthLabel(d.month, { month: 'long' }) })}</span>
          </div>
          <Bars data={weekdayBars} height={160} axis={d.entriesByWeekday.map((w) => fmt.weekdayShort(w.weekday))} label={t('manage.stats.entries')} />
        </section>
        <section className="card pad-lg stack">
          <h2 className="card-title">{t('manage.stats.usage')}</h2>
          <div className="mg-tiles">
            <Tile label={t('manage.stats.opened')} value={fmt.percent(d.appUsage.openedThisWeekPct)} />
            <Tile label={t('manage.stats.sessions')} value={fmt.num(d.appUsage.sessionsLogged)} />
            <Tile label={t('manage.stats.meals')} value={fmt.num(d.appUsage.mealsLogged)} />
            <Tile label={t('manage.stats.alternatives')} value={fmt.num(d.appUsage.alternativesChosen)} />
          </div>
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div className="mg-tile">
      <span className="small muted">{label}</span>
      <span className="v">
        <span className="num">{value}</span>
      </span>
    </div>
  );
}
