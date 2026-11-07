// Équipe (D18) : comptes de l'équipe, invitation avec mot de passe provisoire, rôles, désactivation, matrice des accès
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { useAuth } from '../../../lib/auth';
import { useLoad } from '../../../lib/hooks';
import {
  Button, IconButton, Field, Input, Select, Sheet, useToast, Avatar, StatusPill, Icon,
  PageSkeleton, Empty, ErrorState, FormError, ListRow,
} from '../../../components';
import { PageHead, TempPassword } from './shared';

// Lignes de la matrice : libellé → permission du serveur
const MATRIX = [
  ['dashboard', 'dashboard'],
  ['live', 'live'],
  ['members', 'members.read'],
  ['health', 'members.health'],
  ['payments', 'payments'],
  ['plans', 'plans.write'],
  ['machines', 'machines.write'],
  ['content', 'content'],
  ['notifications', 'notifications'],
  ['stats', 'stats'],
  ['team', 'team'],
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Team() {
  const { t, tp, fmt } = useI18n();
  const { user } = useAuth();
  const team = useLoad(() => api.get('/staff/team'), []);
  const [inviting, setInviting] = useState(false);
  const [acting, setActing] = useState(null);

  const d = team.data;
  const members = d ? d.members.filter((m) => !m.pendingInvitation) : [];
  const pending = d ? d.members.filter((m) => m.pendingInvitation) : [];
  const head = (
    <PageHead
      title={t('manage.team.title')}
      subtitle={d ? `${tp('manage.team.people', d.members.length)} · ${tp('manage.team.roles', d.roles.length)}` : ''}
      back="/salle/plus"
      actions={
        <Button variant="primary" icon="user-plus" onClick={() => setInviting(true)}>
          {t('manage.team.invite')}
        </Button>
      }
    />
  );
  if (team.loading && !d) return (<>{head}<PageSkeleton cards={4} /></>);
  if (team.error && !d) return (<>{head}<ErrorState error={team.error} onRetry={team.reload} /></>);

  function lastSeen(m) {
    if (!m.active) return <StatusPill tone="danger" icon="lock">{t('manage.team.disabled')}</StatusPill>;
    if (m.online) return <StatusPill tone="ok" led>{t('manage.team.online')}</StatusPill>;
    return <StatusPill>{m.lastLoginAt ? fmt.when(m.lastLoginAt) : t('manage.team.never')}</StatusPill>;
  }

  return (
    <>
      {head}
      <div className="split even">
        <div className="mg-list">
          {members.length === 0 ? <Empty icon="users" title={t('manage.team.empty')} /> : null}
          {members.map((m) => (
            <div key={m.id} className="mg-item">
              <Avatar name={m.name} />
              <span className="grow">
                <span className="title" style={{ display: 'block' }}>
                  <span dir="auto">{m.name}</span> <span className="code">· {t(`role.${m.role}`)}</span>
                </span>
                <span className="sub" style={{ display: 'block' }}>
                  {t(`manage.team.access.${m.role}`)}
                </span>
              </span>
              {lastSeen(m)}
              {m.id !== user.id ? <IconButton icon="ellipsis" size={20} plain label={t('manage.team.actions', { name: m.name })} onClick={() => setActing(m)} /> : null}
            </div>
          ))}
          {pending.map((m) => (
            <div key={m.id} className="mg-item mg-dashed">
              <span className="mg-thumb">
                <Icon name="mail" size={20} />
              </span>
              <span className="grow">
                <span className="sub" style={{ display: 'block' }}>
                  {t('manage.team.invitedTo')}
                </span>
                <span className="title" style={{ display: 'block' }} dir="ltr">
                  {m.email}
                </span>
                <span className="sub" style={{ display: 'block' }}>
                  {m.name} · {t(`role.${m.role}`)} · {invitationLeft(m, t)}
                </span>
              </span>
              <IconButton icon="ellipsis" size={20} plain label={t('manage.team.actions', { name: m.name })} onClick={() => setActing(m)} />
            </div>
          ))}
        </div>

        <section className="card pad-lg stack-4">
          <h2 className="card-title">{t('manage.team.matrix')}</h2>
          <div className="table-wrap">
            <table className="mg-matrix">
              <thead>
                <tr>
                  <th>
                    <span className="sr-only">{t('manage.team.permission')}</span>
                  </th>
                  {d.roles.map((r) => (
                    <th key={r} scope="col">
                      {t(`role.${r}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX.map(([key, perm]) => (
                  <tr key={key}>
                    <td>{t(`manage.team.perm.${key}`)}</td>
                    {d.roles.map((r) => {
                      const yes = (d.permissions[perm] || []).includes(r);
                      return (
                        <td key={r} className={yes ? 'yes' : 'no'}>
                          <Icon name={yes ? 'check' : 'minus'} size={18} />
                          <span className="sr-only">{yes ? t('manage.yes') : t('manage.no')}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">{t('manage.team.audit')}</p>
        </section>
      </div>

      {inviting ? <InviteSheet roles={d.roles} onClose={() => setInviting(false)} onDone={team.reload} /> : null}
      {acting ? (
        <MemberActions
          member={acting}
          roles={d.roles}
          onClose={() => setActing(null)}
          onChanged={() => {
            team.reload();
          }}
        />
      ) : null}
    </>
  );
}

function invitationLeft(m, t) {
  if (!m.invitationExpiresAt) return '';
  const days = Math.ceil((new Date(m.invitationExpiresAt) - Date.now()) / 86400000);
  return days > 0 ? t('manage.team.expiresIn', { n: days }) : t('manage.team.expired');
}

function InviteSheet({ roles, onClose, onDone }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: '', email: '', role: 'ACCUEIL' });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const emailOk = EMAIL.test(form.email.trim());
  const valid = form.name.trim().length >= 2 && emailOk && form.role;

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.post('/staff/team', { name: form.name.trim(), email: form.email.trim(), role: form.role });
      setResult(r);
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={result ? t('manage.team.invitedTitle', { name: result.member.name }) : t('manage.team.invite')} subtitle={result ? null : t('manage.team.inviteHint')}>
      {result ? (
        <TempPassword login={result.login} password={result.temporaryPassword} expiresAt={result.temporaryPasswordExpiresAt} onDone={onClose} />
      ) : (
        <form className="stack-4" onSubmit={submit}>
          <Field label={t('manage.team.name')}>
            <Input value={form.name} maxLength={100} autoComplete="off" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </Field>
          <Field label={t('manage.team.email')} error={touched && form.email && !emailOk ? t('manage.team.emailInvalid') : null}>
            <Input type="email" dir="ltr" value={form.email} autoComplete="off" onBlur={() => setTouched(true)} invalid={touched && form.email && !emailOk} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </Field>
          <Field label={t('manage.team.role')} hint={t(`manage.team.access.${form.role}`)}>
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
          <FormError error={error} />
          <Button variant="primary" block type="submit" icon="user-plus" disabled={!valid} loading={saving}>
            {t('manage.team.create')}
          </Button>
        </form>
      )}
    </Sheet>
  );
}

function MemberActions({ member, roles, onClose, onChanged }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [role, setRole] = useState(member.role);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [temp, setTemp] = useState(null);

  async function run(kind, fn) {
    setBusy(kind);
    setError(null);
    try {
      const r = await fn();
      onChanged();
      return r;
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setBusy(null);
    }
  }

  if (temp) {
    return (
      <Sheet open onClose={onClose} title={t('manage.team.newPassword', { name: member.name })}>
        <TempPassword login={temp.login} password={temp.temporaryPassword} expiresAt={temp.temporaryPasswordExpiresAt} onDone={onClose} />
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title={member.name} subtitle={`${t(`role.${member.role}`)} · ${member.email}`}>
      <div className="stack-4">
        <Field label={t('manage.team.changeRole')} hint={t('manage.team.roleHint')}>
          <div className="row">
            <Select value={role} onChange={(e) => setRole(e.target.value)} className="grow">
              {roles.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </Select>
            <Button
              variant="primary"
              disabled={role === member.role}
              loading={busy === 'role'}
              onClick={() =>
                run('role', () => api.put(`/staff/team/${member.id}`, { role })).then((r) => {
                  if (r) {
                    toast({ text: t('manage.team.roleChanged'), icon: 'check' });
                    onClose();
                  }
                })
              }
            >
              {t('action.save')}
            </Button>
          </div>
        </Field>
        <div className="list">
          <ListRow
            icon="key-round"
            title={member.pendingInvitation ? t('manage.team.resend') : t('manage.team.reset')}
            sub={t('manage.team.resetHint')}
            onClick={() => run('reset', () => api.post(`/staff/team/${member.id}/reset-password`)).then((r) => r && setTemp(r))}
          />
          {member.active ? (
            <ListRow
              icon="user-x"
              danger
              title={member.pendingInvitation ? t('manage.team.cancelInvite') : t('manage.team.deactivate')}
              sub={t('manage.team.deactivateHint')}
              onClick={() =>
                run('off', () => api.post(`/staff/team/${member.id}/deactivate`)).then((r) => {
                  if (r) {
                    toast({ text: t('manage.team.deactivated'), icon: 'check' });
                    onClose();
                  }
                })
              }
            />
          ) : (
            <ListRow
              icon="user-check"
              title={t('manage.team.reactivate')}
              onClick={() =>
                run('on', () => api.post(`/staff/team/${member.id}/reactivate`)).then((r) => {
                  if (r) {
                    toast({ text: t('manage.team.reactivated'), icon: 'check' });
                    onClose();
                  }
                })
              }
            />
          )}
        </div>
        <FormError error={error} />
      </div>
    </Sheet>
  );
}
