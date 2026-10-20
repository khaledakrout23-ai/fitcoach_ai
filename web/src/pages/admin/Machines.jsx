import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { ErrorText, Field, Spinner, useLoad, useToast } from '../../components/ui';
import PhotoButton from '../../components/PhotoButton';

// Ajout d'une machine par photo : l'IA reconnaît le type, on affiche les exercices possibles, puis on choisit la salle
export default function AdminMachines() {
  const { t, name, muscle } = useI18n();
  const gyms = useLoad(() => api('/admin/gyms'));
  const equipment = useLoad(() => api('/equipment'));
  const [gymId, setGymId] = useState('');
  const [form, setForm] = useState({ equipmentId: '', label: '' });
  const [photo, setPhoto] = useState(null);
  const [identifying, setIdentifying] = useState(false);
  const [recognized, setRecognized] = useState(false);
  const [newType, setNewType] = useState(null);
  const [error, setError] = useState(null);
  const [toast, showToast] = useToast();
  const exercises = useLoad(() => (form.equipmentId ? api(`/admin/equipment/${form.equipmentId}/exercises`) : Promise.resolve([])), [form.equipmentId]);
  const machines = useLoad(() => (gymId ? api(`/admin/gyms/${gymId}/machines`) : Promise.resolve([])), [gymId]);
  // nouveaux exercices proposés par l'IA : cochés par défaut, ajoutés au catalogue avec la machine
  const suggestions = useLoad(() => (form.equipmentId ? api(`/admin/equipment/${form.equipmentId}/suggestions`) : Promise.resolve([])), [form.equipmentId]);
  const [skipped, setSkipped] = useState(() => new Set());
  useEffect(() => setSkipped(new Set()), [form.equipmentId]);
  const kept = (suggestions.data || []).filter((s) => !skipped.has(s.nameFr));

  function toggle(s) {
    const next = new Set(skipped);
    if (next.has(s.nameFr)) next.delete(s.nameFr);
    else next.add(s.nameFr);
    setSkipped(next);
  }

  // aucun type existant ne correspond : on crée le type proposé par l'IA, puis on le sélectionne
  async function createType() {
    setError(null);
    try {
      const eq = await api('/admin/equipment', { method: 'POST', body: newType });
      equipment.reload();
      setForm((f) => ({ ...f, equipmentId: String(eq.id) }));
      setNewType(null);
      setRecognized(true);
    } catch (err) {
      setError(err);
    }
  }

  async function identify(image) {
    setNewType(null);
    setError(null);
    setRecognized(false);
    setIdentifying(true);
    setPhoto(image);
    try {
      const r = await api('/admin/machines/identify', { method: 'POST', body: { image } });
      setNewType(r.newType || null);
      setForm({ equipmentId: r.equipmentId ? String(r.equipmentId) : '', label: r.label });
      setRecognized(Boolean(r.equipmentId));
    } catch (err) {
      setError(err);
    } finally {
      setIdentifying(false);
    }
  }

  async function add(e) {
    e.preventDefault();
    setError(null);
    try {
      const r = await api(`/admin/gyms/${gymId}/machines`, {
        method: 'POST',
        body: { equipmentId: Number(form.equipmentId), label: form.label, newExercises: kept },
      });
      setForm({ equipmentId: '', label: '' });
      setPhoto(null);
      setRecognized(false);
      machines.reload();
      gyms.reload();
      showToast(r.createdExercises ? t('adminMachines.addedWithExercises', { n: r.createdExercises }) : t('adminMachines.added'));
    } catch (err) {
      setError(err);
    }
  }

  if (gyms.loading) return <Spinner />;
  const gymList = gyms.data || [];

  return (
    <div className="page page-narrow">
      {toast}
      <div>
        <h1>{t('nav.machines')}</h1>
        <p className="page-sub">{t('adminMachines.sub')}</p>
      </div>

      <form className="panel stack" onSubmit={add}>
        <h2>1. {t('machines.photo')}</h2>
        <PhotoButton label={t('machines.photo')} onPhoto={identify} onError={setError} disabled={identifying} />
        <p className="small muted">{t('machines.photoHint')}</p>
        {photo && <img src={photo} alt="" style={{ maxWidth: 260, maxHeight: 260, borderRadius: 12, objectFit: 'cover' }} />}
        {identifying && <p className="small">{t('machines.identifying')}</p>}
        {recognized && <p className="small" style={{ color: 'var(--ok)' }}>{t('machines.recognized')}</p>}
        {newType && (
          <div className="panel stack" style={{ background: 'var(--signal-soft)' }}>
            <strong>{t('adminMachines.newTypeTitle', { name: name(newType) })}</strong>
            <p className="small muted">{t('adminMachines.newTypeHint')}</p>
            <button type="button" className="btn" style={{ justifySelf: 'start' }} onClick={createType}>
              {t('adminMachines.createType')}
            </button>
          </div>
        )}

        <h2>2. {t('machines.type')}</h2>
        <div className="form-grid">
          <Field label={t('machines.type')}>
            <select value={form.equipmentId} onChange={(e) => setForm({ ...form, equipmentId: e.target.value })} required>
              <option value="">—</option>
              {(equipment.data || [])
                .filter((eq) => eq.code !== 'poids_du_corps')
                .map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {name(eq)}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={t('machines.label')}>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={t('machines.labelPlaceholder')} required />
          </Field>
        </div>

        {form.equipmentId && (
          <div className="stack">
            <h3>{t('adminMachines.exercises', { n: exercises.data?.length || 0 })}</h3>
            {exercises.loading ? (
              <Spinner />
            ) : exercises.data.length ? (
              <ul className="rows">
                {exercises.data.map((ex) => (
                  <li key={ex.id} className="row">
                    <span style={{ color: 'var(--ok)', fontWeight: 700 }}>✓</span>
                    <span style={{ flex: 1 }}>{name(ex)}</span>
                    <span className="badge">{muscle(ex.primaryMuscle)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">{t('adminMachines.noExercises')}</p>
            )}

            <h3>{t('adminMachines.aiTitle')}</h3>
            {suggestions.loading ? (
              <p className="small">{t('adminMachines.aiLoading')}</p>
            ) : suggestions.error ? (
              <div className="inline">
                <ErrorText error={suggestions.error} />
                <button type="button" className="btn btn-small btn-ghost" onClick={suggestions.reload}>
                  {t('adminMachines.retry')}
                </button>
              </div>
            ) : suggestions.data.length ? (
              <>
                <p className="small muted">{t('adminMachines.aiHint')}</p>
                <ul className="rows">
                  {suggestions.data.map((s) => (
                    <li key={s.nameFr} className="row">
                      <label className="inline" style={{ flex: 1, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!skipped.has(s.nameFr)} onChange={() => toggle(s)} />
                        <span>{name(s)}</span>
                      </label>
                      <span className="badge badge-brand">{t('adminMachines.newAi')}</span>
                      <span className="badge">{muscle(s.primaryMuscle)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="small muted">{t('adminMachines.aiNone')}</p>
            )}
          </div>
        )}

        <h2>3. {t('adminMachines.gym')}</h2>
        <Field label={t('adminMachines.gym')}>
          <select value={gymId} onChange={(e) => setGymId(e.target.value)} required>
            <option value="">—</option>
            {gymList.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.city ? ` — ${g.city}` : ''}
              </option>
            ))}
          </select>
        </Field>

        <ErrorText error={error} />
        <button className="btn" style={{ justifySelf: 'start' }} disabled={identifying || suggestions.loading}>
          {kept.length ? t('adminMachines.addWithExercises', { n: kept.length }) : t('machines.addBtn')}
        </button>
      </form>

      {gymId && (
        <section className="panel stack">
          <h2>{t('adminMachines.inGym', { name: gymList.find((g) => String(g.id) === gymId)?.name || '' })}</h2>
          {machines.loading ? (
            <Spinner />
          ) : machines.data.length ? (
            <ul className="rows">
              {machines.data.map((m) => (
                <li key={m.id} className="row">
                  <strong style={{ flex: 1 }}>{m.label}</strong>
                  <span className="small muted">{name(m.equipment)}</span>
                  {m.status === 'OK' ? <span className="badge badge-ok">{t('machines.ok')}</span> : <span className="badge badge-danger">{t('machines.broken')}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">{t('adminMachines.empty')}</p>
          )}
        </section>
      )}
    </div>
  );
}
