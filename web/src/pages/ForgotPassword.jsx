import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { homeFor, useAuth } from '../auth';
import { useI18n } from '../i18n';
import { ErrorText, Field } from '../components/ui';
import { NewPasswordField, passwordOk } from '../components/Password';
import { AuthSide } from './Login';
import { useCooldown } from './VerifyEmail';

// Mot de passe oublié : 1) e-mail → code envoyé  2) code + nouveau mot de passe
export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, restart] = useCooldown(0);

  async function sendCode(e) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setStep('code');
      restart();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError({ code: 'PASSWORD_MISMATCH' });
    setBusy(true);
    try {
      const user = await resetPassword(email, code, password);
      navigate(homeFor(user.role), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  return (
    <div className="auth">
      <AuthSide />
      <section className="auth-form">
        {step === 'email' ? (
          <form className="auth-card" onSubmit={sendCode}>
            <h1>{t('forgot.title')}</h1>
            <p className="muted">{t('forgot.explain')}</p>
            <Field label={t('auth.email')}>
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </Field>
            <ErrorText error={error} />
            <button className="btn btn-block" disabled={busy}>
              {t('forgot.send')}
            </button>
            <p className="muted small">
              <Link to="/connexion">{t('verify.back')}</Link>
            </p>
          </form>
        ) : (
          <form className="auth-card" onSubmit={submit}>
            <h1>{t('forgot.newTitle')}</h1>
            <p className="auth-note">
              {t('forgot.sent')} <strong dir="ltr">{email}</strong>
            </p>
            <Field label={t('verify.code')}>
              <input
                className="code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
              />
            </Field>
            <NewPasswordField label={t('pw.new')} value={password} onChange={setPassword} />
            <Field label={t('pw.confirm')}>
              <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </Field>
            <ErrorText error={error} />
            <button className="btn btn-block" disabled={busy || code.length !== 6 || !passwordOk(password)}>
              {t('forgot.submit')}
            </button>
            <p className="muted small">
              {t('verify.noMail')}{' '}
              <button type="button" className="link-button" onClick={() => sendCode()} disabled={cooldown > 0 || busy}>
                {cooldown > 0 ? t('verify.resendIn', { s: cooldown }) : t('verify.resend')}
              </button>
            </p>
          </form>
        )}
      </section>
    </div>
  );
}
