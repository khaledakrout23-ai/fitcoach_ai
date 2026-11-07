import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * QR code en SVG (carte d'accès, étiquettes des machines). Généré dans le navigateur : rien n'est envoyé ailleurs.
 * Les modules sont dessinés en un seul chemin (pas de HTML injecté).
 */
export default function QRCode({ value, size = 220, label }) {
  const path = useMemo(() => {
    if (!value) return null;
    const qr = qrcode(0, 'M');
    qr.addData(String(value));
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
    return { d, n };
  }, [value]);
  if (!path) return null;
  return (
    <span className="qr" style={{ width: size }}>
      <svg viewBox={`-2 -2 ${path.n + 4} ${path.n + 4}`} role="img" aria-label={label} shapeRendering="crispEdges">
        <rect x="-2" y="-2" width={path.n + 4} height={path.n + 4} fill="#fff" />
        <path d={path.d} fill="#0B0D10" />
      </svg>
    </span>
  );
}
