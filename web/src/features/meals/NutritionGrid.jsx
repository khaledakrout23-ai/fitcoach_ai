import { useI18n } from '../../lib/i18n';

/** 4 cases : kcal, P, G, L */
export default function NutritionGrid({ values }) {
  const { t, fmt } = useI18n();
  const cells = [
    { k: 'calories', label: t('unit.kcal'), cls: '' },
    { k: 'protein', label: t('meals.protein'), cls: 'ml-p' },
    { k: 'carbs', label: t('meals.carbs'), cls: 'ml-c' },
    { k: 'fat', label: t('meals.fat'), cls: 'ml-f' },
  ];
  return (
    <div className="ml-ngrid">
      {cells.map((c) => (
        <div key={c.k} className="ml-ncell">
          <span className={`h3 ${c.cls}`}>
            <span className="num">{fmt.num(values[c.k])}</span>
            {c.k !== 'calories' ? <span className="num-unit">{t('unit.g')}</span> : null}
          </span>
          <span className="caption muted">{c.label}</span>
        </div>
      ))}
    </div>
  );
}
