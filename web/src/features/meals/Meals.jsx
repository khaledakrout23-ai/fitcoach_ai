import { useCallback, useMemo, useRef, useState } from 'react';
import { Button, Empty, ErrorState, Field, Icon, IconButton, Input, OfflineBanner, Ring, Sheet, Skeleton, useToast } from '../../components';
import { api } from '../../lib/api';
import { useLoad, localDate, useOnline } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { addDays, mondayOf, dayOfMonth, MEAL_TYPES } from './dates';
import WaterCard from './WaterCard';
import AddMeal from './AddMeal';
import NutritionGrid from './NutritionGrid';
import './meals.css';

const MACROS = [
  { key: 'protein', label: 'meals.protein', color: 'var(--protein)' },
  { key: 'carbs', label: 'meals.carbs', color: 'var(--carbs)' },
  { key: 'fat', label: 'meals.fat', color: 'var(--fat)' },
];
const UNDO_MS = 5200;

/** B7 — Repas + eau : objectif du jour, eau, repas par moment, ajout (photo, recherche, création) */
export default function Meals() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const online = useOnline();
  const today = localDate();
  const [date, setDate] = useState(today);
  const [dateSheet, setDateSheet] = useState(false);
  const [add, setAdd] = useState(null); // { mealType } quand la feuille « Ajouter un repas » est ouverte
  const [hidden, setHidden] = useState([]); // repas en cours de suppression (annulable)
  const timers = useRef({});

  const day = useLoad(() => api.get(`/nutrition/day?date=${date}`), [date]);
  const data = day.data && day.data.date === date ? day.data : null;

  const removeMeal = useCallback(
    (meal) => {
      setHidden((h) => [...h, meal.id]);
      const restore = () => setHidden((h) => h.filter((id) => id !== meal.id));
      timers.current[meal.id] = setTimeout(async () => {
        delete timers.current[meal.id];
        try {
          await api.del(`/nutrition/meals/${meal.id}`);
          day.reload();
        } catch (err) {
          restore();
          toast({ text: t('err.ERROR'), tone: 'error' });
        }
      }, UNDO_MS);
      toast({
        text: t('meals.deleted'),
        icon: 'trash-2',
        tone: 'dark',
        duration: UNDO_MS - 200,
        action: {
          label: t('action.undo'),
          onClick: () => {
            clearTimeout(timers.current[meal.id]);
            delete timers.current[meal.id];
            restore();
          },
        },
      });
    },
    [day, t, toast]
  );

  if (day.error && day.error.code === 'FEATURE_DISABLED') {
    return (
      <main className="page">
        <header className="app-header">
          <h1>{t('meals.title')}</h1>
        </header>
        <Empty icon="utensils" title={t('meals.featureOff.title')}>
          {t('meals.featureOff.text')}
        </Empty>
      </main>
    );
  }

  return (
    <main className="page meals">
      <header className="app-header">
        <h1>{t('meals.title')}</h1>
        <IconButton icon="calendar" label={t('meals.calendar')} onClick={() => setDateSheet(true)} />
      </header>

      <WeekStrip date={date} today={today} onChange={setDate} />
      <OfflineBanner text={t('meals.offline')} />

      {!data && day.error ? (
        <ErrorState error={day.error} onRetry={day.reload} />
      ) : !data ? (
        <MealsSkeleton />
      ) : (
        <>
          {day.error ? <ErrorState compact error={day.error} onRetry={day.reload} /> : null}
          <Budget data={data} hidden={hidden} />
          {data.insight ? (
            <div className="ml-insight" role="note" aria-label={t('meals.insightLabel')}>
              <img src="/brand/kammel-symbol.png" alt="" />
              <span dir="auto">{data.insight.text}</span>
            </div>
          ) : null}
          <WaterCard water={data.water} date={date} isToday={date === today} user={user} online={online} onChange={day.reload} />
          <MealList data={data} hidden={hidden} onAdd={(mealType) => setAdd({ mealType })} onDelete={removeMeal} canAdd={online} />
        </>
      )}

      <div className="ml-fab-wrap">
        <Button variant="primary" size="lg" icon="plus" className="ml-fab" onClick={() => setAdd({})} disabled={!online || !data}>
          {t('meals.add')}
        </Button>
      </div>

      <DateSheet open={dateSheet} date={date} today={today} onClose={() => setDateSheet(false)} onPick={setDate} />
      {add ? (
        <AddMeal
          date={date}
          mealType={add.mealType}
          onClose={() => setAdd(null)}
          onAdded={(meal) => {
            setAdd(null);
            toast({ text: t('meals.added', { name: meal.name }), icon: 'check' });
            day.reload();
          }}
        />
      ) : null}
    </main>
  );
}

