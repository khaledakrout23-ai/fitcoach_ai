// Bibliothèque d'exercices Kammel (administration) : recherche, filtres, éditeur complet
// (noms FR/AR/EN, muscles, mouvement, équipement, accessoires, niveau, douleurs, séries par niveau,
// alternatives dans l'ordre, bienfaits / erreurs FR + AR, lien YouTube)
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useLoad } from '../../lib/hooks';
import {
  Button, IconButton, Field, Input, Select, Textarea, Segmented, ChipGroup, Sheet, Icon, Banner, useToast,
  PageSkeleton, Empty, ErrorState, FormError,
} from '../../components';
import { PageHead, Thumb, useMeta, move, safeYoutube } from '../staff/manage/shared';

const LEVELS = ['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE'];
const SETS = /^\d{1,2}\s*[x×]\s*\d{1,3}$/i;
const REPS = /^\d{1,3}(-\d{1,3})?( ?s)?$/;
const YT = /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\/[\w?=&/-]{1,200}$/;
const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export default function AdminExercises() {
  const { t, name, label } = useI18n();
  const meta = useMeta();
  const list = useLoad(() => api.get('/admin/exercises'), []);
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [editing, setEditing] = useState(null);
  const m = meta.data;

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list.data || []).filter(
      (ex) => (!muscle || ex.primaryMuscle === muscle) && (!needle || [ex.nameFr, ex.nameAr, ex.nameEn].some((n) => String(n || '').toLowerCase().includes(needle)))
    );
  }, [list.data, q, muscle]);

  return (
    <>
      <PageHead
        title={t('admin.ex.title')}
        subtitle={list.data ? t('content.ex.subtitle', { n: list.data.length }) : ''}
        actions={
          <>
            <label className="search">
              <Icon name="search" size={20} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('content.ex.search')} aria-label={t('content.ex.search')} />
            </label>
            <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
              {t('admin.ex.new')}
            </Button>
          </>
        }
      />
      <ChipGroup
          options={[{ value: '', label: t('content.ex.allMuscles') }, ...Object.entries(m?.muscles || {}).map(([k, v]) => ({ value: k, label: label(v) }))]}
          value={muscle}
          onChange={setMuscle}
          scroll
          label={t('content.ex.muscle')}
        />
      {list.loading && !list.data ? (
        <PageSkeleton cards={4} />
      ) : list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : items.length === 0 ? (
        <Empty icon="search" title={t('content.ex.none')} />
      ) : (
        <div className="table-wrap">
          <table className="table responsive">
            <thead>
              <tr>
                <th>{t('content.ex.exercise')}</th>
                <th>{t('content.ex.muscles')}</th>
                <th>{t('admin.ex.pattern')}</th>
                <th>{t('content.ex.avoid')}</th>
                <th>{t('content.ex.alt')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((ex) => (
                <tr key={ex.id} className="clickable" tabIndex={0} onClick={() => setEditing(ex)} onKeyDown={(e) => e.key === 'Enter' && setEditing(ex)}>
                  <td>
                    <span className="mg-cell">
                      <Thumb icon={ex.videoUrl ? 'play' : 'dumbbell'} />
                      <span>
                        <span className="w500" style={{ display: 'block' }}>{name(ex)}</span>
                        <span className="sub">{[name(ex.equipment), label(m?.levels?.[LEVELS[ex.difficulty - 1]])].filter(Boolean).join(' · ')}</span>
                      </span>
                    </span>
                  </td>
                  <td className="muted" data-label={t('content.ex.muscles')}>
                    {[ex.primaryMuscle, ...(ex.secondaryMuscles || [])].map((k) => label(m?.muscles?.[k])).join(', ')}
                  </td>
                  <td className="muted" data-label={t('admin.ex.pattern')}>{label(m?.patterns?.[ex.pattern])}</td>
                  <td data-label={t('content.ex.avoid')}>{(ex.injuryZones || []).map((z) => label(m?.injuryZones?.[z])).join(', ') || '—'}</td>
                  <td data-label={t('content.ex.alt')}><span className="num">{(ex.alternativeIds || []).length}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing ? (
        <Editor
          exercise={editing === 'new' ? null : editing}
          all={list.data || []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}
    </>
  );
}

function Editor({ exercise, all, onClose, onSaved }) {
  const { t, name, label } = useI18n();
  const { toast } = useToast();
  const meta = useMeta();
  const equipment = useLoad(() => api.get('/equipment'), []);
  const m = meta.data;
  const [f, setF] = useState(() => ({
    nameFr: exercise?.nameFr || '',
    nameAr: exercise?.nameAr || '',
    nameEn: exercise?.nameEn || '',
    primaryMuscle: exercise?.primaryMuscle || '',
    secondaryMuscles: exercise?.secondaryMuscles || [],
    pattern: exercise?.pattern || '',
    equipmentId: exercise?.equipmentId ? String(exercise.equipmentId) : '',
    accessories: exercise?.accessories || [],
    difficulty: exercise?.difficulty || 1,
    injuryZones: exercise?.injuryZones || [],
    defaultReps: exercise?.defaultReps || '8-12',
    defaultSets: Object.fromEntries(LEVELS.map((l) => [l, exercise?.defaultSets?.[l] ? String(exercise.defaultSets[l]).replace('x', ' × ') : ''])),
    alternativeIds: exercise?.alternativeIds || [],
    benefitsFr: (exercise?.benefitsFr || []).join('\n'),
    benefitsAr: (exercise?.benefitsAr || []).join('\n'),
    mistakesFr: (exercise?.mistakesFr || []).join('\n'),
    mistakesAr: (exercise?.mistakesAr || []).join('\n'),
    videoUrl: exercise?.videoUrl || '',
  }));
  const [altPick, setAltPick] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v && v.target ? v.target.value : v }));
  const byId = useMemo(() => new Map(all.map((e) => [e.id, e])), [all]);

  const errs = {};
  if (!f.nameFr.trim()) errs.nameFr = t('manage.settings.required');
  if (!f.nameAr.trim()) errs.nameAr = t('manage.settings.required');
  if (!f.nameEn.trim()) errs.nameEn = t('manage.settings.required');
  if (!f.primaryMuscle) errs.primaryMuscle = t('manage.settings.required');
  if (!f.pattern) errs.pattern = t('manage.settings.required');
  if (!f.equipmentId) errs.equipmentId = t('manage.settings.required');
  if (!REPS.test(f.defaultReps.trim())) errs.defaultReps = t('admin.ex.repsInvalid');
  if (LEVELS.some((l) => f.defaultSets[l] && !SETS.test(f.defaultSets[l].trim()))) errs.sets = t('admin.ex.setsInvalid');
  if (f.videoUrl.trim() && !YT.test(f.videoUrl.trim())) errs.videoUrl = t('admin.ex.videoInvalid');
  for (const k of ['benefitsFr', 'benefitsAr', 'mistakesFr', 'mistakesAr']) if (lines(f[k]).length > 5) errs[k] = t('admin.ex.max5');
  const valid = Object.keys(errs).length === 0;

  const options = (obj) => Object.entries(obj || {}).map(([k, v]) => ({ value: k, label: label(v) }));
  const eqList = equipment.data || [];

  async function save(e) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    const body = {
      nameFr: f.nameFr.trim(),
      nameAr: f.nameAr.trim(),
      nameEn: f.nameEn.trim(),
      primaryMuscle: f.primaryMuscle,
      secondaryMuscles: f.secondaryMuscles.filter((x) => x !== f.primaryMuscle),
      pattern: f.pattern,
      equipmentId: Number(f.equipmentId),
      accessories: f.accessories,
      difficulty: f.difficulty,
      injuryZones: f.injuryZones,
      defaultReps: f.defaultReps.trim(),
      defaultSets: Object.fromEntries(LEVELS.filter((l) => f.defaultSets[l].trim()).map((l) => [l, f.defaultSets[l].replace(/\s/g, '').replace('×', 'x').toLowerCase()])),
      alternativeIds: f.alternativeIds,
      benefitsFr: lines(f.benefitsFr),
      benefitsAr: lines(f.benefitsAr),
      mistakesFr: lines(f.mistakesFr),
      mistakesAr: lines(f.mistakesAr),
      videoUrl: f.videoUrl.trim(),
    };
    try {
      if (exercise) await api.put(`/admin/exercises/${exercise.id}`, body);
      else await api.post('/admin/exercises', body);
      toast({ text: t('admin.ex.saved'), icon: 'check' });
      onSaved();
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await api.del(`/admin/exercises/${exercise.id}`);
      toast({ text: t('admin.ex.deleted'), icon: 'trash-2' });
      onSaved();
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  const video = safeYoutube(f.videoUrl.trim());

  return (
    <Sheet
      open
      onClose={onClose}
      variant="drawer"
      title={exercise ? name(exercise) : t('admin.ex.new')}
      footer={
        <Button variant="primary" block type="submit" form="ex-form" disabled={!valid} loading={saving}>
          {t('action.save')}
        </Button>
      }
    >
      <form id="ex-form" className="stack-4" onSubmit={save}>
        <Field label={t('admin.ex.nameFr')} error={f.nameFr ? null : errs.nameFr}>
          <Input value={f.nameFr} maxLength={120} onChange={set('nameFr')} />
        </Field>
        <div className="mg-fields">
          <Field label={t('admin.ex.nameAr')} error={f.nameAr ? null : errs.nameAr}>
            <Input value={f.nameAr} dir="rtl" lang="ar" maxLength={120} onChange={set('nameAr')} />
          </Field>
          <Field label={t('admin.ex.nameEn')} error={f.nameEn ? null : errs.nameEn}>
            <Input value={f.nameEn} dir="ltr" lang="en" maxLength={120} onChange={set('nameEn')} />
          </Field>
        </div>
        <div className="mg-fields">
          <Field label={t('admin.ex.primary')}>
            <Select value={f.primaryMuscle} onChange={set('primaryMuscle')}>
              <option value="">{t('manage.choose')}</option>
              {options(m?.muscles).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('admin.ex.pattern')}>
            <Select value={f.pattern} onChange={set('pattern')}>
              <option value="">{t('manage.choose')}</option>
              {options(m?.patterns).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t('admin.ex.secondary')} optional>
          <ChipGroup multiple options={options(m?.muscles).filter((o) => o.value !== f.primaryMuscle)} value={f.secondaryMuscles} onChange={set('secondaryMuscles')} label={t('admin.ex.secondary')} />
        </Field>
        <Field label={t('admin.ex.equipment')}>
          <Select value={f.equipmentId} onChange={set('equipmentId')}>
            <option value="">{t('manage.choose')}</option>
            {eqList.map((eq) => (
              <option key={eq.id} value={eq.id}>{name(eq)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('admin.ex.accessories')} optional hint={t('admin.ex.accessoriesHint')}>
          <ChipGroup
            multiple
            options={eqList.filter((eq) => String(eq.id) !== f.equipmentId && eq.code !== 'poids_du_corps').map((eq) => ({ value: eq.code, label: name(eq) }))}
            value={f.accessories}
            onChange={(v) => setF((x) => ({ ...x, accessories: v.slice(0, 5) }))}
            label={t('admin.ex.accessories')}
          />
        </Field>
        <Field label={t('content.ex.level')}>
          <Segmented options={LEVELS.map((l, i) => ({ value: i + 1, label: label(m?.levels?.[l]) }))} value={f.difficulty} onChange={set('difficulty')} label={t('content.ex.level')} />
        </Field>
        <Field label={t('content.ex.avoidIf')} optional>
          <ChipGroup multiple options={options(m?.injuryZones)} value={f.injuryZones} onChange={set('injuryZones')} label={t('content.ex.avoidIf')} />
        </Field>
        <div className="stack-2">
          <span className="w500">{t('content.ex.sets')}</span>
          <div className="mg-fields three">
            {LEVELS.map((l) => (
              <Field key={l} label={label(m?.levels?.[l])}>
                <Input value={f.defaultSets[l]} dir="ltr" placeholder="3 × 10" maxLength={8} onChange={(e) => setF((x) => ({ ...x, defaultSets: { ...x.defaultSets, [l]: e.target.value } }))} />
              </Field>
            ))}
          </div>
          {errs.sets ? <p className="small danger-text">{errs.sets}</p> : null}
          <Field label={t('admin.ex.reps')} error={errs.defaultReps}>
            <Input value={f.defaultReps} dir="ltr" maxLength={10} onChange={set('defaultReps')} />
          </Field>
        </div>

        <div className="stack-2">
          <div className="row between">
            <span className="w500">{t('content.ex.alternatives')}</span>
            <span className="caption muted">{t('content.ex.inOrder')}</span>
          </div>
          {f.alternativeIds.length ? (
            <ol className="mg-order">
              {f.alternativeIds.map((id, i) => (
                <li key={id}>
                  <span className="num muted">{i + 1}</span>
                  <span className="grow">{byId.get(id) ? name(byId.get(id)) : `#${id}`}</span>
                  <IconButton icon="arrow-up" size={16} plain label={t('content.prog.up')} disabled={i === 0} onClick={() => set('alternativeIds')(move(f.alternativeIds, i, i - 1))} />
                  <IconButton icon="arrow-down" size={16} plain label={t('content.prog.down')} disabled={i === f.alternativeIds.length - 1} onClick={() => set('alternativeIds')(move(f.alternativeIds, i, i + 1))} />
                  <IconButton icon="x" size={16} plain label={t('content.prog.remove')} onClick={() => set('alternativeIds')(f.alternativeIds.filter((x) => x !== id))} />
                </li>
              ))}
            </ol>
          ) : (
            <p className="small muted">{t('content.ex.noAlt')}</p>
          )}
          {f.alternativeIds.length < 6 ? (
            <div className="row">
              <Select value={altPick} onChange={(e) => setAltPick(e.target.value)} className="grow" aria-label={t('admin.ex.addAlt')}>
                <option value="">{t('admin.ex.addAlt')}</option>
                {all
                  .filter((e) => e.id !== exercise?.id && !f.alternativeIds.includes(e.id))
                  .sort((a, b) => (a.primaryMuscle === f.primaryMuscle ? -1 : 0) - (b.primaryMuscle === f.primaryMuscle ? -1 : 0))
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {name(e)} · {label(m?.muscles?.[e.primaryMuscle])}
                    </option>
                  ))}
              </Select>
              <Button
                icon="plus"
                disabled={!altPick}
                onClick={() => {
                  set('alternativeIds')([...f.alternativeIds, Number(altPick)]);
                  setAltPick('');
                }}
              >
                {t('action.add')}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="mg-fields">
          <Field label={t('admin.ex.benefitsFr')} hint={t('admin.ex.onePerLine')} error={errs.benefitsFr}>
            <Textarea rows={4} value={f.benefitsFr} onChange={set('benefitsFr')} />
          </Field>
          <Field label={t('admin.ex.benefitsAr')} hint={t('admin.ex.onePerLine')} error={errs.benefitsAr}>
            <Textarea rows={4} dir="rtl" lang="ar" value={f.benefitsAr} onChange={set('benefitsAr')} />
          </Field>
          <Field label={t('admin.ex.mistakesFr')} hint={t('admin.ex.onePerLine')} error={errs.mistakesFr}>
            <Textarea rows={4} value={f.mistakesFr} onChange={set('mistakesFr')} />
          </Field>
          <Field label={t('admin.ex.mistakesAr')} hint={t('admin.ex.onePerLine')} error={errs.mistakesAr}>
            <Textarea rows={4} dir="rtl" lang="ar" value={f.mistakesAr} onChange={set('mistakesAr')} />
          </Field>
        </div>
        <Field label={t('admin.ex.video')} optional error={errs.videoUrl} hint={t('admin.ex.videoHint')}>
          <Input type="url" dir="ltr" value={f.videoUrl} placeholder="https://www.youtube.com/watch?v=…" onChange={set('videoUrl')} invalid={Boolean(errs.videoUrl)} />
        </Field>
        {video ? (
          <a href={video} target="_blank" rel="noopener noreferrer" className="link-btn">
            {t('content.ex.video')}
          </a>
        ) : null}
        <FormError error={error} />
        {exercise ? (
          confirm ? (
            <Banner
              tone="danger"
              icon="trash-2"
              action={
                <span className="row-2">
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>{t('action.cancel')}</Button>
                  <Button size="sm" variant="danger-solid" onClick={remove} loading={saving}>{t('action.delete')}</Button>
                </span>
              }
            >
              {t('admin.ex.deleteConfirm')}
            </Banner>
          ) : (
            <Button variant="danger" icon="trash-2" onClick={() => setConfirm(true)}>
              {t('admin.ex.delete')}
            </Button>
          )
        ) : null}
      </form>
    </Sheet>
  );
}
