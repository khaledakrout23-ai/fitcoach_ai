import Icon from './Icon';
import { Button } from './Button';
import { useI18n } from '../lib/i18n';
import { useOnline } from '../lib/hooks';

/** Bloc de chargement (squelette) : <Skeleton h={120} /> · <Skeleton line w="60%" /> · <Skeleton circle size={48} /> */
export function Skeleton({ h = 16, w = '100%', line = false, circle = false, size, card = false, className = '' }) {
  const style = circle ? { width: size, height: size } : { width: w, height: line ? 14 : h };
  return <div className={`skeleton ${line ? 'line' : ''} ${circle ? 'circle' : ''} ${card ? 'card-sk' : ''} ${className}`} style={style} aria-hidden="true" />;
}

/** Squelette d'une page : n cartes */
export function PageSkeleton({ cards = 3 }) {
  const { t } = useI18n();
  return (
    <div className="stack" role="status" aria-label={t('state.loading')}>
      <Skeleton line w="45%" />
      {Array.from({ length: cards }, (_, i) => (
        <Skeleton key={i} card h={i === 0 ? 180 : 110} />
      ))}
    </div>
  );
}

export function Empty({ icon = 'circle', title, children, action }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      {title ? <h3>{title}</h3> : null}
      {children ? <div className="small">{children}</div> : null}
      {action || null}
    </div>
  );
}

/** Erreur de chargement avec bouton « Réessayer » */
export function ErrorState({ error, onRetry, compact = false }) {
  const { t, error: msg } = useI18n();
  if (compact) {
    return (
      <div className="banner danger" role="alert">
        <Icon name="circle-alert" size={20} />
        <span className="grow">{msg(error)}</span>
        {onRetry ? (
          <button type="button" className="link-btn" onClick={onRetry}>
            {t('action.retry')}
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <Empty icon="triangle-alert" title={t('state.error')} action={onRetry ? <Button onClick={onRetry} icon="refresh-cw">{t('action.retry')}</Button> : null}>
      {msg(error)}
    </Empty>
  );
}

/** Message d'erreur d'un formulaire */
export function FormError({ error }) {
  const { error: msg } = useI18n();
  if (!error) return null;
  return (
    <div className="banner danger" role="alert">
      <Icon name="circle-alert" size={20} />
      <span>{msg(error)}</span>
    </div>
  );
}

export function Banner({ tone = '', icon, children, action }) {
  return (
    <div className={`banner ${tone}`}>
      {icon ? <Icon name={icon} size={20} /> : null}
      <span className="grow">{children}</span>
      {action || null}
    </div>
  );
}

/** « Hors ligne. Tes séries sont enregistrées. » (message adaptable) */
export function OfflineBanner({ text }) {
  const online = useOnline();
  const { t } = useI18n();
  if (online) return null;
  return (
    <div className="banner" role="status">
      <Icon name="wifi-off" size={20} />
      <span>{text || t('state.offline')}</span>
    </div>
  );
}
