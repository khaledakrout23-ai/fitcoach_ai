// Salles (administration Kammel) : liste, création avec le premier gérant (mot de passe provisoire), modification,
// suppression avec confirmation tapée
import { useState } from 'react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useLoad } from '../../lib/hooks';
import { Button, IconButton, Field, Input, Sheet, StatusPill, Toggle, useToast, PageSkeleton, Empty, ErrorState, FormError, Banner } from '../../components';
import { PageHead, TempPassword } from '../staff/manage/shared';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[\d\s]{8,16}$/;
const DAYS = ['week', 'sat', 'sun'];

export default function Gyms() {
  const { t, fmt } = useI18n();
  const gyms = useLoad(() => api.get('/admin/gyms'), []);
  const [form, setForm] = useState(null); // 'new' | gym
  const [deleting, setDeleting] = useState(null);

  return (
    <>
      <PageHead
        title={t('admin.gyms.title')}
        subtitle={gyms.data ? t('admin.gyms.subtitle', { n: gyms.data.length }) : ''}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setForm('new')}>
            {t('admin.gyms.add')}
          </Button>
        }
      />
      {gyms.loading && !gyms.data ? (
        <PageSkeleton cards={3} />
      ) : gyms.error && !gyms.data ? (
        <ErrorState error={gyms.error} onRetry={gyms.reload} />
      ) : gyms.data.length === 0 ? (
        <Empty icon="building-2" title={t('admin.gyms.empty')} />
      ) : (
        <div className="table-wrap">
          <table className="table responsive">
            <thead>
              <tr>
                <th>{t('admin.gyms.gym')}</th>
                <th>{t('admin.gyms.manager')}</th>
                <th>{t('admin.gyms.members')}</th>
                <th>{t('admin.gyms.machines')}</th>
                <th>{t('admin.gyms.live')}</th>
                <th aria-label={t('manage.actions')} />
              </tr>
            </thead>
            <tbody>
              {gyms.data.map((g) => (
                <tr key={g.id}>
                  <td>
                    <span className="w500" style={{ display: 'block' }} dir="auto">{g.name}</span>
                    <span className="caption muted">{[g.address, g.city].filter(Boolean).join(', ')}</span>
                  </td>
                  <td data-label={t('admin.gyms.manager')}>
                    {g.manager ? (
                      <>
                        <span style={{ display: 'block' }}>{g.manager.name}</span>
                        <span className="caption muted" dir="ltr">{g.manager.email}</span>
                        {g.manager.mustChangePassword ? <StatusPill tone="warn" icon="clock">{t('admin.gyms.pending')}</StatusPill> : null}
                      </>
                    ) : (
                      <span className="muted">–</span>
                    )}
                  </td>
                  <td data-label={t('admin.gyms.members')}><span className="num">{fmt.num(g.members)}</span></td>
                  <td data-label={t('admin.gyms.machines')}><span className="num">{fmt.num(g.machines)}</span></td>
                  <td data-label={t('admin.gyms.live')}><span className="num">{fmt.num(g.liveCount)}</span></td>
                  <td className="actions-cell">
                    <span className="row-2" style={{ justifyContent: 'flex-end' }}>
                      <IconButton icon="pencil" size={18} label={t('action.edit')} onClick={() => setForm(g)} />
                      <IconButton icon="trash-2" size={18} label={t('action.delete')} onClick={() => setDeleting(g)} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form ? <GymForm gym={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={gyms.reload} /> : null}
      {deleting ? <DeleteGym gym={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); gyms.reload(); }} /> : null}
    </>
  );
}

function GymForm({ gym, onClose, onSaved }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [form, setForm] = useState(() => ({
    name: gym?.name || '',
    address: gym?.address || '',
    city: gym?.city || '',
    phone: gym?.phone || '',
    capacity: gym?.capacity ?? 100,
    hours: gym?.hours || { week: ['06:00', '23:00'], sat: ['07:00', '21:00'], sun: ['08:00', '14:00'] },
    managerName: '',
    managerEmail: '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setDay = (d, v) => setForm((f) => ({ ...f, hours: { ...f.hours, [d]: v } }));

  const phoneOk = !form.phone || PHONE.test(form.phone.trim());
  const capOk = Number(form.capacity) >= 1 && Number(form.capacity) <= 5000;
  const hoursOk = DAYS.every((d) => !form.hours[d] || (form.hours[d][0] && form.hours[d][1] && form.hours[d][0] < form.hours[d][1]));
  const managerOk = gym || (form.managerName.trim().length >= 2 && EMAIL.test(form.managerEmail.trim()));
  const valid = form.name.trim() && phoneOk && capOk && hoursOk && managerOk;

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    const body = { name: form.name.trim(), address: form.address.trim(), city: form.city.trim(), phone: form.phone.trim(), capacity: Number(form.capacity), hours: { week: form.hours.week, sat: form.hours.sat, sun: form.hours.sun, ...(form.hours.ramadan ? { ramadan: form.hours.ramadan } : {}) } };
    try {
      if (gym) {
        await api.put(`/admin/gyms/${gym.id}`, body);
        toast({ text: t('admin.gyms.saved'), icon: 'check' });
        onSaved();
        onClose();
      } else {
        const r = await api.post('/admin/gyms', { ...body, managerName: form.managerName.trim(), managerEmail: form.managerEmail.trim() });
        onSaved();
        setResult(r);
      }
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <Sheet open onClose={onClose} title={t('admin.gyms.created', { name: result.name })} subtitle={t('admin.gyms.createdSub', { name: result.manager.name })}>
        <TempPassword login={result.login} password={result.temporaryPassword} expiresAt={result.temporaryPasswordExpiresAt} onDone={onClose} />
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      variant="drawer"
      title={gym ? gym.name : t('admin.gyms.add')}
      footer={
        <Button variant="primary" block type="submit" form="gym-form" disabled={!valid} loading={saving}>
          {gym ? t('action.save') : t('admin.gyms.create')}
        </Button>
      }
    >
      <form id="gym-form" className="stack-4" onSubmit={submit}>
        <Field label={t('manage.settings.name')}>
          <Input value={form.name} maxLength={120} onChange={set('name')} required />
        </Field>
        <Field label={t('manage.settings.address')} optional>
          <Input value={form.address} maxLength={200} onChange={set('address')} />
        </Field>
        <div className="mg-fields">
          <Field label={t('manage.settings.city')} optional>
            <Input value={form.city} maxLength={80} onChange={set('city')} />
          </Field>
          <Field label={t('manage.settings.phone')} optional error={phoneOk ? null : t('manage.settings.phoneInvalid')}>
            <Input value={form.phone} dir="ltr" inputMode="tel" maxLength={30} onChange={set('phone')} invalid={!phoneOk} />
          </Field>
        </div>
        <Field label={t('manage.settings.capacity')} error={capOk ? null : t('manage.settings.capacityInvalid')}>
          <Input type="number" min={1} max={5000} value={form.capacity} onChange={set('capacity')} invalid={!capOk} />
        </Field>
        <div className="stack-2">
          <span className="w500">{t('manage.settings.hours')}</span>
          {DAYS.map((d) => {
            const r = form.hours[d];
            return (
              <div key={d} className="mg-hours">
                <span className="row-2">
                  <Toggle checked={Boolean(r)} onChange={(v) => setDay(d, v ? ['08:00', '20:00'] : null)} label={t(`manage.settings.day.${d}`)} />
                  {t(`manage.settings.day.${d}`)}
                </span>
                {r ? (
                  <span className="times" dir="ltr">
                    <Input type="time" value={r[0]} onChange={(e) => setDay(d, [e.target.value, r[1]])} aria-label={t('manage.settings.opens')} />
                    <span className="muted">–</span>
                    <Input type="time" value={r[1]} onChange={(e) => setDay(d, [r[0], e.target.value])} aria-label={t('manage.settings.closes')} />
                  </span>
                ) : (
                  <span className="muted">{t('manage.settings.closed')}</span>
                )}
              </div>
            );
          })}
          {hoursOk ? null : <p className="small danger-text">{t('manage.settings.hoursInvalid')}</p>}
        </div>
        {gym ? null : (
          <div className="card flat stack">
            <span className="w500">{t('admin.gyms.firstManager')}</span>
            <span className="caption muted">{t('admin.gyms.firstManagerHint')}</span>
            <Field label={t('manage.team.name')}>
              <Input value={form.managerName} maxLength={100} autoComplete="off" onChange={set('managerName')} />
            </Field>
            <Field label={t('manage.team.email')} error={form.managerEmail && !EMAIL.test(form.managerEmail.trim()) ? t('manage.team.emailInvalid') : null}>
              <Input type="email" dir="ltr" autoComplete="off" value={form.managerEmail} onChange={set('managerEmail')} />
            </Field>
          </div>
        )}
        <FormError error={error} />
      </form>
    </Sheet>
  );
}

function DeleteGym({ gym, onClose, onDeleted }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ok = typed.trim() === gym.name;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.del(`/admin/gyms/${gym.id}`);
      toast({ text: t('admin.gyms.deleted'), icon: 'trash-2' });
      onDeleted();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('admin.gyms.deleteTitle', { name: gym.name })}
      footer={
        <Button variant="danger-solid" block disabled={!ok} loading={busy} onClick={remove}>
          {t('admin.gyms.deleteBtn')}
        </Button>
      }
    >
      <div className="stack-4">
        <Banner tone="danger" icon="triangle-alert">
          {gym.members ? t('admin.gyms.deleteHasMembers', { n: gym.members }) : t('admin.gyms.deleteWarn')}
        </Banner>
        <Field label={t('admin.gyms.typeName', { name: gym.name })}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" dir="auto" />
        </Field>
        <FormError error={error} />
      </div>
    </Sheet>
  );
}
