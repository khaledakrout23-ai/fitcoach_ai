// D8 — Formules et tarifs : cartes (membres, part des revenus), éditeur (gérant), règles communes. Lecture seule pour l'accueil.
import { useEffect, useState } from 'react';
import { Button, Empty, ErrorState, Field, FormError, Input, PageSkeleton, Segmented, Select, Sheet, Toggle, ToggleRow, useToast, Banner } from '../../../components';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { useLoad } from '../../../lib/hooks';
import { can } from '../../../lib/permissions';
import './ops.css';

const NEW_PLAN = { nameFr: '', nameAr: '', nameEn: '', duration: 1, durationUnit: 'MONTH', price: '', accessHours: 'ALL', inApp: false, freezeDays: 0, visible: true, noteFr: '', noteAr: '' };

function durationText(t, p) {
  return t(p.durationUnit === 'DAY' ? 'ops.plans.days' : 'ops.plans.months', { n: p.duration });
}

function PlanEditor({ open, onClose, plan, onSaved }) {
  const { t, fmt } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState(NEW_PLAN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inAppEnabled = Boolean(user?.gym?.settings?.features?.inAppPurchase);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      plan
        ? { ...NEW_PLAN, ...plan, price: String(plan.price), nameEn: plan.nameEn || '', noteFr: plan.noteFr || '', noteAr: plan.noteAr || '' }
        : NEW_PLAN
    );
  }, [open, plan]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v && v.target ? v.target.value : v }));
  const price = Number(String(form.price).replace(',', '.'));
  const valid = form.nameFr.trim() && form.nameAr.trim() && Number.isFinite(price) && price >= 0 && String(form.price).trim() !== '' && form.duration >= 1;

  const save = async () => {
    setBusy(true);
    setError(null);
    const body = {
      nameFr: form.nameFr.trim(),
      nameAr: form.nameAr.trim(),
      nameEn: form.nameEn.trim() || null,
      duration: Number(form.duration),
      durationUnit: form.durationUnit,
      price,
      accessHours: form.accessHours,
      inApp: form.inApp,
      freezeDays: Number(form.freezeDays) || 0,
      visible: form.visible,
      noteFr: form.noteFr.trim() || null,
      noteAr: form.noteAr.trim() || null,
    };
    try {
      if (plan) await api.put(`/staff/plans/${plan.id}`, body);
      else await api.post('/staff/plans', body);
      toast({ text: t('ops.saved'), icon: 'check' });
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    setBusy(true);
    try {
      await api.post(`/staff/plans/${plan.id}/archive`);
      toast({ text: t('ops.plans.archived'), icon: 'check' });
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const durations = form.durationUnit === 'DAY' ? [1, 7, 10, 15] : [1, 2, 3, 6, 12];
  if (!durations.includes(Number(form.duration))) durations.push(Number(form.duration));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="drawer"
      title={plan ? t('ops.plans.editTitle', { name: plan.nameFr }) : t('ops.plans.new')}
      footer={
        <div className="ops-sheet-actions">
          {plan && !plan.archived ? (
            <Button variant="danger" icon="trash-2" onClick={archive} disabled={busy}>
              {t('ops.plans.archive')}
            </Button>
          ) : null}
          <Button variant="primary" className="grow" disabled={!valid} loading={busy} onClick={save}>
            {t('action.save')}
          </Button>
        </div>
      }
    >
      <div className="stack-4">
        <Field label={t('ops.plans.nameFr')}>
          <Input value={form.nameFr} onChange={set('nameFr')} maxLength={60} />
        </Field>
        <Field label={t('ops.plans.nameAr')}>
          <Input value={form.nameAr} onChange={set('nameAr')} maxLength={60} dir="rtl" lang="ar" />
        </Field>
        <Field label={t('ops.plans.nameEn')} optional>
          <Input value={form.nameEn} onChange={set('nameEn')} maxLength={60} dir="ltr" />
        </Field>
        <div className="grid-2">
          <Field label={t('ops.plans.duration')}>
            <div className="row-2">
              <Select value={String(form.duration)} onChange={(e) => set('duration')(Number(e.target.value))} aria-label={t('ops.plans.duration')}>
                {durations.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
              <Select value={form.durationUnit} onChange={(e) => setForm((f) => ({ ...f, durationUnit: e.target.value, duration: 1 }))} aria-label={t('ops.plans.unit')}>
                <option value="MONTH">{t('ops.plans.unitMonth')}</option>
                <option value="DAY">{t('ops.plans.unitDay')}</option>
              </Select>
            </div>
          </Field>
          <Field label={t('ops.plans.price')}>
            <Input inputMode="decimal" value={form.price} onChange={(e) => set('price')(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))} suffix={t('unit.tnd')} dir="ltr" />
          </Field>
        </div>
        <div className="stack-2">
          <span className="label w500">{t('ops.plans.hours')}</span>
          <Segmented
            value={form.accessHours}
            onChange={set('accessHours')}
            label={t('ops.plans.hours')}
            options={[
              { value: 'ALL', label: t('ops.plans.allDay') },
              { value: 'OFF_PEAK', label: t('ops.plans.offPeak') },
            ]}
          />
          {form.accessHours === 'OFF_PEAK' ? <p className="caption muted">{t('ops.plans.offPeakHint')}</p> : null}
        </div>
        <ToggleRow title={t('ops.plans.inApp')} subtitle={inAppEnabled ? t('ops.plans.inAppSub') : t('ops.plans.inAppOff')} checked={form.inApp} onChange={set('inApp')} />
        <ToggleRow
          title={t('ops.plans.freeze')}
          subtitle={form.freezeDays > 0 ? t('ops.plans.freezeUpTo', { n: form.freezeDays }) : t('ops.plans.freezeNo')}
          checked={form.freezeDays > 0}
          onChange={(v) => set('freezeDays')(v ? 15 : 0)}
        />
        {form.freezeDays > 0 ? (
          <Field label={t('ops.plans.freezeDays')}>
            <Input type="number" min={1} max={180} value={form.freezeDays} onChange={(e) => set('freezeDays')(Math.min(180, Math.max(0, Number(e.target.value) || 0)))} dir="ltr" />
          </Field>
        ) : null}
        <ToggleRow title={t('ops.plans.visible')} subtitle={t('ops.plans.visibleSub')} checked={form.visible} onChange={set('visible')} />
        <Field label={t('ops.plans.noteFr')} optional>
          <Input value={form.noteFr} onChange={set('noteFr')} maxLength={120} />
        </Field>
        <Field label={t('ops.plans.noteAr')} optional>
          <Input value={form.noteAr} onChange={set('noteAr')} maxLength={120} dir="rtl" lang="ar" />
        </Field>
        {plan ? <p className="small muted">{t('ops.plans.priceNote', { n: plan.activeMembers, price: fmt.money(plan.price) })}</p> : null}
        <FormError error={error} />
      </div>
    </Sheet>
  );
}

function RulesSheet({ open, onClose, rules, onSaved }) {
  const { t } = useI18n();
  const { refresh } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState(rules);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setForm({ ...rules });
      setError(null);
    }
  }, [open, rules]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value.replace(/[^\d.]/g, '').slice(0, 6) }));
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.put('/staff/plans-rules', { registrationFee: Number(form.registrationFee) || 0, graceDays: Number(form.graceDays) || 0, maxFreezeDaysPerYear: Number(form.maxFreezeDaysPerYear) || 0 });
      toast({ text: t('ops.saved'), icon: 'check' });
      refresh().catch(() => {});
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('ops.plans.rules')}
      footer={
        <Button variant="primary" block loading={busy} onClick={save}>
          {t('action.save')}
        </Button>
      }
    >
      <div className="stack-4">
        <Field label={t('ops.plans.fee')}>
          <Input inputMode="decimal" value={String(form.registrationFee ?? '')} onChange={set('registrationFee')} suffix={t('unit.tnd')} dir="ltr" />
        </Field>
        <Field label={t('ops.plans.grace')} hint={t('ops.plans.graceSub')}>
          <Input inputMode="numeric" value={String(form.graceDays ?? '')} onChange={set('graceDays')} suffix={t('ops.plans.daysUnit')} dir="ltr" />
        </Field>
        <Field label={t('ops.plans.maxFreeze')}>
          <Input inputMode="numeric" value={String(form.maxFreezeDaysPerYear ?? '')} onChange={set('maxFreezeDaysPerYear')} suffix={t('ops.plans.daysUnit')} dir="ltr" />
        </Field>
        <FormError error={error} />
      </div>
    </Sheet>
  );
}

