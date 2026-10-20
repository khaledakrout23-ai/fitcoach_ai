import { useState } from 'react';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { ErrorText, Field, Spinner, useLoad } from '../../components/ui';
import PhotoButton from '../../components/PhotoButton';

export default function Machines() {
  const { t, name } = useI18n();
  const machines = useLoad(() => api('/manager/machines'));
  const equipment = useLoad(() => api('/equipment'));
  const [form, setForm] = useState({ equipmentId: '', label: '' });
  const [error, setError] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [identifying, setIdentifying] = useState(false);
  const [recognized, setRecognized] = useState(false);

  async function add(e) {
    e.preventDefault();
    setError(null);
    try {
      await api('/manager/machines', { method: 'POST', body: { equipmentId: Number(form.equipmentId), label: form.label } });
      setForm({ equipmentId: '', label: '' });
      setPhoto(null);
      setRecognized(false);
      machines.reload();
    } catch (err) {
      setError(err);
    }
  }

  async function identify(image) {
    setError(null);
    setRecognized(false);
    setIdentifying(true);
    setPhoto(image);
    try {
      const r = await api('/manager/machines/identify', { method: 'POST', body: { image } });
      setForm({ equipmentId: String(r.equipmentId), label: r.label });
      setRecognized(true);
    } catch (err) {
      setError(err);
    } finally {
      setIdentifying(false);
    }
  }

  async function setStatus(m, status) {
    try {
      await api(`/manager/machines/${m.id}`, { method: 'PUT', body: { status } });
      machines.reload();
    } catch (err) {
      setError(err);
    }
  }

  async function remove(m) {
    if (!window.confirm(t('machines.confirmDelete', { name: m.label }))) return;
    try {
      await api(`/manager/machines/${m.id}`, { method: 'DELETE' });
      machines.reload();
    } catch (err) {
      setError(err);
    }
  }

  if (machines.loading) return <Spinner />;
  const list = machines.data || [];
  const broken = list.filter((m) => m.status === 'PANNE').length;

  return (
    <div className="page">
      <div>
        <h1>{t('nav.machines')}</h1>
        <p className="page-sub">{t('machines.sub', { n: list.length, b: broken })}</p>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('machines.label')}</th>
              <th>{t('machines.type')}</th>
              <th>{t('members.status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong>{m.label}</strong>
                </td>
                <td>{name(m.equipment)}</td>
                <td>
                  {m.status === 'OK' ? <span className="badge badge-ok">{t('machines.ok')}</span> : <span className="badge badge-danger">{t('machines.broken')}</span>}
                </td>
                <td style={{ textAlign: 'end' }}>
                  <div className="inline" style={{ justifyContent: 'flex-end' }}>
                    {m.status === 'OK' ? (
                      <button className="btn btn-small btn-ghost" onClick={() => setStatus(m, 'PANNE')}>
                        {t('machines.markBroken')}
                      </button>
                    ) : (
                      <button className="btn btn-small" onClick={() => setStatus(m, 'OK')}>
                        {t('machines.markFixed')}
                      </button>
                    )}
                    <button className="btn btn-small btn-ghost" onClick={() => remove(m)} aria-label={t('common.delete')}>
                      {t('common.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="panel stack" onSubmit={add}>
        <h2>{t('machines.add')}</h2>
        <p className="small muted">{t('machines.addHint')}</p>
        <div className="stack">
          <PhotoButton className="btn btn-ghost" label={t('machines.photo')} onPhoto={identify} onError={setError} disabled={identifying} />
          <p className="small muted">{t('machines.photoHint')}</p>
          {photo && <img src={photo} alt="" style={{ maxWidth: 240, maxHeight: 240, borderRadius: 12, objectFit: 'cover' }} />}
          {identifying && <p className="small">{t('machines.identifying')}</p>}
          {recognized && <p className="small" style={{ color: 'var(--ok)' }}>{t('machines.recognized')}</p>}
        </div>
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
        <ErrorText error={error} />
        <button className="btn" style={{ justifySelf: 'start' }}>
          {t('machines.addBtn')}
        </button>
      </form>
    </div>
  );
}
