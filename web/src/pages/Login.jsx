import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../auth';
import { useI18n } from '../i18n';
import { BrandMark, LangSwitch } from '../components/Shell';
import { ErrorText, Field } from '../components/ui';

export function AuthSide() {
  const { t } = useI18n();
  return (
    <section className="auth-side">
      <div className="inline" style={{ justifyContent: 'space-between' }}>
        <span className="brand">
          <BrandMark /> FitCoach AI
        </span>
        <LangSwitch dark />
      </div>
      <p className="auth-pitch">{t('auth.pitch')}</p>
      <div className="swap-demo" aria-hidden="true">
        <div className="swap-demo-row busy">
          <span>{t('auth.demoMachine')}</span>
          <span className="badge badge-warn">{t('swap.OCCUPEE')}</span>
        </div>
        <div className="swap-demo-row">
          <span>{t('auth.demoAlt1')}</span>
          <span className="badge badge-brand">{t('auth.demoSame')}</span>
        </div>
        <div className="swap-demo-row">
          <span>{t('auth.demoAlt2')}</span>
          <span className="badge badge-brand">{t('auth.demoSame')}</span>
        </div>
      </div>
    </section>
  );
}

export default function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      navigate(homeFor(user.role), { replace: true });
    } catch (err) {
      // adresse pas encore confirmée : un code vient d'être envoyé, on va à la saisie du code
      if (err.code === 'EMAIL_NOT_VERIFIED') navigate(`/verification?email=${encodeURIComponent(email.trim())}`);
      else setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <AuthSide />
      <section className="auth-form">
        <form className="auth-card" onSubmit={submit}>
          <h1>{t('auth.loginTitle')}</h1>
          <Field label={t('auth.email')}>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label={t('auth.password')}>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Link to="/mot-de-passe-oublie" className="small" style={{ justifySelf: 'end' }}>
            {t('forgot.link')}
          </Link>
          <ErrorText error={error} />
          <button className="btn btn-block" disabled={busy}>
            {t('auth.login')}
          </button>
          <p className="muted">
            {t('auth.noAccount')} <Link to="/inscription">{t('auth.createAccount')}</Link>
          </p>
          <div className="demo-accounts">
            <strong>{t('auth.demo')}</strong>
            <div>sportif@fitcoach.tn · Sportif123!</div>
            <div>gerant@fitcoach.tn · Gerant123!</div>
            <div>admin@fitcoach.tn · Admin123!</div>
          </div>
        </form>
      </section>
    </div>
  );
}
