import { createElement } from 'react';
import { ICONS, DIRECTIONAL } from './icons-data';
import { EXTRA_ICONS } from './icons-extra';

const ALL = { ...ICONS, ...EXTRA_ICONS };
const FLIP = new Set([...DIRECTIONAL, 'undo-2', 'log-in-2']);

/**
 * Icône Lucide : 24 px, trait 1,75, bouts arrondis (A5). Les flèches se retournent en arabe.
 * <Icon name="dumbbell" size={20} fill />  (fill : icône pleine, ex. onglet actif)
 */
export default function Icon({ name, size = 24, stroke = 1.75, fill = false, className = '', title, ...rest }) {
  const nodes = ALL[name] || ALL.circle;
  return (
    <svg
      className={`icon${FLIP.has(name) ? ' flip' : ''}${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {nodes.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}

export const hasIcon = (name) => Boolean(ALL[name]);
