// M13 — Plus (téléphone) : toutes les pages accessibles au rôle + langue, thème, mot de passe, déconnexion
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, Icon, Field, FormError, ListRow, PasswordInput, Segmented, Sheet, useToast } from '../../../components';
import LangSwitch from '../../../components/LangSwitch';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { useTheme } from '../../../lib/theme';
import { can } from '../../../lib/permissions';
import { visibleNav } from '../../../layouts/StaffLayout';
import './ops.css';

// les onglets du bas déjà visibles sur téléphone ne sont pas répétés
const IN_TABS = ['/salle', '/salle/membres', '/salle/pannes'];

function PasswordSheet({ open, onClose }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setForm({ current: '', next: '', confirm: '' });
      setError(null);
    }
  }, [open]);
  const checks = [
    { key: 'length', ok: form.next.length >= 8 && form.next.length <= 128 },
    { key: 'mix', ok: /[A-Za-z؀-ۿ]/.test(form.next) && /\d/.test(form.next) },
    { key: 'diff', ok: Boolean(form.next) && form.next !== form.current },
    { key: 'same', ok: Boolean(form.next) && form.next === form.confirm },
  ];
  const valid = form.current && checks.every((c) => c.ok);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e?.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.put('/me/password', { currentPassword: form.current, newPassword: form.next });
      toast({ text: t('ops.more.pwDone'), icon: 'check' });
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('ops.more.password')}
      footer={
        <Button variant="primary" block disabled={!valid} loading={busy} onClick={submit}>
          {t('action.save')}
        </Button>
      }
    >
      <form className="stack-4" onSubmit={submit} noValidate>
        <Field label={t('ops.more.pwCurrent')}>
          <PasswordInput value={form.current} onChange={set('current')} autoComplete="current-password" />
        </Field>
        <Field label={t('ops.more.pwNew')}>
          <PasswordInput value={form.next} onChange={set('next')} autoComplete="new-password" />
        </Field>
        <Field label={t('ops.more.pwConfirm')}>
          <PasswordInput value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
        </Field>
        <ul className="rules">
          {checks.map((c) => (
            <li key={c.key} className={c.ok ? 'ok' : ''}>
              <span className="tick" aria-hidden="true">
                <Icon name="check" size={14} stroke={3} />
              </span>
              <span>{t(`ops.more.rule.${c.key}`)}</span>
            </li>
          ))}
        </ul>
        <FormError error={error} />
      </form>
    </Sheet>
  );
}

export default function More() {
  const { t } = useI18n();
  const { user, logout, setUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [pw, setPw] = useState(false);

  const nav = visibleNav(user, false).filter((it) => it.head || !IN_TABS.includes(it.to));
  // regroupe les entrées par section (titres retirés quand la section est vide)
  const groups = [];
  for (const it of nav) {
    if (it.head) groups.push({ head: it.head, items: [] });
    else {
      if (!groups.length) groups.push({ head: null, items: [] });
      groups[groups.length - 1].items.push(it);
    }
  }
  if (can(user, 'live')) groups[0]?.items.unshift({ to: '/salle/scanner', icon: 'scan-line', label: 'staffnav.scanner' });

  const chooseTheme = (v) => {
    setTheme(v);
    api.put('/me/profile', { theme: v }).then(() => setUser({ ...user, theme: v })).catch(() => {});
  };

  const onLogout = async () => {
    await logout();
    navigate('/salle/connexion', { replace: true });
  };

  return (
    <div className="stack-4 ops ops-more">
      <div className="row-2">
        <Avatar name={user.name} />
        <div className="min0">
          <h1 className="h3" dir="auto">
            {user.name}
          </h1>
          <div className="small muted">
            {t(`role.${user.role}`)}
            {user.gym ? (
              <>
                {' · '}
                <span dir="auto">{user.gym.name}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {groups
        .filter((g) => g.items.length)
        .map((g, i) => (
          <nav key={g.head || i} className="list" aria-label={g.head ? t(g.head) : t('nav.menu')}>
            {g.items.map((it) => (
              <ListRow key={it.to} icon={it.icon} title={t(it.label)} to={it.to} />
            ))}
          </nav>
        ))}

      <section className="list" aria-label={t('ops.more.account')}>
        <div className="list-row">
          <span className="grow">{t('ops.more.language')}</span>
          <LangSwitch />
        </div>
        <div className="list-row ops-more-theme">
          <span className="grow">{t('ops.more.theme')}</span>
          <Segmented
            size="sm"
            value={theme}
            onChange={chooseTheme}
            label={t('ops.more.theme')}
            options={[
              { value: 'dark', label: t('ops.more.dark') },
              { value: 'light', label: t('ops.more.light') },
              { value: 'system', label: t('ops.more.system') },
            ]}
          />
        </div>
        <ListRow icon="key-round" title={t('ops.more.password')} onClick={() => setPw(true)} />
      </section>

      <button type="button" className="link-btn ops-logout" onClick={onLogout}>
        <Icon name="log-out" size={20} />
        {t('action.logout')}
      </button>

      <PasswordSheet open={pw} onClose={() => setPw(false)} />
    </div>
  );
}
