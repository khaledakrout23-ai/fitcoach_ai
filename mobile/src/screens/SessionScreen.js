import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, Vibration, View } from 'react-native';
import { api } from '../api';
import { useNav } from '../context';
import { useI18n } from '../i18n';
import { colors } from '../theme';
import { Button, Card, Chip, ErrorText, Loading, P, Screen, useLoad } from '../ui';
import VideoFrame from '../VideoFrame';

const REASONS = ['OCCUPEE', 'ABSENTE', 'PANNE'];
const firstNumber = (s) => {
  const n = parseInt(String(s), 10);
  return Number.isNaN(n) ? '' : String(n);
};
const isDone = (e) => e.setsDone.length >= e.targetSets;

// Minuteur de repos
function RestTimer({ seconds, onEnd }) {
  const { t } = useI18n();
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) {
      Vibration.vibrate(400);
      onEnd();
      return undefined;
    }
    const id = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  return (
    <View style={{ backgroundColor: colors.ink, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: '#fff', fontWeight: '700' }}>{t('session.rest')}</Text>
      <Text style={{ color: '#fff', fontSize: 30, fontWeight: '800' }}>
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </Text>
      <Pressable onPress={onEnd}>
        <Text style={{ color: colors.signal, fontWeight: '700' }}>{t('session.skip')}</Text>
      </Pressable>
    </View>
  );
}

// Bloc « la machine n'est pas disponible »
function Swap({ session, entry, onSession }) {
  const { t, name, row, text } = useI18n();
  const [reason, setReason] = useState(null);
  const [alts, setAlts] = useState(null);
  const [error, setError] = useState(null);

  async function pick(r) {
    setReason(r);
    setAlts(null);
    setError(null);
    try {
      const data = await api(`/sessions/${session.id}/entries/${entry.id}/alternatives?reason=${r}`);
      setAlts(data.alternatives);
    } catch (err) {
      setError(err);
    }
  }

  async function choose(exerciseId) {
    try {
      onSession(await api(`/sessions/${session.id}/entries/${entry.id}/substitute`, { method: 'POST', body: { exerciseId, reason } }));
    } catch (err) {
      setError(err);
    }
  }

  async function postpone() {
    try {
      onSession(await api(`/sessions/${session.id}/entries/${entry.id}/postpone`, { method: 'POST' }));
    } catch (err) {
      setError(err);
    }
  }

  return (
    <View style={{ backgroundColor: colors.surface2, borderRadius: 12, padding: 12, gap: 10 }}>
      <Text style={[{ fontWeight: '700', color: colors.ink }, text]}>{t('swap.question', { machine: name(entry.exercise.equipment) })}</Text>
      <View style={{ flexDirection: row, gap: 8 }}>
        {REASONS.map((r) => {
          const on = reason === r;
          const panne = r === 'PANNE';
          return (
            <Pressable
              key={r}
              onPress={() => pick(r)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 10,
                borderWidth: 2,
                alignItems: 'center',
                justifyContent: 'center',
                borderColor: on ? (panne ? colors.danger : colors.signal) : colors.line,
                backgroundColor: on ? (panne ? colors.danger : colors.signal) : colors.surface,
              }}
            >
              <Text style={{ fontWeight: '700', color: on && panne ? '#fff' : colors.ink }}>{t(`swap.${r}`)}</Text>
            </Pressable>
          );
        })}
      </View>
      {reason === 'PANNE' && <P muted style={{ fontSize: 13 }}>{t('swap.panneNote')}</P>}
      {alts && alts.length === 0 && <P muted>{t('swap.none')}</P>}
      {alts &&
        alts.map((a, i) => (
          <View key={a.exercise.id} style={{ backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 8 }}>
            <View style={{ flexDirection: row, alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 24, fontWeight: '800', color: colors.brand }}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[{ fontWeight: '700', color: colors.ink }, text]}>{name(a.exercise)}</Text>
                <Text style={[{ color: colors.muted, fontSize: 13 }, text]}>{name(a.exercise.equipment)}</Text>
              </View>
              <Button small title={t('swap.choose')} onPress={() => choose(a.exercise.id)} />
            </View>
            <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 6 }}>
              {a.reasons.map((r) => (
                <Chip key={r} on label={t(`swap.reason.${r}`)} />
              ))}
            </View>
            {a.advice !== 'SAME_EFFORT' && <P style={{ fontSize: 13 }}>{t(`swap.advice.${a.advice}`)}</P>}
          </View>
        ))}
      {reason === 'OCCUPEE' && <Button variant="ghost" title={t('swap.wait')} onPress={postpone} />}
      <ErrorText error={error} />
    </View>
  );
}

