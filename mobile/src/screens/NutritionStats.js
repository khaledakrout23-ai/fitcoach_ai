import { Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { colors } from '../theme';
import { Card, Chip, H2, P } from '../ui';

const CHART_HEIGHT = 120;
const CHART_MAX = 1.3; // l'axe va jusqu'à 130 % de l'objectif

// +0,25 kg / -0,4 kg
function kg(value, lang) {
  const v = Math.round(value * 100) / 100;
  const s = `${v > 0 ? '+' : ''}${v}`;
  return lang === 'fr' ? s.replace('.', ',') : s;
}

function Big({ label, value, unit, color }) {
  const { text } = useI18n();
  return (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 10, paddingVertical: 10 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.muted }}>{unit}</Text>
      <Text style={[{ fontSize: 12, color: colors.ink, fontWeight: '600' }, text]}>{label}</Text>
    </View>
  );
}

/** Ce que l'objectif journalier permet d'atteindre */
export function GoalCard({ stats }) {
  const { t, lang } = useI18n();
  const { target, maintenance, targetWeeklyKg, goal } = stats;
  if (!target || targetWeeklyKg === null) return null;
  const monthly = targetWeeklyKg * 4.3;
  return (
    <Card>
      <H2>🎯 {t('meals.reachTitle', { goal: t(`goal.${goal || 'FORME'}`) })}</H2>
      <View style={{ backgroundColor: colors.brandSoft, borderRadius: 10, padding: 12, gap: 4 }}>
        <P>
          {Math.abs(targetWeeklyKg) < 0.05
            ? t('meals.reachStable')
            : t('meals.reachWeight', { week: kg(targetWeeklyKg, lang), month: kg(monthly, lang) })}
        </P>
        <P muted style={{ fontSize: 13 }}>
          {t('meals.maintenance', { kcal: maintenance })} · {t('meals.proteinPerKg', { n: stats.weight ? Math.round((target.protein / stats.weight) * 10) / 10 : '—' })}
        </P>
      </View>
    </Card>
  );
}

/** Statistiques sur 7 ou 30 jours */
export function StatsCard({ stats, span, onSpan }) {
  const { t, lang, row, text } = useI18n();
  const { target, days, average, loggedDays, reachedDays, streak, actualWeeklyKg } = stats;
  const locale = lang === 'ar' ? 'ar-TN' : 'fr-FR';
  const label = (date, i) => {
    const d = new Date(`${date}T12:00:00`);
    if (span === 7) return d.toLocaleDateString(locale, { weekday: 'narrow' });
    return i % 5 === 0 || i === days.length - 1 ? String(d.getDate()) : '';
  };

  return (
    <Card>
      <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
        <H2>{t('meals.statsTitle')}</H2>
        <View style={{ flexDirection: row, gap: 6 }}>
          <Chip label={t('meals.days', { n: 7 })} on={span === 7} onPress={() => onSpan(7)} />
          <Chip label={t('meals.days', { n: 30 })} on={span === 30} onPress={() => onSpan(30)} />
        </View>
      </View>

      {/* Calories par jour : barre verte = objectif atteint, jaune = insuffisant ; ligne = objectif */}
      <View style={{ height: CHART_HEIGHT + 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: CHART_HEIGHT, gap: span === 7 ? 8 : 2 }}>
          {days.map((d) => {
            const ratio = target ? Math.min(d.calories / target.calories, CHART_MAX) : 0;
            const color = d.meals === 0 ? colors.line : d.reached ? colors.ok : colors.signal;
            return (
              <View key={d.date} style={{ flex: 1, height: Math.max(3, (ratio / CHART_MAX) * CHART_HEIGHT), backgroundColor: color, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
            );
          })}
        </View>
        {target && (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 18 + CHART_HEIGHT / CHART_MAX, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.brand }} />
        )}
        <View style={{ flexDirection: 'row', gap: span === 7 ? 8 : 2, marginTop: 4 }}>
          {days.map((d, i) => (
            <Text key={d.date} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: colors.muted }}>
              {label(d.date, i)}
            </Text>
          ))}
        </View>
      </View>
      <P muted style={{ fontSize: 12 }}>{t('meals.chartLegend')}</P>

      {/* Chiffres clés */}
      <View style={{ flexDirection: row, gap: 8 }}>
        <Big label={t('meals.reachedDays')} value={`${reachedDays}/${span}`} unit={t('meals.daysUnit')} color={colors.ok} />
        <Big label={t('meals.streak')} value={`🔥 ${streak}`} unit={t('meals.daysUnit')} color={colors.signal} />
        <Big label={t('meals.logged')} value={loggedDays} unit={t('meals.daysUnit')} color={colors.brand} />
      </View>

      {average ? (
        <>
          <Text style={[{ fontWeight: '700', color: colors.ink }, text]}>{t('meals.averageTitle')}</Text>
          {[
            ['calories', 'kcal'],
            ['protein', 'g'],
            ['carbs', 'g'],
            ['fat', 'g'],
          ].map(([k, unit]) => {
            const pct = target ? Math.round((average[k] / target[k]) * 100) : null;
            return (
              <View key={k} style={{ flexDirection: row, justifyContent: 'space-between' }}>
                <Text style={[{ color: colors.ink }, text]}>{t(`meals.${k}`)}</Text>
                <Text style={{ color: pct !== null && pct < 80 ? colors.danger : colors.ink, fontWeight: '600' }}>
                  {average[k]} {unit}
                  {pct !== null ? `  (${pct} %)` : ''}
                </Text>
              </View>
            );
          })}
          {actualWeeklyKg !== null && (
            <View style={{ backgroundColor: colors.surface2, borderRadius: 10, padding: 10 }}>
              <P>{t('meals.actualPace', { week: kg(actualWeeklyKg, lang) })}</P>
            </View>
          )}
        </>
      ) : (
        <P muted>{t('meals.noStats')}</P>
      )}
    </Card>
  );
}
