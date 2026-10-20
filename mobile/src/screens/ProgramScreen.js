import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '../api';
import { useAuth, useNav } from '../context';
import { useI18n } from '../i18n';
import { colors } from '../theme';
import { Button, Card, Chip, ErrorText, H2, Loading, P, Screen, styles, useLoad } from '../ui';
import { profileComplete } from './HomeScreen';
import VideoFrame from '../VideoFrame';

export default function ProgramScreen() {
  const { user } = useAuth();
  const nav = useNav();
  const { t, name, muscle, row, text } = useI18n();
  const program = useLoad(() => api('/programs/current'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [videoEx, setVideoEx] = useState(null); // exercice dont la vidéo est affichée en haut

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      program.setData(await api('/programs/generate', { method: 'POST' }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (program.loading && !program.data) return <Loading />;
  const p = program.data;

  return (
    <Screen
      title={t('nav.program')}
      subtitle={p ? p.title : null}
      top={videoEx && <VideoFrame exercise={videoEx} onClose={() => setVideoEx(null)} />}
    >
      {!profileComplete(user) ? (
        <Card>
          <H2>{t('home.completeTitle')}</H2>
          <P muted>{t('home.completeText')}</P>
          <Button title={t('home.completeAction')} onPress={() => nav.reset('profile')} />
        </Card>
      ) : (
        <>
          {p && <Chip on={p.source === 'IA'} label={t(`program.source.${p.source}`)} />}
          <Button
            title={busy ? t('program.generating') : p ? t('program.regenerate') : t('program.generate')}
            variant={p ? 'ghost' : 'primary'}
            onPress={generate}
            disabled={busy}
          />
          <ErrorText error={error} />
          {!p && <P muted>{t('program.explain')}</P>}
        </>
      )}

      {p &&
        p.days.map((day) => (
          <Card key={day.dayIndex}>
            <H2>
              {t('program.day', { n: day.dayIndex })} · {name(day, 'label')}
            </H2>
            {day.items.map((it) => {
              const playing = videoEx?.id === it.exercise.id;
              return (
                <Pressable
                  key={it.id}
                  style={[styles.row, { flexDirection: row }, playing && { backgroundColor: colors.brandSoft }]}
                  onPress={() => setVideoEx(playing ? null : it.exercise)}
                  accessibilityState={{ selected: playing }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[{ fontWeight: '700', color: playing ? colors.brand : colors.ink }, text]}>
                      {playing ? '▶ ' : ''}
                      {name(it.exercise)}
                    </Text>
                    <Text style={[{ color: colors.muted, fontSize: 13 }, text]}>
                      {muscle(it.exercise.primaryMuscle)} · {t('program.rest', { s: it.restSec })}
                    </Text>
                  </View>
                  <Chip label={`${it.sets} × ${it.reps}`} />
                  <Chip label={t('session.sheet')} onPress={() => nav.push('exercise', { id: it.exercise.id })} />
                </Pressable>
              );
            })}
          </Card>
        ))}
    </Screen>
  );
}
