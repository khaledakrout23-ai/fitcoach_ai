import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';

// Couleurs : toujours des variables du thème (var(--ember), var(--hydro), var(--protein)…)

/** Anneau de progression (kcal restantes, eau, macros). Animation de remplissage au montage (A5). */
export function Ring({ value = 0, max = 100, size = 120, stroke = 10, color = 'var(--ember)', track, children, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div className="ring" style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={track ? { stroke: track } : undefined} />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

/** Donut multi-segments (calories : protéines / glucides / lipides) */
export function Donut({ parts, size = 150, stroke = 14, gap = 0.02, children, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  let offset = 0;
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {parts.map((p, i) => {
          const frac = p.value / total;
          const len = Math.max(0, frac - gap) * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset * c}
            />
          );
          offset += frac;
          return el;
        })}
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

/** Jauge demi-cercle (affluence 42 / 120) */
export function Gauge({ value = 0, max = 100, size = 220, stroke = 14, color = 'var(--ok)', children, label }) {
  const r = (size - stroke) / 2;
  const half = Math.PI * r;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const h = size / 2 + stroke / 2;
  return (
    <div className="gauge" style={{ width: size, height: h }} role="img" aria-label={label}>
      <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} aria-hidden="true">
        <path d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} strokeLinecap="round" />
        <path
          d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={half}
          strokeDashoffset={half * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 900ms var(--ease)' }}
        />
      </svg>
      <div className="gauge-center">{children}</div>
    </div>
  );
}

/**
 * Barres verticales (affluence par heure, eau 7 jours, revenus 12 mois).
 * data : [{ value, tone: 'now'|'calm'|'past'|'forecast'|'hydro'|'ember', label, marker }]
 */
export function Bars({ data, height = 120, axis, label, max }) {
  const top = max || Math.max(1, ...data.map((d) => d.value || 0));
  return (
    <figure style={{ margin: 0 }} aria-label={label} role="img">
      <div className="bars" style={{ height }} dir="ltr">
        {data.map((d, i) => (
          <div
            key={i}
            className={`bar ${d.tone || ''}`}
            style={{ height: `${Math.max(3, ((d.value || 0) / top) * 100)}%` }}
            title={d.label ? `${d.label} · ${d.value}` : String(d.value)}
          >
            {d.marker ? <span className="bar-label">{d.marker}</span> : null}
          </div>
        ))}
      </div>
      {axis ? (
        <div className="bars-axis" aria-hidden="true">
          {axis.map((a, i) => (
            <span key={i}>{a}</span>
          ))}
        </div>
      ) : null}
    </figure>
  );
}

/** Courbe simple (poids, charge max) ; points [{ x: label, y: number }] */
export function LineChart({ points, height = 140, color = 'var(--ember)', label, showDots = true, goal }) {
  if (!points || points.length === 0) return null;
  const w = 320;
  const ys = points.map((p) => p.y).concat(goal != null ? [goal] : []);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const pad = 10;
  const px = (i) => (points.length === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (points.length - 1));
  const py = (y) => pad + (1 - (y - min) / span) * (height - pad * 2);
  const d = points.map((p, i) => `${i ? 'L' : 'M'} ${px(i).toFixed(1)} ${py(p.y).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img" aria-label={label} dir="ltr" preserveAspectRatio="none">
      {goal != null ? <line x1={pad} x2={w - pad} y1={py(goal)} y2={py(goal)} stroke="var(--line)" strokeDasharray="4 4" /> : null}
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {showDots
        ? points.map((p, i) => <circle key={i} cx={px(i)} cy={py(p.y)} r="3.5" fill={color} vectorEffect="non-scaling-stroke" />)
        : null}
    </svg>
  );
}

/** Barre segmentée (onboarding 4 sections, « Exercice 2/6 », semaine 3/8) : values = [0..1] par segment */
export function Segments({ values, label }) {
  return (
    <div className="segments" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={values.length} aria-valuenow={values.reduce((s, v) => s + v, 0)}>
      {values.map((v, i) => (
        <span key={i}>
          <i style={{ width: `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%` }} />
        </span>
      ))}
    </div>
  );
}

export function ProgressBar({ value = 0, max = 100, tone = '', label }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={`progress ${tone}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Protéines 20 / 124 g avec barre colorée */
export function MacroBar({ label, value, target, color }) {
  const { fmt, t } = useI18n();
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="macro-bar">
      <div className="row between">
        <span className="muted">{label}</span>
        <span className="num">
          {fmt.num(value)} / {fmt.num(target)} {t('unit.g')}
        </span>
      </div>
      <div className="progress" style={{ background: 'var(--surface-3)' }}>
        <i style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/** Carte de chaleur jour × heure (affluence habituelle) ; values[jour][heure] ∈ [0..1] */
export function Heatmap({ values, rowLabels, colLabels, label }) {
  return (
    <div role="img" aria-label={label} dir="ltr" style={{ display: 'grid', gap: 4, gridTemplateColumns: `40px repeat(${values[0]?.length || 0}, minmax(0, 1fr))` }}>
      {values.map((row, i) => [
        <span key={`l${i}`} className="caption muted" style={{ alignSelf: 'center' }}>
          {rowLabels[i]}
        </span>,
        ...row.map((v, j) => (
          <span
            key={`${i}-${j}`}
            title={`${rowLabels[i]} ${colLabels ? colLabels[j] : j}`}
            style={{ height: 18, borderRadius: 4, background: `color-mix(in srgb, var(--ember) ${Math.round(Math.min(1, Math.max(0, v)) * 100)}%, var(--surface-2))` }}
          />
        )),
      ])}
    </div>
  );
}

/** Points « 1 point = 1 personne » (Gym en direct) */
export function PeopleDots({ count, capacity, max = 45 }) {
  const shown = Math.min(count, max);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', gap: 6 }} aria-hidden="true">
      {Array.from({ length: Math.min(max, Math.max(shown, Math.min(capacity || max, max))) }, (_, i) => (
        <span key={i} style={{ aspectRatio: '1', borderRadius: '50%', background: i < shown ? 'var(--text)' : 'var(--surface-3)' }} />
      ))}
    </div>
  );
}
