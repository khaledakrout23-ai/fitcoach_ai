import { useRef, useState } from 'react';
import { Button, ChipGroup, Empty, ErrorState, Field, FormError, Icon, Input, Segmented, Sheet, Skeleton, Stepper, useToast } from '../../components';
import { api } from '../../lib/api';
import { useDebounced, useLoad } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';
import { shrinkPhoto } from '../../lib/photo';
import { MEAL_TYPES, mealTypeNow } from './dates';
import NutritionGrid from './NutritionGrid';

const LIMITS = { calories: 5000, protein: 400, carbs: 800, fat: 400 };
const FOOD_LIMITS = { calories: 3000, protein: 400, carbs: 400, fat: 400 };
const KEYS = ['calories', 'protein', 'carbs', 'fat'];
const clamp = (n, max) => Math.min(max, Math.max(0, Math.round(Number(n) || 0)));

/**
 * Feuille « Ajouter un repas » : menu (photo, recherche, création) puis l'étape choisie.
 * La photo n'est jamais gardée : elle sert seulement à l'estimation.
 */
export default function AddMeal({ date, mealType: initialType, onClose, onAdded }) {
  const { t } = useI18n();
  const [step, setStep] = useState('menu'); // menu | scan | search | food | create
  const [mealType, setMealType] = useState(initialType || mealTypeNow());
  const [food, setFood] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [scan, setScan] = useState(null); // { status: 'loading'|'result'|'error', photo, result, error }
  const fileRef = useRef(null);

  const pickPhoto = () => {
    if (fileRef.current) {
      fileRef.current.value = '';
      fileRef.current.click();
    }
  };

  const analyze = async (photo) => {
    setScan({ status: 'loading', photo });
    try {
      const result = await api.post('/nutrition/analyze', { image: photo });
      setScan({ status: 'result', photo, result });
    } catch (error) {
      setScan({ status: 'error', photo, error });
    }
  };

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setStep('scan');
    setScan({ status: 'loading', photo: null });
    try {
      const photo = await shrinkPhoto(file);
      await analyze(photo);
    } catch (error) {
      setScan({ status: 'error', photo: null, error: { code: 'PHOTO_INVALID', message: error.message } });
    }
  };

  const typePicker = (
    <Field label={t('meals.mealType')}>
      <ChipGroup
        scroll
        label={t('meals.mealType')}
        value={mealType}
        onChange={setMealType}
        options={MEAL_TYPES.map((v) => ({ value: v, label: t(`meals.type.${v}`) }))}
      />
    </Field>
  );

  const titles = {
    menu: t('meals.addSheet.title'),
    scan: t('meals.scan.title'),
    search: t('meals.search.title'),
    create: t('meals.create.title'),
  };

  const back = (to) => (
    <button type="button" className="link-btn muted ml-back" onClick={() => setStep(to)}>
      <Icon name="arrow-left" size={18} />
      {t('action.back')}
    </button>
  );

  return (
    <Sheet open onClose={onClose} title={step === 'food' ? <FoodTitle food={food} /> : titles[step]}>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} />

      {step === 'menu' ? (
        <div className="action-list ml-actions">
          <button type="button" onClick={pickPhoto}>
            <Icon name="camera" />
            <span className="grow">
              {t('meals.addSheet.scan')}
              <span className="caption muted ml-action-sub">{t('meals.addSheet.scanSub')}</span>
            </span>
          </button>
          <button type="button" onClick={() => setStep('search')}>
            <Icon name="search" />
            <span className="grow">
              {t('meals.addSheet.search')}
              <span className="caption muted ml-action-sub">{t('meals.addSheet.searchSub')}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftName('');
              setStep('create');
            }}
          >
            <Icon name="plus" />
            <span className="grow">
              {t('meals.addSheet.create')}
              <span className="caption muted ml-action-sub">{t('meals.addSheet.createSub')}</span>
            </span>
          </button>
        </div>
      ) : null}

      {step === 'scan' && scan ? (
        <ScanStep
          scan={scan}
          back={back('menu')}
          typePicker={typePicker}
          date={date}
          mealType={mealType}
          onRetake={pickPhoto}
          onRetry={() => analyze(scan.photo)}
          onSearch={() => setStep('search')}
          onCreate={() => setStep('create')}
          onAdded={onAdded}
        />
      ) : null}

      {step === 'search' ? (
        <SearchStep
          back={back('menu')}
          onPick={(f) => {
            setFood(f);
            setStep('food');
          }}
          onCreate={(name) => {
            setDraftName(name);
            setStep('create');
          }}
        />
      ) : null}

      {step === 'food' && food ? (
        <FoodStep food={food} back={back('search')} typePicker={typePicker} date={date} mealType={mealType} onAdded={onAdded} onDeleted={() => setStep('search')} />
      ) : null}

      {step === 'create' ? <CreateStep back={back('menu')} initialName={draftName} typePicker={typePicker} date={date} mealType={mealType} onAdded={onAdded} /> : null}
    </Sheet>
  );
}

