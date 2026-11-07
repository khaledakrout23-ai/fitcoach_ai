// D4 / M4 — Membres : recherche, filtres par statut (avec nombres), formule, tri, tableau (cartes sur téléphone), export CSV
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, Button, Chip, Empty, ErrorState, Icon, IconButton, Pager, Select, Skeleton, useToast } from '../../../components';
import { api, download } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { useDebounced, useLoad } from '../../../lib/hooks';
import { can } from '../../../lib/permissions';
import { SubStatus, localDate, prettyPhone } from './shared';
import NewMember from './NewMember';
import './ops.css';

const FILTERS = ['all', 'active', 'expiring', 'expired', 'frozen'];
const SORTS = ['lastVisit', 'name', 'endDate'];
const PAGE_SIZE = 20;

export default function Members({ creating = false }) {
  const { t, fmt, name } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const status = FILTERS.includes(params.get('status')) ? params.get('status') : 'all';
  const sort = SORTS.includes(params.get('sort')) ? params.get('sort') : 'lastVisit';
  const planId = params.get('plan') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [q, setQ] = useState(params.get('q') || '');
  const query = useDebounced(q.trim(), 300);
  const [exporting, setExporting] = useState(false);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v == null || (k === 'status' && v === 'all') || (k === 'sort' && v === 'lastVisit') || (k === 'page' && v === 1)) next.delete(k);
      else next.set(k, String(v));
    }
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get('q') || '') !== query) update({ q: query, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const qs = new URLSearchParams({ status, sort, page: String(page), pageSize: String(PAGE_SIZE) });
  if (query) qs.set('q', query);
  if (planId) qs.set('planId', planId);
  const list = useLoad(() => api.get(`/staff/members?${qs}`), [qs.toString()]);
  const plans = useLoad(() => (can(user, 'plans.read') ? api.get('/staff/plans') : Promise.resolve(null)), []);
  const counts = list.data?.counts;

  const exportCsv = async () => {
    setExporting(true);
    try {
      await download('/staff/members/export.csv', `membres-${localDate()}.csv`);
    } catch (err) {
      toast({ text: t('ops.exportFailed'), tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const go = (m) => navigate(`/salle/membres/${m.id}`);
  const lastVisit = (m) => (m.lastVisitAt ? fmt.when(m.lastVisitAt) : t('ops.members.never'));

  return (
    <div className="stack-4 ops">
      <header className="page-head">
        <div className="titles">
          <h1>{t('ops.members.title')}</h1>
          {counts ? <p className="subtitle">{t('ops.members.subtitle', { active: counts.active, expiring: counts.expiring })}</p> : null}
        </div>
        <div className="actions">
          <div className="search ops-desk-only">
            <Icon name="search" size={20} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ops.members.search')} aria-label={t('ops.members.search')} maxLength={60} />
          </div>
          {can(user, 'members.write') ? (
            <Button icon="download" onClick={exportCsv} loading={exporting} className="ops-desk-only">
              {t('action.export')}
            </Button>
          ) : null}
          {can(user, 'members.write') ? (
            <>
              <Button variant="primary" icon="user-plus" to="/salle/membres/nouveau" className="ops-desk-only">
                {t('ops.members.new')}
              </Button>
              <IconButton icon="user-plus" label={t('ops.members.new')} to="/salle/membres/nouveau" className="ops-phone-only ops-icon-primary" />
            </>
          ) : null}
        </div>
      </header>

      <div className="search ops-phone-only ops-search-full">
        <Icon name="search" size={20} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ops.members.searchShort')} aria-label={t('ops.members.searchShort')} maxLength={60} />
      </div>

      <div className="row wrap between ops-filters">
        <div className="chips scroll" role="group" aria-label={t('ops.members.filter')}>
          {FILTERS.map((f) => (
            <Chip key={f} selected={status === f} onClick={() => update({ status: f, page: 1 })} count={counts ? counts[f] : null} icon={status === f ? 'check' : undefined}>
              {t(`ops.filter.${f}`)}
            </Chip>
          ))}
        </div>
        <div className="row-2 ops-desk-only">
          {plans.data?.plans?.length ? (
            <Select value={planId} onChange={(e) => update({ plan: e.target.value, page: 1 })} aria-label={t('ops.members.plan')}>
              <option value="">{t('ops.members.planAll')}</option>
              {plans.data.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {name(p)}
                </option>
              ))}
            </Select>
          ) : null}
          <Select value={sort} onChange={(e) => update({ sort: e.target.value, page: 1 })} aria-label={t('ops.members.sort')}>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`ops.sort.${s}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <div className="stack-2" role="status" aria-label={t('state.loading')}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} h={64} />
          ))}
        </div>
      ) : !list.data.items.length ? (
        <Empty icon="users" title={query || status !== 'all' || planId ? t('ops.members.noResult') : t('ops.members.empty')}>
          {query || status !== 'all' || planId ? (
            <button type="button" className="link-btn" onClick={() => { setQ(''); update({ status: 'all', plan: '', q: '', page: 1 }); }}>
              {t('ops.members.clear')}
            </button>
          ) : null}
        </Empty>
      ) : (
        <>
          <div className="table-wrap ops-desk-table">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('ops.col.member')}</th>
                  <th>{t('ops.col.plan')}</th>
                  <th>{t('ops.col.end')}</th>
                  <th>{t('ops.col.lastVisit')}</th>
                  <th>{t('ops.col.status')}</th>
                  <th aria-label={t('action.see')} />
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((m) => (
                  <tr key={m.id} className="clickable" onClick={() => go(m)}>
                    <td>
                      <div className="row-2">
                        <Avatar name={m.name} size="sm" />
                        <div className="min0">
                          <Link to={`/salle/membres/${m.id}`} className="w500 ops-link" dir="auto" onClick={(e) => e.stopPropagation()}>
                            {m.name}
                          </Link>
                          <div className="caption muted" dir="ltr">
                            {prettyPhone(m.phone)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="w500" dir="auto">
                      {m.plan ? name(m.plan) : '—'}
                    </td>
                    <td className="w500">
                      <span className="num">{m.subscription?.endDate ? fmt.shortDate(m.subscription.endDate) : '—'}</span>
                    </td>
                    <td className="muted">{lastVisit(m)}</td>
                    <td>
                      <SubStatus status={m.status} daysLeft={m.subscription?.daysLeft} />
                    </td>
                    <td className="text-end">
                      <Icon name="chevron-right" size={18} className="muted" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="ops-cards">
            {list.data.items.map((m) => (
              <li key={m.id}>
                <Link to={`/salle/membres/${m.id}`} className="ops-card-row">
                  <Avatar name={m.name} size="sm" />
                  <span className="grow min0">
                    <span className="w500 ellipsis" dir="auto">
                      {m.name}
                    </span>
                    <span className="caption muted">
                      {m.plan ? <span dir="auto">{name(m.plan)}</span> : t('ops.status.AUCUN')}
                      {m.subscription?.endDate ? (
                        <>
                          {' · '}
                          <span className="num">{fmt.shortDate(m.subscription.endDate)}</span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <SubStatus status={m.status} daysLeft={m.subscription?.daysLeft} />
                </Link>
              </li>
            ))}
          </ul>

          <Pager page={page} pageSize={PAGE_SIZE} total={list.data.total} onPage={(p) => update({ page: p })} />
        </>
      )}

      <NewMember open={creating} onClose={() => navigate(`/salle/membres${params.toString() ? `?${params}` : ''}`)} onCreated={list.reload} />
    </div>
  );
}
