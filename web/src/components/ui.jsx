import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

export function Spinner() {
  return (
    <div className="center">
      <div className="spinner" role="status" aria-label="..." />
    </div>
  );
}

export function ErrorText({ error }) {
  const { error: msg } = useI18n();
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {msg(error)}
    </p>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>
        {label} {hint && <span className="field-hint">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Stat({ value, label, alert }) {
  return (
    <div className={`stat${alert ? ' alert' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

// Charge des données de l'API avec gestion du chargement et des erreurs
export function useLoad(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    loader()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error) => alive && setState({ data: null, loading: false, error }));
    return () => {
      alive = false;
    };
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((x) => x + 1), setData: (data) => setState((s) => ({ ...s, data })) };
}

export function useToast() {
  const [text, setText] = useState(null);
  useEffect(() => {
    if (!text) return undefined;
    const id = setTimeout(() => setText(null), 3200);
    return () => clearTimeout(id);
  }, [text]);
  const node = text ? (
    <div className="toast" role="status">
      {text}
    </div>
  ) : null;
  return [node, setText];
}

// Badge de statut d'abonnement
export function SubscriptionBadge({ sub }) {
  const { t } = useI18n();
  if (!sub) return <span className="badge">{t('sub.none')}</span>;
  if (sub.status === 'EXPIRE') return <span className="badge badge-danger">{t('sub.expired')}</span>;
  if (sub.status === 'EXPIRE_BIENTOT') return <span className="badge badge-warn">{t('sub.expiringDays', { n: sub.daysLeft })}</span>;
  return <span className="badge badge-ok">{t('sub.active')}</span>;
}