function FoodTitle({ food }) {
  const { name } = useI18n();
  return name(food);
}

/** Résultat de l'analyse photo : valeurs modifiables, portion, moment du repas */
function ScanStep({ scan, back, typePicker, date, mealType, onRetake, onRetry, onSearch, onCreate, onAdded }) {
  const { t, fmt, error: errText } = useI18n();
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(false);
  const [factor, setFactor] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (scan.status === 'result' && !form) {
    const r = scan.result;
    setForm({ name: r.name, quantity: '', calories: String(r.calories), protein: String(r.protein), carbs: String(r.carbs), fat: String(r.fat) });
  }

  if (scan.status === 'loading') {
    return (
      <div className="stack">
        {scan.photo ? <img className="ml-photo" src={scan.photo} alt={t('meals.scan.photoAlt')} /> : <Skeleton card h={180} />}
        <div className="row-2" role="status">
          <span className="ml-spin" aria-hidden="true" />
          <div>
            <div className="w500">{t('meals.scan.analyzing')}</div>
            <div className="caption muted">{t('meals.scan.analyzingSub')}</div>
          </div>
        </div>
      </div>
    );
  }

  if (scan.status === 'error') {
    const code = scan.error && scan.error.code;
    const text = code === 'NO_AI' ? t('meals.scan.noAi') : code === 'NOT_FOOD' ? t('meals.scan.notFood') : code === 'AI_UNAVAILABLE' ? t('meals.scan.unavailable') : errText(scan.error);
    return (
      <div className="stack">
        {back}
        {scan.photo ? <img className="ml-photo" src={scan.photo} alt={t('meals.scan.photoAlt')} /> : null}
        <div className={`banner ${code === 'NO_AI' ? '' : 'warn'}`} role="alert">
          <Icon name={code === 'NO_AI' ? 'info' : 'triangle-alert'} size={20} />
          <span>{text}</span>
        </div>
        {code === 'AI_UNAVAILABLE' || code === 'NETWORK' || code === 'TOO_MANY_REQUESTS' ? (
          <Button variant="primary" block icon="refresh-cw" onClick={onRetry} disabled={!scan.photo}>
            {t('action.retry')}
          </Button>
        ) : null}
        {code !== 'NO_AI' ? (
          <Button variant={code === 'AI_UNAVAILABLE' ? 'secondary' : 'primary'} block icon="camera" onClick={onRetake}>
            {t('meals.scan.retake')}
          </Button>
        ) : null}
        <div className="grid-2">
          <Button icon="search" onClick={onSearch}>
            {t('meals.addSheet.search')}
          </Button>
          <Button icon="plus" onClick={onCreate}>
            {t('meals.addSheet.create')}
          </Button>
        </div>
      </div>
    );
  }

  if (!form) return null;
  const r = scan.result;
  const base = Object.fromEntries(KEYS.map((k) => [k, clamp(form[k], LIMITS[k])]));
  const scaled = Object.fromEntries(KEYS.map((k) => [k, clamp(base[k] * factor, LIMITS[k])]));
  const nameOk = form.name.trim().length > 0;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!nameOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      const quantity = form.quantity.trim() || (factor !== 1 ? `× ${fmt.num(factor, 2)}` : '');
      const meal = await api.post('/nutrition/meals', { date, mealType, name: form.name.trim(), quantity: quantity || undefined, ...scaled });
      onAdded(meal);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      {back}
      <img className="ml-photo" src={scan.photo} alt={t('meals.scan.photoAlt')} />
      <div className="card flat stack-2">
        <div className="row between">
          <span className="h3">{form.name || '–'}</span>
          {r.confidence ? <span className="caption muted">{t('meals.scan.confidence', { n: Math.round(r.confidence * 100) })}</span> : null}
        </div>
        {r.items && r.items.length ? (
          <p className="caption muted">
            {t('meals.scan.detected')} :{' '}
            {r.items.map((it, i) => (
              <span key={i}>
                {i ? ', ' : ''}
                {it.name}
                {it.grams ? (
                  <>
                    {' '}
                    <span className="num">
                      {fmt.num(it.grams)} {t('unit.g')}
                    </span>
                  </>
                ) : null}
              </span>
            ))}
          </p>
        ) : null}
        <NutritionGrid values={scaled} />
        <div className="row between">
          <span className="small muted">{t('meals.scan.portion')}</span>
          <Stepper value={factor} onChange={setFactor} step={0.25} min={0.25} max={3} decimals={2} label={t('meals.scan.portion')} unit="×" />
        </div>
        <p className="caption muted">{t('meals.scan.estimate')}</p>
      </div>

      {!editing ? (
        <Button variant="ghost" icon="pencil" onClick={() => setEditing(true)}>
          {t('meals.scan.fix')}
        </Button>
      ) : (
        <div className="stack-2">
          <Field label={t('meals.scan.name')} error={!nameOk ? t('meals.create.required') : null}>
            <Input value={form.name} maxLength={150} onChange={set('name')} invalid={!nameOk} />
          </Field>
          <Field label={t('meals.scan.quantity')} optional>
            <Input value={form.quantity} maxLength={60} placeholder={t('meals.scan.quantityPh')} onChange={set('quantity')} />
          </Field>
          <div className="grid-2">
            {KEYS.map((k) => (
              <Field key={k} label={t(k === 'calories' ? 'meals.create.kcal' : `meals.create.${k}`)}>
                <Input type="number" inputMode="numeric" min={0} max={LIMITS[k]} value={form[k]} onChange={set(k)} dir="ltr" />
              </Field>
            ))}
          </div>
        </div>
      )}

      {typePicker}
      <FormError error={error} />
      <Button variant="primary" block size="lg" icon="plus" onClick={submit} loading={busy} disabled={!nameOk}>
        {t('meals.scan.addToMeal')}
      </Button>
    </div>
  );
}

