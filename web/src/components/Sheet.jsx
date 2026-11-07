import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import { useI18n } from '../lib/i18n';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Feuille du bas (téléphone) ; centrée ou tiroir latéral sur grand écran (variant: 'center' | 'drawer').
 * Échap et clic sur le fond ferment ; le focus reste dans la feuille puis revient au déclencheur.
 * dark : toujours sombre (séance, gym en direct)
 */
export default function Sheet({ open, onClose, title, subtitle, children, footer, variant = 'center', dark = false, closeButton = true, labelledBy }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const node = ref.current;
    const first = node?.querySelector(FOCUSABLE);
    (first || node)?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
      if (e.key === 'Tab' && node) {
        const items = [...node.querySelectorAll(FOCUSABLE)];
        if (!items.length) return;
        const [a, b] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (previous && previous.focus) previous.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className={`sheet-backdrop ${variant}`} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()} data-theme={dark ? 'dark' : undefined}>
      <div
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : labelledBy}
        tabIndex={-1}
      >
        <div className="grabber" aria-hidden="true" />
        {title || closeButton ? (
          <div className="sheet-head">
            <div className="grow">
              {title ? <h2 id={titleId}>{title}</h2> : null}
              {subtitle ? <p className="muted small mt-2">{subtitle}</p> : null}
            </div>
            {closeButton ? <IconButton icon="x" label={t('action.close')} round onClick={onClose} /> : null}
          </div>
        ) : null}
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
