import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from './theme';
import { useI18n } from './i18n';

// top : bloc fixe au-dessus de la page (ex. vidéo), le reste défile en dessous
export function Screen({ children, title, subtitle, right, onBack, top }) {
  const { t, text, row } = useI18n();
  return (
    <View style={styles.screen}>
      {top}
      <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
        {onBack && (
          <Pressable onPress={onBack} style={{ marginBottom: 8 }} accessibilityRole="button">
            <Text style={[styles.link, text]}>{t('mobile.back')}</Text>
          </Pressable>
        )}
        {title ? (
          <View style={[styles.head, { flexDirection: row }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.h1, text]}>{title}</Text>
              {subtitle ? <Text style={[styles.muted, text]}>{subtitle}</Text> : null}
            </View>
            {right}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </View>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function H2({ children }) {
  const { text } = useI18n();
  return <Text style={[styles.h2, text]}>{children}</Text>;
}

export function P({ children, muted, style }) {
  const { text } = useI18n();
  return <Text style={[styles.p, muted && styles.muted, text, style]}>{children}</Text>;
}

export function Button({ title, onPress, variant = 'primary', disabled, small }) {
  const ghost = variant === 'ghost';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        ghost && styles.btnGhost,
        variant === 'danger' && { backgroundColor: colors.danger },
        (pressed || disabled) && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.btnText, ghost && { color: colors.ink }, small && { fontSize: 14 }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }) {
  const { text } = useI18n();
  return (
    <View style={{ gap: 4 }}>
      <Text style={[styles.label, text]}>{label}</Text>
      <TextInput style={[styles.input, text]} placeholderTextColor={colors.muted} {...props} />
    </View>
  );
}

export function Chip({ label, on, onPress, tone }) {
  const bg = on ? colors.brandSoft : tone === 'warn' ? colors.signalSoft : tone === 'danger' ? colors.dangerSoft : tone === 'ok' ? colors.okSoft : colors.surface;
  const fg = on ? colors.brand : tone === 'warn' ? '#6B4E00' : tone === 'danger' ? colors.danger : tone === 'ok' ? colors.ok : colors.ink;
  const content = <Text style={{ color: fg, fontWeight: '600', fontSize: 13 }}>{label}</Text>;
  const style = [styles.chip, { backgroundColor: bg, borderColor: on ? colors.brand : tone ? 'transparent' : colors.line }];
  return onPress ? (
    <Pressable style={style} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }}>
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: 40 }}>
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

export function ErrorText({ error }) {
  const { error: msg, text } = useI18n();
  if (!error) return null;
  return <Text style={[{ color: colors.danger, fontWeight: '600' }, text]}>{msg(error)}</Text>;
}

// Charge des données de l'API
export function useLoad(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return loader()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => setState({ data: null, loading: false, error }));
  }, deps);
  useEffect(() => {
    run();
  }, [run]);
  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) };
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { padding: 16, paddingBottom: 40, gap: 14 },
  head: { alignItems: 'flex-end', gap: 10, marginBottom: 4 },
  h1: { fontSize: 28, fontWeight: '800', color: colors.ink },
  h2: { fontSize: 18, fontWeight: '700', color: colors.ink },
  p: { fontSize: 15, color: colors.ink, lineHeight: 21 },
  muted: { color: colors.muted },
  link: { color: colors.brand, fontWeight: '700', fontSize: 15 },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 10 },
  btn: { backgroundColor: colors.brand, borderRadius: 10, minHeight: 48, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { minHeight: 36, paddingHorizontal: 12 },
  btnGhost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  label: { fontWeight: '700', color: colors.ink, fontSize: 14 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8, minHeight: 46, paddingHorizontal: 12, fontSize: 16, color: colors.ink },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  row: { alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
});
