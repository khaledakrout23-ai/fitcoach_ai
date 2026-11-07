// Nutrition (D14) : aliments (catalogue Kammel + aliments ajoutés par la salle) et règles de calcul des objectifs (lecture seule)
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { useLoad, useDebounced } from '../../../lib/hooks';
import {
  Button, Field, Input, Sheet, Chip, Icon, StatusPill, useToast, Skeleton,
  PageSkeleton, Empty, ErrorState, FormError, Banner,
} from '../../../components';
import { PageHead, Thumb, useMeta } from '../manage/shared';

const SOURCES = ['all', 'kammel', 'gym'];

export default function Nutrition() {
  const { t, fmt, name } = useI18n();
  const [q, setQ] = useState('');
  const [source, setSource] = useState('all');
  const query = useDebounced(q.trim(), 300);
  const foods = useLoad(() => {
    const p = new URLSearchParams({ source });
    if (query) p.set('q', query);
    return api.get(`/staff/content/foods?${p}`);
  }, [query, source]);
  const [editing, setEditing] = useState(null);
  const items = foods.data?.items || [];

  return (
    <>
      <PageHead
        title={t('content.food.title')}
        subtitle={foods.data ? t('content.food.subtitle', { n: fmt.num(foods.data.total) }) : ''}
        back="/salle/plus"
        actions={
          <>
            <label className="search">
              <Icon name="search" size={20} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('content.food.search')} aria-label={t('content.food.search')} />
            </label>
            <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
              {t('content.food.add')}
            </Button>
          </>
        }
      />
      <div className="split">
        <div className="stack">
          <div className="chips" role="group" aria-label={t('content.food.source')}>
            {SOURCES.map((s) => (
              <Chip key={s} selected={source === s} onClick={() => setSource(s)}>
                {t(`content.food.src.${s}`)}
              </Chip>
            ))}
          </div>
          {foods.loading && !foods.data ? (
            <PageSkeleton cards={4} />
          ) : foods.error && !foods.data ? (
            <ErrorState error={foods.error} onRetry={foods.reload} />
          ) : items.length === 0 ? (
            <Empty icon="utensils" title={t('content.food.none')} />
          ) : (
            <div className="table-wrap">
              <table className="table responsive">
                <thead>
                  <tr>
                    <th>{t('content.food.food')}</th>
                    <th>{t('unit.kcal')}</th>
                    <th style={{ color: 'var(--protein)' }}>{t('content.food.protein')}</th>
                    <th style={{ color: 'var(--carbs)' }}>{t('content.food.carbs')}</th>
                    <th>{t('content.food.fat')}</th>
                    <th>{t('content.food.source')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((f) => (
                    <tr key={f.id} className={f.editable ? 'clickable' : ''} onClick={f.editable ? () => setEditing(f) : undefined}>
                      <td>
                        <span className="mg-cell">
                          <Thumb icon="utensils" />
                          <span>
                            <span className="w500" style={{ display: 'block' }}>{name(f)}</span>
                            <span className="sub">{f.portion}</span>
                          </span>
                        </span>
                      </td>
                      <td data-label={t('unit.kcal')}><span className="num w500">{fmt.num(f.calories)}</span></td>
                      <td data-label={t('content.food.protein')}><span className="num">{fmt.g(f.protein)}</span></td>
                      <td data-label={t('content.food.carbs')}><span className="num">{fmt.g(f.carbs)}</span></td>
                      <td data-label={t('content.food.fat')}><span className="num">{fmt.g(f.fat)}</span></td>
                      <td data-label={t('content.food.source')}>
                        {f.source === 'GYM' ? <StatusPill tone="ember" icon="pencil">{t('content.food.byGym')}</StatusPill> : <StatusPill>{t('content.food.kammel')}</StatusPill>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Rules />
      </div>
      {editing ? <FoodForm food={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); foods.reload(); }} /> : null}
    </>
  );
}

function Rules() {
  const { t, fmt, label } = useI18n();
  const meta = useMeta();
  const rules = useLoad(() => api.get('/staff/content/nutrition-rules'), []);
  const r = rules.data;
  const m = meta.data;
  const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt.num(Math.abs(n))} ${t('unit.kcal')}`;
  return (
    <aside className="card pad-lg stack mg-panel">
      <div>
        <h2 className="card-title">{t('content.food.rules')}</h2>
        <p className="caption muted">{t('content.food.rulesSub')}</p>
      </div>
      {rules.loading && !r ? (
        <Skeleton h={300} />
      ) : rules.error && !r ? (
        <ErrorState compact error={rules.error} onRetry={rules.reload} />
      ) : (
        <>
          <div className="stack-2">
            <span className="w500">{t('content.food.base')}</span>
            <span className="tag">{t('content.food.mifflin')}</span>
            <span className="caption muted">{t('content.food.bmr')}</span>
            {Object.entries(r.activityFactors).map(([k, v]) => (
              <div key={k} className="mg-kv">
                <span>{label(m?.activities?.[k])}</span>
                <span className="num">× {fmt.num(v, 3)}</span>
              </div>
            ))}
          </div>
          <div className="stack-2">
            <span className="w500">{t('content.food.delta')}</span>
            {Object.entries(r.goalDelta).map(([k, v]) => (
              <div key={k} className="mg-kv">
                <span>{label(m?.goals?.[k])}</span>
                <span className="num">{signed(v)}</span>
              </div>
            ))}
          </div>
          <div className="stack-2">
            <span className="w500">{t('content.food.split')}</span>
            <span className="caption muted">{t('content.food.splitHint')}</span>
            {Object.entries(r.macroSplit).map(([k, v]) => (
              <div key={k} className="mg-kv">
                <span>{label(m?.dietStyles?.[k])}</span>
                <span className="num">{v.map((x) => Math.round(x * 100)).join(' / ')} %</span>
              </div>
            ))}
          </div>
          <div className="stack-2">
            <span className="w500">{t('content.food.water')}</span>
            <div className="mg-kv">
              <span>{t('content.food.perKg')}</span>
              <span className="num">{fmt.num(r.water.perKg)} {t('unit.ml')}</span>
            </div>
            <div className="mg-kv">
              <span>{t('content.food.perMinute')}</span>
              <span className="num">+{fmt.num(r.water.perSessionMinute)} {t('unit.ml')}</span>
            </div>
            <div className="mg-kv">
              <span>{t('content.food.hot')}</span>
              <span className="num">+{fmt.num(r.water.hot30)} / +{fmt.num(r.water.hot35)} {t('unit.ml')}</span>
            </div>
            <div className="mg-kv">
              <span>{t('content.food.bounds')}</span>
              <span className="num">{fmt.liters(r.water.min)} – {fmt.liters(r.water.max)}</span>
            </div>
          </div>
          <p className="small muted">
            {t('content.food.example', {
              kg: fmt.num(r.example.profile.weight),
              goal: fmt.num(r.example.profile.goalWeight, 1),
              kcal: fmt.num(r.example.calories),
              p: fmt.num(r.example.protein),
              c: fmt.num(r.example.carbs),
              f: fmt.num(r.example.fat),
              water: fmt.liters(r.example.waterMl),
              maintenance: fmt.num(r.example.maintenance),
            })}
          </p>
        </>
      )}
    </aside>
  );
}

function FoodForm({ food, onClose, onSaved }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [form, setForm] = useState(() => ({
    nameFr: food?.nameFr || '',
    nameAr: food?.nameAr || '',
    nameEn: food?.nameEn || '',
    portion: food?.portion || '',
    calories: food?.calories ?? '',
    protein: food?.protein ?? '',
    carbs: food?.carbs ?? '',
    fat: food?.fat ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const numOk = (v, max) => v === '' || (Number(v) >= 0 && Number(v) <= max);
  const valid =
    form.nameFr.trim() && form.portion.trim() && form.calories !== '' && numOk(form.calories, 3000) && ['protein', 'carbs', 'fat'].every((k) => numOk(form[k], 400));

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    const body = { nameFr: form.nameFr.trim(), portion: form.portion.trim(), calories: Number(form.calories) };
    if (form.nameAr.trim()) body.nameAr = form.nameAr.trim();
    if (form.nameEn.trim()) body.nameEn = form.nameEn.trim();
    for (const k of ['protein', 'carbs', 'fat']) body[k] = form[k] === '' ? 0 : Number(form[k]);
    try {
      if (food) await api.put(`/staff/content/foods/${food.id}`, body);
      else await api.post('/staff/content/foods', body);
      toast({ text: t('content.food.saved'), icon: 'check' });
      onSaved();
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await api.del(`/staff/content/foods/${food.id}`);
      toast({ text: t('content.food.deleted'), icon: 'trash-2' });
      onSaved();
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={food ? t('content.food.edit') : t('content.food.add')}
      footer={
        <Button variant="primary" block type="submit" form="food-form" disabled={!valid} loading={saving}>
          {t('action.save')}
        </Button>
      }
    >
      <form id="food-form" className="stack-4" onSubmit={submit}>
        <Field label={t('content.food.nameFr')}>
          <Input value={form.nameFr} maxLength={120} onChange={set('nameFr')} required />
        </Field>
        <div className="mg-fields">
          <Field label={t('content.food.nameAr')} optional>
            <Input value={form.nameAr} dir="rtl" lang="ar" maxLength={120} onChange={set('nameAr')} />
          </Field>
          <Field label={t('content.food.nameEn')} optional>
            <Input value={form.nameEn} dir="ltr" lang="en" maxLength={120} onChange={set('nameEn')} />
          </Field>
        </div>
        <div className="mg-fields">
          <Field label={t('content.food.portion')} hint={t('content.food.portionHint')}>
            <Input value={form.portion} maxLength={60} onChange={set('portion')} required />
          </Field>
          <Field label={t('unit.kcal')} error={numOk(form.calories, 3000) ? null : t('content.food.range')}>
            <Input type="number" min={0} max={3000} value={form.calories} onChange={set('calories')} required />
          </Field>
        </div>
        <div className="mg-fields three">
          {['protein', 'carbs', 'fat'].map((k) => (
            <Field key={k} label={t(`content.food.${k}`)} error={numOk(form[k], 400) ? null : t('content.food.range')}>
              <Input type="number" min={0} max={400} value={form[k]} onChange={set(k)} suffix={t('unit.g')} />
            </Field>
          ))}
        </div>
        <FormError error={error} />
        {food ? (
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
              {t('content.food.deleteConfirm')}
            </Banner>
          ) : (
            <Button variant="danger" icon="trash-2" onClick={() => setConfirm(true)}>
              {t('content.food.delete')}
            </Button>
          )
        ) : null}
      </form>
    </Sheet>
  );
}
