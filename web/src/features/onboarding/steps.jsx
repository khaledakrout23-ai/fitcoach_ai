import { useEffect } from 'react';
import { Checkbox, Chip, ErrorState, Icon, OptionCard, Segmented, Skeleton } from '../../components';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';
import { healthyRange } from '../../lib/targets';
import { ACTIVITIES, DIETS, GOALS, LEVELS, LIMITS, SESSION_MINUTES, suggestedGoalWeight, thisYear } from './flow';
import { BigNumberInput, Ruler, YearWheel } from './pickers';

/** Liste de cartes à choix unique (objectif, activité, niveau, repas) */
function Choice({ options, value, onChange, prefix, icons, subs = false, label }) {
  const { t } = useI18n();
  return (
    <div className="stack" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <OptionCard
          key={o}
          selected={value === o}
          onSelect={() => onChange(o)}
          icon={icons[o]}
          title={t(`${prefix}.${o}`)}
          subtitle={subs ? t(`${prefix}.${o}.sub`) : undefined}
        />
      ))}
    </div>
  );
}

function FieldError({ error, id }) {
  const { t, fmt } = useI18n();
  if (!error) return null;
  return (
    <p className="onb-error" role="alert" id={id}>
      <Icon name="circle-alert" size={16} />
      {t(error.key, error.w != null ? { w: fmt.kg(error.w) } : undefined)}
    </p>
  );
}

// ---------------------------------------------------------------- 1. Objectif
const GOAL_ICONS = { PERTE_POIDS: 'trending-down', PRISE_MASSE: 'dumbbell', FORME: 'heart-pulse', FORCE: 'zap' };
export function GoalStep({ a, set }) {
  const { t } = useI18n();
  return <Choice options={GOALS} value={a.goal} onChange={(goal) => set({ goal })} prefix="onb.goal" icons={GOAL_ICONS} label={t('onb.goal.q')} />;
}

// ---------------------------------------------------------------- 2. Sexe
export function SexStep({ a, set }) {
  const { t } = useI18n();
  return (
    <div className="stack" role="radiogroup" aria-label={t('onb.sex.q')}>
      <div className="grid-2">
        {['H', 'F'].map((s) => (
          <button key={s} type="button" role="radio" aria-checked={a.sex === s} className="sex-tile" onClick={() => set({ sex: s })}>
            <span className="radio" aria-hidden="true">
              {a.sex === s ? <Icon name="check" size={16} stroke={2.5} /> : null}
            </span>
            <Icon name={s === 'H' ? 'mars' : 'venus'} size={28} className="sex-icon" />
            <span className="sex-label">{t(`onb.sex.${s}`)}</span>
          </button>
        ))}
      </div>
      <OptionCard selected={a.sex === 'NA'} onSelect={() => set({ sex: 'NA' })} title={<span className="onb-na">{t('onb.sex.NA')}</span>} />
      <p className="caption muted">{t('onb.sex.naNote')}</p>
    </div>
  );
}

