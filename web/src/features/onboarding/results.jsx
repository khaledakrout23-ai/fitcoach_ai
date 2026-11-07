import { useState } from 'react';
import { Button, Donut, Icon, Num, Ring, Sheet } from '../../components';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';
import { bmi, bmiCategory, dailyTarget, healthyRange, waterTarget, weeksToGoal, WATER } from '../../lib/targets';
import { thisYear } from './flow';

/** Profil de calcul (mêmes champs que le serveur) */
export function profileOf(a) {
  return {
    weight: a.weight,
    height: a.height,
    age: a.birthYear ? thisYear() - a.birthYear : null,
    sex: a.sex,
    activity: a.activity,
    goal: a.goal,
    dietStyle: a.dietStyle,
    sessionMinutes: a.sessionMinutes,
  };
}

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

const MACROS = [
  ['protein', 'var(--protein)', 4],
  ['carbs', 'var(--carbs)', 4],
  ['fat', 'var(--fat)', 9],
];

function MacroDonut({ target, size = 150 }) {
  const { t, fmt } = useI18n();
  return (
    <div className="card results-donut">
      <Donut
        size={size}
        stroke={16}
        parts={MACROS.map(([k, color, f]) => ({ value: target[k] * f, color }))}
        label={t('onb.results.donut', { kcal: fmt.kcal(target.calories), p: fmt.g(target.protein), c: fmt.g(target.carbs), f: fmt.g(target.fat) })}
      >
        <span className="donut-kcal">
          <Num>{fmt.num(target.calories)}</Num>
        </span>
        <span className="caption muted">{t('onb.results.perDay')}</span>
      </Donut>
      <ul className="macro-legend">
        {MACROS.map(([k, color]) => (
          <li key={k}>
            <span className="dot" style={{ background: color }} aria-hidden="true" />
            <span className="grow muted">{t(`onb.results.${k}`)}</span>
            <span className="w500">
              <Num>{fmt.num(target[k])}</Num> {t('unit.g')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const BMI_SCALE = [
  ['MAIGREUR', 15, 18.5, 'hydro'],
  ['NORMAL', 18.5, 25, 'ok'],
  ['SURPOIDS', 25, 30, 'warn'],
  ['OBESITE', 30, 40, 'danger'],
];

/** Position sur l'échelle IMC : chaque catégorie occupe un quart de la barre */
function bmiPosition(value) {
  const i = BMI_SCALE.findIndex(([, lo, hi]) => value < hi);
  const idx = i < 0 ? BMI_SCALE.length - 1 : i;
  const [, lo, hi] = BMI_SCALE[idx];
  const within = Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
  return ((idx + within) / BMI_SCALE.length) * 100;
}

export function ResultsStep({ a, jump }) {
  const { t, fmt } = useI18n();
  const { user } = useAuth();
  const [waterOpen, setWaterOpen] = useState(false);
  const profile = profileOf(a);
  const target = dailyTarget(profile);
  const value = bmi(profile);
  const cat = bmiCategory(value);
  const tone = BMI_SCALE.find(([k]) => k === cat)?.[3] || '';
  const waterTrain = waterTarget(profile, { trainingDay: true });
  const waterRest = waterTarget(profile, { trainingDay: false });
  const name = firstName(user?.name);
  if (!target) return null;

  return (
    <div className="stack">
      <h1 className="onb-title" tabIndex={-1}>
        {name ? t('onb.results.title', { name }) : t('onb.results.titleAnon')}
      </h1>
      <MacroDonut target={target} />

      <div className="grid-2">
        <div className="card compare">
          <span className="small muted">{t('onb.results.stable')}</span>
          <span className="compare-num">
            <Num>{fmt.num(target.maintenance)}</Num> <small>{t('unit.kcal')}</small>
          </span>
        </div>
        <div className="card ember compare">
          <span className="small ember">{t('onb.results.target')}</span>
          <span className="compare-num">
            <Num>{fmt.num(target.calories)}</Num> <small>{t('unit.kcal')}</small>
          </span>
        </div>
      </div>

      {value != null ? (
        <div className="card stack">
          <div className="row between">
            <span className="muted">{t('onb.results.bmi')}</span>
            <span className="w500">
              <Num>{fmt.num(value, 1)}</Num> · <span className={`${tone}-text`}>{t(`onb.results.bmi.${cat}`)}</span>
            </span>
          </div>
          <div className="bmi-scale" aria-hidden="true">
            {BMI_SCALE.map(([k, , , c]) => (
              <i key={k} className={c} />
            ))}
            <b style={{ insetInlineStart: `${bmiPosition(value)}%` }} />
          </div>
          <div className="bmi-labels caption muted">
            {BMI_SCALE.map(([k]) => (
              <span key={k}>{t(`onb.results.bmi.${k}`)}</span>
            ))}
          </div>
        </div>
      ) : null}

      {waterTrain ? (
        <div className="card row water-card">
          <Ring value={waterTrain} max={WATER.max} size={64} stroke={7} color="var(--hydro)">
            <Icon name="droplet" size={20} className="hydro-text" />
          </Ring>
          <div className="grow stack-2 tight">
            <span className="small muted">{t('onb.results.water')}</span>
            <span className="compare-num">
              <Num>{fmt.num(waterTrain / 1000, 1)}</Num> <small>{t('unit.l')}</small>
            </span>
          </div>
          <button type="button" className="link-btn small" onClick={() => setWaterOpen(true)}>
            {t('onb.results.how')}
          </button>
        </div>
      ) : null}

      <div className="row-2 wrap">
        <Button variant="secondary" size="sm" onClick={() => jump('weight')}>
          {t('onb.results.editWeight')}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => jump('activity')}>
          {t('onb.results.editActivity')}
        </Button>
      </div>
      <p className="caption muted">{t('onb.disclaimer')}</p>

      <Sheet open={waterOpen} onClose={() => setWaterOpen(false)} title={t('onb.water.title')}>
        <div className="stack-4">
          <p className="muted">{t('onb.water.formula')}</p>
          <div className="card flat stack small">
            <div className="row between">
              <span>{t('onb.water.base', { kg: fmt.kg(a.weight) })}</span>
              <Num>{fmt.num(a.weight * WATER.perKg)} {t('unit.ml')}</Num>
            </div>
            <div className="row between">
              <span>{t('onb.water.session', { min: fmt.duration(a.sessionMinutes) })}</span>
              <Num>+ {fmt.num(a.sessionMinutes * WATER.perSessionMinute)} {t('unit.ml')}</Num>
            </div>
            <hr className="divider" />
            <div className="row between w500">
              <span>{t('onb.water.train')}</span>
              <span className="hydro-text">
                <Num>{fmt.liters(waterTrain, 2)}</Num>
              </span>
            </div>
            <div className="row between">
              <span>{t('onb.water.rest')}</span>
              <Num>{fmt.liters(waterRest, 2)}</Num>
            </div>
          </div>
          <p className="caption muted">{t('onb.water.hot')}</p>
          <p className="caption muted">{t('onb.disclaimer')}</p>
        </div>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------- Courbe (Résultats 2)
const W = 320;
const H = 160;
const PAD = 16;

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function TimelineStep({ a }) {
  const { t, fmt, lang } = useI18n();
  const goalWeight = a.goal === 'FORME' ? null : a.goalWeight;
  const weeks = goalWeight != null ? weeksToGoal(a.weight, goalWeight) : 0;
  const stable = !weeks;
  const today = new Date();
  const end = addDays(today, (stable ? 12 : weeks) * 7);
  let monthYear = fmt.date(end, { month: 'long', year: 'numeric' });
  if (lang === 'fr') monthYear = monthYear.charAt(0).toLowerCase() + monthYear.slice(1);

  // courbe douce : départ et arrivée à plat, ~0,5 kg par semaine entre les deux
  const down = !stable && goalWeight < a.weight;
  const y0 = stable ? H / 2 : down ? PAD + 8 : H - PAD - 8;
  const y1 = stable ? H / 2 : down ? H - PAD - 8 : PAD + 8;
  const x0 = PAD;
  const x1 = W - PAD;
  const curve = `M ${x0} ${y0} C ${x0 + (x1 - x0) * 0.45} ${y0}, ${x0 + (x1 - x0) * 0.55} ${y1}, ${x1} ${y1}`;
  const area = `${curve} L ${x1} ${H} L ${x0} ${H} Z`;
  const startLabel = fmt.kg(a.weight);
  const endLabel = fmt.kg(stable ? a.weight : goalWeight);

  return (
    <div className="stack-4">
      <h1 className="onb-title" tabIndex={-1}>
        {stable ? t('onb.timeline.stableTitle', { w: fmt.kg(a.weight) }) : t('onb.timeline.title', { w: fmt.kg(goalWeight), date: monthYear })}
      </h1>
      <p className="muted">{stable ? t('onb.timeline.stableSub') : t('onb.timeline.sub', { n: weeks })}</p>

      <div className="card timeline">
        <div className="tl-values row between">
          <span className="stack-2 tight">
            <span className="caption muted">{t('onb.timeline.today')}</span>
            <span className="w500">
              <Num>{startLabel}</Num>
            </span>
          </span>
          <span className="stack-2 tight text-end">
            <span className="caption ember">{t('onb.timeline.goal')}</span>
            <span className="w500 ember">
              <Num>{endLabel}</Num>
            </span>
          </span>
        </div>
        <svg className="tl-svg" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={t('onb.timeline.chart', { from: startLabel, to: endLabel })} preserveAspectRatio="none">
          <defs>
            <linearGradient id="tl-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--ember)" stopOpacity="0.28" />
              <stop offset="1" stopColor="var(--ember)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={x0} x2={x1} y1={H * f} y2={H * f} stroke="var(--line)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={area} fill="url(#tl-fill)" />
          <path d={curve} fill="none" stroke="var(--ember)" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <circle cx={x0} cy={y0} r="6" fill="var(--text)" stroke="var(--surface)" strokeWidth="3" />
          <circle cx={x1} cy={y1} r="7" fill="var(--ember)" stroke="var(--surface)" strokeWidth="3" />
        </svg>
        <div className="row between caption muted">
          <span>{fmt.shortDate(today)}</span>
          <span>{stable ? t('onb.timeline.months') : fmt.date(end, { month: 'short', year: 'numeric' })}</span>
        </div>
      </div>
      <p className="caption muted">{t('onb.disclaimer')}</p>
    </div>
  );
}

// ---------------------------------------------------------------- Récapitulatif
export function SummaryStep({ a, review }) {
  const { t, fmt, label } = useI18n();
  const target = dailyTarget(profileOf(a));
  const meta = useLoad(() => ((a.injuries || []).length ? api.get('/meta') : null), []);
  const age = a.birthYear ? thisYear() - a.birthYear : null;
  const profileLine = [t(`onb.sex.${a.sex}`), t('onb.summary.age', { n: age }), `${a.height} ${t('unit.cm')}`, fmt.kg(a.weight)];
  if (a.sex === 'NA') profileLine.shift();
  const range = healthyRange(a.height);
  const chips = [
    t(`onb.goal.${a.goal}`),
    a.goal !== 'FORME' && a.goalWeight != null ? t('onb.summary.goalWeight', { w: fmt.kg(a.goalWeight) }) : null,
    t(`onb.activity.${a.activity}`),
    t(`onb.level.${a.level}`),
    t('onb.summary.days', { n: (a.trainingDays || []).length }),
    t('onb.days.minutes', { n: a.sessionMinutes }),
    t(`onb.diet.${a.dietStyle}`),
  ].filter(Boolean);
  return (
    <div className="stack-4">
      <div className="stack-2">
        <h1 className="onb-title" tabIndex={-1}>
          {t('onb.summary.title')}
        </h1>
        <p className="muted">{t('onb.summary.lead')}</p>
      </div>
      {target ? (
        <div className="card stack">
          <div className="row between wrap">
            <span className="summary-kcal">
              <Num>{fmt.num(target.calories)}</Num> <small>{t('onb.results.perDay')}</small>
            </span>
          </div>
          <div className="row wrap summary-macros">
            {MACROS.map(([k, color]) => (
              <span key={k} className="row-2 small">
                <span className="dot" style={{ background: color }} aria-hidden="true" />
                {t(`onb.results.${k}`)} <span className="w500"><Num>{fmt.g(target[k])}</Num></span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <p className="w500">{profileLine.join(' · ')}</p>
      <div className="stack-2">
        <span className="small muted">{t('onb.summary.answers')}</span>
        <div className="chips">
          {chips.map((c) => (
            <span key={c} className="chip">
              {c}
            </span>
          ))}
          {(a.injuries || []).length === 0 ? (
            <span className="chip">{t('onb.pains.none')}</span>
          ) : (
            a.injuries.map((c) => (
              <span key={c} className="chip">
                <Icon name="circle-alert" size={16} />
                {meta.data?.injuryZones?.[c] ? label(meta.data.injuryZones[c]) : '…'}
              </span>
            ))
          )}
        </div>
      </div>
      {range && a.goalWeight != null && a.goal !== 'FORME' && (a.goalWeight < range[0] || a.goalWeight > range[1]) ? (
        <p className="banner warn">
          <Icon name="triangle-alert" size={20} />
          <span className="grow">{t('onb.target.outside', { a: fmt.kg(range[0]), b: fmt.kg(range[1]) })}</span>
        </p>
      ) : null}
      <button type="button" className="link-btn summary-review" onClick={review}>
        {t('onb.summary.review')}
      </button>
    </div>
  );
}
