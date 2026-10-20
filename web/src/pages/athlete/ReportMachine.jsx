import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { ErrorText, Field, Spinner, useLoad } from '../../components/ui';

export default function ReportMachine() {
  const { user } = useAuth();
  const { t, name } = useI18n();
  const navigate = useNavigate();
  const gym = useLoad(() => (user.gymId ? api(`/gyms/${user.gymId}`) : Promise.resolve(null)), [user.gymId]);
  const [machineId, setMachineId] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/me/reports', { method: 'POST', body: { machineId: Number(machineId), description } });
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  if (gym.loading) return <Spinner />;
  const machines = (gym.data?.machines || []).filter((m) => m.status === 'OK');

  return (
    <div className="page page-narrow">
      <div>
        <h1>{t('report.title')}</h1>
        <p className="page-sub">{t('report.sub')}</p>
      </div>
      <form className="panel stack" onSubmit={submit}>
        <Field label={t('report.machine')}>
          <select value={machineId} onChange={(e) => setMachineId(e.target.value)} required>
            <option value="">—</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({name(m.equipment)})
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('report.description')} hint={t('report.optional')}>
          <textarea value={description} maxLength={255} onChange={(e) => setDescription(e.target.value)} placeholder={t('report.placeholder')} />
        </Field>
        <ErrorText error={error} />
        <button className="btn" disabled={busy}>
          {t('report.send')}
        </button>
      </form>
    </div>
  );
}
