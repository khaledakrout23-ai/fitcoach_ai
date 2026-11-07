// Exercices (D12) : catalogue Kammel vu par la salle (machines de la salle, douleurs, alternatives). Lecture seule :
// le catalogue est géré par l'équipe Kammel.
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { useLoad, useDebounced } from '../../../lib/hooks';
import { Icon, Select, Sheet, Banner, StatusPill, PageSkeleton, Empty, ErrorState } from '../../../components';
import { PageHead, Thumb, useMedia, useMeta, safeYoutube } from '../manage/shared';

const LEVELS = ['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE'];

export function exerciseWhere(ex, t) {
  if (ex.machines?.length) return `#${ex.machines[0].code || ''} ${ex.machines[0].label}`.trim();
  if (ex.equipment?.code === 'poids_du_corps') return t('content.ex.noMachine');
  return null;
}

export default function Exercises() {
  const { t, name, label } = useI18n();
  const meta = useMeta();
  const wide = useMedia('(min-width: 1100px)');
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const query = useDebounced(q.trim(), 300);
  const list = useLoad(() => {
    const p = new URLSearchParams();
    if (query) p.set('q', query);
    if (muscle) p.set('muscle', muscle);
    const s = p.toString();
    return api.get(`/staff/content/exercises${s ? `?${s}` : ''}`);
  }, [query, muscle]);
  const [selected, setSelected] = useState(null);
  const items = list.data?.items || [];
  const m = meta.data;

  useEffect(() => {
    if (wide && !selected && items.length) setSelected(items[0].id);
  }, [wide, items, selected]);

  const muscles = (ex) => [ex.primaryMuscle, ...(ex.secondaryMuscles || [])].map((k) => label(m?.muscles?.[k])).filter(Boolean).join(', ');
  const zones = (ex) => (ex.injuryZones || []).map((k) => label(m?.injuryZones?.[k])).filter(Boolean).join(', ') || '—';
  const sub = (ex) => [exerciseWhere(ex, t) || name(ex.equipment), label(m?.levels?.[LEVELS[ex.difficulty - 1]])].filter(Boolean).join(' · ');
  const current = items.find((x) => x.id === selected);

  return (
    <>
      <PageHead
        title={t('content.ex.title')}
        subtitle={list.data ? t('content.ex.subtitle', { n: list.data.total }) : ''}
        back="/salle/plus"
        actions={
          <>
            <label className="search">
              <Icon name="search" size={20} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('content.ex.search')} aria-label={t('content.ex.search')} />
            </label>
            <Select value={muscle} onChange={(e) => setMuscle(e.target.value)} aria-label={t('content.ex.muscle')} style={{ maxWidth: 200 }}>
              <option value="">{t('content.ex.allMuscles')}</option>
              {Object.entries(m?.muscles || {}).map(([k, v]) => (
                <option key={k} value={k}>
                  {label(v)}
                </option>
              ))}
            </Select>
          </>
        }
      />
      <Banner icon="info">{t('content.ex.managed')}</Banner>
      {list.loading && !list.data ? (
        <PageSkeleton cards={4} />
      ) : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : items.length === 0 ? (
        <Empty icon="search" title={t('content.ex.none')} />
      ) : (
        <div className={wide ? 'split detail' : ''}>
          <div className="table-wrap">
            <table className="table responsive">
              <thead>
                <tr>
                  <th>{t('content.ex.exercise')}</th>
                  <th>{t('content.ex.muscles')}</th>
                  <th>{t('content.ex.avoid')}</th>
                  <th>{t('content.ex.alt')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ex) => (
                  <tr key={ex.id} className={`clickable ${selected === ex.id ? 'selected' : ''}`} onClick={() => setSelected(ex.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelected(ex.id)}>
                    <td>
                      <span className="mg-cell">
                        <Thumb icon="dumbbell" />
                        <span>
                          <span className="w500" style={{ display: 'block' }}>{name(ex)}</span>
                          <span className="sub">{sub(ex)}</span>
                        </span>
                      </span>
                    </td>
                    <td className="muted" data-label={t('content.ex.muscles')}>{muscles(ex)}</td>
                    <td className="w500" data-label={t('content.ex.avoid')}>{zones(ex)}</td>
                    <td data-label={t('content.ex.alt')}>
                      <span className="num">{ex.alternativesCount}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {wide ? (
            <aside className="card pad-lg mg-panel">{current ? <Detail ex={current} /> : <Empty icon="list" title={t('content.ex.pick')} />}</aside>
          ) : (
            <Sheet open={Boolean(current)} onClose={() => setSelected(null)} variant="drawer" title={current ? name(current) : ''}>
              {current ? <Detail ex={current} inSheet /> : null}
            </Sheet>
          )}
        </div>
      )}
    </>
  );
}

function Detail({ ex, inSheet = false }) {
  const { t, name, label } = useI18n();
  const meta = useMeta();
  const m = meta.data;
  const video = safeYoutube(ex.videoUrl);
  return (
    <div className="stack-4">
      {inSheet ? null : <h2 className="h2">{name(ex)}</h2>}
      {video ? (
        <a className="btn secondary" href={video} target="_blank" rel="noopener noreferrer">
          <Icon name="play" size={20} />
          {t('content.ex.video')}
        </a>
      ) : (
        <p className="caption muted">{t('content.ex.noVideo')}</p>
      )}
      <div className="mg-fields">
        <div className="stack-2">
          <span className="w500">{t('content.ex.machine')}</span>
          {ex.machines.length ? (
            ex.machines.map((mc) => (
              <span key={mc.id} className="row-2">
                <span className="num muted">#{mc.code}</span> {mc.label}
              </span>
            ))
          ) : (
            <span className="muted">{exerciseWhere(ex, t) || (ex.availableInGym ? name(ex.equipment) : t('content.ex.notInGym'))}</span>
          )}
        </div>
        <div className="stack-2">
          <span className="w500">{t('content.ex.level')}</span>
          <span>{label(m?.levels?.[LEVELS[ex.difficulty - 1]])}</span>
        </div>
      </div>
      {!ex.availableInGym ? <StatusPill tone="warn" icon="triangle-alert">{t('content.ex.notInGym')}</StatusPill> : null}
      <div className="stack-2">
        <span className="w500">{t('content.ex.avoidIf')}</span>
        {ex.injuryZones.length ? (
          <div className="chips">
            {ex.injuryZones.map((z) => (
              <span key={z} className="tag">
                {label(m?.injuryZones?.[z])}
              </span>
            ))}
          </div>
        ) : (
          <span className="muted">{t('content.ex.noZone')}</span>
        )}
      </div>
      <div className="stack-2">
        <div className="row between">
          <span className="w500">{t('content.ex.alternatives')}</span>
          <span className="caption muted">{t('content.ex.inOrder')}</span>
        </div>
        {ex.alternatives.length ? (
          <ol className="mg-order">
            {ex.alternatives.map((a, i) => (
              <li key={a.id}>
                <span className="num muted">{i + 1}</span>
                <span className="grow">{name(a)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <span className="muted">{t('content.ex.noAlt')}</span>
        )}
      </div>
      <div className="stack-2">
        <span className="w500">{t('content.ex.sets')}</span>
        <div className="chips">
          {LEVELS.filter((l) => ex.defaultSets?.[l]).map((l) => (
            <span key={l} className="tag">
              {label(m?.levels?.[l])}&nbsp;<span className="num">{String(ex.defaultSets[l]).replace('x', ' × ')}</span>
            </span>
          ))}
        </div>
      </div>
      <p className="caption muted">{t('content.ex.managedShort')}</p>
    </div>
  );
}
