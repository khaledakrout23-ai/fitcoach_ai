import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { dictionaries } from './locales';

const I18nContext = createContext(null);
const LANG_KEY = 'fitcoach_lang';

function savedLang() {
  try {
    return localStorage.getItem(LANG_KEY) === 'ar' ? 'ar' : 'fr';
  } catch {
    return 'fr';
  }
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(savedLang);
  const [meta, setMeta] = useState({ muscles: {}, patterns: {}, injuryZones: {} });

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  // Libellés des muscles, mouvements et zones (venant de l'API)
  useEffect(() => {
    api('/meta').then(setMeta).catch(() => {});
  }, []);

  const value = useMemo(() => {
    const dict = dictionaries[lang];
    const locale = lang === 'ar' ? 'ar-TN' : 'fr-FR';

    // t('cle', { n: 3 }) → texte traduit, avec remplacement de {n}
    const t = (key, vars) => {
      let text = dict[key] ?? dictionaries.fr[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, v);
      return text;
    };

    return {
      lang,
      setLang(next) {
        setLangState(next);
        try {
          localStorage.setItem(LANG_KEY, next);
        } catch {
          /* ignore */
        }
      },
      t,
      // champ traduit d'un objet de l'API : name(ex) → ex.nameFr ou ex.nameAr
      name: (obj, field = 'name') => (obj ? obj[`${field}${lang === 'ar' ? 'Ar' : 'Fr'}`] || obj[`${field}Fr`] : ''),
      list: (obj, field) => (obj ? obj[`${field}${lang === 'ar' ? 'Ar' : 'Fr'}`] || [] : []),
      muscle: (code) => meta.muscles[code]?.[lang] || code,
      pattern: (code) => meta.patterns[code]?.[lang] || code,
      zone: (code) => meta.injuryZones[code]?.[lang] || code,
      meta,
      date: (d, opts = { day: 'numeric', month: 'short' }) => (d ? new Date(d).toLocaleDateString(locale, opts) : ''),
      time: (d) => (d ? new Date(d).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : ''),
      money: (n) =>
        `${new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(Number(n) || 0)} ${lang === 'ar' ? 'د.ت' : 'DT'}`,
      num: (n) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Number(n) || 0),
      // message d'erreur : traduction du code si elle existe, sinon le message du serveur
      error: (err) => (err?.code && dict[`err.${err.code}`]) || err?.message || dict['err.ERROR'],
    };
  }, [lang, meta]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
