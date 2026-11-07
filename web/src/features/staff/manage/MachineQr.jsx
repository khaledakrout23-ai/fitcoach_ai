// Étiquettes QR des machines à imprimer : le membre scanne l'étiquette pour signaler une panne
import { useSearchParams } from 'react-router-dom';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { useLoad } from '../../../lib/hooks';
import { Button, QRCode, PageSkeleton, Empty, ErrorState } from '../../../components';
import { PageHead, machineName, printLight } from './shared';

export default function MachineQr() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const only = Number(params.get('id')) || null;
  const labels = useLoad(() => api.get('/staff/machines/qr'), []);
  const items = (labels.data || []).filter((m) => !only || m.id === only);

  return (
    <>
      <PageHead
        title={t('manage.qr.title')}
        subtitle={t('manage.qr.subtitle', { n: items.length })}
        back="/salle/machines"
        actions={
          <>
            {only ? <Button to="/salle/machines/qr">{t('manage.qr.all')}</Button> : <Button icon="arrow-left" to="/salle/machines">{t('manage.machines.title')}</Button>}
            <Button variant="primary" icon="printer" onClick={printLight} disabled={!items.length}>
              {t('action.print')}
            </Button>
          </>
        }
      />
      {labels.loading && !labels.data ? (
        <PageSkeleton cards={3} />
      ) : labels.error && !labels.data ? (
        <ErrorState error={labels.error} onRetry={labels.reload} />
      ) : items.length === 0 ? (
        <Empty icon="qr-code" title={t('manage.machines.empty')} />
      ) : (
        <>
          <p className="small muted no-print">{t('manage.qr.hint')}</p>
          <div className="mg-qr-grid">
            {items.map((m) => (
              <div key={m.id} className="mg-qr-label">
                <QRCode value={m.qr} size={150} label={machineName(m)} />
                <span className="name" dir="auto">
                  {m.label} {m.code ? <span className="num muted">#{m.code}</span> : null}
                </span>
                <span className="caption muted">{m.zone}</span>
                <span className="small">{t('manage.qr.scan')}</span>
                <span className="brand">
                  <img src="/brand/kammel-symbol.png" alt="" />
                  Kammel
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
