// Programmes (D13) : modèles attribués selon l'objectif et les jours choisis à l'inscription.
// Éditeur de semaine type : jours, exercices (séries × répétitions), ordre, publication.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { useLoad, useDebounced } from '../../../lib/hooks';
import {
  Button, IconButton, Field, Input, Select, Sheet, StatusPill, Icon, useToast,
  PageSkeleton, Empty, ErrorState, FormError, Banner,
} from '../../../components';
import { PageHead, useMeta, move } from '../manage/shared';
import './content.css';

const REPS = /^\d{1,3}(-\d{1,3})?( ?(s|sec|min))?$/;
const blankDay = (i) => ({ labelFr: '', labelAr: '', focusFr: '', focusAr: '', items: [], key: `${Date.now()}-${i}` });

function toDraft(tpl) {
  return {
    id: tpl?.id || null,
    nameFr: tpl?.nameFr || '',
    nameAr: tpl?.nameAr || '',
    goal: tpl?.goal || 'FORME',
    level: tpl?.level || '',
    weeks: tpl?.weeks || 8,
    published: Boolean(tpl?.published),
    days: tpl ? tpl.days.map((d, i) => ({ ...d, key: `d${i}`, items: d.items.map((it) => ({ ...it })) })) : [blankDay(0)],
  };
}

export default function Programs() {
  const { t, tp, name } = useI18n();
  const list = useLoad(() => api.get('/staff/content/programs'), []);
  const [selected, setSelected] = useState(null); // id | 'new'

  useEffect(() => {
    if (!selected && list.data?.length) setSelected(list.data[0].id);
  }, [list.data, selected]);

  const head = (
    <PageHead
      title={t('content.prog.title')}
      subtitle={t('content.prog.subtitle')}
      back="/salle/plus"
      actions={
        <Button variant="primary" icon="plus" onClick={() => setSelected('new')}>
          {t('content.prog.new')}
        </Button>
      }
    />
  );
  if (list.loading && !list.data) return (<>{head}<PageSkeleton cards={4} /></>);
  if (list.error && !list.data) return (<>{head}<ErrorState error={list.error} onRetry={list.reload} /></>);

  const templates = list.data;
  const current = selected === 'new' ? null : templates.find((x) => x.id === selected);

  return (
    <>
      {head}
      <div className="mg-prog">
        <div className="mg-list">
          {templates.length === 0 && selected !== 'new' ? <Empty icon="clipboard-list" title={t('content.prog.empty')} /> : null}
          {templates.map((tpl) => (
            <button key={tpl.id} type="button" className={`mg-item ${selected === tpl.id ? 'selected' : ''}`} aria-pressed={selected === tpl.id} onClick={() => setSelected(tpl.id)}>
              <span className="grow">
                <span className="title" style={{ display: 'block' }}>{name(tpl)}</span>
                <span className="sub" style={{ display: 'block' }}>
                  {t('content.prog.rhythm', { d: tpl.daysPerWeek, w: tpl.weeks })}
                </span>
                <span className="sub" style={{ display: 'block' }}>
                  {tp('content.prog.members', tpl.membersCount)}
                </span>
              </span>
              {tpl.published ? <StatusPill tone="ok" icon="circle-check">{t('content.prog.published')}</StatusPill> : <StatusPill>{t('content.prog.draft')}</StatusPill>}
            </button>
          ))}
        </div>
        {selected ? (
          <Editor
            key={selected}
            template={current}
            onSaved={(tpl) => {
              list.reload();
              setSelected(tpl ? tpl.id : null);
            }}
          />
        ) : null}
      </div>
    </>
  );
}

