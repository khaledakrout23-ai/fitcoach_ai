import { useEffect, useRef, useState } from 'react';
import { Button, Field, Icon, Input, Ring, Sheet, Toggle, ToggleRow, useToast } from '../../components';
import { api } from '../../lib/api';
import { useInterval, useLoad } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';

const QUICK = [
  { ml: 250, label: 'meals.water.glass' },
  { ml: 330, label: 'meals.water.can' },
  { ml: 500, label: 'meals.water.bottle' },
];
const DRINKS = [
  { value: 'EAU', icon: 'droplet' },
  { value: 'THE', icon: 'leaf' },
  { value: 'CAFE', icon: 'coffee' },
  { value: 'JUS', icon: 'citrus' },
  { value: 'SHAKE', icon: 'milk' },
];

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return h * 60 + m;
};
/** Heures de silence (peuvent passer minuit : 23:00 → 07:00) */
function isQuiet(now, from, to) {
  const m = now.getHours() * 60 + now.getMinutes();
  const a = toMinutes(from);
  const b = toMinutes(to);
  return a <= b ? m >= a && m < b : m >= a || m < b;
}

/** Carte Eau : anneau, verres, ajouts rapides, type de boisson, rappels, « Comment c'est calculé ? » */
export default function WaterCard({ water, date, isToday, user, online, onChange }) {
  const { t, fmt, error: errText } = useI18n();
  const { toast } = useToast();
  const [drink, setDrink] = useState('EAU');
  const [busy, setBusy] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const prefs = useLoad(() => api.get('/me/prefs'), []);
  const reminders = prefs.data?.waterReminders;

  const target = water.targetMl;
  const consumed = water.consumedMl;
  const left = Math.max(0, target - consumed);
  const total = Math.min(13, Math.max(8, water.glasses.total));
  const filled = Math.min(total, Math.floor((consumed / target) * total + 1e-6));

  const addWater = async (ml) => {
    if (busy) return;
    setBusy(true);
    try {
      const log = await api.post('/nutrition/water', { ml, drink, date });
      onChange();
      toast({
        text: t('meals.water.added', { n: fmt.num(ml) }),
        icon: 'glass-water',
        tone: 'dark',
        action: {
          label: t('action.undo'),
          onClick: async () => {
            try {
              await api.del(`/nutrition/water/${log.id}`);
              onChange();
              toast({ text: t('meals.water.undone'), tone: 'dark' });
            } catch (err) {
              toast({ text: t('err.ERROR'), tone: 'error' });
            }
          },
        },
      });
    } catch (err) {
      toast({ text: errText(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const savePrefs = async (patch) => {
    const saved = await api.put('/me/prefs', patch);
    prefs.setData(saved);
    return saved;
  };

  const toggleReminders = async (enabled) => {
    try {
      prefs.setData((p) => ({ ...p, waterReminders: { ...p.waterReminders, enabled } }));
      await savePrefs({ waterReminders: { enabled } });
      // permission demandée uniquement sur action du membre
      if (enabled && typeof window !== 'undefined' && 'Notification' in window) {
        let perm = Notification.permission;
        if (perm === 'default') perm = await Notification.requestPermission();
        if (perm === 'denied') toast({ text: t('meals.water.notifBlocked'), tone: 'dark', icon: 'bell' });
      }
      toast({ text: enabled ? t('meals.water.remindersOn') : t('meals.water.remindersOff'), icon: 'bell', tone: 'dark' });
    } catch (err) {
      prefs.reload();
      toast({ text: t('err.ERROR'), tone: 'error' });
    }
  };

  useReminders({ enabled: Boolean(reminders?.enabled) && isToday, reminders, logs: water.logs, done: consumed >= target });

  const empty = consumed === 0;
  return (
    <section className="card ml-water" aria-labelledby="ml-water-title">
      <div className="card-head">
        <h2 id="ml-water-title" className="card-title">
          {t('meals.water.title')}
        </h2>
        <button type="button" className="link-btn small" onClick={() => setHowOpen(true)}>
          {t('meals.water.how')}
        </button>
      </div>

      <div className="ml-water-top">
        <Ring
          value={consumed}
          max={target}
          size={96}
          stroke={9}
          color="var(--hydro)"
          track="color-mix(in srgb, var(--hydro) 18%, transparent)"
          label={t('meals.water.ringLabel', { done: fmt.liters(consumed), target: fmt.liters(target) })}
        >
          <span className="ml-water-num">
            <span className="num">{fmt.num(consumed / 1000, 1)}</span>
          </span>
          <span className="caption muted">
            <span className="num">/ {fmt.liters(target)}</span>
          </span>
        </Ring>
        <div className="grow stack-2">
          <div className="ml-glasses" role="img" aria-label={t('meals.water.glassesLabel', { filled, total })}>
            {Array.from({ length: total }, (_, i) => (
              <Icon key={i} name="glass-water" size={20} className={i < filled ? 'on' : ''} />
            ))}
          </div>
          {empty && isToday ? (
            <div>
              <div className="w500 hydro-text">{t('meals.water.first')}</div>
              <div className="caption muted">{t('meals.water.firstSub')}</div>
            </div>
          ) : (
            <span className="small muted">
              <span className="hydro-text w500">
                <span className="num">{fmt.percent(water.pct)}</span>
              </span>
              {' · '}
              {left === 0 ? t('meals.water.done') : t(isToday ? 'meals.water.left' : 'meals.water.leftPast', { l: fmt.liters(left) })}
            </span>
          )}
        </div>
      </div>

      <div className="ml-quick">
        {QUICK.map((q, i) => (
          <button key={q.ml} type="button" className={`ml-quick-btn ${i === 0 ? 'main' : ''}`} onClick={() => addWater(q.ml)} disabled={busy || !online}>
            <span className="w500">
              <span className="num">+{fmt.num(q.ml)} {t('unit.ml')}</span>
            </span>
            <span className="caption muted">{t(q.label)}</span>
          </button>
        ))}
        <button type="button" className="ml-quick-btn" onClick={() => setOtherOpen(true)} disabled={busy || !online}>
          <span className="w500">{t('meals.water.other')}</span>
          <span className="caption muted">{t('unit.ml')}</span>
        </button>
      </div>

      <div className="chips scroll ml-drinks" role="group" aria-label={t('meals.water.drinkLabel')}>
        {DRINKS.map((d) => (
          <button key={d.value} type="button" className="chip ml-drink" aria-pressed={drink === d.value} onClick={() => setDrink(d.value)}>
            <Icon name={d.icon} size={16} />
            {t(`meals.water.drink.${d.value}`)}
          </button>
        ))}
      </div>
      {drink === 'JUS' || drink === 'SHAKE' ? <p className="caption muted">{t('meals.water.kcalNote')}</p> : null}

      {reminders ? (
        <div className="ml-reminders">
          <ToggleRow
            icon="bell"
            title={t('meals.water.reminders', { n: reminders.everyHours })}
            subtitle={t('meals.water.quiet', { from: reminders.quietFrom, to: reminders.quietTo })}
            checked={reminders.enabled}
            onChange={toggleReminders}
            disabled={!online}
          />
        </div>
      ) : null}

      <OtherSheet open={otherOpen} onClose={() => setOtherOpen(false)} onAdd={(ml) => { setOtherOpen(false); addWater(ml); }} />
      {howOpen ? (
        <HowSheet
          water={water}
          user={user}
          prefs={prefs.data}
          online={online}
          onClose={() => setHowOpen(false)}
          onSave={async (patch) => {
            await savePrefs(patch);
            onChange();
            toast({ text: t('meals.how.saved'), icon: 'check' });
            setHowOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

/** Rappels locaux pendant que l'app est ouverte (pas de push serveur) */
function useReminders({ enabled, reminders, logs, done }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const last = useRef(Date.now());
  const lastLog = logs.length ? new Date(logs[logs.length - 1].createdAt).getTime() : 0;
  useEffect(() => {
    if (lastLog > last.current) last.current = lastLog;
  }, [lastLog]);

  useInterval(
    () => {
      const now = new Date();
      if (done || isQuiet(now, reminders.quietFrom, reminders.quietTo)) return;
      if (now.getTime() - last.current < reminders.everyHours * 3600 * 1000) return;
      last.current = now.getTime();
      const text = t('meals.water.reminderText');
      const inApp = () => toast({ text, icon: 'glass-water', tone: 'dark', duration: 8000 });
      if (!('Notification' in window) || Notification.permission !== 'granted') return inApp();
      const options = { body: text, icon: '/brand/kammel-symbol.png', tag: 'kammel-water' };
      const show = async () => {
        const reg = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : null;
        if (reg) await reg.showNotification('Kammel', options);
        else new Notification('Kammel', options); // eslint-disable-line no-new
      };
      show().catch(inApp);
    },
    enabled && reminders ? 60 * 1000 : null
  );
}

function OtherSheet({ open, onClose, onAdd }) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const n = Number(value);
  const valid = value !== '' && Number.isFinite(n) && n >= 50 && n <= 2000;
  useEffect(() => {
    if (open) setValue('');
  }, [open]);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('meals.water.otherTitle')}
      footer={
        <Button variant="hydro" block icon="plus" disabled={!valid} onClick={() => onAdd(Math.round(n))}>
          {t('action.add')}
        </Button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onAdd(Math.round(n));
        }}
      >
        <Field label={t('meals.water.otherField')} error={value !== '' && !valid ? t('meals.water.otherError') : null}>
          <Input type="number" inputMode="numeric" min={50} max={2000} step={10} value={value} onChange={(e) => setValue(e.target.value)} suffix={t('unit.ml')} invalid={value !== '' && !valid} dir="ltr" />
        </Field>
      </form>
    </Sheet>
  );
}

/** « Comment c'est calculé ? » : détail du calcul, journée chaude, objectif manuel */
function HowSheet({ water, user, prefs, online, onClose, onSave }) {
  const { t, fmt, error: errText } = useI18n();
  const [hotDay, setHotDay] = useState(Boolean(prefs?.hotDay));
  const [manual, setManual] = useState(Boolean(prefs?.waterTargetMl));
  const [liters, setLiters] = useState(prefs?.waterTargetMl ? String(prefs.waterTargetMl / 1000) : String((water.computedTargetMl || water.targetMl) / 1000));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const l = Number(String(liters).replace(',', '.'));
  const manualValid = !manual || (Number.isFinite(l) && l >= 1 && l <= 6);

  const weight = user?.weight;
  const minutes = user?.sessionMinutes || 0;
  const base = weight ? Math.round(weight * 33) : null;

  const save = async () => {
    if (!manualValid) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({ hotDay, waterTargetMl: manual ? Math.round((l * 1000) / 50) * 50 : null });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('meals.how.title')}
      footer={
        <>
          {error ? <p className="caption danger-text">{errText(error)}</p> : null}
          <Button variant="primary" block onClick={save} loading={busy} disabled={!manualValid || !online}>
            {t('action.save')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <ul className="ml-how">
          <li>
            <Icon name="weight" size={20} />
            <span className="grow">
              <span className="small">{t('meals.how.base')}</span>
              {base ? (
                <span className="caption muted">
                  {t('meals.how.baseValue', { kg: fmt.num(weight, 1) })} = <span className="num">{fmt.num(base)} {t('unit.ml')}</span>
                </span>
              ) : null}
            </span>
          </li>
          <li>
            <Icon name="dumbbell" size={20} />
            <span className="grow">
              <span className="small">{t('meals.how.training')}</span>
              <span className="caption muted">
                {water.trainingDay && minutes ? (
                  <>
                    {t('meals.how.trainingValue', { min: fmt.num(minutes) })} = <span className="num">+{fmt.num(minutes * 10)} {t('unit.ml')}</span>
                  </>
                ) : (
                  t('meals.how.rest')
                )}
              </span>
            </span>
          </li>
          <li>
            <Icon name="sun" size={20} />
            <span className="grow small">{t('meals.how.heat')}</span>
          </li>
          <li>
            <Icon name="target" size={20} />
            <span className="grow small">{t('meals.how.rounding')}</span>
          </li>
        </ul>

        <ToggleRow icon="sun" title={t('meals.how.hotDay')} subtitle={t('meals.how.hotDaySub')} checked={hotDay} onChange={setHotDay} />

        <div className="card flat row between">
          <span className="small muted">{water.manual ? t('meals.how.current') : t('meals.how.computed')}</span>
          <span className="h3 hydro-text">
            <span className="num">{fmt.liters(water.manual ? water.targetMl : water.computedTargetMl || water.targetMl, 2)}</span>
          </span>
        </div>

        <div className="stack-2">
          <div className="toggle-row">
            <Icon name="pencil" className="muted" />
            <div className="grow">
              <div className="w500" id="ml-manual">
                {t('meals.how.manual')}
              </div>
              <div className="caption muted">{t('meals.how.manualSub')}</div>
            </div>
            <Toggle checked={manual} onChange={setManual} aria-labelledby="ml-manual" />
          </div>
          {manual ? (
            <Field label={t('meals.how.manualField')} error={!manualValid ? t('meals.how.manualError') : null}>
              <Input type="number" inputMode="decimal" min={1} max={6} step={0.05} value={liters} onChange={(e) => setLiters(e.target.value)} suffix={t('unit.l')} invalid={!manualValid} dir="ltr" />
            </Field>
          ) : null}
        </div>

        <div className="card hydro">
          <div className="caption muted">{t('meals.how.example')}</div>
          <div className="row between mt-2">
            <span className="small">{t('meals.how.exampleText')}</span>
            <span className="w600 hydro-text">
              <span className="num">{fmt.liters(3750, 2)}</span>
            </span>
          </div>
        </div>
        <p className="caption muted">{t('meals.how.disclaimer')}</p>
      </div>
    </Sheet>
  );
}
