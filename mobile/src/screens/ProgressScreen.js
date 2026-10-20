import { Text, View } from 'react-native';
import { api } from '../api';
import { useI18n } from '../i18n';
import { colors } from '../theme';
import { Card, H2, Loading, P, Screen, useLoad } from '../ui';

function Bars({ data, format }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 150, gap: 6 }}>
      {data.map((d, i) => (
        <View key={d.label} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          {d.value > 0 && <Text style={{ fontSize: 10, color: colors.ink, fontWeight: '700' }}>{format(d.value)}</Text>}
          <View
            style={{
              width: '70%',
              height: Math.max(3, (d.value / max) * 110),
              borderRadius: 4,
              backgroundColor: i === data.length - 1 ? colors.signal : colors.brand,
              opacity: d.value === 0 ? 0.25 : 1,
            }}
          />
          <Text style={{ fontSize: 10, color: colors.muted }}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

function Stat({ value, label }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 12 }}>
      <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink }}>{value}</Text>
      <Text style={{ fontSize: 12, color: colors.muted }}>{label}</Text>
    </View>
  );
}

export default function ProgressScreen() {
  const { t, name, muscle, meta, num, date, row, text } = useI18n();
  const progress = useLoad(() => api('/progress'));

  if (progress.loading) return <Loading />;
  const p = progress.data;
  if (!p) return null;

  const muscles = Object.keys(meta.muscles).map((m) => ({ key: m, label: muscle(m), value: p.musclesThisWeek[m] || 0 }));
  const maxSets = Math.max(1, ...muscles.map((m) => m.value));

  return (
    <Screen title={t('nav.progress')} subtitle={t('progress.sub')}>
      <View style={{ flexDirection: row, gap: 8 }}>
        <Stat value={p.totalSessions} label={t('progress.total')} />
        <Stat value={`${p.thisWeekSessions}/${p.weeklyTarget}`} label={t('home.sessionsWeek')} />
        <Stat value={p.streakWeeks} label={t('home.streak')} />
      </View>

      {p.totalSessions === 0 ? (
        <Card>
          <H2>{t('progress.emptyTitle')}</H2>
          <P muted>{t('progress.emptyText')}</P>
        </Card>
      ) : (
        <>
          <Card>
            <H2>{t('progress.volume')}</H2>
            <Bars data={p.weeks.map((w) => ({ label: date(w.week).split(' ')[0], value: w.volume }))} format={(v) => (v >= 1000 ? `${num(v / 1000)}t` : v)} />
          </Card>

          <Card>
            <H2>{t('progress.muscles')}</H2>
            {muscles.map((m) => (
              <View key={m.key} style={{ flexDirection: row, alignItems: 'center', gap: 8 }}>
                <Text style={[{ width: 110, color: m.value === 0 ? colors.danger : colors.ink, fontSize: 13 }, text]}>{m.label}</Text>
                <View style={{ flex: 1, height: 10, backgroundColor: colors.surface2, borderRadius: 5, overflow: 'hidden' }}>
                  <View style={{ width: `${(m.value / maxSets) * 100}%`, height: 10, backgroundColor: colors.brand, borderRadius: 5 }} />
                </View>
                <Text style={{ width: 24, textAlign: 'center', fontWeight: '700', color: colors.ink }}>{m.value}</Text>
              </View>
            ))}
          </Card>

          <Card>
            <H2>{t('progress.records')}</H2>
            {p.records.map((r) => (
              <View key={r.exercise.id} style={{ flexDirection: row, justifyContent: 'space-between', gap: 8 }}>
                <Text style={[{ flex: 1, color: colors.ink }, text]}>{name(r.exercise)}</Text>
                <Text style={{ fontWeight: '800', color: colors.ink }}>
                  {num(r.weight)} kg × {r.reps}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
