import { Empty, ErrorState, IconButton, PageSkeleton } from '../../components';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useLoad } from '../../lib/hooks';
import './account.css';

/** Historique des paiements du membre (faits à l'accueil) */
export default function Payments() {
  const { t, fmt, name, label, has } = useI18n();
  const { data, loading, error, reload } = useLoad(() => api.get('/me/payments'), []);
  const meta = useLoad(() => api.get('/meta'), []);

  return (
    <main className="page">
      <header className="app-header compact">
        <IconButton icon="arrow-left" label={t('action.back')} to="/app/compte" />
        <h1>{t('account.pay.title')}</h1>
      </header>
      {loading && !data ? (
        <PageSkeleton cards={3} />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data.length ? (
        <Empty icon="receipt" title={t('account.pay.empty')}>
          {t('account.pay.emptyText')}
        </Empty>
      ) : (
        <ul className="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {data.map((p) => {
            const kind = has(`account.pay.kind.${p.kind}`) ? t(`account.pay.kind.${p.kind}`) : '';
            const title = p.plan ? name(p.plan) : p.label || kind;
            const method = label(meta.data?.paymentMethods?.[p.method]) || p.method;
            return (
              <li key={p.id} className="list-row">
                <span className="grow">
                  <span className="w500">{title}</span>
                  <span className="sub">{[fmt.date(p.createdAt, { day: 'numeric', month: 'long', year: 'numeric' }), method, p.plan ? kind : null].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="value pay-amount">
                  <span className="num">{fmt.money(p.amount)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
