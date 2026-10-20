import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

/**
 * Anneau de progression (0 → 100 %), avec un contenu centré.
 * Au-delà de 100 %, l'anneau reste plein.
 */
export default function Ring({ size, stroke, progress, color, track, children }) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress || 0));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {p > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - p)}
          />
        )}
      </Svg>
      {children}
    </View>
  );
}
