import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Field, FormError, Icon, IconButton, Input, PasswordInput, PhoneInput, Sheet } from '../../components';
import LangSwitch from '../../components/LangSwitch';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { afterLogin } from './shared';
import './auth.css';

/** B1.3 — Connexion membre : numéro (+216) + mot de passe. Un e-mail d'équipe marche aussi. */
export default function MemberLogin() {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const firstTime = params.get('premiere') === '1';
  const [mode, setMode] = useState('phone'); // phone | email
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [forgotOpen, setForgotOpen] = useState(false);

  const digits = phone.replace(/\D/g, '');
  const identifier = mode === 'phone' ? digits : email.trim();
  const valid = (mode === 'phone' ? digits.length === 8 : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) && password.length > 0;

  // un e-mail tapé ou collé dans le champ téléphone : on passe au champ e-mail
  const toEmail = (text) => {
    setMode('email');
    setEmail(text);
    setError(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const me = await login(identifier, password, true);
      // le mot de passe provisoire passe à la page suivante en mémoire seulement (jamais stocké)
      if (me.mustChangePassword) navigate('/premiere-connexion', { replace: true, state: { temporary: password } });
      else navigate(afterLogin(me, location.state?.from), { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <div className="auth-top">
        <IconButton icon="arrow-left" label={t('action.back')} to="/bienvenue" />
        <LangSwitch />
      </div>

      <form className="stack-4" onSubmit={submit} noValidate>
        <div className="stack-2 auth-head">
          <h1>{t('auth.login.title')}</h1>
          <p className="lead">{t('auth.login.lead')}</p>
        </div>

        {mode === 'phone' ? (
          <Field label={t('auth.login.phone')}>
            <PhoneInput
              value={phone}
              onChange={(v) => {
                setPhone(v);
                setError(null);
              }}
              name="phone"
              autoFocus
              onBeforeInput={(e) => {
                if (e.data && /[@a-zA-Z]/.test(e.data)) {
                  e.preventDefault();
                  toEmail(digits + e.data);
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text') || '';
                if (text.includes('@')) {
                  e.preventDefault();
                  toEmail(text.trim());
                }
              }}
            />
          </Field>
        ) : (
          <Field label={t('auth.login.email')}>
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
        )}

        <Field label={t('auth.login.password')}>
          <PasswordInput
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            autoComplete="current-password"
            name="password"
          />
        </Field>

        {mode === 'email' ? (
          <div className="banner ember">
            <Icon name="building-2" size={20} />
            <span className="grow">
              {t('auth.login.staffHint')}{' '}
              <Link to="/salle/connexion">{t('auth.welcome.staff')}</Link>
            </span>
          </div>
        ) : (
          <p className={`auth-info small ${firstTime ? 'highlight' : 'muted'}`}>
            <Icon name="info" size={18} />
            <span>{t('auth.login.firstTime')}</span>
          </p>
        )}

        <FormError error={error} />

        <Button type="submit" variant="primary" size="lg" block disabled={!valid} loading={busy}>
          {t('auth.login.submit')}
        </Button>

        <div className="text-center stack-2 auth-forgot">
          <button type="button" className="link-btn" onClick={() => setForgotOpen(true)}>
            {t('auth.login.forgot')}
          </button>
          <span className="small muted">{t('auth.login.forgotHint')}</span>
        </div>
      </form>

      <div className="auth-foot">
        <button
          type="button"
          className="link-btn muted small"
          onClick={() => {
            setMode(mode === 'phone' ? 'email' : 'phone');
            setError(null);
          }}
        >
          {mode === 'phone' ? t('auth.login.useEmail') : t('auth.login.usePhone')}
        </button>
        <p className="small muted">{t('auth.login.noAccount')}</p>
      </div>

      <Sheet open={forgotOpen} onClose={() => setForgotOpen(false)} title={t('auth.login.forgotTitle')}>
        <div className="stack-4">
          <p className="muted">{t('auth.login.forgotText')}</p>
          <Link to="/salle/mot-de-passe-oublie" className="small">
            {t('auth.login.forgotStaff')}
          </Link>
          <Button variant="secondary" block onClick={() => setForgotOpen(false)}>
            {t('action.close')}
          </Button>
        </div>
      </Sheet>
    </main>
  );
}
