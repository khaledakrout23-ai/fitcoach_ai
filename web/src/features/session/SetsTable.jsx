// Tableau des séries : SÉRIE · PRÉCÉDENT · KG · REPS · ✓ (ligne validée en vert)
import { Icon } from '../../components';
import { useI18n } from '../../lib/i18n';

export default function SetsTable({ entry, rows, timed, active, onChange, onToggle, onAdd }) {
  const { t, fmt } = useI18n();
  const previous = entry.previous?.sets || [];
  return (
    <div className="sets" role="table" aria-label={t('session.sets')}>
      <div className="sets-row head" role="row">
        <span role="columnheader">{t('session.col.set')}</span>
        <span role="columnheader">{t('session.col.prev')}</span>
        <span role="columnheader">{t('session.col.kg')}</span>
        <span role="columnheader">{timed ? t('session.col.sec') : t('session.col.reps')}</span>
        <span role="columnheader" className="sr-only">
          {t('session.col.done')}
        </span>
      </div>
      {rows.map((r, i) => {
        const p = previous[i];
        const isActive = i === active;
        const cls = ['sets-row', r.done ? 'done' : '', isActive ? 'active' : ''].filter(Boolean).join(' ');
        return (
          <div key={i} className={cls} role="row">
            <span role="cell" className="set-n num">
              {i + 1}
            </span>
            <span role="cell" className="set-prev">
              {p ? (
                <span className="num">
                  {fmt.num(p.weight, 2)} × {p.reps}
                </span>
              ) : (
                '–'
              )}
            </span>
            <span role="cell">
              <input
                className="set-input"
                inputMode="decimal"
                enterKeyHint="next"
                autoComplete="off"
                dir="ltr"
                value={r.weight}
                placeholder="0"
                readOnly={r.done}
                aria-label={t('session.kgOf', { n: i + 1 })}
                onChange={(e) => onChange(i, 'weight', e.target.value.replace(/[^\d.,]/g, '').slice(0, 6))}
              />
            </span>
            <span role="cell">
              <input
                className="set-input"
                inputMode="numeric"
                enterKeyHint="done"
                autoComplete="off"
                dir="ltr"
                value={r.reps}
                placeholder="0"
                readOnly={r.done}
                aria-label={t(timed ? 'session.secOf' : 'session.repsOf', { n: i + 1 })}
                onChange={(e) => onChange(i, 'reps', e.target.value.replace(/\D/g, '').slice(0, 3))}
              />
            </span>
            <span role="cell">
              <button
                type="button"
                className="set-check"
                aria-pressed={r.done}
                aria-label={r.done ? t('session.undoSet', { n: i + 1 }) : t('session.validateSet', { n: i + 1 })}
                onClick={() => onToggle(i)}
              >
                {r.done ? <Icon name="check" size={20} stroke={2.75} /> : null}
              </button>
            </span>
          </div>
        );
      })}
      {rows.length < 10 ? (
        <button type="button" className="link-btn muted add-set" onClick={onAdd}>
          <Icon name="plus" size={16} /> {t('session.addSet')}
        </button>
      ) : null}
    </div>
  );
}
