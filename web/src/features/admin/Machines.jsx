// Machines des salles (administration Kammel) : choix de la salle, liste, ajout par photo (type reconnu par l'IA),
// exercices compatibles et nouveaux exercices proposés par l'IA ajoutés au catalogue avec la machine
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useLoad, useStoredState } from '../../lib/hooks';
import { shrinkPhoto } from '../../lib/photo';
import { Button, Field, Input, Select, Sheet, Checkbox, Banner, useToast, PageSkeleton, Skeleton, Empty, ErrorState, FormError } from '../../components';
import { PageHead, MachineStatus, Thumb, useMeta } from '../staff/manage/shared';

export default function AdminMachines() {
  const { t, fmt, name } = useI18n();
  const gyms = useLoad(() => api.get('/admin/gyms'), []);
  const [gymId, setGymId] = useStoredState('kammel_admin_gym', '');
  const machines = useLoad(() => (gymId ? api.get(`/admin/gyms/${gymId}/machines`) : Promise.resolve(null)), [gymId]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (gyms.data?.length && !gyms.data.some((g) => String(g.id) === String(gymId))) setGymId(String(gyms.data[0].id));
  }, [gyms.data, gymId, setGymId]);

  const gym = gyms.data?.find((g) => String(g.id) === String(gymId));
  const zones = useMemo(() => [...new Set((machines.data || []).map((m) => m.zone).filter(Boolean))], [machines.data]);

  return (
    <>
      <PageHead
        title={t('admin.machines.title')}
        subtitle={t('admin.machines.subtitle')}
        actions={
          <>
            <Select value={gymId} onChange={(e) => setGymId(e.target.value)} aria-label={t('admin.machines.gym')} style={{ minWidth: 200 }}>
              {(gyms.data || []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
            <Button variant="primary" icon="plus" disabled={!gym} onClick={() => setAdding(true)}>
              {t('manage.machines.add')}
            </Button>
          </>
        }
      />
      {gyms.loading && !gyms.data ? (
        <PageSkeleton cards={3} />
      ) : gyms.error && !gyms.data ? (
        <ErrorState error={gyms.error} onRetry={gyms.reload} />
      ) : !gyms.data.length ? (
        <Empty icon="building-2" title={t('admin.gyms.empty')} />
      ) : machines.loading && !machines.data ? (
        <PageSkeleton cards={3} />
      ) : machines.error ? (
        <ErrorState error={machines.error} onRetry={machines.reload} />
      ) : !machines.data?.length ? (
        <Empty icon="dumbbell" title={t('manage.machines.empty')} />
      ) : (
        <div className="table-wrap">
          <table className="table responsive">
            <thead>
              <tr>
                <th>{t('manage.machines.code')}</th>
                <th>{t('manage.machines.machine')}</th>
                <th>{t('manage.machines.type')}</th>
                <th>{t('manage.machines.zone')}</th>
                <th>{t('manage.machines.state')}</th>
                <th>{t('manage.machines.lastMaintenance')}</th>
              </tr>
            </thead>
            <tbody>
              {machines.data.map((m) => (
                <tr key={m.id}>
                  <td className="code"><span className="num">{m.code ? `#${m.code}` : '–'}</span></td>
                  <td>
                    <span className="mg-cell">
                      <Thumb />
                      <span className="w500" dir="auto">{m.label}</span>
                    </span>
                  </td>
                  <td className="muted" data-label={t('manage.machines.type')}>{name(m.equipment)}</td>
                  <td data-label={t('manage.machines.zone')}>{m.zone}</td>
                  <td data-label={t('manage.machines.state')}><MachineStatus status={m.status} /></td>
                  <td className="muted" data-label={t('manage.machines.lastMaintenance')}>{m.lastMaintenanceAt ? fmt.shortDate(m.lastMaintenanceAt) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && gym ? (
        <AddMachine
          gym={gym}
          zones={zones}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            machines.reload();
            gyms.reload();
          }}
        />
      ) : null}
    </>
  );
}

function AddMachine({ gym, zones, onClose, onAdded }) {
  const { t, tp, name, label } = useI18n();
  const { toast } = useToast();
  const meta = useMeta();
  const stats = useLoad(() => api.get('/admin/stats'), []);
  const equipment = useLoad(() => api.get('/equipment'), []);
  const fileRef = useRef(null);
  const [form, setForm] = useState({ equipmentId: '', label: '', code: '', zone: '' });
  const [photo, setPhoto] = useState(null);
  const [identify, setIdentify] = useState({ state: 'idle' });
  const [newType, setNewType] = useState(null);
  const [suggestions, setSuggestions] = useState({ state: 'idle', items: [] });
  const [skipped, setSkipped] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const compatible = useLoad(() => (form.equipmentId ? api.get(`/admin/equipment/${form.equipmentId}/exercises`) : Promise.resolve([])), [form.equipmentId]);

  useEffect(() => {
    setSuggestions({ state: 'idle', items: [] });
    setSkipped(new Set());
  }, [form.equipmentId]);

  const aiEnabled = Boolean(stats.data?.aiEnabled);
  const codeOk = !form.code || /^#?[A-Za-z0-9-]{1,10}$/.test(form.code.trim());
  const valid = form.equipmentId && form.label.trim() && codeOk;
  const kept = suggestions.items.filter((s) => !skipped.has(s.nameFr));

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIdentify({ state: 'busy' });
    setNewType(null);
    try {
      const image = await shrinkPhoto(file);
      setPhoto(image);
      const r = await api.post('/admin/machines/identify', { image });
      setNewType(r.newType || null);
      setForm((f) => ({ ...f, equipmentId: r.equipmentId ? String(r.equipmentId) : f.equipmentId, label: r.label || f.label }));
      setIdentify({ state: r.equipmentId ? 'done' : 'newType' });
    } catch (err) {
      setIdentify({ state: 'error', error: err.message === 'PHOTO_INVALID' ? { code: 'PHOTO_INVALID' } : err });
    }
  }

  async function createType() {
    setError(null);
    try {
      const eq = await api.post('/admin/equipment', newType);
      equipment.reload();
      setForm((f) => ({ ...f, equipmentId: String(eq.id) }));
      setNewType(null);
      setIdentify({ state: 'done' });
    } catch (err) {
      setError(err);
    }
  }

  async function suggest() {
    setSuggestions({ state: 'busy', items: [] });
    try {
      const items = await api.get(`/admin/equipment/${form.equipmentId}/suggestions`);
      setSuggestions({ state: 'done', items: Array.isArray(items) ? items : [] });
    } catch (err) {
      setSuggestions({ state: 'error', items: [], error: err });
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    const body = { equipmentId: Number(form.equipmentId), label: form.label.trim(), newExercises: kept };
    if (form.code.trim()) body.code = form.code.trim();
    if (form.zone) body.zone = form.zone;
    try {
      const r = await api.post(`/admin/gyms/${gym.id}/machines`, body);
      toast({ text: r.createdExercises ? tp('admin.machines.addedWith', r.createdExercises) : t('manage.machines.added'), icon: 'check' });
      onAdded();
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      variant="drawer"
      title={t('manage.machines.add')}
      subtitle={gym.name}
      footer={
        <Button variant="primary" block type="submit" form="admin-machine" disabled={!valid || suggestions.state === 'busy'} loading={saving}>
          {kept.length ? tp('admin.machines.addWith', kept.length) : t('manage.machines.add')}
        </Button>
      }
    >
      <form id="admin-machine" className="stack-4" onSubmit={submit}>
        <div className="card flat stack-2">
          <div className="row">
            <span className="grow">
              <span className="w500" style={{ display: 'block' }}>{t('manage.machines.photoTitle')}</span>
              <span className="caption muted">{t('admin.machines.photoHint')}</span>
            </span>
            <Button size="sm" icon="camera" loading={identify.state === 'busy'} onClick={() => fileRef.current?.click()}>
              {t('manage.machines.photoBtn')}
            </Button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={onPhoto} />
          </div>
          {photo ? <img src={photo} alt="" className="mg-photo" style={{ maxHeight: 180 }} /> : null}
          {identify.state === 'done' ? <Banner tone="ok" icon="sparkles">{t('manage.machines.recognized')}</Banner> : null}
          {identify.state === 'error' ? <FormError error={identify.error} /> : null}
          {newType ? (
            <Banner tone="ember" icon="sparkles" action={<Button size="sm" variant="primary" onClick={createType}>{t('admin.machines.createType')}</Button>}>
              {t('admin.machines.newType', { name: name(newType) })}
            </Banner>
          ) : null}
        </div>

        <Field label={t('manage.machines.type')}>
          <Select value={form.equipmentId} onChange={(e) => setForm((f) => ({ ...f, equipmentId: e.target.value }))}>
            <option value="">{t('manage.choose')}</option>
            {(equipment.data || [])
              .filter((eq) => eq.code !== 'poids_du_corps')
              .map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {name(eq)}
                </option>
              ))}
          </Select>
        </Field>
        <div className="mg-fields">
          <Field label={t('manage.machines.label')}>
            <Input value={form.label} maxLength={100} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder={t('manage.machines.labelPh')} />
          </Field>
          <Field label={t('manage.machines.code')} optional error={codeOk ? null : t('manage.machines.codeInvalid')}>
            <Input value={form.code} dir="ltr" maxLength={11} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} invalid={!codeOk} />
          </Field>
        </div>
        <Field label={t('manage.machines.zone')} hint={t('admin.machines.zoneHint')}>
          <Select value={form.zone} onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}>
            <option value="">{t('admin.machines.defaultZone')}</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
        </Field>

        {form.equipmentId ? (
          <div className="stack-2">
            <span className="w500">{tp('admin.machines.compatible', compatible.data?.length || 0)}</span>
            {compatible.loading ? (
              <Skeleton h={60} />
            ) : (compatible.data || []).length ? (
              <div className="chips">
                {compatible.data.map((ex) => (
                  <span key={ex.id} className="tag">
                    {name(ex)} · {label(meta.data?.muscles?.[ex.primaryMuscle])}
                  </span>
                ))}
              </div>
            ) : (
              <p className="small muted">{t('admin.machines.noCompatible')}</p>
            )}

            <span className="w500 mt-2">{t('admin.machines.aiTitle')}</span>
            {!aiEnabled ? (
              <p className="small muted">{t('err.NO_AI')}</p>
            ) : suggestions.state === 'idle' ? (
              <Button size="sm" icon="sparkles" onClick={suggest}>
                {t('admin.machines.suggest')}
              </Button>
            ) : suggestions.state === 'busy' ? (
              <p className="small muted">{t('admin.machines.aiLoading')}</p>
            ) : suggestions.state === 'error' ? (
              <ErrorState compact error={suggestions.error} onRetry={suggest} />
            ) : suggestions.items.length ? (
              <>
                <p className="caption muted">{t('admin.machines.aiHint')}</p>
                {suggestions.items.map((s) => (
                  <Checkbox
                    key={s.nameFr}
                    checked={!skipped.has(s.nameFr)}
                    onChange={() =>
                      setSkipped((cur) => {
                        const next = new Set(cur);
                        if (next.has(s.nameFr)) next.delete(s.nameFr);
                        else next.add(s.nameFr);
                        return next;
                      })
                    }
                  >
                    {name(s)} · <span className="muted">{label(meta.data?.muscles?.[s.primaryMuscle])}</span>
                  </Checkbox>
                ))}
              </>
            ) : (
              <p className="small muted">{t('admin.machines.aiNone')}</p>
            )}
          </div>
        ) : null}
        <FormError error={error} />
      </form>
    </Sheet>
  );
}
