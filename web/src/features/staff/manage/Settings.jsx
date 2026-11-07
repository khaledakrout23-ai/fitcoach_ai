// Paramètres de la salle (D19 / M14) : infos, horaires (+ ramadan), fonctionnalités, langues, paiements,
// confidentialité, affluence et zones. Un seul enregistrement pour tout l'écran.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { useAuth } from '../../../lib/auth';
import { useLoad } from '../../../lib/hooks';
import {
  Button, Field, Input, Select, ToggleRow, Toggle, Chip, useToast, Icon, IconButton,
  PageSkeleton, ErrorState, FormError,
} from '../../../components';
import { PageHead, useMeta } from './shared';

const FEATURES = ['live', 'alternatives', 'reports', 'coach', 'meals', 'painProgram', 'inAppPurchase'];
const DAYS = ['week', 'sat', 'sun'];
const LANGS = ['fr', 'ar', 'en'];
const METHODS = ['ESPECES', 'CARTE', 'D17', 'FLOUCI', 'VIREMENT'];
const RETENTION = [3, 6, 12, 24, 36];
const PHONE = /^\+?[\d\s]{8,16}$/;

export default function Settings() {
  const { t, label } = useI18n();
  const { refresh } = useAuth();
  const { toast } = useToast();
  const meta = useMeta();
  const loaded = useLoad(() => api.get('/staff/settings'), []);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [zone, setZone] = useState('');

  useEffect(() => {
    if (loaded.data) setForm(structuredClone(loaded.data));
  }, [loaded.data]);
  const dirty = useMemo(() => form && loaded.data && JSON.stringify(form) !== JSON.stringify(loaded.data), [form, loaded.data]);

  const g = form?.gym;
  const s = form?.settings;
  const setGym = (k, v) => setForm((f) => ({ ...f, gym: { ...f.gym, [k]: v } }));
  const setS = (section, k, v) => setForm((f) => ({ ...f, settings: { ...f.settings, [section]: { ...f.settings[section], [k]: v } } }));
  const setHours = (scope, day, v) =>
    setForm((f) => {
      const hours = { ...f.gym.hours };
      if (scope === 'ramadan') hours.ramadan = { ...hours.ramadan, [day]: v };
      else hours[day] = v;
      return { ...f, gym: { ...f.gym, hours } };
    });

  const errors = {};
  if (g) {
    if (!g.name?.trim()) errors.name = t('manage.settings.required');
    if (g.phone && !PHONE.test(g.phone.trim())) errors.phone = t('manage.settings.phoneInvalid');
    if (!(Number(g.capacity) >= 1 && Number(g.capacity) <= 5000)) errors.capacity = t('manage.settings.capacityInvalid');
    const badRange = (r) => r && !(r[0] && r[1] && r[0] < r[1]);
    if (DAYS.some((d) => badRange(g.hours?.[d])) || (g.hours?.ramadan && DAYS.some((d) => badRange(g.hours.ramadan[d])))) errors.hours = t('manage.settings.hoursInvalid');
    if (!s.zones.length) errors.zones = t('manage.settings.zonesEmpty');
  }
  const valid = Object.keys(errors).length === 0;

  async function save() {
    if (!valid || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        gym: { name: g.name.trim(), address: g.address || '', city: g.city || '', phone: g.phone?.trim() || '', capacity: Number(g.capacity), hours: g.hours },
        settings: { features: s.features, languages: s.languages, paymentMethods: s.paymentMethods, live: s.live, privacy: s.privacy, zones: s.zones },
      };
      const r = await api.put('/staff/settings', body);
      loaded.setData(r);
      toast({ text: t('manage.settings.saved'), icon: 'check' });
      refresh().catch(() => {});
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  const saveBtn = (
    <Button variant="primary" onClick={save} disabled={!dirty || !valid} loading={saving}>
      {t('action.save')}
    </Button>
  );
  const head = <PageHead title={t('manage.settings.title')} subtitle={loaded.data?.gym.name} back="/salle/plus" actions={<span className="hide-phone">{saveBtn}</span>} />;
  if (loaded.loading && !loaded.data) return (<>{head}<PageSkeleton cards={4} /></>);
  if (loaded.error && !loaded.data) return (<>{head}<ErrorState error={loaded.error} onRetry={loaded.reload} /></>);
  if (!form) return head;

  const hoursRow = (scope, day) => {
    const range = scope === 'ramadan' ? g.hours.ramadan?.[day] : g.hours[day];
    const open = Boolean(range);
    return (
      <div key={`${scope}-${day}`} className="mg-hours">
        <span className="row-2">
          <Toggle checked={open} onChange={(v) => setHours(scope, day, v ? ['08:00', '20:00'] : null)} label={t(`manage.settings.day.${day}`)} />
          <span>{t(`manage.settings.day.${day}`)}</span>
        </span>
        {open ? (
          <span className="times" dir="ltr">
            <Input type="time" value={range[0]} onChange={(e) => setHours(scope, day, [e.target.value, range[1]])} aria-label={t('manage.settings.opens')} />
            <span className="muted">–</span>
            <Input type="time" value={range[1]} onChange={(e) => setHours(scope, day, [range[0], e.target.value])} aria-label={t('manage.settings.closes')} />
          </span>
        ) : (
          <span className="muted">{t('manage.settings.closed')}</span>
        )}
      </div>
    );
  };

  const activeMethods = METHODS.filter((m) => s.paymentMethods[m]).length;

  return (
    <>
      {head}
      <div className="mg-cols">
        <div className="stack">
          <section className="card pad-lg stack">
            <h2 className="card-title">{t('manage.settings.gym')}</h2>
            <Field label={t('manage.settings.name')} error={errors.name}>
              <Input value={g.name || ''} maxLength={120} onChange={(e) => setGym('name', e.target.value)} invalid={Boolean(errors.name)} />
            </Field>
            <Field label={t('manage.settings.address')}>
              <Input value={g.address || ''} maxLength={200} onChange={(e) => setGym('address', e.target.value)} />
            </Field>
            <div className="mg-fields">
              <Field label={t('manage.settings.city')}>
                <Input value={g.city || ''} maxLength={80} onChange={(e) => setGym('city', e.target.value)} />
              </Field>
              <Field label={t('manage.settings.phone')} error={errors.phone}>
                <Input value={g.phone || ''} dir="ltr" inputMode="tel" maxLength={30} onChange={(e) => setGym('phone', e.target.value)} invalid={Boolean(errors.phone)} />
              </Field>
            </div>
          </section>

          <section className="card pad-lg stack">
            <h2 className="card-title">{t('manage.settings.hours')}</h2>
            {DAYS.map((d) => hoursRow('main', d))}
            <div className="row between mt-2">
              <span className="w500">{t('manage.settings.ramadan')}</span>
              {g.hours.ramadan ? (
                <Button size="sm" variant="text" onClick={() => setGym('hours', { ...g.hours, ramadan: undefined })}>
                  {t('manage.settings.ramadanRemove')}
                </Button>
              ) : (
                <Button size="sm" variant="text" onClick={() => setGym('hours', { ...g.hours, ramadan: { week: ['10:00', '16:00'], sat: ['10:00', '16:00'], sun: null } })}>
                  {t('manage.settings.configure')}
                </Button>
              )}
            </div>
            {g.hours.ramadan ? DAYS.map((d) => hoursRow('ramadan', d)) : null}
            {errors.hours ? <p className="small danger-text">{errors.hours}</p> : null}
          </section>
        </div>

        <div className="stack">
          <section className="card pad-lg stack-2">
            <h2 className="card-title">{t('manage.settings.features')}</h2>
            <p className="caption muted">{t('manage.settings.featuresHint')}</p>
            {FEATURES.map((k) => (
              <ToggleRow key={k} title={t(`manage.settings.feature.${k}`)} subtitle={t(`manage.settings.feature.${k}.sub`)} checked={s.features[k]} onChange={(v) => setS('features', k, v)} />
            ))}
          </section>

          <section className="card pad-lg stack">
            <h2 className="card-title">{t('manage.settings.live')}</h2>
            <div className="mg-fields">
              <Field label={t('manage.settings.capacity')} error={errors.capacity}>
                <Input type="number" min={1} max={5000} value={g.capacity ?? ''} onChange={(e) => setGym('capacity', e.target.value)} invalid={Boolean(errors.capacity)} />
              </Field>
              <Field label={t('manage.settings.calm')} hint={t('manage.settings.calmHint')}>
                <Input type="number" min={0} max={2000} value={s.live.calmThreshold} onChange={(e) => setS('live', 'calmThreshold', Number(e.target.value))} />
              </Field>
              <Field label={t('manage.settings.alert')} hint={t('manage.settings.alertHint')}>
                <Input type="number" min={1} max={5000} value={s.live.alertAbove} onChange={(e) => setS('live', 'alertAbove', Number(e.target.value))} />
              </Field>
              <Field label={t('manage.settings.autoCheckout')}>
                <Input type="number" min={1} max={12} value={s.live.autoCheckoutHours} onChange={(e) => setS('live', 'autoCheckoutHours', Number(e.target.value))} suffix={t('unit.h')} />
              </Field>
            </div>
          </section>

          <section className="card pad-lg stack-2">
            <h2 className="card-title">{t('manage.settings.zones')}</h2>
            <p className="caption muted">{t('manage.settings.zonesHint')}</p>
            <div className="chips">
              {s.zones.map((z) => (
                <span key={z} className="chip" style={{ paddingInlineEnd: 4 }}>
                  {z}
                  <IconButton icon="x" size={16} plain label={t('manage.settings.zoneRemove', { zone: z })} style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }} onClick={() => setForm((f) => ({ ...f, settings: { ...f.settings, zones: f.settings.zones.filter((x) => x !== z) } }))} />
                </span>
              ))}
            </div>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                const z = zone.trim().slice(0, 40);
                if (z && !s.zones.includes(z) && s.zones.length < 20) setForm((f) => ({ ...f, settings: { ...f.settings, zones: [...f.settings.zones, z] } }));
                setZone('');
              }}
            >
              <Input className="grow" value={zone} maxLength={40} placeholder={t('manage.settings.zonePh')} onChange={(e) => setZone(e.target.value)} />
              <Button type="submit" icon="plus" disabled={!zone.trim()}>
                {t('action.add')}
              </Button>
            </form>
            {errors.zones ? <p className="small danger-text">{errors.zones}</p> : null}
          </section>
        </div>

        <div className="stack">
          <section className="card pad-lg stack-2">
            <h2 className="card-title">{t('manage.settings.languages')}</h2>
            {LANGS.map((l) => (
              <div key={l} className="mg-kv">
                <span className="row-2" style={{ color: 'var(--text)' }}>
                  <Toggle
                    checked={s.languages[l]}
                    disabled={s.languages.default === l}
                    onChange={(v) => setS('languages', l, v)}
                    label={t(`manage.settings.lang.${l}`)}
                  />
                  {t(`manage.settings.lang.${l}`)}
                </span>
                {s.languages.default === l ? (
                  <span className="caption muted">{t('manage.settings.default')}</span>
                ) : s.languages[l] ? (
                  <Button size="xs" variant="text" onClick={() => setS('languages', 'default', l)}>
                    {t('manage.settings.makeDefault')}
                  </Button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </section>

          <section className="card pad-lg stack-2">
            <div className="row between">
              <h2 className="card-title">{t('manage.settings.payments')}</h2>
              <span className="caption muted">{t('manage.settings.activeCount', { n: activeMethods })}</span>
            </div>
            <div className="chips">
              {METHODS.map((m) => (
                <Chip key={m} selected={s.paymentMethods[m]} onClick={() => (s.paymentMethods[m] && activeMethods <= 1 ? null : setS('paymentMethods', m, !s.paymentMethods[m]))}>
                  {label(meta.data?.paymentMethods?.[m]) || m}
                </Chip>
              ))}
            </div>
          </section>

          <section className="card pad-lg stack-2">
            <h2 className="card-title">{t('manage.settings.privacy')}</h2>
            <div className="toggle-row">
              <Icon name="lock" className="muted" />
              <div className="grow">
                <div className="w500">{t('manage.settings.countOnly')}</div>
                <div className="caption muted">{t('manage.settings.countOnlySub')}</div>
              </div>
            </div>
            <ToggleRow title={t('manage.settings.showCount')} subtitle={t('manage.settings.showCountSub')} checked={s.live.showCount} onChange={(v) => setS('live', 'showCount', v)} />
            <Field label={t('manage.settings.retention')} hint={t('manage.settings.retentionHint')}>
              <Select value={s.privacy.checkinRetentionMonths} onChange={(e) => setS('privacy', 'checkinRetentionMonths', Number(e.target.value))}>
                {[...new Set([...RETENTION, s.privacy.checkinRetentionMonths])].sort((a, b) => a - b).map((n) => (
                  <option key={n} value={n}>
                    {t('manage.settings.months', { n })}
                  </option>
                ))}
              </Select>
            </Field>
          </section>
        </div>
      </div>
      <FormError error={error} />
      <div className="sticky-bar only-phone-bar">{saveBtn}</div>
    </>
  );
}
