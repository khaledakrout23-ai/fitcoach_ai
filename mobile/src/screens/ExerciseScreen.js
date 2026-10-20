import { Text, View } from 'react-native';
import { api } from '../api';
import { useNav } from '../context';
import { useI18n } from '../i18n';
import { colors } from '../theme';
import { Card, Chip, ErrorText, H2, Loading, Screen, useLoad } from '../ui';
import VideoFrame from '../VideoFrame';

export default function ExerciseScreen({ params }) {
  const nav = useNav();
  const { t, name, list, muscle, row, text } = useI18n();
  const ex = useLoad(() => api(`/exercises/${params.id}`), [params.id]);

  if (ex.loading) return <Loading />;
  if (!ex.data) return <ErrorText error={ex.error} />;
  const e = ex.data;

  // vidéo (choisie par l'administrateur, sinon trouvée sur YouTube) lue dans l'application, en haut de la fiche
  return (
    <Screen title={name(e)} onBack={nav.back} top={<VideoFrame exercise={e} />}>
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 6 }}>
        <Chip on label={muscle(e.primaryMuscle)} />
        {e.secondaryMuscles.map((m) => (
          <Chip key={m} label={muscle(m)} />
        ))}
        <Chip label={name(e.equipment)} />
      </View>

      <Card>
        <H2>{t('exercise.benefits')}</H2>
        {list(e, 'benefits').map((b) => (
          <View key={b} style={{ flexDirection: row, gap: 8 }}>
            <Text style={{ color: colors.ok, fontWeight: '800' }}>✓</Text>
            <Text style={[{ flex: 1, color: colors.ink, fontSize: 15 }, text]}>{b}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <H2>{t('exercise.mistakes')}</H2>
        {list(e, 'mistakes').map((b) => (
          <View key={b} style={{ flexDirection: row, gap: 8 }}>
            <Text style={{ color: colors.danger, fontWeight: '800' }}>✕</Text>
            <Text style={[{ flex: 1, color: colors.ink, fontSize: 15 }, text]}>{b}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