export default function Plans() {
  const { t, fmt, name, lang } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const editable = can(user, 'plans.write');
  const data = useLoad(() => api.get('/staff/plans'), []);
  const [editing, setEditing] = useState(null); // plan | 'new'
  const [rules, setRules] = useState(false);

  const toggleVisible = async (p, visible) => {
    data.setData((d) => ({ ...d, plans: d.plans.map((x) => (x.id === p.id ? { ...x, visible } : x)) }));
    try {
      await api.put(`/staff/plans/${p.id}`, { visible });
    } catch {
      toast({ text: t('ops.saveFailed'), tone: 'error' });
      data.reload();
    }
  };
  const unarchive = async (p) => {
    try {
      await api.post(`/staff/plans/${p.id}/unarchive`);
      data.reload();
    } catch {
      toast({ text: t('ops.saveFailed'), tone: 'error' });
    }
  };

  const head = (
    <header className="page-head">
      <div className="titles">
        <h1>{t('ops.plans.title')}</h1>
        <p className="subtitle">{t('ops.plans.subtitle')}</p>
      </div>
      {editable ? (
        <div className="actions">
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            {t('ops.plans.new')}
          </Button>
        </div>
      ) : null}
    </header>
  );

  if (!data.data) return <div className="stack-4">{head}{data.error ? <ErrorState error={data.error} onRetry={data.reload} /> : <PageSkeleton cards={3} />}</div>;

  const d = data.data;
  const active = d.plans.filter((p) => !p.archived);
  const archived = d.plans.filter((p) => p.archived);
  const monthName = fmt.date(`${d.month}-01`, { month: 'long' });

  return (
    <div className="stack-4 ops">
      {head}
      {!editable ? <Banner icon="lock">{t('ops.plans.readOnly')}</Banner> : null}
      {active.length ? (
        <div className="ops-plan-cards">
          {active.map((p) => {
            const subline = [durationText(t, p), p.accessHours === 'OFF_PEAK' ? t('ops.plans.offPeak') : t('ops.plans.unlimited')];
            const note = lang === 'ar' ? p.noteAr || p.noteFr : p.noteFr;
            return (
              <article key={p.id} className={`card pad-lg ops-plan ${p.visible ? '' : 'off'}`}>
                <div className="row between row-top">
                  <div className="min0">
                    <h2 className="h3" dir="auto">
                      {name(p)}
                    </h2>
                    <p className="small muted" dir="auto">
                      {note || subline.join(' · ')}
                    </p>
                  </div>
                  {editable ? <Toggle checked={p.visible} onChange={(v) => toggleVisible(p, v)} label={t('ops.plans.visible')} /> : null}
                </div>
                <div className="ops-plan-price">
                  <span className="num">{fmt.num(p.price, 3)}</span> <small>{t('unit.tnd')}</small>
                </div>
                <p className="small muted">
                  {!p.visible
                    ? t('ops.plans.hidden')
                    : p.durationUnit === 'DAY'
                      ? t('ops.plans.sales', { n: p.salesLastMonth, month: monthName })
                      : t('ops.plans.share', { n: p.activeMembers, pct: p.revenueShare })}
                </p>
                {editable ? (
                  <button type="button" className="link-btn ops-plan-edit" onClick={() => setEditing(p)}>
                    {t('action.edit')}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty icon="tag" title={t('ops.renew.noPlans')} />
      )}

      <section className="card pad-lg" aria-labelledby="ops-rules">
        <div className="card-head">
          <h2 id="ops-rules" className="card-title">
            {t('ops.plans.rules')}
          </h2>
          {editable ? (
            <button type="button" className="link-btn" onClick={() => setRules(true)}>
              {t('action.edit')}
            </button>
          ) : null}
        </div>
        <div className="grid-3 ops-rules">
          <div className="card flat">
            <div className="small muted">{t('ops.plans.fee')}</div>
            <div className="h3 num">{fmt.money(d.rules.registrationFee)}</div>
          </div>
          <div className="card flat">
            <div className="small muted">{t('ops.plans.grace')}</div>
            <div className="h3">{t('ops.plans.nDays', { n: d.rules.graceDays })}</div>
            <div className="caption muted">{t('ops.plans.graceSub')}</div>
          </div>
          <div className="card flat">
            <div className="small muted">{t('ops.plans.maxFreeze')}</div>
            <div className="h3">{t('ops.plans.perYear', { n: d.rules.maxFreezeDaysPerYear })}</div>
          </div>
        </div>
      </section>

      {archived.length ? (
        <section className="stack-2" aria-labelledby="ops-arch">
          <h2 id="ops-arch" className="card-title">
            {t('ops.plans.archivedTitle')}
          </h2>
          <ul className="list">
            {archived.map((p) => (
              <li key={p.id} className="list-row">
                <span className="grow">
                  <span dir="auto">{name(p)}</span>
                  <span className="sub">
                    {durationText(t, p)} · <span className="num">{fmt.money(p.price)}</span>
                  </span>
                </span>
                {editable ? (
                  <button type="button" className="link-btn" onClick={() => unarchive(p)}>
                    {t('ops.plans.unarchive')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {editable ? (
        <>
          <PlanEditor open={Boolean(editing)} onClose={() => setEditing(null)} plan={editing === 'new' ? null : editing} onSaved={data.reload} />
          <RulesSheet open={rules} onClose={() => setRules(false)} rules={d.rules} onSaved={data.reload} />
        </>
      ) : null}
    </div>
  );
}
