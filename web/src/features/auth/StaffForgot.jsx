import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Field, FormError, Icon, IconButton, Input, Logo, PasswordInput, useToast } from '../../components';
import LangSwitch from '../../components/LangSwitch';
import { api } from '../../lib/api';
import { homeFor, useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { useInterval } from '../../lib/hooks';
import CodeInput from './CodeInput';
import { PasswordRules, passwordChecks, weakMessage } from './shared';
import './auth.css';

const RESEND_SECONDS = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mot de passe oublié de l'équipe : e-mail → code à 6 chiffres + nouveau mot de passe → connecté */
export default function StaffForgot() {
  const { t, error: errorText } = useI18n();
  const { setUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState('email'); // email | code
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [wait, setWait] = useState(0);

  useInterval(() => setWait((s) => Math.max(0, s - 1)), wait > 0 ? 1000 : null);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setWait(RESEND_SECONDS);
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onEmail = async (e) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim()) || busy) return;
    if (await sendCode()) setStep('code');
  };

  const resend = async () => {
    if (wait > 0 || busy) return;
    if (await sendCode()) toast(t('auth.forgot.resent'));
  };

  const checks = passwordChecks(password, confirm);
  const valid = code.length === 6 && checks.every((c) => c.ok);

  const onReset = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const me = await api.post('/auth/reset-password', { email: email.trim(), code, password });
      setUser(me);
      toast(t('auth.forgot.done'));
      navigate(homeFor(me), { replace: true });
    } catch (err) {
      if (err.code === 'CODE_INVALID') setCode('');
      setError(err);
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <div className="auth-top">
        {step === 'email' ? (
          <IconButton icon="arrow-left" label={t('auth.forgot.backToLogin')} to="/salle/connexion" />
        ) : (
          <IconButton
            icon="arrow-left"
            label={t('auth.forgot.changeEmail')}
            onClick={() => {
              setStep('email');
              setCode('');
              setError(null);
            }}
          />
        )}
        <LangSwitch />
      </div>

      {step === 'email' ? (
        <form className="stack-4" onSubmit={onEmail} noValidate>
          <div className="stack-2 auth-head">
            <Logo size={32} wordmark sub={t('auth.staff.space')} />
            <h1 className="mt-4">
              {t('auth.forgot.title')}
            </h1>
            <p className="lead">{t('auth.forgot.lead')}</p>
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
          <FormError error={error} />
          <Button type="submit" variant="primary" size="lg" block disabled={!EMAIL_RE.test(email.trim())} loading={busy}>
            {t('auth.forgot.send')}
          </Button>
          <p className="auth-info small muted">
            <Icon name="info" size={18} />
            <span>{t('auth.forgot.member')}</span>
          </p>
        </form>
      ) : (
        <form className="stack-4" onSubmit={onReset} noValidate>
          <div className="stack-2 auth-head">
            <h1>
              {t('auth.forgot.codeTitle')}
            </h1>
            <p className="lead">{t('auth.forgot.codeLead')}</p>
            <p className="w500">
              <bdi dir="ltr">{email.trim()}</bdi>
            </p>
          </div>

          <div className="field">
            <span className="label">{t('auth.forgot.code')}</span>
            <CodeInput
              value={code}
              onChange={(v) => {
                setCode(v);
                setError(null);
              }}
              invalid={error?.code === 'CODE_INVALID'}
              autoFocus
              label={t('auth.forgot.code')}
            />
            <div className="row between wrap">
              <span className="caption muted">{t('auth.forgot.spam')}</span>
              <button type="button" className="link-btn small" onClick={resend} disabled={wait > 0 || busy}>
                {wait > 0 ? (
                  <span className="muted">{t('auth.forgot.resendIn', { s: wait })}</span>
                ) : (
                  t('auth.forgot.resend')
                )}
              </button>
            </div>
          </div>

          <Field label={t('auth.forgot.new')}>
            <PasswordInput
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              autoComplete="new-password"
            />
          </Field>
          <Field label={t('auth.forgot.confirm')} error={confirm && password && confirm !== password && confirm.length >= password.length ? t('auth.mismatch') : null}>
            <PasswordInput
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError(null);
              }}
              autoComplete="new-password"
            />
          </Field>
          <PasswordRules checks={checks} />

          {error ? (
            <div className="banner danger" role="alert">
              <Icon name="circle-alert" size={20} />
              <span>{weakMessage(error, t, errorText)}</span>
            </div>
          ) : null}

          <Button type="submit" variant="primary" size="lg" block disabled={!valid} loading={busy}>
            {t('auth.forgot.submit')}
          </Button>
          <Link to="/salle/connexion" className="small text-center">
            {t('auth.forgot.backToLogin')}
          </Link>
        </form>
      )}
    </main>
  );
}