// ---------------------------------------------------------------- 3. Année de naissance
export function BirthStep({ a, set }) {
  const { t } = useI18n();
  const max = thisYear() - LIMITS.minAge;
  const min = thisYear() - LIMITS.maxAge;
  useEffect(() => {
    if (a.birthYear == null) set({ birthYear: thisYear() - 30 }, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const age = a.birthYear ? thisYear() - a.birthYear : null;
  return (
    <div className="stack-4 onb-center">
      <p className="onb-age" aria-live="polite">
        {age != null ? t('onb.birth.age', { n: age }) : ' '}
      </p>
      <YearWheel
        value={a.birthYear}
        onChange={(birthYear) => set({ birthYear })}
        min={min}
        max={max}
        label={t('onb.birth.label')}
        describe={(y) => t('onb.birth.age', { n: thisYear() - y })}
      />
    </div>
  );
}

// ---------------------------------------------------------------- 4–5. Taille et poids
const DEFAULT_HEIGHT = { H: 175, F: 162, NA: 168 };
const DEFAULT_WEIGHT = { H: 75, F: 62, NA: 68 };

function Measure({ value, onChange, min, max, step, decimals, unit, label, error, majorEvery = 10 }) {
  const { fmt } = useI18n();
  const errId = `err-${label}`.replace(/\W+/g, '-');
  return (
    <div className="stack-4 onb-center">
      <BigNumberInput value={value} onChange={onChange} decimals={decimals} unit={unit} label={label} invalid={Boolean(error)} describedBy={error ? errId : undefined} />
      <Ruler
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        decimals={decimals}
        majorEvery={majorEvery}
        label={label}
        valueText={value != null ? `${fmt.num(value, decimals)} ${unit}` : undefined}
      />
      <FieldError error={error} id={errId} />
    </div>
  );
}

export function HeightStep({ a, set, error }) {
  const { t } = useI18n();
  useEffect(() => {
    if (a.height == null) set({ height: DEFAULT_HEIGHT[a.sex] || 170 }, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Measure
      value={a.height}
      onChange={(v) => set({ height: v == null ? null : Math.round(v) })}
      min={LIMITS.height[0]}
      max={LIMITS.height[1]}
      step={1}
      decimals={0}
      unit={t('unit.cm')}
      label={t('onb.height.label')}
      error={error}
    />
  );
}

export function WeightStep({ a, set, error }) {
  const { t } = useI18n();
  useEffect(() => {
    if (a.weight == null) set({ weight: DEFAULT_WEIGHT[a.sex] || 70 }, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Measure
      value={a.weight}
      onChange={(weight) => set({ weight })}
      min={LIMITS.weight[0]}
      max={LIMITS.weight[1]}
      step={0.1}
      decimals={1}
      unit={t('unit.kg')}
      label={t('onb.weight.label')}
      error={error}
    />
  );
}

// ---------------------------------------------------------------- 6. Poids visé + poids sain
export function healthyState(a) {
  const range = healthyRange(a.height);
  if (!range || a.goalWeight == null) return { range, inside: false };
  return { range, inside: a.goalWeight >= range[0] && a.goalWeight <= range[1] };
}

export function GoalWeightStep({ a, set, error }) {
  const { t, fmt } = useI18n();
  useEffect(() => {
    if (a.goalWeight == null) set({ goalWeight: suggestedGoalWeight(a) }, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { range, inside } = healthyState(a);
  const diff = a.goalWeight != null && a.weight ? Math.round((a.goalWeight - a.weight) * 10) / 10 : null;
  // puce « Utiliser … » : la borne du poids sain dans le sens de l'objectif
  let bound = null;
  if (range && a.weight) {
    if (a.weight > range[1] && a.goal !== 'PRISE_MASSE') bound = range[1];
    else if (a.weight < range[0] && a.goal !== 'PERTE_POIDS') bound = range[0];
  }
  const lo = range ? range[0] - 12 : 0;
  const hi = range ? range[1] + 12 : 1;
  const pct = (v) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`;

  return (
    <div className="stack-4">
      <div className="onb-center stack-2">
        <BigNumberInput
          value={a.goalWeight}
          onChange={(goalWeight) => set({ goalWeight })}
          decimals={1}
          unit={t('unit.kg')}
          label={t('onb.target.label')}
          invalid={Boolean(error)}
        />
        {diff != null && !error ? (
          <p className={`row-2 small ${diff === 0 ? 'muted' : 'ember'}`}>
            <Icon name={diff < 0 ? 'trending-down' : diff > 0 ? 'trending-up' : 'minus'} size={16} />
            {diff === 0
              ? t('onb.target.keep')
              : t(diff < 0 ? 'onb.target.toLose' : 'onb.target.toGain', { n: fmt.kg(Math.abs(diff)) })}
          </p>
        ) : null}
      </div>
      <Ruler
        value={a.goalWeight}
        onChange={(goalWeight) => set({ goalWeight })}
        min={LIMITS.weight[0]}
        max={LIMITS.weight[1]}
        step={0.1}
        decimals={1}
        majorEvery={10}
        label={t('onb.target.label')}
        valueText={a.goalWeight != null ? fmt.kg(a.goalWeight) : undefined}
      />
      <FieldError error={error} />
      {range ? (
        <div className="card stack">
          <div className="row between wrap">
            <span className="small muted">{t('onb.target.healthy', { h: a.height })}</span>
            <span className="w500">
              <span className="num">
                {fmt.num(range[0], 1)} – {fmt.num(range[1], 1)}
              </span>{' '}
              {t('unit.kg')}
            </span>
          </div>
          <div className="healthy-bar" aria-hidden="true">
            <i className="band" style={{ insetInlineStart: pct(range[0]), width: `calc(${pct(range[1])} - ${pct(range[0])})` }} />
            {a.goalWeight != null ? <i className="marker" style={{ insetInlineStart: pct(a.goalWeight) }} /> : null}
          </div>
          {bound != null ? (
            <Chip selected={a.goalWeight === bound} onClick={() => set({ goalWeight: bound })} className="use-chip">
              {t('onb.target.use', { w: fmt.kg(bound) })}
            </Chip>
          ) : null}
          {!inside && a.goalWeight != null && !error ? (
            <p className="banner warn">
              <Icon name="triangle-alert" size={20} />
              <span className="grow">{t('onb.target.outside', { a: fmt.kg(range[0]), b: fmt.kg(range[1]) })}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- 7. Activité
const ACTIVITY_ICONS = { SEDENTAIRE: 'armchair', LEGER: 'footprints', ACTIF: 'bike', TRES_ACTIF: 'flame' };
export function ActivityStep({ a, set }) {
  const { t } = useI18n();
  return (
    <Choice options={ACTIVITIES} value={a.activity} onChange={(activity) => set({ activity })} prefix="onb.activity" icons={ACTIVITY_ICONS} subs label={t('onb.activity.q')} />
  );
}

// ---------------------------------------------------------------- 8. Niveau
const LEVEL_ICONS = { DEBUTANT: 'signal-low', INTERMEDIAIRE: 'signal-medium', AVANCE: 'signal-high' };
export function LevelStep({ a, set }) {
  const { t } = useI18n();
  return <Choice options={LEVELS} value={a.level} onChange={(level) => set({ level })} prefix="onb.level" icons={LEVEL_ICONS} subs label={t('onb.level.q')} />;
}

// ---------------------------------------------------------------- 9. Douleurs
export function PainsStep({ a, set }) {
  const { t, tp, label, name } = useI18n();
  const meta = useLoad(() => api.get('/meta'), []);
  const catalogue = useLoad(() => api.get('/exercises'), []);
  const injuries = a.injuries;
  const zones = meta.data?.injuryZones ? Object.entries(meta.data.injuryZones) : [];

  const toggleZone = (z) =>
    set((prev) => {
      const cur = Array.isArray(prev.injuries) ? prev.injuries : [];
      return { injuries: cur.includes(z) ? cur.filter((x) => x !== z) : [...cur, z] };
    });

  const removed = Array.isArray(injuries) && catalogue.data ? catalogue.data.filter((e) => (e.injuryZones || []).some((z) => injuries.includes(z))) : [];

  return (
    <div className="stack-4">
      <OptionCard multiple selected={Array.isArray(injuries) && injuries.length === 0} onSelect={() => set({ injuries: Array.isArray(injuries) && injuries.length === 0 ? null : [] })} title={t('onb.pains.none')} />
      {meta.error && !meta.data ? (
        <ErrorState compact error={meta.error} onRetry={meta.reload} />
      ) : (
        <div className="grid-3 onb-zones" role="group" aria-label={t('onb.pains.zones')}>
          {meta.loading && !meta.data
            ? Array.from({ length: 9 }, (_, i) => <Skeleton key={i} h={48} />)
            : zones.map(([code, entry]) => (
                <Chip key={code} selected={Array.isArray(injuries) && injuries.includes(code)} onClick={() => toggleZone(code)}>
                  {label(entry)}
                </Chip>
              ))}
        </div>
      )}

      {Array.isArray(injuries) ? (
        <div className="card stack" aria-live="polite">
          <span className="w500">{t('onb.pains.changes')}</span>
          {injuries.length === 0 ? (
            <p className="small muted">{t('onb.pains.nothing')}</p>
          ) : catalogue.error && !catalogue.data ? (
            <ErrorState compact error={catalogue.error} onRetry={catalogue.reload} />
          ) : !catalogue.data ? (
            <>
              <Skeleton line w="80%" />
              <Skeleton line w="55%" />
            </>
          ) : removed.length === 0 ? (
            <p className="small muted">{t('onb.pains.nothing')}</p>
          ) : (
            <>
              <p className="small">{tp('onb.pains.removed', removed.length, { total: catalogue.data.length })}</p>
              <ul className="removed-list">
                {removed.slice(0, 3).map((e) => (
                  <li key={e.id} className="strike small">
                    {name(e)}
                  </li>
                ))}
              </ul>
              {removed.length > 3 ? <span className="caption muted">{t('onb.pains.more', { n: removed.length - 3 })}</span> : null}
            </>
          )}
        </div>
      ) : null}
      <p className="caption muted">{t('onb.pains.disclaimer')}</p>
    </div>
  );
}

// ---------------------------------------------------------------- 10. Jours + durée
export function DaysStep({ a, set, error }) {
  const { t, tp, fmt } = useI18n();
  const days = a.trainingDays || [];
  const toggle = (d) =>
    set((prev) => {
      const cur = prev.trainingDays || [];
      return { trainingDays: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((x, y) => x - y) };
    });
  return (
    <div className="stack-4">
      <div className="days" role="group" aria-label={t('onb.days.label')}>
        {[0, 1, 2, 3, 4, 5, 6].map((d) => (
          <button key={d} type="button" className="day" aria-pressed={days.includes(d)} aria-label={fmt.weekday(d)} onClick={() => toggle(d)}>
            {fmt.weekdayLetter(d)}
          </button>
        ))}
      </div>
      {error ? (
        <FieldError error={error} />
      ) : (
        <p className="small">
          {days.length >= 2 ? <span className="w500">{tp('onb.days.count', days.length)}</span> : <span className="muted">{t('onb.days.min')}</span>}
        </p>
      )}
      <div className="stack-2">
        <span className="w500">{t('onb.days.length')}</span>
        <Segmented
          options={SESSION_MINUTES.map((m) => ({ value: m, label: t('onb.days.minutes', { n: m }) }))}
          value={a.sessionMinutes}
          onChange={(sessionMinutes) => set({ sessionMinutes })}
          label={t('onb.days.length')}
        />
      </div>
      {days.length ? (
        <div className="card stack">
          <span className="w500">{t('onb.days.week')}</span>
          {days.map((d) => (
            <div key={d} className="row between small">
              <span>{fmt.weekday(d).charAt(0).toUpperCase() + fmt.weekday(d).slice(1)}</span>
              <span className="muted">{t('onb.days.minutes', { n: a.sessionMinutes })}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- 11. Repas
const DIET_ICONS = { EQUILIBRE: 'salad', PROTEINES: 'dumbbell', VEGETARIEN: 'leaf', LOW_CARB: 'flame' };
export function DietStep({ a, set }) {
  const { t } = useI18n();
  return <Choice options={DIETS} value={a.dietStyle} onChange={(dietStyle) => set({ dietStyle })} prefix="onb.diet" icons={DIET_ICONS} subs label={t('onb.diet.q')} />;
}

// ---------------------------------------------------------------- 12. Accord santé
export function ConsentStep({ a, set }) {
  const { t } = useI18n();
  return (
    <div className="stack-4">
      <div className={`card consent ${a.healthConsent ? 'selected' : ''}`}>
        <Checkbox checked={a.healthConsent === true} onChange={(v) => set({ healthConsent: v })}>
          <span className="w500">{t('onb.consent.check')}</span>
        </Checkbox>
      </div>
      <p className="row-top small muted">
        <Icon name="shield-check" size={20} className="ok-text" />
        <span>{t('onb.consent.who')}</span>
      </p>
      <p className="row-top small muted">
        <Icon name="lock" size={20} />
        <span>{t('onb.consent.withdraw')}</span>
      </p>
      {!a.healthConsent ? <p className="caption muted">{t('onb.consent.required')}</p> : null}
    </div>
  );
}
