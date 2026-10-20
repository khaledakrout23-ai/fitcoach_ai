import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../context';
import { useI18n } from '../i18n';
import { API_URL, api } from '../api';
import { colors } from '../theme';
import { Button, Card, ErrorText, Field, P, Screen } from '../ui';
import { CodeField, PasswordField, passwordOk, useCooldown } from '../password';

// Étapes : connexion, inscription, code de vérification, mot de passe oublié (e-mail puis code + nouveau mot de passe)
export default function LoginScreen() {
  const { login, register, verifyEmail, resetPassword } = useAuth();
  const { t, lang, setLang, text, row } = useI18n();
  const [mode, setMode] = useState('login');
  const [v, setV] = useState({ name: '', email: '', password: '', code: '', confirm: '' });
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, restartCooldown] = useCooldown(0);
  const set = (k) => (x) => setV({ ...v, [k]: x });
  const email = v.email.trim();

  function go(next) {
    setMode(next);
    setError(null);
    setInfo(null);
    setV((old) => ({ ...old, code: '', confirm: '', password: next === 'reset' || next === 'register' ? '' : old.password }));
  }

  // Exécute une action et gère le chargement et les erreurs
  async function run(fn) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const submitLogin = () =>
    run(async () => {
      try {
        await login(email, v.password);
      } catch (err) {
        if (err.code !== 'EMAIL_NOT_VERIFIED') throw err;
        // adresse pas encore confirmée : un code vient d'être envoyé
        go('verify');
        restartCooldown();
      }
    });

  const submitRegister = () =>
    run(async () => {
      await register({ name: v.name, email, password: v.password, language: lang });
      go('verify');
      restartCooldown();
    });

  const submitVerify = () => run(() => verifyEmail(email, v.code));

  const resend = (purpose) =>
    run(async () => {
      await api(purpose === 'RESET' ? '/auth/forgot-password' : '/auth/resend-code', { method: 'POST', body: { email, purpose } });
      setInfo(t('verify.resent'));
      restartCooldown();
    });

  const submitForgot = () =>
    run(async () => {
      await api('/auth/forgot-password', { method: 'POST', body: { email } });
      go('reset');
      restartCooldown();
    });

  const submitReset = () =>
    run(async () => {
      if (v.password !== v.confirm) throw Object.assign(new Error(''), { code: 'PASSWORD_MISMATCH' });
      await resetPassword(email, v.code, v.password);
    });

  const titles = {
    login: t('auth.loginTitle'),
    register: t('auth.registerTitle'),
    verify: t('verify.title'),
    forgot: t('forgot.title'),
    reset: t('forgot.newTitle'),
  };

  const link = (label, onPress, disabled) => (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" hitSlop={6}>
      <Text style={[{ color: disabled ? colors.muted : colors.brand, fontWeight: '700' }, text]}>{label}</Text>
    </Pressable>
  );

  const emailNote = (key) => (
    <View style={{ backgroundColor: colors.brandSoft, borderRadius: 10, padding: 12 }}>
      <P>
        {t(key)} <Text style={{ fontWeight: '800' }}>{email}</Text>
      </P>
    </View>
  );

  const resendLink = (purpose) =>
    link(cooldown > 0 ? `${t('verify.noMail')} ${t('verify.resendIn', { s: cooldown })}` : `${t('verify.noMail')} ${t('verify.resend')}`, () => resend(purpose), cooldown > 0 || busy);

  return (
    <Screen>
      <View style={{ backgroundColor: colors.ink, borderRadius: 16, padding: 20, gap: 10 }}>
        <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>FitCoach AI</Text>
          <Pressable onPress={() => setLang(lang === 'fr' ? 'ar' : 'fr')} accessibilityRole="button">
            <Text style={{ color: colors.signal, fontWeight: '700' }}>{lang === 'fr' ? 'العربية' : 'Français'}</Text>
          </Pressable>
        </View>
        <Text style={[{ color: '#fff', fontSize: 30, fontWeight: '800', lineHeight: 34 }, text]}>{t('auth.pitch')}</Text>
      </View>

      <Card>
        <Text style={[{ fontSize: 24, fontWeight: '800', color: colors.ink }, text]}>{titles[mode]}</Text>

        {(mode === 'login' || mode === 'register') && (
          <>
            {mode === 'register' && <Field label={t('auth.name')} value={v.name} onChangeText={set('name')} />}
            <Field label={t('auth.email')} value={v.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <PasswordField label={t('auth.password')} value={v.password} onChangeText={set('password')} rules={mode === 'register'} />
            {mode === 'login' && <View style={{ alignItems: 'flex-end' }}>{link(t('forgot.link'), () => go('forgot'))}</View>}
            <ErrorText error={error} />
            {mode === 'login' ? (
              <Button title={t('auth.login')} onPress={submitLogin} disabled={busy || !email || !v.password} />
            ) : (
              <Button title={t('auth.createAccount')} onPress={submitRegister} disabled={busy || !v.name || !email || !passwordOk(v.password)} />
            )}
            {link(mode === 'login' ? `${t('auth.noAccount')} ${t('auth.createAccount')}` : `${t('auth.haveAccount')} ${t('auth.login')}`, () => go(mode === 'login' ? 'register' : 'login'))}
          </>
        )}

        {mode === 'verify' && (
          <>
            {emailNote('verify.sent')}
            <CodeField label={t('verify.code')} value={v.code} onChangeText={set('code')} />
            <ErrorText error={error} />
            {info && <Text style={{ color: colors.ok, fontWeight: '600' }}>{info}</Text>}
            <Button title={t('verify.submit')} onPress={submitVerify} disabled={busy || v.code.length !== 6} />
            {resendLink('VERIFY')}
            {link(t('verify.back'), () => go('login'))}
          </>
        )}

        {mode === 'forgot' && (
          <>
            <P muted>{t('forgot.explain')}</P>
            <Field label={t('auth.email')} value={v.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <ErrorText error={error} />
            <Button title={t('forgot.send')} onPress={submitForgot} disabled={busy || !email} />
            {link(t('verify.back'), () => go('login'))}
          </>
        )}

        {mode === 'reset' && (
          <>
            {emailNote('forgot.sent')}
            <CodeField label={t('verify.code')} value={v.code} onChangeText={set('code')} />
            <PasswordField label={t('pw.new')} value={v.password} onChangeText={set('password')} rules />
            <PasswordField label={t('pw.confirm')} value={v.confirm} onChangeText={set('confirm')} />
            <ErrorText error={error} />
            {info && <Text style={{ color: colors.ok, fontWeight: '600' }}>{info}</Text>}
            <Button title={t('forgot.submit')} onPress={submitReset} disabled={busy || v.code.length !== 6 || !passwordOk(v.password)} />
            {resendLink('RESET')}
            {link(t('verify.back'), () => go('login'))}
          </>
        )}
      </Card>

      <P muted style={{ fontSize: 12 }}>
        {t('auth.demo')} : sportif@fitcoach.tn · Sportif123!
      </P>
      <P muted style={{ fontSize: 12 }}>
        API : {API_URL} · {t('mobile.serverHint')}
      </P>
    </Screen>
  );
}
