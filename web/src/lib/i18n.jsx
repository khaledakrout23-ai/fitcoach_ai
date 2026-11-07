import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Chaque dossier de fonctionnalité a son fichier strings.js : { fr: {...}, ar: {...}, en: {...} }.
// Ils sont tous fusionnés ici ; les clés sont préfixées par la fonctionnalité (home., session., …).
const modules = import.meta.glob('../**/strings.js', { eager: true });
export const LANGS = ['fr', 'ar', 'en'];
const dictionaries = { fr: {}, ar: {}, en: {} };
for (const mod of Object.values(modules)) {
  const s = mod.default || mod.strings || {};
  for (const l of LANGS) Object.assign(dictionaries[l], s[l] || {});
}

const LANG_KEY = 'kammel_lang';
const I18nContext = createContext(null);

function initialLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch {
    /* stockage indisponible (navigation privée) */
  }
  const nav = (navigator.language || 'fr').slice(0, 2);
  return nav === 'ar' ? 'ar' : nav === 'en' ? 'en' : 'fr';
}

// Chiffres latins partout (comme dans le design arabe) ; virgule décimale et espace des milliers en fr/ar
const NUMBER_LOCALE = { fr: 'fr-FR', ar: 'fr-FR', en: 'en-GB' };
const DATE_LOCALE = { fr: 'fr-FR', ar: 'ar-TN-u-nu-latn', en: 'en-GB' };

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function makeFormatters(lang, t) {
  const nl = NUMBER_LOCALE[lang];
  const dl = DATE_LOCALE[lang];
  const numFmt = (decimals = 0) => new Intl.NumberFormat(nl, { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
  const toDate = (d) => (d instanceof Date ? d : new Date(typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00` : d));
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const fmt = {
    /** 1 647 · 52,5 */
    num: (n, decimals = 0) => (n == null || Number.isNaN(Number(n)) ? '–' : numFmt(decimals).format(Number(n))),
    kg: (n) => `${fmt.num(n, 1)} ${t('unit.kg')}`,
    kcal: (n) => `${fmt.num(n)} ${t('unit.kcal')}`,
    g: (n) => `${fmt.num(n)} ${t('unit.g')}`,
    /** ml → « 3,4 L » */
    liters: (ml, decimals = 1) => `${fmt.num((Number(ml) || 0) / 1000, decimals)} ${t('unit.l')}`,
    money: (n) => `${fmt.num(n, 3)} ${t('unit.tnd')}`,
    percent: (n) => `${fmt.num(n)} %`,
    /** « mardi 3 novembre » */
    date: (d, opts = { weekday: 'long', day: 'numeric', month: 'long' }) =>
      d ? capitalize(new Intl.DateTimeFormat(dl, opts).format(toDate(d))) : '',
    /** « 3 nov. » / « 3 nov. 2027 » si autre année */
    shortDate: (d) => {
      if (!d) return '';
      const x = toDate(d);
      const opts = { day: 'numeric', month: 'short' };
      if (x.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
      return new Intl.DateTimeFormat(dl, opts).format(x);
    },
    time: (d) => (d ? new Intl.DateTimeFormat(dl, { hour: '2-digit', minute: '2-digit', hour12: false }).format(toDate(d)) : ''),
    /** « Aujourd'hui 10:52 », « Hier 18:30 », « Il y a 6 j », « 26 oct. » */
    when: (d, { withTime = true } = {}) => {
      if (!d) return '';
      const x = toDate(d);
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      if (sameDay(x, now)) return withTime ? `${t('time.today')} ${fmt.time(x)}` : t('time.today');
      if (sameDay(x, yesterday)) return withTime ? `${t('time.yesterday')} ${fmt.time(x)}` : t('time.yesterday');
      const days = Math.floor((now - x) / 86400000);
      if (days > 0 && days < 7) return t('time.daysAgo', { n: days });
      return fmt.shortDate(x);
    },
    /** 0 = lundi → « L » / « ن » / « M » */
    weekdayLetter: (i) => t(`day.letter.${i}`),
    weekdayShort: (i) => t(`day.short.${i}`),
    weekday: (i) => t(`day.long.${i}`),
    /** minutes → « 1 h 05 » / « 58 min » */
    duration: (min) => {
      const m = Math.max(0, Math.round(Number(min) || 0));
      if (m < 60) return `${m} ${t('unit.min')}`;
      return `${Math.floor(m / 60)} ${t('unit.h')} ${String(m % 60).padStart(2, '0')}`;
    },
    /** secondes → « 18:24 » */
    clock: (sec) => {
      const s = Math.max(0, Math.floor(Number(sec) || 0));
      const h = Math.floor(s / 3600);
      const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
      const ss = String(s % 60).padStart(2, '0');
      return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    },
    initials: (name) =>
      String(name || '?')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p.charAt(0).toUpperCase())
        .join(''),
  };
  return fmt;
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((next) => {
    if (!LANGS.includes(next)) return;
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => {
    const dict = dictionaries[lang];
    /** t('cle', { n: 3 }) → texte traduit avec {n} remplacé */
    const t = (key, vars) => {
      let text = dict[key] ?? dictionaries.fr[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
      return text;
    };
    /** pluriel simple : clé_one si n = 1 (fr : n ≤ 1), sinon clé_other */
    const tp = (key, n, vars = {}) => {
      const one = lang === 'fr' ? Math.abs(n) <= 1 : Math.abs(n) === 1;
      const k = one && (dict[`${key}_one`] || dictionaries.fr[`${key}_one`]) ? `${key}_one` : `${key}_other`;
      return t(k, { n, ...vars });
    };
    /** champ traduit d'un objet de l'API : name(ex) → ex.nameFr / ex.nameAr / ex.nameEn */
    const name = (obj, field = 'name') => {
      if (!obj) return '';
      const suffix = lang === 'ar' ? 'Ar' : lang === 'en' ? 'En' : 'Fr';
      return obj[`${field}${suffix}`] || obj[`${field}Fr`] || obj[field] || '';
    };
    /** libellé {fr, ar, en} venant de /api/meta */
    const label = (entry) => (entry ? entry[lang] || entry.fr || '' : '');
    /** message d'erreur : traduction du code si elle existe, sinon message du serveur */
    const error = (err) => {
      if (!err) return '';
      const key = `err.${err.code}`;
      return dict[key] || dictionaries.fr[key] || err.message || t('err.ERROR');
    };
    return { lang, dir, setLang, t, tp, name, label, error, fmt: makeFormatters(lang, t), has: (key) => key in dict };
  }, [lang, dir, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