/** Semaine (lundi → dimanche) avec flèches ; jours futurs non sélectionnables */
function WeekStrip({ date, today, onChange }) {
  const { t, fmt, lang } = useI18n();
  const monday = mondayOf(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const nextMonday = addDays(monday, 7);
  return (
    <nav className="ml-week" aria-label={t('meals.calendar')}>
      <IconButton icon="chevron-left" plain size={20} label={t('meals.prevWeek')} onClick={() => onChange(addDays(date, -7))} />
      <div className="ml-days">
        {days.map((d, i) => (
          <button
            key={d}
            type="button"
            className={`ml-day ${d === date ? 'on' : ''} ${d === today ? 'today' : ''}`}
            disabled={d > today}
            aria-pressed={d === date}
            aria-label={fmt.date(d)}
            onClick={() => onChange(d)}
          >
            <span className="ml-day-name">{lang === 'ar' ? fmt.weekdayLetter(i) : fmt.weekdayShort(i)}</span>
            <span className="num">{dayOfMonth(d)}</span>
          </button>
        ))}
      </div>
      <IconButton
        icon="chevron-right"
        plain
        size={20}
        label={t('meals.nextWeek')}
        disabled={nextMonday > today}
        onClick={() => {
          const target = addDays(date, 7);
          onChange(target > today ? today : target);
        }}
      />
    </nav>
  );
}

function DateSheet({ open, date, today, onClose, onPick }) {
  const { t } = useI18n();
  const [value, setValue] = useState(date);
  const min = addDays(today, -365);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && value <= today && value >= min;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('meals.dateSheet.title')}
      footer={
        <>
          <Button
            variant="primary"
            block
            disabled={!valid}
            onClick={() => {
              onPick(value);
              onClose();
            }}
          >
            {t('meals.dateSheet.go')}
          </Button>
          <Button
            variant="ghost"
            block
            onClick={() => {
              setValue(today);
              onPick(today);
              onClose();
            }}
          >
            {t('meals.dateSheet.today')}
          </Button>
        </>
      }
    >
      <Field label={t('meals.dateSheet.field')}>
        <Input type="date" value={value} min={min} max={today} onChange={(e) => setValue(e.target.value)} dir="ltr" />
      </Field>
    </Sheet>
  );
}

