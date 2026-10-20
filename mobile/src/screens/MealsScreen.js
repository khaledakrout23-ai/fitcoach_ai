import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import { takePhoto } from '../camera';
import { useNav } from '../context';
import { useI18n } from '../i18n';
import { missing, updateMealReminder } from '../mealReminder';
import Ring from '../Ring';
import { colors } from '../theme';
import { Button, Card, Chip, ErrorText, H2, Loading, P, Screen, styles, useLoad } from '../ui';
import { GoalCard, StatsCard } from './NutritionStats';

const MACROS = [
  ['calories', 'kcal'],
  ['protein', 'g'],
  ['carbs', 'g'],
  ['fat', 'g'],
];
const ALERT_HOUR = 18; // à partir de 18 h, un objectif non atteint devient une alerte

// Couleurs du bloc « aujourd'hui » (fond sombre)
const HERO = {
  bg: colors.ink,
  track: 'rgba(255,255,255,0.12)',
  soft: 'rgba(255,255,255,0.65)',
  calories: '#4FD1C5',
  protein: '#68D391',
  carbs: '#F6AD55',
  fat: '#FC8181',
};

// Jour local du téléphone (AAAA-MM-JJ)
export function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Un macronutriment : anneau + « 51 / 148 g » + ce qu'il reste
function MacroRing({ label, value, target, color }) {
  const { t } = useI18n();
  const pct = target ? Math.round((value / target) * 100) : 0;
  const done = value >= target;
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <Ring size={80} stroke={8} progress={target ? value / target : 0} color={color} track={HERO.track}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: done ? 22 : 16 }}>{done ? '✓' : `${pct}%`}</Text>
      </Ring>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
        {value}
        <Text style={{ color: HERO.soft, fontWeight: '600', fontSize: 13 }}> / {target} g</Text>
      </Text>
      <Text style={{ color, fontWeight: '700', fontSize: 13 }}>{label}</Text>
      <Text style={{ color: HERO.soft, fontSize: 11 }}>{done ? t('meals.done') : t('meals.left', { n: target - value })}</Text>
    </View>
  );
}

