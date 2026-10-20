import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { ErrorText, Field, Spinner, useLoad, useToast } from '../../components/ui';

export default function GymSettings() {
  const { t } = useI18n();
  const gym = useLoad(() => api('/manager/gym'));
  const [v, setV] = useState(null);
  const [error, setError] = useState(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    if (gym.data) setV({ name: gym.data.name || '', address: gym.data.address || '', city: gym.data.city || '', phone: gym.data.phone || '', openingHours: gym.data.openingHours || '' });
  }, [gym.data]);

  async function submit(e) {
    e.preventDefault();
    try {
      await api('/manager/gym', { method: 'PUT', body: v });
      showToast(t('profile.saved'));
    } catch (err) {
      setError(err);
    }
  }

  if (!v) return <Spinner />;
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  return (
    <div className="page page-narrow">
      {toast}
      <h1>{t('nav.gym')}</h1>
      <form className="panel stack" onSubmit={submit}>
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
          <Field label={t('gym.phone')}>
            <input value={v.phone} onChange={set('phone')} />
          </Field>
          <Field label={t('gym.hours')}>
            <input value={v.openingHours} onChange={set('openingHours')} />
          </Field>
        </div>
        <ErrorText error={error} />
        <button className="btn" style={{ justifySelf: 'start' }}>
          {t('profile.save')}
        </button>
      </form>
    </div>
  );
}