function Editor({ template, onSaved }) {
  const { t, tp, name, label } = useI18n();
  const { toast } = useToast();
  const meta = useMeta();
  const [draft, setDraft] = useState(() => toDraft(template));
  const [picking, setPicking] = useState(null); // index du jour
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const m = meta.data;
  const original = useMemo(() => JSON.stringify(toDraft(template)), [template]);
  const dirty = JSON.stringify(draft) !== original;

  const setDay = (i, patch) => setDraft((d) => ({ ...d, days: d.days.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const setItem = (i, k, patch) => setDay(i, { items: draft.days[i].items.map((it, j) => (j === k ? { ...it, ...patch } : it)) });

  const problems = [];
  if (!draft.nameFr.trim() || !draft.nameAr.trim()) problems.push(t('content.prog.errName'));
  if (draft.days.some((d) => !d.items.length)) problems.push(t('content.prog.errEmptyDay'));
  if (draft.days.some((d) => d.items.some((it) => !(it.sets >= 1 && it.sets <= 10) || !REPS.test(String(it.reps).trim())))) problems.push(t('content.prog.errSets'));
  const valid = problems.length === 0;

  async function save() {
    setSaving(true);
    setError(null);
    const body = {
      nameFr: draft.nameFr.trim(),
      nameAr: draft.nameAr.trim(),
      goal: draft.goal,
      level: draft.level || null,
      weeks: Number(draft.weeks),
      daysPerWeek: draft.days.length,
      days: draft.days.map((d) => ({
        labelFr: d.labelFr,
        labelAr: d.labelAr,
        focusFr: d.focusFr,
        focusAr: d.focusAr,
        items: d.items.map((it) => ({ exerciseId: it.exerciseId, sets: Number(it.sets), reps: String(it.reps).trim(), restSec: it.restSec ?? 60 })),
      })),
    };
    try {
      const r = draft.id ? await api.put(`/staff/content/programs/${draft.id}`, body) : await api.post('/staff/content/programs', body);
      toast({ text: t('content.prog.saved'), icon: 'check' });
      onSaved(r);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function publish(published) {
    setSaving(true);
    setError(null);
    try {
      const r = await api.post(`/staff/content/programs/${draft.id}/publish`, { published });
      toast({ text: published ? t('content.prog.publishedToast') : t('content.prog.unpublishedToast'), icon: 'check' });
      onSaved(r);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await api.del(`/staff/content/programs/${draft.id}`);
      toast({ text: t('content.prog.deleted'), icon: 'trash-2' });
      onSaved(null);
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  return (
    <section className="card pad-lg stack-4">
      <div className="row between wrap">
        <div className="grow">
          <h2 className="h2">{draft.nameFr || draft.nameAr ? name(draft) : t('content.prog.new')}</h2>
          <p className="small muted">
            {t('content.prog.week', { n: draft.days.length })}
            {template ? ` · ${tp('content.prog.members', template.membersCount)}` : ''}
          </p>
        </div>
        <div className="row-2 wrap">
          {draft.id ? (
            draft.published ? (
              <Button onClick={() => publish(false)} disabled={saving || dirty}>
                {t('content.prog.unpublish')}
              </Button>
            ) : (
              <Button variant="secondary" icon="send" onClick={() => publish(true)} disabled={saving || dirty}>
                {t('content.prog.publish')}
              </Button>
            )
          ) : null}
          <Button variant="primary" onClick={save} disabled={!dirty || !valid} loading={saving}>
            {t('action.save')}
          </Button>
        </div>
      </div>

      <div className="mg-fields three">
        <Field label={t('content.prog.nameFr')}>
          <Input value={draft.nameFr} maxLength={120} onChange={(e) => setDraft((d) => ({ ...d, nameFr: e.target.value }))} />
        </Field>
        <Field label={t('content.prog.nameAr')}>
          <Input value={draft.nameAr} dir="rtl" lang="ar" maxLength={120} onChange={(e) => setDraft((d) => ({ ...d, nameAr: e.target.value }))} />
        </Field>
        <Field label={t('content.prog.weeks')}>
          <Input type="number" min={1} max={52} value={draft.weeks} onChange={(e) => setDraft((d) => ({ ...d, weeks: Math.max(1, Math.min(52, Number(e.target.value) || 1)) }))} />
        </Field>
        <Field label={t('content.prog.goal')}>
          <Select value={draft.goal} onChange={(e) => setDraft((d) => ({ ...d, goal: e.target.value }))}>
            {Object.entries(m?.goals || {}).map(([k, v]) => (
              <option key={k} value={k}>
                {label(v)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('content.prog.level')}>
          <Select value={draft.level} onChange={(e) => setDraft((d) => ({ ...d, level: e.target.value }))}>
            <option value="">{t('content.prog.allLevels')}</option>
            {Object.entries(m?.levels || {}).map(([k, v]) => (
              <option key={k} value={k}>
                {label(v)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mg-week">
        {draft.days.map((day, i) => (
          <div key={day.key || i} className="mg-day">
            <div className="row between">
              <span className="caption muted">{t('content.prog.day', { n: i + 1 })}</span>
              {draft.days.length > 1 ? (
                <IconButton icon="trash-2" size={16} plain label={t('content.prog.removeDay', { n: i + 1 })} onClick={() => setDraft((d) => ({ ...d, days: d.days.filter((_, j) => j !== i) }))} />
              ) : null}
            </div>
            <Input className="sm" value={day.labelFr} maxLength={60} placeholder={t('content.prog.dayLabel')} aria-label={t('content.prog.dayLabel')} onChange={(e) => setDay(i, { labelFr: e.target.value })} />
            <Input className="sm" value={day.labelAr} dir="rtl" lang="ar" maxLength={60} placeholder="اسم النهار" aria-label={t('content.prog.dayLabelAr')} onChange={(e) => setDay(i, { labelAr: e.target.value })} />
            <Input className="sm" value={day.focusFr} maxLength={60} placeholder={t('content.prog.focus')} aria-label={t('content.prog.focus')} onChange={(e) => setDay(i, { focusFr: e.target.value })} />
            {day.items.map((it, k) => (
              <div key={`${it.exerciseId}-${k}`} className="mg-ex">
                <span className="name">{it.exercise ? name(it.exercise) : `#${it.exerciseId}`}</span>
                <div className="ctrl">
                  <Input value={it.sets} inputMode="numeric" aria-label={t('content.prog.sets')} onChange={(e) => setItem(i, k, { sets: Number(e.target.value.replace(/\D/g, '').slice(0, 2)) || '' })} />
                  <span className="muted">×</span>
                  <Input value={it.reps} aria-label={t('content.prog.reps')} maxLength={12} onChange={(e) => setItem(i, k, { reps: e.target.value })} style={{ width: 64 }} />
                  <span className="grow" />
                  <IconButton icon="arrow-up" size={16} plain label={t('content.prog.up')} disabled={k === 0} onClick={() => setDay(i, { items: move(day.items, k, k - 1) })} />
                  <IconButton icon="arrow-down" size={16} plain label={t('content.prog.down')} disabled={k === day.items.length - 1} onClick={() => setDay(i, { items: move(day.items, k, k + 1) })} />
                  <IconButton icon="x" size={16} plain label={t('content.prog.remove')} onClick={() => setDay(i, { items: day.items.filter((_, j) => j !== k) })} />
                </div>
              </div>
            ))}
            {day.items.length < 12 ? (
              <Button variant="text" size="sm" icon="plus" onClick={() => setPicking(i)}>
                {t('content.prog.addEx')}
              </Button>
            ) : null}
          </div>
        ))}
        {draft.days.length < 6 ? (
          <button type="button" className="mg-day mg-dashed" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 120, cursor: 'pointer', color: 'var(--text-muted)', font: 'inherit' }} onClick={() => setDraft((d) => ({ ...d, days: [...d.days, blankDay(d.days.length)] }))}>
            <Icon name="plus" />
            {t('content.prog.addDay')}
          </button>
        ) : null}
      </div>

      {problems.length && dirty ? <Banner tone="warn" icon="triangle-alert">{problems.join(' ')}</Banner> : null}
      <FormError error={error} />

      <div className="grid-3 mg-rules">
        <div className="card flat stack-2">
          <span className="w500">{t('content.prog.ruleProgress')}</span>
          <span className="small muted">{t('content.prog.ruleProgressText')}</span>
        </div>
        <div className="card flat stack-2">
          <span className="w500">{t('content.prog.rulePain')}</span>
          <span className="small muted">{t('content.prog.rulePainText')}</span>
        </div>
        <div className="card flat stack-2">
          <span className="w500">{t('content.prog.ruleQuick')}</span>
          <span className="small muted">{t('content.prog.ruleQuickText')}</span>
        </div>
      </div>

      {draft.id ? (
        confirmDelete ? (
          <Banner
            tone="danger"
            icon="trash-2"
            action={
              <span className="row-2">
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  {t('action.cancel')}
                </Button>
                <Button size="sm" variant="danger-solid" onClick={remove} loading={saving}>
                  {t('action.delete')}
                </Button>
              </span>
            }
          >
            {t('content.prog.deleteConfirm')}
          </Banner>
        ) : (
          <Button variant="text" size="sm" icon="trash-2" onClick={() => setConfirmDelete(true)}>
            {t('content.prog.delete')}
          </Button>
        )
      ) : null}

      {picking != null ? (
        <ExercisePicker
          level={draft.level || 'INTERMEDIAIRE'}
          onClose={() => setPicking(null)}
          onPick={(ex, sets, reps) => {
            setDay(picking, { items: [...draft.days[picking].items, { exerciseId: ex.id, sets, reps, restSec: 60, exercise: ex }] });
            setPicking(null);
          }}
        />
      ) : null}
    </section>
  );
}

function ExercisePicker({ level, onClose, onPick }) {
  const { t, name, label } = useI18n();
  const meta = useMeta();
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 300);
  const list = useLoad(() => api.get(`/staff/content/exercises${query ? `?q=${encodeURIComponent(query)}` : ''}`), [query]);
  return (
    <Sheet open onClose={onClose} title={t('content.prog.pickTitle')}>
      <div className="stack">
        <label className="search" style={{ maxWidth: 'none' }}>
          <Icon name="search" size={20} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('content.ex.search')} aria-label={t('content.ex.search')} />
        </label>
        <div className="mg-list mg-pick">
          {list.error ? <ErrorState compact error={list.error} onRetry={list.reload} /> : null}
          {(list.data?.items || []).map((ex) => {
            const [sets, reps] = String(ex.defaultSets?.[level] || `3x${ex.defaultReps || '10'}`).split('x');
            return (
              <button key={ex.id} type="button" className="mg-item" onClick={() => onPick(ex, Number(sets) || 3, reps || '10')}>
                <span className="grow">
                  <span className="title" style={{ display: 'block' }}>{name(ex)}</span>
                  <span className="sub">{label(meta.data?.muscles?.[ex.primaryMuscle])}{ex.availableInGym ? '' : ` · ${t('content.ex.notInGym')}`}</span>
                </span>
                <span className="num muted">{sets} × {reps}</span>
              </button>
            );
          })}
          {list.data && !list.data.items.length ? <Empty icon="search" title={t('content.ex.none')} /> : null}
        </div>
      </div>
    </Sheet>
  );
}
