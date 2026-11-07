import { Link } from 'react-router-dom';
import { Button, Empty, ErrorState, Icon, IconButton, PageSkeleton, StatusPill } from '../../components';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useLoad } from '../../lib/hooks';
import './report.css';

export const REPORT_TONE = { NOUVEAU: 'ember', VU: 'warn', REPARATION: 'warn', REPAREE: 'ok', REJETE: '' };
const REPORT_ICON = { NOUVEAU: 'send', VU: 'eye', REPARATION: 'wrench', REPAREE: 'circle-check', REJETE: 'circle-x' };

/** Mes signalements : liste avec l'état de chacun */
export default function MyReports() {
  const { t, fmt, label } = useI18n();
  const { data, loading, error, reload } = useLoad(() => api.get('/me/reports'), []);
  const meta = useLoad(() => api.get('/meta'), []);

  return (
    <main className="page">
      <header className="app-header compact">
        <IconButton icon="arrow-left" label={t('action.back')} to="/app/compte" />
        <h1>{t('report.list.title')}</h1>
        <IconButton icon="plus" label={t('report.list.new')} to="/app/panne" />
      </header>
      {loading && !data ? (
        <PageSkeleton cards={3} />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data.length ? (
        <Empty
          icon="wrench"
          title={t('report.list.empty')}
          action={
            <Button variant="primary" icon="wrench" to="/app/panne">
              {t('report.list.new')}
            </Button>
          }
        >
          {t('report.list.emptyText')}
        </Empty>
      ) : (
        <ul className="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {data.map((r) => (
            <li key={r.id}>
              <Link to={`/app/panne/${r.id}`} className="list-row">
                <span className="grow">
                  <span className="w500">{r.machine ? `${r.machine.label} #${r.machine.code}` : r.ticket}</span>
                  <span className="sub">
                    {[label(meta.data?.issueTypes?.[r.issueType]), fmt.when(r.createdAt)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <StatusPill tone={REPORT_TONE[r.status]} icon={REPORT_ICON[r.status]}>
                  {t(`report.status.${r.status}`)}
                </StatusPill>
                <Icon name="chevron-right" size={18} className="chev" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
