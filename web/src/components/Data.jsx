import { Link } from 'react-router-dom';
import Icon from './Icon';
import { useI18n } from '../lib/i18n';

/** Nombre isolé : reste « 1 240 » en arabe (et pas « 240 1 ») */
export function Num({ children, className = '' }) {
  return <span className={`num ${className}`}>{children}</span>;
}

/** Initiales dans un rond (AB) */
export function Avatar({ name, size = '', className = '' }) {
  const { fmt } = useI18n();
  return (
    <span className={`avatar ${size} ${className}`} aria-hidden="true">
      {fmt.initials(name)}
    </span>
  );
}

/** Pastille de statut, toujours avec une icône ou un point (A3 : warn/danger jamais par la couleur seule) */
export function StatusPill({ tone = '', icon, led = false, children }) {
  return (
    <span className={`status ${tone}`}>
      {led ? <span className="led" aria-hidden="true" /> : icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  );
}

/** KPI de l'espace salle : libellé, grande valeur, sous-texte coloré */
export function Kpi({ label, value, unit, sub, subTone = '', to }) {
  const body = (
    <>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">
        <span className="num">{value}</span>
        {unit ? <small> {unit}</small> : null}
      </span>
      {sub ? <span className={`kpi-sub ${subTone ? `${subTone}-text` : ''}`}>{sub}</span> : null}
    </>
  );
  return to ? (
    <Link to={to} className="kpi card link">
      {body}
    </Link>
  ) : (
    <div className="kpi">{body}</div>
  );
}

/** Ligne de liste (Compte, réglages) : icône, titre, sous-titre, valeur, chevron */
export function ListRow({ icon, title, sub, value, to, onClick, chevron = true, danger = false, children }) {
  const inner = (
    <>
      {icon ? <Icon name={icon} /> : null}
      <span className="grow">
        <span className={danger ? 'danger-text' : ''}>{title}</span>
        {sub ? <span className="sub">{sub}</span> : null}
      </span>
      {value != null ? <span className="value">{value}</span> : null}
      {children}
      {chevron && (to || onClick) ? <Icon name="chevron-right" size={18} className="chev" /> : null}
    </>
  );
  if (to) {
    return (
      <Link to={to} className="list-row">
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className="list-row" onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className="list-row">{inner}</div>;
}

/** Petit titre de section avec filet */
export function Eyebrow({ children, plain = false, action }) {
  if (action) {
    return (
      <div className="row between" style={{ marginTop: 'var(--s6)' }}>
        <span className="eyebrow plain" style={{ margin: 0 }}>
          {children}
        </span>
        {action}
      </div>
    );
  }
  return <div className={`eyebrow ${plain ? 'plain' : ''}`}>{children}</div>;
}

/** « 1 – 10 sur 512 » + précédent / suivant */
export function Pager({ page, pageSize, total, onPage }) {
  const { t, fmt } = useI18n();
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pager">
      <span className="num">
        {fmt.num(from)} – {fmt.num(to)} / {fmt.num(total)}
      </span>
      <span className="row-2">
        <button type="button" className="icon-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('action.back')}>
          <Icon name="chevron-left" />
        </button>
        <button type="button" className="icon-btn" disabled={to >= total} onClick={() => onPage(page + 1)} aria-label={t('action.next')}>
          <Icon name="chevron-right" />
        </button>
      </span>
    </div>
  );
}

/** Logo Kammel : symbole fourni (jamais redessiné) + nom */
export function Logo({ size = 40, wordmark = false, sub }) {
  return (
    <span className="logo">
      <img src="/brand/kammel-symbol.png" alt="Kammel" style={{ height: size }} />
      {wordmark ? (
        <span className="wordmark">
          Kammel
          {sub ? <small>{sub}</small> : null}
        </span>
      ) : null}
    </span>
  );
}

/** Mascotte coach : symbole dans un rond + bulle (« Behi ! ») */
export function Mascot({ text }) {
  return (
    <div className="mascot" aria-live="polite">
      <span className="avatar sm">
        <img src="/brand/kammel-symbol.png" alt="" />
      </span>
      {text ? <span className="bubble">{text}</span> : null}
    </div>
  );
}