// Bloc principal : objectif du jour et progression, mis à jour à chaque repas
function TodayHero({ target, totals, onRecompute, busy }) {
  const { t, lang, text } = useI18n();
  const today = new Date().toLocaleDateString(lang === 'ar' ? 'ar-TN' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const kcalLeft = target.calories - totals.calories;
  return (
    <View style={{ backgroundColor: HERO.bg, borderRadius: 20, padding: 18, gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Text style={[{ color: HERO.soft, fontSize: 12, fontWeight: '700', letterSpacing: 1 }, text]}>{today.toUpperCase()}</Text>
        <Text style={[{ color: '#fff', fontSize: 20, fontWeight: '800' }, text]}>{t('meals.objectiveTitle')}</Text>
        <Text style={[{ color: HERO.soft, fontSize: 14, lineHeight: 20 }, text]}>
          {t('meals.objective', { kcal: target.calories, p: target.protein, c: target.carbs, f: target.fat })}
        </Text>
      </View>

      <View style={{ alignItems: 'center' }}>
        <Ring size={190} stroke={16} progress={totals.calories / target.calories} color={HERO.calories} track={HERO.track}>
          <Text style={{ color: '#fff', fontSize: 40, fontWeight: '900' }}>{totals.calories}</Text>
          <Text style={{ color: HERO.soft, fontSize: 14, fontWeight: '600' }}>/ {target.calories} kcal</Text>
          <Text style={{ color: HERO.calories, fontSize: 13, fontWeight: '700', marginTop: 4 }}>
            {kcalLeft > 0 ? t('meals.kcalLeft', { n: kcalLeft }) : t('meals.done')}
          </Text>
        </Ring>
      </View>

      <View style={{ flexDirection: 'row', gap: 6 }}>
        <MacroRing label={t('meals.protein')} value={totals.protein} target={target.protein} color={HERO.protein} />
        <MacroRing label={t('meals.carbs')} value={totals.carbs} target={target.carbs} color={HERO.carbs} />
        <MacroRing label={t('meals.fat')} value={totals.fat} target={target.fat} color={HERO.fat} />
      </View>

      {target.advice && (
        <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 }}>
          <Text style={[{ color: '#fff', fontSize: 13, lineHeight: 19 }, text]}>💡 {target.advice}</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: HERO.soft, fontSize: 12 }}>{t(`meals.source.${target.source}`)}</Text>
        <Pressable onPress={onRecompute} disabled={busy} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: HERO.calories, fontWeight: '700', fontSize: 13 }}>{busy ? t('meals.computing') : `↻ ${t('meals.recompute')}`}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Repas estimé par l'IA (ou saisi à la main) : le sportif corrige si besoin puis ajoute
function MealDraft({ draft, onChange, onSave, onCancel, busy }) {
  const { t, text, row } = useI18n();
  const num = { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8, height: 46, textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.ink };
  return (
    <Card style={{ borderColor: colors.brand, borderWidth: 2 }}>
      {draft.photo && <Image source={{ uri: draft.photo }} style={{ width: '100%', height: 180, borderRadius: 10 }} resizeMode="cover" />}
      {draft.estimated && <Chip on label={t('meals.estimated')} />}
      <TextInput style={[styles.input, text]} value={draft.name} onChangeText={(v) => onChange({ ...draft, name: v })} placeholder={t('meals.namePlaceholder')} placeholderTextColor={colors.muted} />
      {draft.items?.length > 0 && <P muted style={{ fontSize: 13 }}>{draft.items.map((it) => `${it.name} (~${it.grams} g)`).join(' · ')}</P>}
      <View style={{ flexDirection: row, gap: 8 }}>
        {MACROS.map(([k, unit]) => (
          <View key={k} style={{ flex: 1, gap: 4 }}>
            <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 12 }}>
              {t(`meals.${k}`)} ({unit})
            </Text>
            <TextInput style={num} keyboardType="number-pad" value={String(draft[k] ?? '')} onChangeText={(v) => onChange({ ...draft, [k]: v.replace(/[^0-9]/g, '') })} />
          </View>
        ))}
      </View>
      {draft.estimated && <P muted style={{ fontSize: 12 }}>{t('meals.approx')}</P>}
      <View style={{ flexDirection: row, gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button variant="ghost" title={t('common.cancel')} onPress={onCancel} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={t('meals.add')} onPress={onSave} disabled={busy || !draft.name || !draft.calories} />
        </View>
      </View>
    </Card>
  );
}

// Petite pastille « P 35 g »
function Pill({ label, color }) {
  return (
    <View style={{ backgroundColor: colors.surface2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontSize: 12, color: colors.ink, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export default function MealsScreen() {
  const nav = useNav();
  const { t, text, row } = useI18n();
  const date = localDay();
  const day = useLoad(() => api(`/nutrition/day?date=${date}`), [date]);
  const [span, setSpan] = useState(7);
  const stats = useLoad(() => api(`/nutrition/stats?date=${date}&days=${span}`), [date, span]);
  const refresh = () => Promise.all([day.reload(), stats.reload()]);
  const [draft, setDraft] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null); // « +35 g de protéines » après un ajout

  // rappel de 20 h replanifié à chaque changement du bilan
  useEffect(() => {
    if (day.data) updateMealReminder(day.data, t);
  }, [day.data]);

  useEffect(() => {
    if (!flash) return undefined;
    const id = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(id);
  }, [flash]);

  async function recompute() {
    setBusy(true);
    setError(null);
    try {
      await api('/nutrition/target', { method: 'POST' });
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function scan(fromLibrary) {
    setError(null);
    try {
      const photo = await takePhoto({ fromLibrary });
      if (!photo) return;
      setDraft(null);
      setAnalyzing(true);
      const r = await api('/nutrition/analyze', { method: 'POST', body: { image: photo } });
      setDraft({ ...r, photo, estimated: true });
    } catch (err) {
      setError(err);
    } finally {
      setAnalyzing(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const { name, calories, protein, carbs, fat } = draft;
      const meal = await api('/nutrition/meals', { method: 'POST', body: { date, name, calories, protein, carbs, fat } });
      setDraft(null);
      setFlash(meal);
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function remove(meal) {
    Alert.alert(t('meals.deleteTitle'), meal.name, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/nutrition/meals/${meal.id}`, { method: 'DELETE' });
            await refresh();
          } catch (err) {
            setError(err);
          }
        },
      },
    ]);
  }

  if (day.loading && !day.data) return <Loading />;
  if (!day.data) return <ErrorText error={day.error} />;
  const { target, meals, totals, remaining } = day.data;
  const lacking = missing(target, totals);
  const evening = new Date().getHours() >= ALERT_HOUR;

  return (
    <Screen title={t('nav.meals')} subtitle={t('meals.sub')}>
      {/* Objectif du jour : calculé automatiquement dès que âge, poids et taille sont renseignés */}
      {target ? (
        <TodayHero target={target} totals={totals} onRecompute={recompute} busy={busy} />
      ) : (
        <Card>
          <H2>{t('meals.targetTitle')}</H2>
          <P muted>{t('meals.profileNeeded')}</P>
          <Button title={t('home.completeAction')} onPress={() => nav.reset('profile')} />
        </Card>
      )}

      {/* Repas ajouté : ce qu'il apporte */}
      {flash && (
        <View style={{ backgroundColor: colors.okSoft, borderRadius: 12, padding: 12, gap: 2 }}>
          <Text style={[{ color: colors.ok, fontWeight: '800' }, text]}>✓ {t('meals.addedTitle', { name: flash.name })}</Text>
          <Text style={[{ color: colors.ink }, text]}>{t('meals.addedBody', { kcal: flash.calories, p: flash.protein, c: flash.carbs })}</Text>
        </View>
      )}

      {/* Alerte : objectif non atteint */}
      {target && lacking.length > 0 && (
        <View style={{ backgroundColor: evening ? colors.dangerSoft : colors.signalSoft, borderRadius: 12, padding: 12, gap: 4 }}>
          <Text style={[{ fontWeight: '800', color: evening ? colors.danger : '#6B4E00' }, text]}>{evening ? t('meals.alertTitle') : t('meals.leftTitle')}</Text>
          <P>{t('meals.alertBody', { kcal: remaining.calories, p: remaining.protein, c: remaining.carbs })}</P>
        </View>
      )}
      {target && lacking.length === 0 && meals.length > 0 && (
        <View style={{ backgroundColor: colors.okSoft, borderRadius: 12, padding: 12 }}>
          <Text style={[{ fontWeight: '700', color: colors.ok }, text]}>{t('meals.reached')}</Text>
        </View>
      )}

      {/* Ajouter un repas */}
      {!draft && !analyzing && (
        <Card>
          <H2>{t('meals.scanTitle')}</H2>
          <P muted>{t('meals.scanHint')}</P>
          <Button title={`📷 ${t('meals.scan')}`} onPress={() => scan(false)} />
          <View style={{ flexDirection: row, gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button variant="ghost" title={t('meals.gallery')} onPress={() => scan(true)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="ghost" title={t('meals.manual')} onPress={() => setDraft({ name: '', calories: '', protein: '', carbs: '', fat: '' })} />
            </View>
          </View>
        </Card>
      )}
      {analyzing && (
        <Card>
          <Loading />
          <P muted style={{ textAlign: 'center' }}>{t('meals.analyzing')}</P>
        </Card>
      )}
      {draft && <MealDraft draft={draft} onChange={setDraft} onSave={save} onCancel={() => setDraft(null)} busy={busy} />}
      <ErrorText error={error} />

      {/* Repas du jour */}
      <Card>
        <H2>{t('meals.list', { n: meals.length })}</H2>
        {meals.length === 0 && <P muted>{t('meals.none')}</P>}
        {meals.map((m) => (
          <View key={m.id} style={[styles.row, { flexDirection: row, alignItems: 'flex-start' }]}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20 }}>🍽</Text>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={{ flexDirection: row, justifyContent: 'space-between', gap: 8 }}>
                <Text style={[{ flex: 1, fontWeight: '700', color: colors.ink }, text]} numberOfLines={2}>
                  {m.name}
                </Text>
                <Text style={{ fontWeight: '800', color: colors.ink }}>{m.calories} kcal</Text>
              </View>
              <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <Pill label={`P ${m.protein} g`} color={HERO.protein} />
                <Pill label={`G ${m.carbs} g`} color={HERO.carbs} />
                <Pill label={`L ${m.fat} g`} color={HERO.fat} />
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
            <Pressable onPress={() => remove(m)} accessibilityRole="button" accessibilityLabel={t('common.delete')} hitSlop={10}>
              <Text style={{ color: colors.muted, fontSize: 18, fontWeight: '700' }}>✕</Text>
            </Pressable>
          </View>
        ))}
      </Card>

      {/* Ce que l'objectif permet d'atteindre + statistiques */}
      {stats.data && <GoalCard stats={stats.data} />}
      {stats.data ? <StatsCard stats={stats.data} span={span} onSpan={setSpan} /> : stats.loading && <Loading />}
    </Screen>
  );
}
