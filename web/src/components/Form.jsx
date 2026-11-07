import { useId, useState } from 'react';
import Icon from './Icon';
import { useI18n } from '../lib/i18n';

/** Champ avec libellé, aide et erreur rouge sous le champ (A5 / B1a) */
export function Field({ label, hint, error, optional = false, children, className = '' }) {
  const { t } = useI18n();
  return (
    <label className={`field ${className}`}>
      {label ? (
        <span className="label">
          {label}
          {optional ? <span className="opt">{t('state.optional')}</span> : null}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="error" role="alert">
          <Icon name="circle-alert" size={16} />
          {error}
        </span>
      ) : hint ? (
        <span className="hint">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className = '', invalid, suffix, ...rest }) {
  if (suffix) {
    return (
      <span className="input-wrap">
        <input className={`input ${className}`} aria-invalid={invalid || undefined} {...rest} />
        <span className="suffix" aria-hidden="true">
          {suffix}
        </span>
      </span>
    );
  }
  return <input className={`input ${className}`} aria-invalid={invalid || undefined} {...rest} />;
}

/** Mot de passe avec bouton afficher / masquer */
export function PasswordInput({ className = '', invalid, ...rest }) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <span className="input-wrap">
      <input
        className={`input ${className}`}
        type={show ? 'text' : 'password'}
        aria-invalid={invalid || undefined}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        {...rest}
      />
      <button type="button" className="toggle-eye" onClick={() => setShow((s) => !s)} aria-label={show ? t('action.hide') : t('action.show')}>
        <Icon name={show ? 'eye-off' : 'eye'} size={22} />
      </button>
    </span>
  );
}

/** Numéro de téléphone tunisien : « +216 » fixe + 8 chiffres (gauche → droite même en arabe) */
export function PhoneInput({ value, onChange, invalid, ...rest }) {
  return (
    <span className="phone-input">
      <span className="cc" aria-hidden="true">
        +216
      </span>
      <input
        className="input"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        dir="ltr"
        placeholder="22 345 678"
        value={value}
        onChange={(e) => {
          // garde les chiffres, groupés 2 · 3 · 3 comme sur le design
          const d = e.target.value.replace(/\D/g, '').slice(0, 8);
          const pretty = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8)].filter(Boolean).join(' ');
          onChange(pretty);
        }}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    </span>
  );
}

export function Select({ className = '', children, ...rest }) {
  return (
    <select className={`select ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className = '', ...rest }) {
  return <textarea className={`textarea ${className}`} {...rest} />;
}

export function Checkbox({ checked, onChange, children, ...rest }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} {...rest} />
      <span>{children}</span>
    </label>
  );
}

/** Interrupteur (role switch) */
export function Toggle({ checked, onChange, label, disabled, ...rest }) {
  return (
    <button
      type="button"
      role="switch"
      className="toggle"
      aria-checked={Boolean(checked)}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      {...rest}
    />
  );
}

/** Ligne titre + sous-titre + interrupteur (« Me prévenir quand c'est calme ») */
export function ToggleRow({ icon, title, subtitle, checked, onChange, disabled }) {
  const id = useId();
  return (
    <div className="toggle-row">
      {icon ? <Icon name={icon} className="muted" /> : null}
      <div className="grow">
        <div id={id} className="w500">
          {title}
        </div>
        {subtitle ? <div className="caption muted">{subtitle}</div> : null}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} aria-labelledby={id} />
    </div>
  );
}

/** Contrôle segmenté : options [{ value, label }] */
export function Segmented({ options, value, onChange, size, className = '', label }) {
  return (
    <div className={`segmented ${size === 'sm' ? 'sm' : ''} ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Puce sélectionnable */
export function Chip({ selected = false, icon, children, onClick, count, size, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={`chip ${size === 'sm' ? 'sm' : ''} ${selected ? 'selected' : ''} ${className}`}
      aria-pressed={selected}
      onClick={onClick}
      {...rest}
    >
      {selected && !icon ? <Icon name="check" size={16} /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
      {count != null ? <span className="count num">{count}</span> : null}
    </button>
  );
}

/**
 * Groupe de puces : options [{ value, label, icon }]
 * multiple : value est un tableau ; exclusive : valeur qui désélectionne les autres (« Aucune »)
 */
export function ChipGroup({ options, value, onChange, multiple = false, exclusive, scroll = false, label }) {
  const isOn = (v) => (multiple ? (value || []).includes(v) : value === v);
  const toggle = (v) => {
    if (!multiple) return onChange(v);
    const cur = value || [];
    if (v === exclusive) return onChange(cur.includes(v) ? [] : [v]);
    const base = cur.filter((x) => x !== exclusive);
    return onChange(base.includes(v) ? base.filter((x) => x !== v) : [...base, v]);
  };
  return (
    <div className={`chips ${scroll ? 'scroll' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <Chip key={String(o.value)} selected={isOn(o.value)} icon={o.icon} onClick={() => toggle(o.value)} count={o.count}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

/** Carte de choix (objectif, sexe, niveau) : role radio */
export function OptionCard({ selected, onSelect, icon, title, subtitle, multiple = false }) {
  return (
    <button type="button" role={multiple ? 'checkbox' : 'radio'} aria-checked={Boolean(selected)} className="option-card" onClick={onSelect}>
      {icon ? <Icon name={icon} /> : null}
      <span>
        {title}
        {subtitle ? <span className="sub">{subtitle}</span> : null}
      </span>
      <span className="radio" aria-hidden="true">
        {selected ? <Icon name="check" size={16} stroke={2.5} /> : null}
      </span>
    </button>
  );
}

/** Stepper − valeur + (kg, répétitions, quantités) */
export function Stepper({ value, onChange, step = 1, min = 0, max = 999, decimals = 0, label, unit }) {
  const { fmt } = useI18n();
  const set = (v) => onChange(Math.min(max, Math.max(min, Math.round(v * 10 ** decimals) / 10 ** decimals)));
  return (
    <div className="row-2" role="group" aria-label={label}>
      <button type="button" className="icon-btn" onClick={() => set((Number(value) || 0) - step)} aria-label="−">
        <Icon name="minus" />
      </button>
      <span className="h3 num" style={{ minWidth: 72, textAlign: 'center' }}>
        {fmt.num(value, decimals)}
        {unit ? <span className="num-unit">{unit}</span> : null}
      </span>
      <button type="button" className="icon-btn" onClick={() => set((Number(value) || 0) + step)} aria-label="+">
        <Icon name="plus" />
      </button>
    </div>
  );
}
