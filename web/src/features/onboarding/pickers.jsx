import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../../lib/i18n';

const PX = 8; // pixels par cran de la règle
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const roundTo = (v, decimals) => Math.round(v * 10 ** decimals) / 10 ** decimals;

/**
 * Règle horizontale (taille, poids) : glisser au doigt, molette, souris, clavier (role slider).
 * En arabe la règle est en miroir (valeurs croissantes vers la gauche), comme le design.
 */
export function Ruler({ value, onChange, min, max, step = 1, majorEvery = 10, decimals = 0, label, valueText }) {
  const { dir, fmt } = useI18n();
  const ref = useRef(null);
  const programmatic = useRef(false);
  const settle = useRef(null);
  const drag = useRef(null);
  const touching = useRef(false); // seul un geste de l'utilisateur change la valeur
  const count = Math.round((max - min) / step);
  const current = value == null ? min : clamp(value, min, max);

  const posOf = (v) => Math.round((clamp(v, min, max) - min) / step) * PX;
  const valueAt = (pos) => roundTo(min + Math.round(pos / PX) * step, decimals);

  // sens réel de la règle (le sens du document peut changer juste après le rendu)
  const sgn = () => (ref.current && getComputedStyle(ref.current).direction === 'rtl' ? -1 : 1);

  // valeur changée ailleurs (champ, puce « Utiliser … ») ou langue changée : la règle suit
  useLayoutEffect(() => {
    const sync = () => {
      const el = ref.current;
      if (!el) return;
      const target = posOf(current);
      if (Math.abs(Math.abs(el.scrollLeft) - target) > PX / 2) {
        programmatic.current = true;
        el.scrollLeft = target * sgn();
        requestAnimationFrame(() => {
          programmatic.current = false;
        });
      }
    };
    sync();
    const id = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, dir]);

  const onScroll = () => {
    const el = ref.current;
    if (!el || programmatic.current || !touching.current) return;
    const pos = Math.abs(el.scrollLeft);
    const v = clamp(valueAt(pos), min, max);
    if (v !== value) onChange(v);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      if (drag.current) return;
      touching.current = false;
      const snapped = posOf(v);
      if (Math.abs(Math.abs(el.scrollLeft) - snapped) > 0.5) el.scrollTo({ left: snapped * sgn(), behavior: 'smooth' });
    }, 140);
  };

  // molette verticale → défilement horizontal (souris d'ordinateur)
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      touching.current = true;
      el.scrollLeft += e.deltaY * sgn();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => clearTimeout(settle.current), []);

  const onPointerDown = (e) => {
    touching.current = true;
    if (e.pointerType !== 'mouse') return;
    drag.current = { x: e.clientX, left: ref.current.scrollLeft };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    ref.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    onScroll();
  };

  const onKeyDown = (e) => {
    const big = step * majorEvery;
    const right = dir === 'rtl' ? -step : step;
    const moves = { ArrowRight: right, ArrowLeft: -right, ArrowUp: step, ArrowDown: -step, PageUp: big, PageDown: -big };
    let next = null;
    if (e.key in moves) next = current + moves[e.key];
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    if (next == null) return;
    e.preventDefault();
    onChange(clamp(roundTo(next, decimals), min, max));
  };

  const labels = [];
  for (let i = 0; i <= count; i += majorEvery) labels.push(i);

  return (
    <div
      className="ruler"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={current}
      aria-valuetext={valueText}
      onKeyDown={onKeyDown}
    >
      <div
        className="ruler-scroll"
        ref={ref}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={() => {
          touching.current = true;
        }}
      >
        <span className="ruler-pad" />
        <div className="ruler-scale" style={{ width: count * PX + 2, '--px': `${PX}px`, '--major': `${PX * majorEvery}px` }}>
          <span className="ruler-ticks" />
          {labels.map((i) => (
            <span key={i} className="ruler-label" dir="ltr" style={{ insetInlineStart: i * PX + 1 }}>
              {fmt.num(min + i * step, 0)}
            </span>
          ))}
        </div>
        <span className="ruler-pad" />
      </div>
      <span className="ruler-needle" aria-hidden="true" />
    </div>
  );
}

/** Grand nombre modifiable au clavier (« 76,3 kg ») ; la virgule décimale est acceptée */
export function BigNumberInput({ value, onChange, decimals = 0, unit, label, invalid, describedBy }) {
  const { fmt } = useI18n();
  const [text, setText] = useState(null); // texte en cours de saisie (null : affiche la valeur)
  const shown = text ?? (value == null ? '' : fmt.num(value, decimals));
  return (
    <span className="big-input">
      <input
        className="big-num num"
        type="text"
        inputMode={decimals ? 'decimal' : 'numeric'}
        dir="ltr"
        value={shown}
        style={{ width: `${Math.max(2, shown.length) + 0.1}ch` }}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onFocus={(e) => {
          setText(shown);
          requestAnimationFrame(() => e.target.select());
        }}
        onBlur={() => setText(null)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.,]/g, '').slice(0, decimals ? 6 : 3);
          setText(raw);
          const n = parseFloat(raw.replace(',', '.'));
          onChange(Number.isFinite(n) ? roundTo(n, decimals) : null);
        }}
      />
      {unit ? <span className="big-unit">{unit}</span> : null}
    </span>
  );
}

const ROW = 52; // hauteur d'une ligne de la roue

/** Roue des années (scroll vertical aimanté) + clavier ; valeurs de max (en haut) à min */
export function YearWheel({ value, onChange, min, max, label, describe }) {
  const ref = useRef(null);
  const programmatic = useRef(false);
  const timer = useRef(null);
  const years = [];
  for (let y = max; y >= min; y -= 1) years.push(y);
  const index = Math.max(0, years.indexOf(value));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = index * ROW;
    if (Math.abs(el.scrollTop - target) > ROW / 2) {
      programmatic.current = true;
      el.scrollTop = target;
      requestAnimationFrame(() => {
        programmatic.current = false;
      });
    }
  }, [index]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onScroll = () => {
    const el = ref.current;
    if (!el || programmatic.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const i = Math.min(years.length - 1, Math.max(0, Math.round(el.scrollTop / ROW)));
      if (years[i] !== value) onChange(years[i]);
    }, 90);
  };

  const pick = (y) => {
    onChange(y);
    const i = years.indexOf(y);
    ref.current?.scrollTo({ top: i * ROW, behavior: 'smooth' });
  };

  const onKeyDown = (e) => {
    const moves = { ArrowUp: -1, ArrowDown: 1, PageUp: -10, PageDown: 10 };
    let i = null;
    if (e.key in moves) i = index + moves[e.key];
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = years.length - 1;
    if (i == null) return;
    e.preventDefault();
    onChange(years[Math.min(years.length - 1, Math.max(0, i))]);
  };

  return (
    <div className="wheel">
      <span className="wheel-band" aria-hidden="true" />
      <div
        className="wheel-scroll"
        ref={ref}
        onScroll={onScroll}
        role="listbox"
        tabIndex={0}
        aria-label={label}
        aria-activedescendant={`year-${value}`}
        onKeyDown={onKeyDown}
      >
        {years.map((y) => (
          <div
            key={y}
            id={`year-${y}`}
            role="option"
            aria-selected={y === value}
            aria-label={describe ? `${y} · ${describe(y)}` : String(y)}
            className={`wheel-item ${y === value ? "on" : ""}`} dir="ltr"
            onClick={() => pick(y)}
          >
            {y}
          </div>
        ))}
      </div>
    </div>
  );
}
