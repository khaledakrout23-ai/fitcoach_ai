// Bibliothèque d'exercices (feuille) : recherche, filtre par muscle, « sans mes douleurs »
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chip, Empty, ErrorState, Icon, Sheet, Skeleton, StatusPill } from '../../components';
import { api } from '../../lib/api';
import { useDebounced, useLoad } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';
import { ExerciseThumb, useMeta, useMetaLabel } from './shared';

export default function Library({ open, safeDefault, injuries, onClose }) {
  const { t, name, label } = useI18n();
  const meta = useMeta();
  const metaLabel = useMetaLabel();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [safe, setSafe] = useState(safeDefault);
  const query = useDebounced(q.trim(), 300);

  useEffect(() => {
    if (open) setSafe(safeDefault);
  }, [open, safeDefault]);

  const list = useLoad(() => {
    if (!open) return null;
    const params = new URLSearchParams();
    if (query) params.set('q', query.slice(0, 60));
    if (muscle) params.set('muscle', muscle);
    if (safe) params.set('safe', '1');
    const qs = params.toString();
    return api.get(`/exercises${qs ? `?${qs}` : ''}`);
  }, [open, query, muscle, safe]);

  const muscles = meta ? Object.keys(meta.muscles) : [];

  return (
    <Sheet open={open} onClose={onClose} title={t('training.library')}>
      <div className="stack library">
        <label className="search">
          <Icon name="search" size={20} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('training.searchPlaceholder')}
            aria-label={t('training.searchExercises')}
            maxLength={60}
            enterKeyHint="search"
          />
        </label>
        <div className="chips scroll" role="group" aria-label={t('training.filterMuscle')}>
          {injuries.length ? (
            <Chip selected={safe} icon={safe ? 'shield-check' : 'shield'} onClick={() => setSafe((s) => !s)}>
              {t('training.safeChip')}
            </Chip>
          ) : null}
          <Chip selected={!muscle} onClick={() => setMuscle('')}>
            {t('training.allMuscles')}
          </Chip>
          {muscles.map((m) => (
            <Chip key={m} selected={muscle === m} onClick={() => setMuscle(muscle === m ? '' : m)}>
              {label(meta.muscles[m])}
            </Chip>
          ))}
        </div>

        {list.loading && !list.data ? (
          <div className="stack-2" role="status" aria-label={t('state.loading')}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} h={56} />
            ))}
          </div>
        ) : null}
        {list.error ? <ErrorState compact error={list.error} onRetry={list.reload} /> : null}
        {list.data && !list.data.length ? <Empty icon="search" title={t('training.noResults')} /> : null}
        {list.data && list.data.length ? (
          <ul className="ex-list" aria-busy={list.loading || undefined}>
            {list.data.map((ex) => (
              <li key={ex.id}>
                <Link to={`/app/exercice/${ex.id}`} className="ex-row">
                  <ExerciseThumb exercise={ex} />
                  <span className="grow">
                    <span className="ex-name">{name(ex)}</span>
                    <span className="ex-sub">
                      {metaLabel('muscles', ex.primaryMuscle)}
                      {ex.equipment ? ` · ${name(ex.equipment)}` : ''}
                    </span>
                  </span>
                  {ex.avoidForMe ? (
                    <StatusPill tone="warn" icon="triangle-alert">
                      {t('training.avoid')}
                    </StatusPill>
                  ) : null}
                  <Icon name="chevron-right" size={18} className="faint" />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Sheet>
  );
}
