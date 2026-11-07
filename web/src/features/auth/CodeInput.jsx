import { useRef } from 'react';
import { useI18n } from '../../lib/i18n';

/**
 * Code à 6 chiffres en cases séparées : avance automatique, retour arrière, collage du code entier,
 * clavier numérique. Les chiffres restent de gauche à droite, même en arabe.
 */
export default function CodeInput({ value, onChange, length = 6, invalid = false, autoFocus = false, label }) {
  const { t } = useI18n();
  const refs = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] || '');

  const focus = (i) => {
    const el = refs.current[Math.max(0, Math.min(length - 1, i))];
    if (el) {
      el.focus();
      el.select();
    }
  };

  // remplit à partir de la case i (frappe d'un chiffre, collage, saisie automatique du code reçu)
  const fill = (i, text) => {
    const incoming = String(text).replace(/\D/g, '');
    if (!incoming) return;
    const next = digits.slice();
    let pos = i;
    for (const d of incoming) {
      if (pos >= length) break;
      next[pos] = d;
      pos += 1;
    }
    onChange(next.join('').slice(0, length));
    focus(Math.min(pos, length - 1));
  };

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = digits.slice();
      if (next[i]) {
        next[i] = '';
        onChange(next.join(''));
      } else if (i > 0) {
        next[i - 1] = '';
        onChange(next.join(''));
        focus(i - 1);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focus(i + 1);
    }
  };

  return (
    <div className="code-input" dir="ltr" role="group" aria-label={label}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          value={d}
          aria-label={t('auth.forgot.digit', { n: i + 1 })}
          aria-invalid={invalid || undefined}
          autoFocus={autoFocus && i === 0}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => onKeyDown(i, e)}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, '');
            if (!raw) return;
            // la case contenait déjà un chiffre : on garde le nouveau
            fill(i, raw.length > 1 && d && raw.startsWith(d) ? raw.slice(1) : raw);
          }}
          onPaste={(e) => {
            e.preventDefault();
            fill(i, e.clipboardData.getData('text'));
          }}
        />
      ))}
    </div>
  );
}
