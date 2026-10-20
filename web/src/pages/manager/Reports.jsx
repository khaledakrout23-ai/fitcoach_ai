import { useState } from 'react';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { Empty, ErrorText, Spinner, useLoad } from '../../components/ui';

const STATUS_CLASS = { NOUVEAU: 'badge-warn', CONFIRME: 'badge-danger', RESOLU: 'badge-ok', REJETE: '' };

export default function Reports() {
  const { t, name, date, time } = useI18n();
  const reports = useLoad(() => api('/manager/reports'));
  const [error, setError] = useState(null);

  async function act(r, action) {
    try {
      await api(`/manager/reports/${r.id}`, { method: 'PUT', body: { action } });
      reports.reload();
    } catch (err) {
      setError(err);
    }
  }

  if (reports.loading) return <Spinner />;
  const list = reports.data || [];
  const open = list.filter((r) => r.status === 'NOUVEAU' || r.status === 'CONFIRME');
  const closed = list.filter((r) => !open.includes(r));

  const row = (r) => (
    <li key={r.id} className="row" style={{ alignItems: 'flex-start' }}>
      <div className="row-main">
        <div className="inline">
          <span className="row-title">{r.machine?.label}</span>
          <span className={`badge ${STATUS_CLASS[r.status]}`}>{t(`reportStatus.${r.status}`)}</span>
        </div>
        <div className="row-sub">
          {name(r.machine?.equipment)} · {r.author?.name} · {date(r.createdAt)} {time(r.createdAt)}
        </div>
        {r.description && <p style={{ marginTop: 4 }}>{r.description}</p>}
      </div>
      <div className="inline">
        {r.status === 'NOUVEAU' && (
          <>
            <button className="btn btn-small btn-danger" onClick={() => act(r, 'CONFIRMER')}>
              {t('reports.confirm')}
            </button>
            <button className="btn btn-small btn-ghost" onClick={() => act(r, 'REJETER')}>
              {t('reports.reject')}
            </button>
          </>
        )}
        {r.status === 'CONFIRME' && (
          <button className="btn btn-small" onClick={() => act(r, 'RESOUDRE')}>
            {t('reports.fixed')}
          </button>
        )}
      </div>
    </li>
  );

  return (
    <div className="page">
      <div>
        <h1>{t('nav.reports')}</h1>
        <p className="page-sub">{t('reports.sub')}</p>
      </div>
      <ErrorText error={error} />
      {open.length === 0 ? (
        <Empty title={t('reports.none')} />
      ) : (
        <section className="panel">
          <h2 style={{ marginBottom: 6 }}>{t('reports.open', { n: open.length })}</h2>
          <ul className="rows">{open.map(row)}</ul>
        </section>
      )}
      {closed.length > 0 && (
        <section className="panel">
          <h2 style={{ marginBottom: 6 }}>{t('reports.history')}</h2>
          <ul className="rows">{closed.map(row)}</ul>
        </section>
      )}
    </div>
  );
}
