// Minuteur de repos : anneau plein écran, +15 s, Passer, vibration à la fin
import { useEffect, useRef } from 'react';
import { Button, Ring } from '../../components';
import { useNow } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';

export default function RestTimer({ endsAt, total, next, onAdd, onSkip }) {
  const { t, fmt } = useI18n();
  const now = useNow(250);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const buzzed = useRef(false);
  const skipRef = useRef(onSkip);
  skipRef.current = onSkip;

  useEffect(() => {
    if (left > 0) {
      buzzed.current = false;
      return undefined;
    }
    if (!buzzed.current) {
      buzzed.current = true;
      try {
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      } catch {
        /* vibration non prise en charge */
      }
    }
    const id = setTimeout(() => skipRef.current(), 900);
    return () => clearTimeout(id);
  }, [left]);

  return (
    <div className="rest" role="dialog" aria-modal="true" aria-label={t('session.rest')}>
      <span className="eyebrow plain rest-title">{left === 0 ? t('session.restDone') : t('session.rest')}</span>
      <Ring value={left} max={Math.max(total, left, 1)} size={260} stroke={14} label={fmt.clock(left)}>
        <span className="big-num rest-time" role="timer" aria-live="off">
          <span className="num">{fmt.clock(left)}</span>
        </span>
      </Ring>
      {next ? <p className="small muted text-center">{next}</p> : null}
      <span className="sr-only" aria-live="polite">
        {left === 0 ? t('session.restDone') : ''}
      </span>
      <div className="rest-actions">
        <Button variant="secondary" size="lg" onClick={onAdd}>
          <span className="num">{t('session.plus15')}</span>
        </Button>
        <Button variant="primary" size="lg" icon="skip-forward" onClick={onSkip}>
          {t('session.skip')}
        </Button>
      </div>
    </div>
  );
}
