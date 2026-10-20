import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { ErrorText, Field } from '../components/ui';
import { NewPasswordField, passwordOk } from '../components/Password';
import { AuthSide } from './Login';

export default function Register() {
  const { register } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setValues({ ...values, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await register({ ...values, language: lang });
      navigate(`/verification?email=${encodeURIComponent(r.email)}`, { replace: true }); // étape suivante : code reçu par e-mail
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <AuthSide />
      <section className="auth-form">
        <form className="auth-card" onSubmit={submit}>
          <h1>{t('auth.registerTitle')}</h1>
          <Field label={t('auth.name')}>
            <input autoComplete="name" value={values.name} onChange={set('name')} required />
          </Field>
          <Field label={t('auth.email')}>
            <input type="email" autoComplete="email" value={values.email} onChange={set('email')} required />
          </Field>
          <NewPasswordField label={t('auth.password')} value={values.password} onChange={(password) => setValues({ ...values, password })} />
          <ErrorText error={error} />
          <button className="btn btn-block" disabled={busy || !passwordOk(values.password)}>
            {t('auth.createAccount')}
          </button>
          <p className="muted">
            {t('auth.haveAccount')} <Link to="/connexion">{t('auth.login')}</Link>
          </p>
        </form>
      </section>
    </div>
  );
}
