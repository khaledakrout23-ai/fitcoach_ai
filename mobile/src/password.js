import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { api } from './api';
import { useI18n } from './i18n';
import { colors } from './theme';
import { Button, Card, ErrorText, Field, H2, styles } from './ui';

// Mêmes règles que le serveur : 8 caractères, une majuscule, une minuscule, un chiffre
export const PASSWORD_RULES = [
  ['pw.length', (p) => p.length >= 8],
  ['pw.upper', (p) => /[A-Z]/.test(p)],
  ['pw.lower', (p) => /[a-z]/.test(p)],
  ['pw.digit', (p) => /\d/.test(p)],
];

export const passwordOk = (p) => PASSWORD_RULES.every(([, ok]) => ok(p || ''));

// Règles cochées en direct pendant la saisie
export function PasswordChecklist({ value }) {
  const { t, text, row } = useI18n();
  return (
    <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 4 }}>
      {PASSWORD_RULES.map(([key, ok]) => {
        const done = ok(value || '');
        return (
          <Text key={key} style={[{ width: '48%', fontSize: 13, color: done ? colors.ok : colors.muted, fontWeight: done ? '700' : '400' }, text]}>
            {done ? '✓' : '○'} {t(key)}
          </Text>
        );
      })}
    </View>
  );
}

// Champ mot de passe avec bouton afficher/masquer
export function PasswordField({ label, value, onChangeText, rules }) {
  const { t, text, row } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, text]}>{label}</Text>
      <View style={{ flexDirection: row, gap: 8, alignItems: 'center' }}>
        <TextInput
          style={[styles.input, { flex: 1 }, text]}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.muted}
        />
        <Pressable onPress={() => setShow(!show)} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: colors.brand, fontWeight: '700' }}>{show ? t('pw.hide') : t('pw.show')}</Text>
        </Pressable>
      </View>
      {rules && <PasswordChecklist value={value} />}
    </View>
  );
}

// Champ du code à 6 chiffres reçu par e-mail
export function CodeField({ label, value, onChangeText }) {
  return (
    <Field
      label={label}
      value={value}
      onChangeText={(v) => onChangeText(v.replace(/\D/g, '').slice(0, 6))}
      keyboardType="number-pad"
      textContentType="oneTimeCode"
      autoComplete="one-time-code"
      maxLength={6}
      style={[styles.input, { fontSize: 28, fontWeight: '800', letterSpacing: 10, textAlign: 'center' }]}
    />
  );
}

// Délai avant de pouvoir redemander un code
export function useCooldown(initial) {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    if (left <= 0) return undefined;
    const id = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  return [left, () => setLeft(60)];
}

// Carte « Changer mon mot de passe » (profil)
export function ChangePasswordCard() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    if (v.next !== v.confirm) return setError({ code: 'PASSWORD_MISMATCH' });
    setBusy(true);
    try {
      await api('/me/password', { method: 'PUT', body: { currentPassword: v.current, newPassword: v.next } });
      setV({ current: '', next: '', confirm: '' });
      setOpen(false);
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  return (
    <Card>
      <H2>🔒 {t('pw.changeTitle')}</H2>
      {done && !open && <Text style={{ color: colors.ok, fontWeight: '700' }}>✓ {t('pw.changed')}</Text>}
      {!open ? (
        <Button
          variant="ghost"
          title={t('pw.changeTitle')}
          onPress={() => {
            setOpen(true);
            setDone(false);
          }}
        />
      ) : (
        <>
          <PasswordField label={t('pw.current')} value={v.current} onChangeText={(x) => setV({ ...v, current: x })} />
          <PasswordField label={t('pw.new')} value={v.next} onChangeText={(x) => setV({ ...v, next: x })} rules />
          <PasswordField label={t('pw.confirm')} value={v.confirm} onChangeText={(x) => setV({ ...v, confirm: x })} />
          <ErrorText error={error} />
          <Button title={t('pw.save')} onPress={save} disabled={busy || !v.current || !passwordOk(v.next)} />
          <Button variant="ghost" title={t('common.cancel')} onPress={() => setOpen(false)} />
        </>
      )}
    </Card>
  );
}
