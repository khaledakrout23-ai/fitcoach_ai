import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Checkbox, Field, FormError, Icon, Input, Logo, PasswordInput } from '../../components';
import LangSwitch from '../../components/LangSwitch';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { afterLogin } from './shared';
import './auth.css';

const FEATURES = [
  ['users', 'auth.staff.f1'],
  ['scan-line', 'auth.staff.f2'],
  ['wrench', 'auth.staff.f3'],
  ['sparkles', 'auth.staff.f4'],
];

/** D1 / M1 — Connexion de l'équipe (e-mail) : formulaire + panneau visuel sur grand écran */
export default function StaffLogin() {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && password.length > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const me = await login(email.trim(), password, remember);
      if (me.mustChangePassword) navigate('/premiere-connexion', { replace: true, state: { temporary: password } });
      else navigate(afterLogin(me, location.state?.from), { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <main className="split-auth staff-login">
      <div className="split-form">
        <div className="auth-top">
          <Logo size={36} wordmark sub={t('auth.staff.space')} />
          <LangSwitch />
        </div>

        <form className="stack-4 staff-form" onSubmit={submit} noValidate>
          <div className="stack-2 auth-head">
            <h1 className="h1">{t('auth.staff.title')}</h1>
            <p className="lead muted">{t('auth.staff.lead')}</p>
          </div>

          <Field label={t('auth.staff.email')}>
            <Input
              type="email"
              inputMode="email"
              autoComplete="username"
              dir="ltr"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              autoFocus
            />
          </Field>
          <Field label={t('auth.staff.password')}>
            <PasswordInput
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              autoComplete="current-password"
            />
          </Field>

          <div className="stack-2">
            <div className="row between wrap">
              <Checkbox checked={remember} onChange={setRemember}>
                <span className="w500">{t('auth.staff.remember')}</span>
              </Checkbox>
              <Link to="/salle/mot-de-passe-oublie" className="small w500">
                {t('auth.staff.forgot')}
              </Link>
            </div>
            <p className="caption muted remember-hint">{t('auth.staff.rememberHint')}</p>
          </div>

          <FormError error={error} />

          <Button type="submit" variant="primary" size="lg" block disabled={!valid} loading={busy}>
            {t('auth.staff.submit')}
          </Button>

          <div className="stack-2">
            <p className="caption muted">{t('auth.staff.note')}</p>
            <Link to="/connexion" className="caption">
              {t('auth.staff.member')}
            </Link>
          </div>
        </form>
      </div>

      <aside className="split-visual staff-visual" aria-hidden="true">
        <div className="stack-6">
          <Icon name="building-2" size={40} stroke={1.5} className="ember" />
          <p className="staff-tagline">{t('app.tagline')}</p>
          <p className="staff-value">{t('auth.staff.value')}</p>
          <ul className="staff-features">
            {FEATURES.map(([icon, key]) => (
              <li key={key}>
                <span className="staff-feature-icon">
                  <Icon name={icon} size={20} />
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  );
}
