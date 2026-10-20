import { useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { ErrorText, Spinner, useLoad } from '../../components/ui';

export default function Users() {
  const { user: me } = useAuth();
  const { t, date } = useI18n();
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const users = useLoad(() => api(`/admin/users?role=${role}&q=${encodeURIComponent(q)}`), [role, q]);
  const [error, setError] = useState(null);

  async function toggle(u) {
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } });
      users.reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('nav.users')}</h1>
        <div className="inline">
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label={t('users.role')} style={{ width: 'auto' }}>
            <option value="">{t('users.allRoles')}</option>
            {['SPORTIF', 'GERANT', 'ADMIN'].map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} aria-label={t('common.search')} style={{ width: 220 }} />
        </div>
      </div>
      <ErrorText error={error} />
      {users.loading && !users.data ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('auth.name')}</th>
                <th>{t('users.role')}</th>
                <th>{t('profile.gym')}</th>
                <th>{t('users.created')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(users.data || []).map((u) => (
                <tr key={u.id} style={u.active ? undefined : { opacity: 0.55 }}>
                  <td>
                    <strong>{u.name}</strong>
                    <div className="small muted">{u.email}</div>
                  </td>
                  <td>{t(`role.${u.role}`)}</td>
                  <td>{u.gym?.name || '—'}</td>
                  <td>{date(u.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                  <td style={{ textAlign: 'end' }}>
                    {u.id !== me.id && (
                      <button className={`btn btn-small ${u.active ? 'btn-ghost' : ''}`} onClick={() => toggle(u)}>
                        {u.active ? t('users.disable') : t('users.enable')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
