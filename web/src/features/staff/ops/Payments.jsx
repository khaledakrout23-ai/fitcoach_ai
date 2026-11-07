// D9 — Paiements : totaux, répartition par moyen, tableau filtré, export, caisse du jour (ouverture / clôture)
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Chip, Empty, ErrorState, Field, FormError, Input, Pager, Select, Sheet, Skeleton, useToast } from '../../../components';
import { api, download } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { useLoad } from '../../../lib/hooks';
import { localDate, round3 } from './shared';
import { ChargeSheet } from './sheets';
import './ops.css';

const PERIODS = ['today', 'week', 'month', 'lastMonth', 'all'];
const METHODS = ['ESPECES', 'CARTE', 'D17', 'FLOUCI', 'VIREMENT'];
const PAGE_SIZE = 20;

/** « 2026-10 » → « 2026-09 » */
function prevMonth(m) {
  const d = new Date(`${m}-15T12:00:00`);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function CashSheet({ open, onClose, cash, onDone }) {
  const { t, fmt } = useI18n();
  const { toast } = useToast();
  const opening = !cash?.open;
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setAmount('');
      setNote('');
      setError(null);
    }
  }, [open]);
  const value = Number(String(amount).replace(',', '.'));
  const valid = amount !== '' && Number.isFinite(value) && value >= 0;
  const diff = !opening && valid ? round3(value - cash.open.expected) : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (opening) await api.post('/staff/cash/open', { openingFloat: value });
      else await api.post('/staff/cash/close', { countedCash: value, ...(note.trim() ? { note: note.trim() } : {}) });
      toast({ text: t(opening ? 'ops.cash.opened' : 'ops.cash.closed'), icon: 'check' });
      onDone();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(opening ? 'ops.cash.openTitle' : 'ops.cash.closeTitle')}
      footer={
        <Button variant="primary" block disabled={!valid} loading={busy} onClick={submit}>
          {t(opening ? 'ops.cash.open' : 'ops.cash.close')}
        </Button>
      }
    >
      <div className="stack-4">
        {!opening ? (
          <div className="card flat stack-2 small">
            <div className="row between">
              <span className="muted">{t('ops.cash.float')}</span>
              <span className="num">{fmt.money(cash.open.openingFloat)}</span>
            </div>
            <div className="row between">
              <span className="muted">{t('ops.cash.received')}</span>
              <span className="num">{fmt.money(cash.open.cashReceived)}</span>
            </div>
            <div className="row between w500">
              <span>{t('ops.cash.expected')}</span>
              <span className="num">{fmt.money(cash.open.expected)}</span>
            </div>
          </div>
        ) : null}
        <Field label={t(opening ? 'ops.cash.floatLabel' : 'ops.cash.counted')}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))} suffix={t('unit.tnd')} dir="ltr" autoFocus />
        </Field>
        {diff != null ? (
          <p className={`w500 ${diff === 0 ? 'ok-text' : 'danger-text'}`}>
            {diff === 0 ? t('ops.cash.balanced') : t('ops.cash.diff', { amount: `${diff > 0 ? '+' : '−'}${fmt.money(Math.abs(diff))}` })}
          </p>
        ) : null}
        {!opening ? (
          <Field label={t('ops.cash.note')} optional>
            <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} dir="auto" />
          </Field>
        ) : null}
        <FormError error={error} />
      </div>
    </Sheet>
  );
}

