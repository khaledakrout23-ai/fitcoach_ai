import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { api } from '../api';
import { useAuth, useNav } from '../context';
import { useI18n } from '../i18n';
import { colors } from '../theme';
import { Button, Card, Chip, ErrorText, Field, H2, P, Screen, useLoad } from '../ui';
import { profileComplete } from './HomeScreen';
import { ChangePasswordCard } from '../password';

const GOALS = ['PRISE_MASSE', 'PERTE_POIDS', 'FORCE', 'FORME'];
const LEVELS = ['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE'];

// Choix unique sous forme de pastilles
function Choice({ label, options, value, onChange }) {
  const { row, text } = useI18n();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[{ fontWeight: '700', color: colors.ink }, text]}>{label}</Text>
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
        {options.map(([v, l]) => (
          <Chip key={String(v)} label={l} on={value === v} onPress={() => onChange(v)} />
        ))}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { user, setUser, logout } = useAuth();
  const nav = useNav();
  const { t, setLang, lang, meta, zone, row, text } = useI18n();
  const gyms = useLoad(() => api('/gyms'));
  const [v, setV] = useState({
    name: user.name,
    gymId: user.gymId || null,
    goal: user.goal || null,
    level: user.level || null,
    daysPerWeek: user.daysPerWeek || 3,
    age: user.age ? String(user.age) : '',
    height: user.height ? String(user.height) : '',
    weight: user.weight ? String(user.weight) : '',
    injuries: user.injuries || [],
    healthConsent: Boolean(user.healthConsent),
    language: user.language || lang,
  });
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setError(null);
    setSaved(false);
    const wasComplete = profileComplete(user);
    try {
      const fresh = await api('/me/profile', {
        method: 'PUT',
        body: {
          ...v,
          age: v.age ? Number(v.age) : null,
          height: v.height ? Number(v.height) : null,
          weight: v.healthConsent && v.weight ? Number(v.weight.replace(',', '.')) : null,
          injuries: v.healthConsent ? v.injuries : [],
        },
      });
      setUser(fresh);
      setLang(fresh.language);
      if (!wasComplete && profileComplete(fresh)) nav.reset('program');
      else setSaved(true);
    } catch (err) {
      setError(err);
    }
  }

  const toggleZone = (z) => setV({ ...v, injuries: v.injuries.includes(z) ? v.injuries.filter((x) => x !== z) : [...v.injuries, z] });

  return (
    <Screen title={t('profile.title')} subtitle={t('profile.sub')}>
      <Card>
        <Field label={t('auth.name')} value={v.name} onChangeText={(x) => setV({ ...v, name: x })} />
        <Choice label={t('profile.language')} options={[['fr', 'Français'], ['ar', 'العربية']]} value={v.language} onChange={(x) => setV({ ...v, language: x })} />
        <Choice label={t('profile.gym')} options={(gyms.data || []).map((g) => [g.id, g.name])} value={v.gymId} onChange={(x) => setV({ ...v, gymId: x })} />
        <Choice label={t('profile.goal')} options={GOALS.map((g) => [g, t(`goal.${g}`)])} value={v.goal} onChange={(x) => setV({ ...v, goal: x })} />
        <Choice label={t('profile.level')} options={LEVELS.map((l) => [l, t(`level.${l}`)])} value={v.level} onChange={(x) => setV({ ...v, level: x })} />
        <Choice label={t('profile.days')} options={[2, 3, 4, 5, 6].map((n) => [n, String(n)])} value={v.daysPerWeek} onChange={(x) => setV({ ...v, daysPerWeek: x })} />
        <View style={{ flexDirection: row, gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label={t('profile.age')} value={v.age} onChangeText={(x) => setV({ ...v, age: x })} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t('profile.height')} value={v.height} onChangeText={(x) => setV({ ...v, height: x })} keyboardType="number-pad" />
          </View>
        </View>
      </Card>

      <Card>
        <H2>{t('profile.health')}</H2>
        <View style={{ flexDirection: row, alignItems: 'center', gap: 10 }}>
          <Switch value={v.healthConsent} onValueChange={(x) => setV({ ...v, healthConsent: x })} trackColor={{ true: colors.brand }} />
          <Text style={[{ flex: 1, color: colors.ink }, text]}>{t('profile.consent')}</Text>
        </View>
        {v.healthConsent && (
          <>
            <Field label={t('profile.weight')} value={v.weight} onChangeText={(x) => setV({ ...v, weight: x })} keyboardType="decimal-pad" />
            <Text style={[{ fontWeight: '700', color: colors.ink }, text]}>{t('profile.injuries')}</Text>
            <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 8 }}>
              {Object.keys(meta.injuryZones).map((z) => (
                <Chip key={z} label={zone(z)} on={v.injuries.includes(z)} onPress={() => toggleZone(z)} />
              ))}
            </View>
            <P muted style={{ fontSize: 13 }}>
              {t('profile.injuriesHint')}
            </P>
          </>
        )}
        <P muted style={{ fontSize: 12 }}>
          {t('profile.disclaimer')}
        </P>
      </Card>

      <ErrorText error={error} />
      {saved && <P style={{ color: colors.ok, fontWeight: '700' }}>{t('profile.saved')}</P>}
      <Button title={t('profile.save')} onPress={save} />
      <ChangePasswordCard />
      <Button title={t('nav.logout')} variant="ghost" onPress={logout} />
    </Screen>
  );
}
