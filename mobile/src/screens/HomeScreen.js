import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { api } from '../api';
import { useAuth, useNav } from '../context';
import { useI18n } from '../i18n';
import { colors } from '../theme';
import { Button, Card, Chip, ErrorText, H2, Loading, P, Screen, styles, useLoad } from '../ui';
import { missing } from '../mealReminder';
import Ring from '../Ring';
import { localDay } from './MealsScreen';

export function profileComplete(user) {
  return Boolean(user.gymId && user.goal && user.level && user.daysPerWeek);
}

export default function HomeScreen() {
  const { user } = useAuth();
  const nav = useNav();
  const { t, name, text, row } = useI18n();
  const complete = profileComplete(user);
  const today = useLoad(() => (complete ? api('/programs/today') : Promise.resolve(null)), [complete]);
  const sub = useLoad(() => api('/me/subscription'));
  const occupancy = useLoad(() => (user.gymId ? api(`/gyms/${user.gymId}/occupancy`) : Promise.resolve(null)), [user.gymId]);
  const meals = useLoad(() => api(`/nutrition/day?date=${localDay()}`));
  const lacking = meals.data ? missing(meals.data.target, meals.data.totals) : [];
  const evening = new Date().getHours() >= 18;
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function start(quick30) {
    setBusy(true);
    setError(null);
    try {
      const session = await api('/sessions', { method: 'POST', body: { dayIndex: today.data.day.dayIndex, quick30 } });
      nav.push('session', { id: session.id });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={t('home.hello', { name: user.name.split(' ')[0] })} subtitle={user.gym ? user.gym.name : t('home.noGym')}>
      {sub.data && sub.data.status !== 'ACTIF' && (
        <View style={{ backgroundColor: sub.data.status === 'EXPIRE' ? colors.dangerSoft : colors.signalSoft, borderRadius: 10, padding: 12 }}>
          <P>{sub.data.status === 'EXPIRE' ? t('home.subExpired') : t('home.subSoon', { n: sub.data.daysLeft })}</P>
        </View>
      )}

      {!complete && (
        <Card>
          <H2>{t('home.completeTitle')}</H2>
          <P muted>{t('home.completeText')}</P>
          <Button title={t('home.completeAction')} onPress={() => nav.reset('profile')} />
        </Card>
      )}

      {complete && today.loading && <Loading />}

      {complete && !today.loading && !today.data && (
        <Card>
          <H2>{t('home.noProgramTitle')}</H2>
          <P muted>{t('home.noProgramText')}</P>
          <Button title={t('program.generate')} onPress={() => nav.reset('program')} />
        </Card>
      )}

      {today.data && (
        <Card>
          <P muted style={{ fontSize: 13 }}>
            {t('home.today', { n: today.data.day.dayIndex, total: today.data.totalDays })}
          </P>
          <Text style={[{ fontSize: 22, fontWeight: '800', color: colors.ink }, text]}>{name(today.data.day, 'label')}</Text>
          {today.data.day.items.map((it) => (
            <Pressable key={it.id} style={[styles.row, { flexDirection: row }]} onPress={() => nav.push('exercise', { id: it.exercise.id })}>
              <View style={{ flex: 1 }}>
                <Text style={[{ fontWeight: '700', color: colors.ink, fontSize: 15 }, text]}>{name(it.exercise)}</Text>
                <Text style={[{ color: colors.muted, fontSize: 13 }, text]}>{name(it.exercise.equipment)}</Text>
              </View>
              <Chip label={`${it.sets} × ${it.reps}`} />
            </Pressable>
          ))}
          <ErrorText error={error} />
          {today.data.inProgressSessionId ? (
            <Button title={t('home.resume')} onPress={() => nav.push('session', { id: today.data.inProgressSessionId })} />
          ) : (
            <View style={{ flexDirection: row, gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button title={t('home.quick30')} variant="ghost" onPress={() => start(true)} disabled={busy} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title={t('home.start')} onPress={() => start(false)} disabled={busy} />
              </View>
            </View>
          )}
        </Card>
      )}

      {meals.data?.target && (
        <Pressable onPress={() => nav.reset('meals')} accessibilityRole="button">
          <Card style={lacking.length && evening ? { borderColor: colors.danger, borderWidth: 2 } : null}>
            <H2>{t('home.mealsTitle')}</H2>
            <View style={{ flexDirection: row, alignItems: 'center', gap: 14 }}>
              <Ring size={72} stroke={8} progress={meals.data.totals.calories / meals.data.target.calories} color={colors.brand} track={colors.surface2}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.ink }}>{Math.round((meals.data.totals.calories / meals.data.target.calories) * 100)}%</Text>
              </Ring>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[{ fontWeight: '800', color: colors.ink, fontSize: 16 }, text]}>
                  {meals.data.totals.calories} / {meals.data.target.calories} kcal
                </Text>
                <Text style={[{ color: colors.ink }, text]}>
                  {t('meals.protein')} : <Text style={{ fontWeight: '700' }}>{meals.data.totals.protein} / {meals.data.target.protein} g</Text>
                </Text>
                <Text style={[{ color: colors.ink }, text]}>
                  {t('meals.carbs')} : <Text style={{ fontWeight: '700' }}>{meals.data.totals.carbs} / {meals.data.target.carbs} g</Text>
                </Text>
              </View>
            </View>
            {lacking.length > 0 && evening && <P style={{ color: colors.danger, fontWeight: '700' }}>{t('meals.alertTitle')}</P>}
          </Card>
        </Pressable>
      )}

      {occupancy.data && (
        <Card>
          <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
            <H2>{t('home.gymNow')}</H2>
            <Chip
              label={t(`occupancy.${occupancy.data.level}`)}
              tone={occupancy.data.level === 'CHARGE' ? 'danger' : occupancy.data.level === 'MOYEN' ? 'warn' : 'ok'}
            />
          </View>
          <P>{t('home.peopleNow', { n: occupancy.data.count })}</P>
        </Card>
      )}
    </Screen>
  );
}