export default function Payments() {
  const { t, fmt, name } = useI18n();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const period = PERIODS.includes(params.get('period')) ? params.get('period') : 'week';
  const method = METHODS.includes(params.get('method')) ? params.get('method') : '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const qs = new URLSearchParams({ period, page: String(page), pageSize: String(PAGE_SIZE) });
  if (method) qs.set('method', method);
  const data = useLoad(() => api.get(`/staff/payments?${qs}`), [qs.toString()]);
  const cash = useLoad(() => api.get('/staff/cash'), []);
  const [sheet, setSheet] = useState(null); // cash | charge
  const [exporting, setExporting] = useState(false);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (!v || (k === 'page' && v === 1) || (k === 'period' && v === 'week')) next.delete(k);
      else next.set(k, String(v));
    }
    setParams(next, { replace: true });
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await download(`/staff/payments/export.csv?period=${period}`, `paiements-${period}-${localDate()}.csv`);
    } catch {
      toast({ text: t('ops.exportFailed'), tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const d = data.data;
  const c = cash.data;
  const monthName = (m) => fmt.date(`${m}-01`, { month: 'long' });

  return (
    <div className="stack-4 ops">
      <header className="page-head">
        <div className="titles">
          <h1>{t('ops.pay.title')}</h1>
          <p className="subtitle">{t('ops.pay.subtitle')}</p>
        </div>
        <div className="actions">
          <Select value={period} onChange={(e) => update({ period: e.target.value, page: 1 })} aria-label={t('ops.pay.period')}>
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(`ops.period.${p}`)}
              </option>
            ))}
          </Select>
          <Button icon="download" onClick={exportCsv} loading={exporting} className="ops-desk-only">
            {t('action.export')}
          </Button>
          <Button icon="banknote" onClick={() => setSheet('charge')}>
            {t('ops.pay.session')}
          </Button>
          {c ? (
            <Button variant="primary" icon="wallet" onClick={() => setSheet('cash')}>
              {c.open ? t('ops.cash.close') : t('ops.cash.open')}
            </Button>
          ) : null}
        </div>
      </header>

      {!d ? (
        data.error ? (
          <ErrorState error={data.error} onRetry={data.reload} />
        ) : (
          <div className="kpi-grid">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} card h={110} />
            ))}
          </div>
        )
      ) : (
        <>
          <div className="ops-pay-kpis">
            <div className="kpi">
              <span className="kpi-label">{t('ops.period.today')}</span>
              <span className="kpi-value">
                <span className="num">{fmt.num(d.totals.today.amount, 3)}</span>
                <small> {t('unit.tnd')}</small>
              </span>
              <span className="kpi-sub">{t('ops.kpi.payments', { n: d.totals.today.count })}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">{t('ops.period.week')}</span>
              <span className="kpi-value">
                <span className="num">{fmt.num(d.totals.week.amount, 3)}</span>
                <small> {t('unit.tnd')}</small>
              </span>
              <span className="kpi-sub">{t('ops.kpi.payments', { n: d.totals.week.count })}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">{monthName(d.totals.lastMonth.month)}</span>
              <span className="kpi-value">
                <span className="num">{fmt.num(d.totals.lastMonth.amount, 3)}</span>
                <small> {t('unit.tnd')}</small>
              </span>
              {d.totals.lastMonth.deltaPct != null ? (
                <span className={`kpi-sub ${d.totals.lastMonth.deltaPct >= 0 ? 'ok-text' : 'danger-text'}`}>
                  {t('ops.pay.delta', {
                    pct: `${d.totals.lastMonth.deltaPct >= 0 ? '+' : '−'}${fmt.num(Math.abs(d.totals.lastMonth.deltaPct), 1)}`,
                    month: monthName(prevMonth(d.totals.lastMonth.month)),
                  })}
                </span>
              ) : null}
            </div>
            <div className="kpi ops-methods">
              <span className="kpi-label">{t('ops.pay.byMethod', { month: monthName(d.byMethod.month) })}</span>
              {d.byMethod.items.length ? (
                <>
                  <div className="ops-method-bar" aria-hidden="true">
                    {d.byMethod.items.map((m) => (
                      <i key={m.method} className={`m-${m.method}`} style={{ width: `${Math.max(2, m.pct)}%` }} />
                    ))}
                  </div>
                  <ul className="ops-method-legend">
                    {d.byMethod.items.map((m) => (
                      <li key={m.method}>
                        <i className={`m-${m.method}`} aria-hidden="true" />
                        {t(`ops.method.${m.method}`)} <span className="num">{m.pct} %</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <span className="kpi-sub">{t('ops.pay.none')}</span>
              )}
            </div>
          </div>

          <div className="chips scroll" role="group" aria-label={t('ops.pay.method')}>
            <Chip selected={!method} onClick={() => update({ method: '', page: 1 })}>
              {t('ops.pay.allMethods')}
            </Chip>
            {METHODS.map((m) => (
              <Chip key={m} selected={method === m} onClick={() => update({ method: m, page: 1 })}>
                {t(`ops.method.${m}`)}
              </Chip>
            ))}
          </div>

          {!d.items.length ? (
            <Empty icon="wallet" title={t('ops.pay.empty')} />
          ) : (
            <>
              <div className="table-wrap ops-desk-table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('ops.col.date')}</th>
                      <th>{t('ops.col.member')}</th>
                      <th>{t('ops.col.plan')}</th>
                      <th>{t('ops.col.method')}</th>
                      <th>{t('ops.col.by')}</th>
                      <th className="text-end">{t('ops.col.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((p) => (
                      <tr key={p.id}>
                        <td className="muted">{fmt.when(p.createdAt)}</td>
                        <td className="w500" dir="auto">
                          {p.member ? (
                            <Link to={`/salle/membres/${p.member.id}`} className="ops-link">
                              {p.member.name}
                            </Link>
                          ) : (
                            p.label || t('ops.pay.visitor')
                          )}
                        </td>
                        <td className="w500" dir="auto">
                          {p.plan && p.kind !== 'INSCRIPTION' ? name(p.plan) : t(`ops.kind.${p.kind}`)}
                        </td>
                        <td className="w500">{t(`ops.method.${p.method}`)}</td>
                        <td className="muted" dir="auto">
                          {p.receivedBy ? p.receivedBy.name.split(' ')[0] : t('ops.pay.app')}
                        </td>
                        <td className="text-end w500">
                          <span className="num">{fmt.money(p.amount)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="ops-cards">
                {d.items.map((p) => (
                  <li key={p.id} className="ops-card-row">
                    <span className="grow min0">
                      <span className="w500 ellipsis" dir="auto">
                        {p.member ? p.member.name : p.label || t('ops.pay.visitor')}
                      </span>
                      <span className="caption muted">
                        {fmt.when(p.createdAt)} · {p.plan && p.kind !== 'INSCRIPTION' ? name(p.plan) : t(`ops.kind.${p.kind}`)} · {t(`ops.method.${p.method}`)}
                      </span>
                    </span>
                    <span className="num w500">{fmt.money(p.amount)}</span>
                  </li>
                ))}
              </ul>
              <Pager page={page} pageSize={PAGE_SIZE} total={d.total} onPage={(p) => update({ page: p })} />
            </>
          )}
        </>
      )}

      {/* Caisse du jour */}
      <section className="card ops-cash" aria-labelledby="ops-cash">
        <h2 id="ops-cash" className="w500 ops-cash-title">
          {t('ops.cash.title')}
        </h2>
        {cash.error && !c ? (
          <ErrorState error={cash.error} onRetry={cash.reload} compact />
        ) : !c ? (
          <Skeleton line w="60%" />
        ) : c.open ? (
          <>
            <span className="muted">
              {t('ops.cash.float')} <b className="num">{fmt.money(c.open.openingFloat)}</b>
            </span>
            <span className="muted">
              {t('ops.cash.received')} <b className="num">{fmt.money(c.open.cashReceived)}</b>
            </span>
            <span className="muted">
              {t('ops.cash.expected')} <b className="num">{fmt.money(c.open.expected)}</b>
            </span>
            <span className="muted grow text-end">
              {t('ops.cash.openedBy', { name: c.open.openedBy?.name.split(' ')[0] || '—', time: fmt.time(c.open.openedAt) })}
            </span>
          </>
        ) : (
          <>
            <span className="muted grow">{t('ops.cash.isClosed')}</span>
            {c.lastClosed ? (
              <span className="muted">
                {t('ops.cash.lastClosed', { when: fmt.when(c.lastClosed.closedAt), name: c.lastClosed.closedBy?.name.split(' ')[0] || '—' })}
                {' · '}
                <b className={c.lastClosed.difference ? 'danger-text' : 'ok-text'}>
                  {c.lastClosed.difference ? t('ops.cash.diff', { amount: fmt.money(c.lastClosed.difference) }) : t('ops.cash.balanced')}
                </b>
              </span>
            ) : null}
          </>
        )}
      </section>

      <CashSheet open={sheet === 'cash'} onClose={() => setSheet(null)} cash={c} onDone={() => { cash.reload(); data.reload(); }} />
      <ChargeSheet open={sheet === 'charge'} onClose={() => setSheet(null)} onDone={() => { cash.reload(); data.reload(); }} />
    </div>
  );
}
