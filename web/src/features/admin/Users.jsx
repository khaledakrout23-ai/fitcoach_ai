// Utilisateurs de la plateforme (administration Kammel) : recherche, filtre par rôle, activation / désactivation
import { useState } from 'react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { useLoad, useDebounced } from '../../lib/hooks';
import { Button, ChipGroup, Avatar, StatusPill, Icon, Pager, useToast, PageSkeleton, Empty, ErrorState } from '../../components';
import { PageHead } from '../staff/manage/shared';

const ROLES = ['SPORTIF', 'GERANT', 'ACCUEIL', 'TECHNICIEN', 'COACH', 'ADMIN'];
const ROLE_TONE = { ADMIN: 'ember', GERANT: 'hydro', SPORTIF: '' };

export default function Users() {
  const { t, fmt } = useI18n();
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);
  const query = useDebounced(q.trim(), 300);
  const users = useLoad(() => {
    const p = new URLSearchParams({ page: String(page) });
    if (query) p.set('q', query);
    if (role) p.set('role', role);
    return api.get(`/admin/users?${p}`);
  }, [query, role, page]);

  async function toggle(u) {
    setBusy(u.id);
    try {
      const r = await api.patch(`/admin/users/${u.id}`, { active: !u.active });
      users.setData((d) => ({ ...d, items: d.items.map((x) => (x.id === u.id ? { ...x, active: r.active } : x)) }));
      toast({ text: r.active ? t('admin.users.activated', { name: u.name }) : t('admin.users.deactivated', { name: u.name }), icon: 'check' });
    } catch (err) {
      toast({ text: err.message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  const d = users.data;
  return (
    <>
      <PageHead
        title={t('admin.users.title')}
        subtitle={d ? t('admin.users.subtitle', { n: fmt.num(d.total) }) : ''}
        actions={
          <label className="search">
            <Icon name="search" size={20} />
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder={t('admin.users.search')}
              aria-label={t('admin.users.search')}
            />
          </label>
        }
      />
      <ChipGroup
        scroll
        options={[{ value: '', label: t('admin.users.all') }, ...ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }))]}
        value={role}
        onChange={(v) => {
          setRole(v);
          setPage(1);
        }}
        label={t('admin.users.role')}
      />
      {users.loading && !d ? (
        <PageSkeleton cards={4} />
      ) : users.error && !d ? (
        <ErrorState error={users.error} onRetry={users.reload} />
      ) : d.items.length === 0 ? (
        <Empty icon="users" title={t('admin.users.none')} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table responsive">
              <thead>
                <tr>
                  <th>{t('admin.users.user')}</th>
                  <th>{t('admin.users.role')}</th>
                  <th>{t('admin.users.gym')}</th>
                  <th>{t('admin.users.lastLogin')}</th>
                  <th>{t('admin.users.status')}</th>
                  <th aria-label={t('manage.actions')} />
                </tr>
              </thead>
              <tbody>
                {d.items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="mg-cell">
                        <Avatar name={u.name} size="sm" />
                        <span>
                          <span className="w500" style={{ display: 'block' }} dir="auto">{u.name}</span>
                          <span className="sub" dir="ltr">{u.email || u.phone || ''}</span>
                        </span>
                      </span>
                    </td>
                    <td data-label={t('admin.users.role')}>
                      <StatusPill tone={ROLE_TONE[u.role] ?? 'ok'} icon={u.role === 'ADMIN' ? 'shield' : u.role === 'SPORTIF' ? 'user' : 'users'}>
                        {t(`role.${u.role}`)}
                      </StatusPill>
                    </td>
                    <td className="muted" data-label={t('admin.users.gym')}>{u.gym?.name || '–'}</td>
                    <td className="muted" data-label={t('admin.users.lastLogin')}>{u.lastLoginAt ? fmt.when(u.lastLoginAt) : t('manage.team.never')}</td>
                    <td data-label={t('admin.users.status')}>
                      {!u.active ? (
                        <StatusPill tone="danger" icon="lock">{t('manage.team.disabled')}</StatusPill>
                      ) : u.mustChangePassword ? (
                        <StatusPill tone="warn" icon="clock">{t('admin.gyms.pending')}</StatusPill>
                      ) : (
                        <StatusPill tone="ok" icon="circle-check">{t('admin.users.active')}</StatusPill>
                      )}
                    </td>
                    <td className="actions-cell">
                      {u.id !== me.id ? (
                        <Button size="sm" variant={u.active ? 'danger' : 'secondary'} loading={busy === u.id} onClick={() => toggle(u)}>
                          {u.active ? t('admin.users.deactivate') : t('admin.users.activate')}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