/** Recherche : Récents / Mes aliments, ou recherche dans tout le catalogue */
function SearchStep({ back, onPick, onCreate }) {
  const { t, fmt, name } = useI18n();
  const [tab, setTab] = useState('recent');
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const list = useLoad(() => {
    const params = new URLSearchParams();
    if (dq) params.set('q', dq.slice(0, 60));
    params.set('tab', dq ? (tab === 'mine' ? 'mine' : 'all') : tab);
    return api.get(`/nutrition/foods?${params.toString()}`);
  }, [tab, dq]);
  const foods = list.data || [];
  const stale = q.trim() !== dq;

  return (
    <div className="stack">
      {back}
      <div className="search ml-search">
        <Icon name="search" size={20} />
        <input
          className="input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('meals.search.placeholder')}
          aria-label={t('meals.search.label')}
          maxLength={60}
          autoComplete="off"
        />
      </div>
      <Segmented
        options={[
          { value: 'recent', label: t('meals.search.recent') },
          { value: 'mine', label: t('meals.search.mine') },
        ]}
        value={tab}
        onChange={setTab}
        label={t('meals.search.title')}
      />
      {list.error && !list.data ? (
        <ErrorState compact error={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <div className="stack-2" role="status" aria-label={t('state.loading')}>
          <Skeleton h={56} />
          <Skeleton h={56} />
          <Skeleton h={56} />
        </div>
      ) : foods.length === 0 && !stale ? (
        <Empty icon={dq ? 'search' : tab === 'mine' ? 'salad' : 'history'} title={dq ? t('meals.search.noResult') : null}>
          {dq ? null : tab === 'mine' ? t('meals.search.emptyMine') : t('meals.search.emptyRecent')}
          {dq || tab === 'mine' ? (
            <div className="mt-4">
              <Button icon="plus" onClick={() => onCreate(dq)}>
                {dq ? t('meals.search.createInstead', { q: dq }) : t('meals.addSheet.create')}
              </Button>
            </div>
          ) : null}
        </Empty>
      ) : (
        <div className="ml-foods" aria-busy={list.loading || stale}>
          {foods.map((f) => (
            <button key={f.id} type="button" className="ml-food" onClick={() => onPick(f)}>
              <span className="grow ml-row-text">
                <span className="w500 ellipsis">{name(f)}</span>
                <span className="caption muted">
                  {f.portion}
                  {f.source !== 'KAMMEL' ? <span className="tag ml-src">{t(`meals.search.source.${f.source}`)}</span> : null}
                </span>
              </span>
              <span className="small muted">
                <span className="num">{fmt.kcal(f.calories)}</span>
              </span>
              <Icon name="chevron-right" size={18} className="muted" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Aliment choisi : nombre de portions, valeurs, moment du repas */
function FoodStep({ food, back, typePicker, date, mealType, onAdded, onDeleted }) {
  const { t, error: errText } = useI18n();
  const { toast } = useToast();
  const [servings, setServings] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const values = Object.fromEntries(KEYS.map((k) => [k, Math.round(food[k] * servings)]));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onAdded(await api.post('/nutrition/meals', { date, mealType, foodId: food.id, servings }));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  const remove = async () => {
    try {
      await api.del(`/nutrition/foods/${food.id}`);
      toast({ text: t('meals.food.deleted'), icon: 'check' });
      onDeleted();
    } catch (err) {
      toast({ text: errText(err), tone: 'error' });
    }
  };

  return (
    <div className="stack">
      {back}
      <p className="small muted">{t('meals.food.per', { portion: food.portion })}</p>
      <NutritionGrid values={values} />
      <div className="row between">
        <span className="small muted">{t('meals.food.portions')}</span>
        <Stepper value={servings} onChange={setServings} step={0.25} min={0.25} max={10} decimals={2} label={t('meals.food.portions')} />
      </div>
      {typePicker}
      <FormError error={error} />
      <Button variant="primary" block size="lg" icon="plus" onClick={submit} loading={busy}>
        {t('action.add')}
      </Button>
      {food.source === 'MINE' ? (
        <Button variant="text" icon="trash-2" onClick={remove}>
          {t('meals.food.deleteMine')}
        </Button>
      ) : null}
    </div>
  );
}

/** Créer un aliment personnel puis l'ajouter au repas */
function CreateStep({ back, initialName, typePicker, date, mealType, onAdded }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: initialName || '', portion: '', calories: '', protein: '', carbs: '', fat: '' });
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const blur = (k) => () => setTouched((x) => ({ ...x, [k]: true }));

  const errors = {};
  if (!form.name.trim()) errors.name = t('meals.create.required');
  if (!form.portion.trim()) errors.portion = t('meals.create.required');
  for (const k of KEYS) {
    const v = form[k];
    if (v === '') {
      if (k === 'calories') errors[k] = t('meals.create.required');
      continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > FOOD_LIMITS[k]) errors[k] = t('meals.create.range', { max: FOOD_LIMITS[k] });
  }
  const valid = Object.keys(errors).length === 0;
  const show = (k) => (touched[k] ? errors[k] : null);

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) {
      setTouched({ name: true, portion: true, calories: true, protein: true, carbs: true, fat: true });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const name = form.name.trim();
      const food = await api.post('/nutrition/foods', {
        nameFr: name,
        nameAr: name,
        nameEn: name,
        portion: form.portion.trim(),
        ...Object.fromEntries(KEYS.map((k) => [k, Math.round(Number(form[k]) || 0)])),
      });
      onAdded(await api.post('/nutrition/meals', { date, mealType, foodId: food.id, servings: 1 }));
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {back}
      <Field label={t('meals.create.name')} error={show('name')}>
        <Input value={form.name} maxLength={120} placeholder={t('meals.create.namePh')} onChange={set('name')} onBlur={blur('name')} invalid={Boolean(show('name'))} />
      </Field>
      <Field label={t('meals.create.portion')} error={show('portion')}>
        <Input value={form.portion} maxLength={60} placeholder={t('meals.create.portionPh')} onChange={set('portion')} onBlur={blur('portion')} invalid={Boolean(show('portion'))} />
      </Field>
      <div className="grid-2">
        {KEYS.map((k) => (
          <Field key={k} label={t(k === 'calories' ? 'meals.create.kcal' : `meals.create.${k}`)} error={show(k)} optional={k !== 'calories'}>
            <Input type="number" inputMode="numeric" min={0} max={FOOD_LIMITS[k]} value={form[k]} onChange={set(k)} onBlur={blur(k)} invalid={Boolean(show(k))} dir="ltr" />
          </Field>
        ))}
      </div>
      {typePicker}
      <FormError error={error} />
      <Button type="submit" variant="primary" block size="lg" icon="plus" loading={busy} disabled={!valid}>
        {t('meals.create.submit')}
      </Button>
    </form>
  );
}
