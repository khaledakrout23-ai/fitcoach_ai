import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Field, Icon, PasswordInput } from '../../components';
import LangSwitch from '../../components/LangSwitch';
import { homeFor, loginPathFor, useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { PasswordRules, passwordChecks, weakMessage } from './shared';
import './auth.css';

/** B1.4 — Première connexion : le mot de passe provisoire est remplacé (tous les rôles) */
export default function FirstPassword() {
  const { t, error: errorText } = useI18n();
  const { user, firstPassword, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // mot de passe provisoire tapé à l'écran de connexion : gardé en mémoire, puis retiré de l'historique du navigateur
  const fromLogin = useRef(typeof location.state?.temporary === 'string' ? location.state.temporary : '');
  const [askCurrent, setAskCurrent] = useState(!fromLogin.current);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (location.state?.temporary) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const temporary = askCurrent ? current : fromLogin.current;
  const checks = passwordChecks(next, confirm, temporary);
  const valid = checks.every((c) => c.ok) && temporary.length > 0;
  const staff = user && user.role !== 'SPORTIF';

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const me = await firstPassword(temporary, next);
      navigate(homeFor(me), { replace: true });
    } catch (err) {
      // provisoire refusé : on le redemande
      if (err.code === 'BAD_PASSWORD') {
        fromLogin.current = '';
        setAskCurrent(true);
        setCurrent('');
      }
      setError(err);
      setBusy(false);
    }
  };

  const signOut = () => {
    navigate(loginPathFor(user?.role), { replace: true, state: { loggedOut: true } });
    logout().catch(() => {});
  };

  return (
    <main className="auth">
      <div className="auth-top">
        <span className="status ember">{t('auth.first.pill')}</span>
        <LangSwitch />
      </div>

      <form className="stack-4 grow-form" onSubmit={submit} noValidate>
        <div className="stack-2 auth-head">
          <h1>{t('auth.first.title')}</h1>
          <p className="lead">{t('auth.first.text')}</p>
        </div>

        {askCurrent ? (
          <Field label={t('auth.first.current')}>
            <PasswordInput
              value={current}
              onChange={(e) => {
                setCurrent(e.target.value);
                setError(null);
              }}
              autoComplete="current-password"
            />
          </Field>
        ) : null}

        <Field label={t('auth.first.new')}>
          <PasswordInput
            value={next}
            onChange={(e) => {
              setNext(e.target.value);
              setError(null);
            }}
            autoComplete="new-password"
            autoFocus={!askCurrent}
          />
        </Field>
        <Field label={t('auth.first.confirm')} error={confirm && next && confirm !== next && confirm.length >= next.length ? t('auth.mismatch') : null}>
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

        <div className="sticky-bar auth-sticky">
          <Button type="submit" variant="primary" size="lg" block disabled={!valid} loading={busy}>
            {t('auth.first.submit')}
          </Button>
          <p className="caption muted text-center">{staff ? t('auth.first.nextStaff') : t('auth.first.nextMember')}</p>
          <button type="button" className="link-btn muted small" onClick={signOut}>
            {t('auth.first.logout')}
          </button>
        </div>
      </form>
    </main>
  );
}