// Un exercice ouvert : saisie des séries
function Entry({ session, entry, onSession, onRest }) {
  const { t, name, row, text } = useI18n();
  const nav = useNav();
  const [rows, setRows] = useState(() => {
    let last = '';
    return Array.from({ length: Math.max(entry.targetSets, entry.setsDone.length) }, (_, i) => {
      const d = entry.setsDone[i];
      if (d) last = String(d.weight);
      return d ? { weight: String(d.weight), reps: String(d.reps), done: true } : { weight: last, reps: firstNumber(entry.targetReps), done: false };
    });
  });
  const [showSwap, setShowSwap] = useState(false);
  const [error, setError] = useState(null);

  async function toggle(i) {
    const next = rows.map((r, k) => (k === i ? { ...r, done: !r.done } : r));
    if (next[i].done && next[i + 1] && !next[i + 1].done && !next[i + 1].weight) next[i + 1] = { ...next[i + 1], weight: next[i].weight };
    setRows(next);
    if (next[i].done) onRest(entry.restSec);
    try {
      const setsDone = next.filter((r) => r.done).map((r) => ({ weight: Number(r.weight.replace(',', '.')) || 0, reps: Number(r.reps) || 0 }));
      onSession(await api(`/sessions/${session.id}/entries/${entry.id}`, { method: 'PUT', body: { setsDone } }), entry.id);
    } catch (err) {
      setError(err);
    }
  }

  const edit = (i, field, value) => setRows(rows.map((r, k) => (k === i ? { ...r, [field]: value } : r)));
  const input = { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8, height: 50, textAlign: 'center', fontSize: 22, fontWeight: '700', color: colors.ink };

  return (
    <View style={{ gap: 10 }}>
      {entry.originalExercise && (
        <View style={{ backgroundColor: colors.signalSoft, borderRadius: 8, padding: 8 }}>
          <Text style={[{ color: '#6B4E00', fontSize: 13 }, text]}>
            {t('session.replaces', { name: name(entry.originalExercise), reason: t(`swap.${entry.reason}`).toLowerCase() })}
          </Text>
        </View>
      )}
      <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink }}>
          {entry.targetSets} × {entry.targetReps}
        </Text>
        <Pressable onPress={() => nav.push('exercise', { id: entry.exercise.id })}>
          <Text style={{ color: colors.brand, fontWeight: '700' }}>{t('session.sheet')}</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: row, gap: 8 }}>
        <Text style={{ width: 24 }} />
        <Text style={{ flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12 }}>{t('session.weight')}</Text>
        <Text style={{ flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12 }}>{t('session.reps')}</Text>
        <Text style={{ width: 50 }} />
      </View>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: row, gap: 8, alignItems: 'center' }}>
          <Text style={{ width: 24, textAlign: 'center', color: colors.muted, fontSize: 18, fontWeight: '700' }}>{i + 1}</Text>
          <TextInput style={input} keyboardType="decimal-pad" value={r.weight} placeholder="0" onChangeText={(v) => edit(i, 'weight', v)} />
          <TextInput style={input} keyboardType="number-pad" value={r.reps} onChangeText={(v) => edit(i, 'reps', v)} />
          <Pressable
            onPress={() => toggle(i)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: r.done }}
            accessibilityLabel={t('session.validateSet', { n: i + 1 })}
            style={{ width: 50, height: 50, borderRadius: 10, borderWidth: 1, borderColor: r.done ? colors.ok : colors.line, backgroundColor: r.done ? colors.ok : colors.surface, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: r.done ? '#fff' : colors.ink, fontSize: 20 }}>✓</Text>
          </Pressable>
        </View>
      ))}
      <ErrorText error={error} />
      {showSwap ? <Swap session={session} entry={entry} onSession={onSession} /> : <Button variant="ghost" title={t('swap.open')} onPress={() => setShowSwap(true)} />}
    </View>
  );
}

export default function SessionScreen({ params }) {
  const nav = useNav();
  const { t, name, row, text } = useI18n();
  const session = useLoad(() => api(`/sessions/${params.id}`), [params.id]);
  const [openId, setOpenId] = useState(null);
  const [rest, setRest] = useState(null);
  const [error, setError] = useState(null);
  const [videoHidden, setVideoHidden] = useState(false);

  if (session.loading && !session.data) return <Loading />;
  const data = session.data;
  if (!data) return <ErrorText error={session.error} />;

  const entries = data.entries;
  const current = openId ?? entries.find((e) => !isDone(e))?.id ?? null;
  // vidéo de l'exercice ouvert, fixée en haut de l'écran
  const videoEntry = !videoHidden && entries.find((e) => e.id === current);

  function onSession(fresh, keepOpenId) {
    session.setData(fresh);
    if (keepOpenId) {
      const e = fresh.entries.find((x) => x.id === keepOpenId);
      if (e && isDone(e)) setOpenId(null);
    }
  }

  async function finish() {
    try {
      await api(`/sessions/${params.id}/finish`, { method: 'POST' });
      Alert.alert(t('progress.finished'));
      nav.reset('progress');
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Screen
      title={name(data, 'dayLabel')}
      subtitle={t('session.progress', { done: entries.filter(isDone).length, total: entries.length })}
      onBack={nav.back}
      top={videoEntry && <VideoFrame exercise={videoEntry.exercise} onClose={() => setVideoHidden(true)} />}
    >
      {rest && <RestTimer key={rest.key} seconds={rest.seconds} onEnd={() => setRest(null)} />}
      {entries.map((entry, i) => {
        const open = entry.id === current;
        return (
          <Card key={entry.id} style={open ? { borderColor: colors.brand, borderWidth: 2 } : null}>
            <Pressable
              onPress={() => {
                setOpenId(open ? -1 : entry.id);
                setVideoHidden(false);
              }}
              style={{ flexDirection: row, alignItems: 'center', gap: 10 }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isDone(entry) ? colors.ok : colors.surface2 }}>
                <Text style={{ fontWeight: '800', color: isDone(entry) ? '#fff' : colors.ink }}>{isDone(entry) ? '✓' : i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[{ fontWeight: '700', color: colors.ink, fontSize: 16 }, text]}>{name(entry.exercise)}</Text>
                <Text style={[{ color: colors.muted, fontSize: 13 }, text]}>
                  {entry.setsDone.length}/{entry.targetSets} · {name(entry.exercise.equipment)}
                </Text>
              </View>
              {entry.reason && <Chip tone="warn" label={t('session.replaced')} />}
            </Pressable>
            {open && (
              <Entry
                key={`${entry.id}-${entry.exerciseId}`}
                session={data}
                entry={entry}
                onSession={onSession}
                onRest={(seconds) => setRest({ seconds, key: Date.now() })}
              />
            )}
          </Card>
        );
      })}
      <ErrorText error={error} />
      <Button title={t('session.finish')} onPress={finish} />
    </Screen>
  );
}
