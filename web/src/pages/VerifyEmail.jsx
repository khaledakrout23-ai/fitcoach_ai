import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { homeFor, useAuth } from '../auth';
import { useI18n } from '../i18n';
import { ErrorText, Field } from '../components/ui';
import { AuthSide } from './Login';

const RESEND_SECONDS = 60;

// Délai avant de pouvoir redemander un code
export function useCooldown(initial) {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    if (left <= 0) return undefined;
    const id = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  return [left, () => setLeft(RESEND_SECONDS)];
}

// Saisie du code à 6 chiffres reçu après l'inscription (ou à la connexion d'un compte non vérifié)
export default function VerifyEmail() {
  const { verifyEmail } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const email = params.get('email') || '';
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, restart] = useCooldown(RESEND_SECONDS);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await verifyEmail(email, code);
      // nouveau sportif : étape suivante, compléter le profil
      navigate(user.role === 'SPORTIF' ? '/app/profil' : homeFor(user.role), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      await api('/auth/resend-code', { method: 'POST', body: { email, purpose: 'VERIFY' } });
      setInfo(t('verify.resent'));
      restart();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="auth">
      <AuthSide />
      <section className="auth-form">
        <form className="auth-card" onSubmit={submit}>
          <h1>{t('verify.title')}</h1>
          <p className="auth-note">
            {t('verify.sent')} <strong dir="ltr">{email}</strong>
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
          <ErrorText error={error} />
          {info && !error && <p className="small" style={{ color: 'var(--ok)' }}>{info}</p>}
          <button className="btn btn-block" disabled={busy || code.length !== 6}>
            {t('verify.submit')}
          </button>
          <p className="muted small">
            {t('verify.noMail')}{' '}
            <button type="button" className="link-button" onClick={resend} disabled={cooldown > 0}>
              {cooldown > 0 ? t('verify.resendIn', { s: cooldown }) : t('verify.resend')}
            </button>
          </p>
          <p className="muted small">
            <Link to="/connexion">{t('verify.back')}</Link>
          </p>
        </form>
      </section>
    </div>
  );
}
