import { Banner, Button, ErrorState, Sheet, Skeleton, StatusPill } from '../../components';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useLoad } from '../../lib/hooks';

/** Lien tel: construit uniquement avec des chiffres et « + » */
export function telHref(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits.length >= 6 ? `tel:${digits}` : null;
}

/**
 * Renouveler : formules de la salle en lecture seule + « Présente-toi à l'accueil ».
 * Le paiement dans l'app n'existe pas côté API (features.inAppPurchase sans point d'accès de paiement).
 */
export default function RenewSheet({ open, onClose }) {
  const { t, tp, fmt, name, lang } = useI18n();
  const plans = useLoad(() => (open ? api.get('/gym/plans') : null), [open]);
  const sub = useLoad(() => (open ? api.get('/me/subscription') : null), [open]);
  const gym = sub.data?.gym;
  const currentPlanId = sub.data?.subscription?.plan?.id;
  const tel = telHref(gym?.phone);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('account.renew.title')}
      footer={
        tel ? (
          <a className="btn secondary lg block" href={tel}>
            {t('account.renew.call')}
          </a>
        ) : (
          <Button variant="secondary" size="lg" block onClick={onClose}>
            {t('action.close')}
          </Button>
        )
      }
    >
      <div className="stack">
        <Banner tone="ember" icon="map-pin">
          <span className="stack-2">
            <span className="w500">{t('account.renew.desk')}</span>
            <span className="small muted">{t('account.renew.deskText', { gym: gym?.name || 'Kammel' })}</span>
          </span>
        </Banner>
        <div className="eyebrow">{t('account.renew.plans')}</div>
        {plans.loading && !plans.data ? (
          <>
            <Skeleton h={64} />
            <Skeleton h={64} />
          </>
        ) : plans.error ? (
          <ErrorState error={plans.error} onRetry={plans.reload} compact />
        ) : !plans.data?.length ? (
          <p className="small muted">{t('account.renew.noPlans')}</p>
        ) : (
          <ul className="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {plans.data.map((p) => {
              const note = lang === 'ar' ? p.noteAr || p.noteFr : p.noteFr;
              const extras = [
                tp(`account.renew.duration.${p.durationUnit}`, p.duration),
                p.freezeDays ? t('account.renew.freeze', { n: p.freezeDays }) : null,
                p.accessHours === 'OFF_PEAK' ? t('account.renew.offPeak') : null,
                note,
              ].filter(Boolean);
              return (
                <li key={p.id} className="list-row">
                  <span className="grow">
                    <span className="w500">{name(p)}</span>
                    <span className="sub">{extras.join(' · ')}</span>
                  </span>
                  {p.id === currentPlanId ? <StatusPill tone="ember">{t('account.renew.current')}</StatusPill> : null}
                  <span className="value w500">
                    <span className="num">{fmt.money(p.price)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
