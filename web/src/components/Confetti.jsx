import { useMemo } from 'react';

const COLORS = ['var(--ember)', 'var(--carbs)', 'var(--hydro)', 'var(--ok)', 'var(--text)'];

/** Confettis pour un record personnel (A5) — purement décoratif */
export default function Confetti({ count = 60 }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        delay: `${((i * 53) % 900) / 1000}s`,
        color: COLORS[i % COLORS.length],
        rotate: `${(i * 47) % 360}deg`,
      })),
    [count]
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i key={i} style={{ left: p.left, animationDelay: p.delay, background: p.color, transform: `rotate(${p.rotate})` }} />
      ))}
    </div>
  );
}
