import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';

/**
 * Bouton du design system.
 * variant : primary | secondary | ghost | text | warn | warn-soft | danger | danger-solid | hydro
 * size : lg | md | sm | xs ; block : pleine largeur ; to : lien interne
 */
export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', block = false, icon, iconEnd, loading = false, to, className = '', children, disabled, type = 'button', ...rest },
  ref
) {
  const cls = ['btn', variant, size !== 'md' ? size : '', block ? 'block' : '', className].filter(Boolean).join(' ');
  const content = (
    <>
      {loading ? <span className="spin" aria-hidden="true" /> : icon ? <Icon name={icon} size={size === 'sm' || size === 'xs' ? 18 : 20} /> : null}
      {children}
      {iconEnd && !loading ? <Icon name={iconEnd} size={size === 'sm' || size === 'xs' ? 18 : 20} /> : null}
    </>
  );
  if (to) {
    return (
      <Link ref={ref} to={to} className={cls} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
});

/** Bouton carré 48 px avec une icône (label obligatoire pour les lecteurs d'écran) */
export const IconButton = forwardRef(function IconButton(
  { icon, label, round = false, plain = false, dot = false, size = 24, to, className = '', ...rest },
  ref
) {
  const cls = ['icon-btn', round ? 'round' : '', plain ? 'plain' : '', className].filter(Boolean).join(' ');
  const inner = (
    <>
      <Icon name={icon} size={size} />
      {dot ? <span className="dot" aria-hidden="true" /> : null}
    </>
  );
  if (to) {
    return (
      <Link ref={ref} to={to} className={cls} aria-label={label} title={label} {...rest}>
        {inner}
      </Link>
    );
  }
  return (
    <button ref={ref} type="button" className={cls} aria-label={label} title={label} {...rest}>
      {inner}
    </button>
  );
});
