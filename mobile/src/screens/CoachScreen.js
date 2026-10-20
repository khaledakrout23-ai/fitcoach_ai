import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import { useI18n } from '../i18n';
import { colors } from '../theme';
import { Button, Chip, ErrorText, Loading, P, useLoad } from '../ui';

export default function CoachScreen() {
  const { t, row, text } = useI18n();
  const chat = useLoad(() => api('/coach/messages'));
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const scroll = useRef(null);

  const messages = chat.data?.messages || [];

  async function send(content) {
    const msg = (content ?? value).trim();
    if (!msg) return;
    const base = { aiEnabled: chat.data?.aiEnabled };
    setBusy(true);
    setError(null);
    setValue('');
    chat.setData({ ...base, messages: [...messages, { id: `tmp-${Date.now()}`, role: 'user', content: msg }] });
    try {
      const { question, answer } = await api('/coach/messages', { method: 'POST', body: { content: msg } });
      chat.setData({ ...base, messages: [...messages, question, answer] });
    } catch (err) {
      setError(err);
      chat.setData({ ...base, messages });
      setValue(msg);
    } finally {
      setBusy(false);
    }
  }

  if (chat.loading && !chat.data) return <Loading />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ padding: 16, paddingBottom: 6 }}>
        <Text style={[{ fontSize: 28, fontWeight: '800', color: colors.ink }, text]}>{t('nav.coach')}</Text>
        <P muted style={{ fontSize: 13 }}>
          {chat.data?.aiEnabled ? t('coach.aiOn') : t('coach.aiOff')}
        </P>
      </View>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && (
          <View style={{ gap: 10 }}>
            <P muted>{t('coach.empty')}</P>
            <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
              {['coach.s1', 'coach.s2', 'coach.s3'].map((k) => (
                <Chip key={k} label={t(k)} onPress={() => send(t(k))} />
              ))}
            </View>
          </View>
        )}
        {messages.map((m) => {
          const mine = m.role === 'user';
          return (
            <View
              key={m.id}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                backgroundColor: mine ? colors.brand : colors.surface,
                borderWidth: mine ? 0 : 1,
                borderColor: colors.line,
                borderRadius: 16,
                padding: 12,
              }}
            >
              <Text style={[{ color: mine ? '#fff' : colors.ink, fontSize: 15, lineHeight: 21 }, text]}>{m.content}</Text>
            </View>
          );
        })}
        {busy && <P muted>{t('coach.typing')}</P>}
        <ErrorText error={error} />
      </ScrollView>
      <View style={{ flexDirection: row, gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface }}>
        <TextInput
          style={[{ flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, minHeight: 46, fontSize: 16, color: colors.ink }, text]}
          value={value}
          onChangeText={setValue}
          placeholder={t('coach.placeholder')}
          placeholderTextColor={colors.muted}
          onSubmitEditing={() => send()}
          returnKeyType="send"
        />
        <Button title={t('coach.send')} onPress={() => send()} disabled={busy || !value.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}
