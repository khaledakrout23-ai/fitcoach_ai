// Machines de la salle (D10 / M10) : filtres par zone et état, tableau, ajout / modification, étiquettes QR
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { useAuth } from '../../../lib/auth';
import { can } from '../../../lib/permissions';
import { useLoad, localDate } from '../../../lib/hooks';
import { shrinkPhoto } from '../../../lib/photo';
import {
  Button, IconButton, Field, Input, Select, Segmented, ToggleRow, Chip, Sheet, useToast,
  PageSkeleton, Empty, ErrorState, FormError, Banner, Num,
} from '../../../components';
import { PageHead, MachineStatus, Thumb, machineName } from './shared';

const STATUSES = ['OK', 'SIGNALEE', 'REPARATION'];

export default function Machines() {
  const { t, fmt } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const list = useLoad(() => api.get('/staff/machines'), []);
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null); // null | 'new' | machine
  const writable = can(user, 'machines.write');
  const back = can(user, 'members.read') ? '/salle/plus' : null;

  const data = list.data;
  const items = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data.items;
    if (filter === 'status:SIGNALEE') return data.items.filter((m) => m.status === 'SIGNALEE');
    if (filter === 'status:REPARATION') return data.items.filter((m) => m.status === 'REPARATION');
    return data.items.filter((m) => m.zone === filter.slice(5));
  }, [data, filter]);

  const subtitle = data
    ? [
        t('manage.machines.count', { n: data.counts.all }),
        data.counts.signalees ? t('manage.machines.reportedCount', { n: data.counts.signalees }) : null,
        data.counts.reparation ? t('manage.machines.repairCount', { n: data.counts.reparation }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const head = (
    <PageHead
      title={t('manage.machines.title')}
      subtitle={subtitle}
      back={back}
      actions={
        <>
          <Button icon="printer" to="qr">
            {t('manage.machines.printQr')}
          </Button>
          {writable ? (
            <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
              {t('manage.machines.add')}
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (list.loading && !data) return (<>{head}<PageSkeleton cards={4} /></>);
  if (list.error && !data) return (<>{head}<ErrorState error={list.error} onRetry={list.reload} /></>);

  const chips = [
    { value: 'all', label: t('manage.machines.all'), count: data.counts.all },
    ...data.zones.map((z) => ({ value: `zone:${z}`, label: z, count: data.counts.byZone[z] || 0 })),
    { value: 'status:SIGNALEE', label: t('manage.machines.reported'), count: data.counts.signalees },
    ...(data.counts.reparation ? [{ value: 'status:REPARATION', label: t('manage.machineStatus.REPARATION'), count: data.counts.reparation }] : []),
  ];

  return (
    <>
      {head}
      <div className="chips scroll" role="group" aria-label={t('manage.machines.filter')}>
        {chips.map((c) => (
          <Chip key={c.value} selected={filter === c.value} count={c.count} onClick={() => setFilter(c.value)}>
            {c.label}
          </Chip>
        ))}
      </div>

      {items.length === 0 ? (
        <Empty icon="dumbbell" title={t('manage.machines.empty')} action={writable ? <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>{t('manage.machines.add')}</Button> : null} />
      ) : (
        <>
          <div className="table-wrap desk-only">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('manage.machines.code')}</th>
                  <th>{t('manage.machines.machine')}</th>
                  <th>{t('manage.machines.zone')}</th>
                  <th>{t('manage.machines.state')}</th>
                  <th>{t('manage.machines.lastMaintenance')}</th>
                  <th>{t('manage.machines.reports30')}</th>
                  <th aria-label={t('manage.actions')} />
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id} className={writable ? 'clickable' : ''} onClick={writable ? () => setEditing(m) : undefined}>
                    <td className="code">
                      <span className="num">{m.code ? `#${m.code}` : '–'}</span>
                    </td>
                    <td>
                      <span className="mg-cell">
                        <Thumb />
                        <span>
                          <span className="w500" dir="auto">{m.label}</span>
                          {m.outOfService ? <span className="sub danger-text">{t('manage.machines.outOfService')}</span> : null}
                        </span>
                      </span>
                    </td>
                    <td>{m.zone}</td>
                    <td>
                      <MachineStatus status={m.status} />
                    </td>
                    <td className="muted">{m.lastMaintenanceAt ? fmt.shortDate(m.lastMaintenanceAt) : '–'}</td>
                    <td>
                      <Num className="w500">{fmt.num(m.reports30d)}</Num>
                    </td>
                    <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                      <span className="row-2" style={{ justifyContent: 'flex-end' }}>
                        <IconButton icon="qr-code" size={18} label={t('manage.machines.qrOne', { name: machineName(m) })} onClick={() => navigate(`qr?id=${m.id}`)} />
                        {writable ? <IconButton icon="pencil" size={18} label={t('action.edit')} onClick={() => setEditing(m)} /> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mg-list phone-list">
            {items.map((m) => {
              const inner = (
                <>
                  <Thumb />
                  <span className="grow">
                    <span className="title" dir="auto">
                      {m.label} {m.code ? <span className="code num">#{m.code}</span> : null}
                    </span>
                    <span className="sub" style={{ display: 'block' }}>
                      {m.zone}
                      {m.outOfService ? ` · ${t('manage.machines.outOfService')}` : ''}
                    </span>
                  </span>
                  <MachineStatus status={m.status} />
                </>
              );
              return writable ? (
                <button key={m.id} type="button" className="mg-item" onClick={() => setEditing(m)}>
                  {inner}
                </button>
              ) : (
                <div key={m.id} className="mg-item">
                  {inner}
                </div>
              );
            })}
          </div>
        </>
      )}

      {editing ? (
        <MachineForm
          machine={editing === 'new' ? null : editing}
          zones={data.zones}
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

function MachineForm({ machine, zones, onClose, onSaved }) {
  const { t, name } = useI18n();
  const { toast } = useToast();
  const equipment = useLoad(() => api.get('/staff/equipment'), []);
  const fileRef = useRef(null);
  const [form, setForm] = useState(() => ({
    label: machine?.label || '',
    code: machine?.code || '',
    equipmentId: machine?.equipment?.id ? String(machine.equipment.id) : '',
    zone: machine?.zone || zones[0] || '',
    status: machine?.status || 'OK',
    outOfService: Boolean(machine?.outOfService),
    lastMaintenanceAt: machine?.lastMaintenanceAt || '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [identify, setIdentify] = useState({ state: 'idle' }); // idle | busy | done | error
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e && e.target ? e.target.value : e }));

  const codeOk = !form.code || /^#?[A-Za-z0-9-]{1,10}$/.test(form.code.trim());
  const valid = form.label.trim() && form.equipmentId && form.zone && codeOk;

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIdentify({ state: 'busy' });
    try {
      const image = await shrinkPhoto(file);
      const r = await api.post('/staff/machines/identify', { image });
      setForm((f) => ({ ...f, equipmentId: String(r.equipmentId), label: f.label || r.label || '' }));
      setIdentify({ state: 'done' });
    } catch (err) {
      setIdentify({ state: 'error', error: err.message === 'PHOTO_INVALID' ? { code: 'PHOTO_INVALID' } : err });
    }
  }

  async function save(e) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    const body = {
      label: form.label.trim(),
      equipmentId: Number(form.equipmentId),
      zone: form.zone,
      lastMaintenanceAt: form.lastMaintenanceAt || null,
    };
    if (form.code.trim()) body.code = form.code.trim();
    try {
      if (machine) {
        await api.put(`/staff/machines/${machine.id}`, { ...body, status: form.status, outOfService: form.outOfService });
        toast({ text: t('manage.machines.saved'), icon: 'check' });
      } else {
        await api.post('/staff/machines', body);
        toast({ text: t('manage.machines.added'), icon: 'check' });
      }
      onSaved();
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await api.del(`/staff/machines/${machine.id}`);
      toast({ text: t('manage.machines.deleted'), icon: 'trash-2' });
      onSaved();
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  const eqOptions = (equipment.data || []).filter((eq) => eq.code !== 'poids_du_corps');

  return (
    <Sheet
      open
      onClose={onClose}
      variant="drawer"
      title={machine ? machineName(machine) : t('manage.machines.add')}
      subtitle={machine ? machine.zone : t('manage.machines.addHint')}
      footer={
        <Button variant="primary" block type="submit" form="machine-form" disabled={!valid} loading={saving}>
          {machine ? t('action.save') : t('manage.machines.add')}
        </Button>
      }
    >
      <form id="machine-form" className="stack-4" onSubmit={save}>
        <div className="card flat stack-2">
          <div className="row">
            <span className="grow">
              <span className="w500" style={{ display: 'block' }}>{t('manage.machines.photoTitle')}</span>
              <span className="caption muted">{t('manage.machines.photoHint')}</span>
            </span>
            <Button size="sm" icon="camera" loading={identify.state === 'busy'} onClick={() => fileRef.current?.click()}>
              {t('manage.machines.photoBtn')}
            </Button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={onPhoto} />
          </div>
          {identify.state === 'done' ? <Banner tone="ok" icon="sparkles">{t('manage.machines.recognized')}</Banner> : null}
          {identify.state === 'error' ? <FormError error={identify.error} /> : null}
        </div>

        <Field label={t('manage.machines.type')} error={equipment.error ? t('state.error') : null}>
          <Select value={form.equipmentId} onChange={set('equipmentId')} required>
            <option value="">{t('manage.choose')}</option>
            {eqOptions.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {name(eq)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="mg-fields">
          <Field label={t('manage.machines.label')}>
            <Input value={form.label} onChange={set('label')} maxLength={100} placeholder={t('manage.machines.labelPh')} required />
          </Field>
          <Field label={t('manage.machines.code')} optional error={codeOk ? null : t('manage.machines.codeInvalid')}>
            <Input value={form.code} onChange={set('code')} maxLength={11} placeholder="09" dir="ltr" invalid={!codeOk} />
          </Field>
        </div>
        <div className="mg-fields">
          <Field label={t('manage.machines.zone')}>
            <Select value={form.zone} onChange={set('zone')}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('manage.machines.lastMaintenance')} optional>
            <Input type="date" value={form.lastMaintenanceAt || ''} max={localDate()} onChange={set('lastMaintenanceAt')} />
          </Field>
        </div>

        {machine ? (
          <>
            <Field label={t('manage.machines.state')}>
              <Segmented options={STATUSES.map((s) => ({ value: s, label: t(`manage.machineStatus.${s}`) }))} value={form.status} onChange={set('status')} label={t('manage.machines.state')} />
            </Field>
            <ToggleRow
              title={t('manage.machines.oos')}
              subtitle={t('manage.machines.oosHint')}
              checked={form.outOfService}
              onChange={(v) => setForm((f) => ({ ...f, outOfService: v }))}
            />
          </>
        ) : null}

        <FormError error={error} />

        {machine ? (
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
              {t('manage.machines.deleteConfirm')}
            </Banner>
          ) : (
            <Button variant="danger" icon="trash-2" onClick={() => setConfirmDelete(true)}>
              {t('manage.machines.delete')}
            </Button>
          )
        ) : null}
      </form>
    </Sheet>
  );
}
