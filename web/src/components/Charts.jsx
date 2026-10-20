// Graphiques simples en SVG (sans bibliothèque)

/**
 * Histogramme vertical.
 * data : [{ label, value }] · highlight : index de la barre mise en avant
 */
export function BarChart({ data, height = 220, format = (v) => v, highlight = -1, ariaLabel }) {
  const W = 640;
  const H = height;
  const pad = { top: 22, bottom: 30, side: 8 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const band = (W - pad.side * 2) / Math.max(1, data.length);
  const barW = Math.min(46, band * 0.62);
  const y = (v) => H - pad.bottom - (v / max) * (H - pad.top - pad.bottom);
  const showEvery = data.length > 12 ? 2 : 1;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
        <line x1={pad.side} x2={W - pad.side} y1={H - pad.bottom} y2={H - pad.bottom} stroke="var(--line)" />
        {data.map((d, i) => {
          const x = pad.side + i * band + (band - barW) / 2;
          const top = y(d.value);
          const on = i === highlight;
          return (
            <g key={d.label + i}>
              <rect
                x={x}
                y={top}
                width={barW}
                height={Math.max(0, H - pad.bottom - top)}
                rx="4"
                fill={on ? 'var(--signal)' : 'var(--brand)'}
                opacity={d.value === 0 ? 0.25 : 1}
              >
                <title>{`${d.label} : ${format(d.value)}`}</title>
              </rect>
              {d.value > 0 && (on || data.length <= 10) && (
                <text x={x + barW / 2} y={top - 6} textAnchor="middle" fontSize="13" fill="var(--ink)" fontWeight="600">
                  {format(d.value)}
                </text>
              )}
              {i % showEvery === 0 && (
                <text x={x + barW / 2} y={H - 10} textAnchor="middle" fontSize="12" fill="var(--muted)">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Barres horizontales : [{ label, value }] */
export function HBars({ data, format = (v) => v }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="hbars">
      {data.map((d) => (
        <div key={d.label} className={`hbar${d.value === 0 ? ' zero' : ''}`}>
          <span>{d.label}</span>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="hbar-value">{format(d.value)}</span>
        </div>
      ))}
    </div>
  );
}
