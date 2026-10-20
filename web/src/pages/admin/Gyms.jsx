import { useState } from 'react';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { ErrorText, Field, Modal, Spinner, useLoad, useToast } from '../../components/ui';
import { PasswordChecklist } from '../../components/Password';

const EMPTY = { name: '', city: '', address: '', phone: '', openingHours: '', managerName: '', managerEmail: '', managerPassword: '' };

export default function Gyms() {
  const { t } = useI18n();
  const gyms = useLoad(() => api('/admin/gyms'));
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [toast, showToast] = useToast();
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  async function create(e) {
    e.preventDefault();
    setError(null);
    try {
      await api('/admin/gyms', { method: 'POST', body: v });
      setOpen(false);
      setV(EMPTY);
      gyms.reload();
      showToast(t('gyms.created'));
    } catch (err) {
      setError(err);
    }
  }

  async function remove(g) {
    if (!window.confirm(t('gyms.confirmDelete', { name: g.name }))) return;
    try {
      await api(`/admin/gyms/${g.id}`, { method: 'DELETE' });
      gyms.reload();
    } catch (err) {
      setError(err);
    }
  }

  if (gyms.loading) return <Spinner />;

  return (
    <div className="page">
      {toast}
      <div className="page-head">
        <h1>{t('nav.gyms')}</h1>
        <button className="btn" onClick={() => setOpen(true)}>
          {t('gyms.add')}
        </button>
      </div>
      <ErrorText error={!open && error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('gym.name')}</th>
              <th>{t('gym.city')}</th>
              <th>{t('role.GERANT')}</th>
              <th>{t('admin.sportifs')}</th>
              <th>{t('nav.machines')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(gyms.data || []).map((g) => (
              <tr key={g.id}>
                <td>
                  <strong>{g.name}</strong>
                  <div className="small muted">{g.address}</div>
                </td>
                <td>{g.city}</td>
                <td>
                  {g.manager ? (
                    <>
                      {g.manager.name}
                      <div className="small muted">{g.manager.email}</div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{g.members}</td>
                <td>{g.machines}</td>
                <td style={{ textAlign: 'end' }}>
                  <button className="btn btn-small btn-ghost" onClick={() => remove(g)}>
                    {t('common.delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title={t('gyms.add')} onClose={() => setOpen(false)}>
          <form className="stack" onSubmit={create}>
            <div className="form-grid">
              <Field label={t('gym.name')}>
                <input value={v.name} onChange={set('name')} required />
              </Field>
              <Field label={t('gym.city')}>
                <input value={v.city} onChange={set('city')} />
              </Field>
              <Field label={t('gym.address')}>
                <input value={v.address} onChange={set('address')} />
              </Field>
              <Field label={t('gym.hours')}>
                <input value={v.openingHours} onChange={set('openingHours')} />
              </Field>
            </div>
            <h3>{t('gyms.managerAccount')}</h3>
            <div className="form-grid">
              <Field label={t('auth.name')}>
                <input value={v.managerName} onChange={set('managerName')} required />
              </Field>
              <Field label={t('auth.email')}>
                <input type="email" value={v.managerEmail} onChange={set('managerEmail')} required />
              </Field>
              <Field label={t('auth.password')}>
                <input type="text" value={v.managerPassword} onChange={set('managerPassword')} required />
                <PasswordChecklist value={v.managerPassword} />
              </Field>
            </div>
            <ErrorText error={error} />
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn">{t('gyms.create')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