/** Carte budget : kcal restantes (anneau), consommées · objectif, 3 anneaux de macros */
function Budget({ data, hidden }) {
  const { t, fmt } = useI18n();
  const totals = useMemo(() => {
    const out = { ...data.totals };
    for (const type of MEAL_TYPES) {
      for (const m of data.meals[type] || []) {
        if (!hidden.includes(m.id)) continue;
        for (const k of ['calories', 'protein', 'carbs', 'fat']) out[k] -= m[k];
      }
    }
    return out;
  }, [data, hidden]);
  const target = data.target;

  if (!target) {
    return (
      <section className="card pad-lg">
        <Empty icon="target" title={t('meals.noTarget.title')} action={<Button to="/onboarding" variant="primary">{t('meals.noTarget.action')}</Button>}>
          {t('meals.noTarget.text')}
        </Empty>
      </section>
    );
  }

  const left = target.calories - totals.calories;
  const over = left < 0;
  return (
    <section className="card pad-lg ml-budget">
      <Ring
        value={totals.calories}
        max={target.calories}
        size={176}
        stroke={14}
        color={over ? 'var(--warn)' : 'var(--ember)'}
        label={t('meals.budgetLabel', { left: fmt.num(Math.max(0, left)), goal: fmt.num(target.calories) })}
      >
        <span className="ml-big">
          <span className="num">{fmt.num(Math.abs(left))}</span>
        </span>
        <span className="small muted">{over ? t('meals.over') : t('meals.remaining')}</span>
      </Ring>
      <p className="ml-budget-line small muted">
        <span>
          <span className="num w500 ml-strong">{fmt.num(totals.calories)}</span> {t('meals.consumed')}
        </span>
        <span>
          <span className="num w500 ml-strong">{fmt.num(target.calories)}</span> {t('meals.goal')}
        </span>
      </p>
      {totals.drinksKcal > 0 ? <p className="caption muted text-center">{t('meals.drinksKcal', { n: fmt.num(totals.drinksKcal) })}</p> : null}
      <div className="ml-macros">
        {MACROS.map((m) => (
          <div key={m.key} className="ml-macro">
            <Ring value={totals[m.key]} max={target[m.key]} size={60} stroke={6} color={m.color} track={`color-mix(in srgb, ${m.color} 22%, transparent)`} />
            <span className="small muted">{t(m.label)}</span>
            <span className="small">
              <span className="num">
                <b className="w500">{fmt.num(totals[m.key])}</b> / {fmt.num(target[m.key])} {t('unit.g')}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Repas groupés par moment, avec sous-total et ajout en ligne */
function MealList({ data, hidden, onAdd, onDelete, canAdd }) {
  const { t, fmt } = useI18n();
  const [menu, setMenu] = useState(null);
  return (
    <section className="ml-list" aria-label={t('meals.title')}>
      {MEAL_TYPES.map((type) => {
        const list = (data.meals[type] || []).filter((m) => !hidden.includes(m.id));
        const kcal = list.reduce((s, m) => s + m.calories, 0);
        return (
          <div key={type} className="ml-group">
            <div className="ml-group-head small">
              <h2 className="small w500 muted">{t(`meals.type.${type}`)}</h2>
              <span className="muted">{list.length ? <span className="num">{fmt.kcal(kcal)}</span> : '–'}</span>
            </div>
            {list.map((m) => (
              <MealRow key={m.id} meal={m} onOpen={() => setMenu(m)} onDelete={() => onDelete(m)} />
            ))}
            {!list.length ? (
              <button type="button" className="ml-add-inline" onClick={() => onAdd(type)} disabled={!canAdd}>
                <Icon name="plus" size={18} />
                {t(`meals.addInline.${type}`)}
              </button>
            ) : null}
          </div>
        );
      })}
      <MealSheet
        meal={menu}
        onClose={() => setMenu(null)}
        onDelete={() => {
          onDelete(menu);
          setMenu(null);
        }}
      />
    </section>
  );
}

function Macros({ meal }) {
  const { t, fmt } = useI18n();
  return (
    <>
      <span className="ml-p num">
        {t('meals.short.p')} {fmt.num(meal.protein)}
      </span>
      {' · '}
      <span className="ml-c num">
        {t('meals.short.c')} {fmt.num(meal.carbs)}
      </span>
      {' · '}
      <span className="num">
        {t('meals.short.f')} {fmt.num(meal.fat)}
      </span>
    </>
  );
}

const SWIPE_DELETE = 96;

/** Ligne de repas : toucher → détails ; glisser vers le début → supprimer (avec « Annuler ») */
function MealRow({ meal, onOpen, onDelete }) {
  const { t, fmt, dir } = useI18n();
  const [dx, setDx] = useState(0);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const sign = dir === 'rtl' ? 1 : -1; // sens « vers le début de ligne »

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x;
    if (!d.moved && Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(e.clientY - d.y)) {
      d.moved = true;
      e.currentTarget.setPointerCapture?.(d.id);
    }
    if (d.moved) setDx(Math.max(0, mx * sign) * sign);
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    suppressClick.current = true;
    if (Math.abs(dx) >= SWIPE_DELETE) onDelete();
    setDx(0);
  };

  return (
    <div className="ml-row-wrap">
      <span className="ml-row-bin" aria-hidden="true" style={{ opacity: Math.min(1, Math.abs(dx) / SWIPE_DELETE) }}>
        <Icon name="trash-2" />
      </span>
      <button
        type="button"
        className="ml-row"
        style={dx ? { transform: `translateX(${dx}px)`, transition: 'none' } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={() => {
          drag.current = null;
          setDx(0);
        }}
        onClick={() => {
          if (suppressClick.current) suppressClick.current = false;
          else onOpen();
        }}
        aria-label={t('meals.rowActions', { name: meal.name })}
      >
        <span className="ml-thumb" aria-hidden="true">
          <Icon name="utensils" size={20} />
        </span>
        <span className="grow ml-row-text">
          <span className="w500 ellipsis"><bdi>{meal.name}</bdi></span>
          <span className="caption muted ml-row-sub">
            <Macros meal={meal} />
            {' · '}
            {meal.quantity ? <bdi>{meal.quantity}</bdi> : <span className="num">{fmt.time(meal.createdAt)}</span>}
          </span>
        </span>
        <span className="w500 ml-row-kcal">
          <span className="num">{fmt.num(meal.calories)}</span>
        </span>
      </button>
    </div>
  );
}

function MealSheet({ meal, onClose, onDelete }) {
  const { t, fmt } = useI18n();
  return (
    <Sheet
      open={Boolean(meal)}
      onClose={onClose}
      title={meal?.name}
      subtitle={meal ? `${t(`meals.type.${meal.mealType}`)} · ${fmt.time(meal.createdAt)}${meal.quantity ? ` · ${meal.quantity}` : ''}` : ''}
      footer={
        <Button variant="danger" block icon="trash-2" onClick={onDelete}>
          {t('meals.delete')}
        </Button>
      }
    >
      {meal ? <NutritionGrid values={meal} /> : null}
      <p className="caption muted mt-4">{t('meals.swipeHint')}</p>
    </Sheet>
  );
}

function MealsSkeleton() {
  const { t } = useI18n();
  return (
    <div className="stack" role="status" aria-label={t('state.loading')}>
      <Skeleton card h={330} />
      <Skeleton card h={64} />
      <Skeleton card h={300} />
      <Skeleton line w="30%" />
      <Skeleton card h={72} />
    </div>
  );
}
