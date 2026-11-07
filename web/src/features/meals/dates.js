// Dates locales AAAA-MM-JJ (midi, pour éviter les changements d'heure)
import { localDate } from '../../lib/hooks';

const parse = (iso) => new Date(`${iso}T12:00:00`);

export function addDays(iso, n) {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

/** Lundi de la semaine de la date */
export function mondayOf(iso) {
  const d = parse(iso);
  return addDays(iso, -((d.getDay() + 6) % 7));
}

export const dayOfMonth = (iso) => parse(iso).getDate();

/** Moment du repas selon l'heure (préselection) */
export function mealTypeNow(date = new Date()) {
  const m = date.getHours() * 60 + date.getMinutes();
  if (m < 10 * 60 + 30) return 'PETIT_DEJ';
  if (m < 15 * 60) return 'DEJEUNER';
  if (m < 18 * 60 + 30) return 'COLLATION';
  return 'DINER';
}

export const MEAL_TYPES = ['PETIT_DEJ', 'DEJEUNER', 'DINER', 'COLLATION'];
