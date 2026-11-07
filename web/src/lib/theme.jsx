import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Thème : sombre par défaut (salles peu éclairées), clair ou « comme le système »
const THEME_KEY = 'kammel_theme';
export const THEMES = ['dark', 'light', 'system'];
const ThemeContext = createContext(null);

function saved() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEMES.includes(v) ? v : 'dark';
  } catch {
    return 'dark';
  }
}

function resolve(pref) {
  if (pref !== 'system') return pref;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }) {
  const [pref, setPrefState] = useState(saved);
  const [resolved, setResolved] = useState(() => resolve(saved()));

  useEffect(() => {
    const apply = () => {
      const r = resolve(pref);
      setResolved(r);
      document.documentElement.dataset.theme = r;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', r === 'light' ? '#F7F5F1' : '#0B0D10');
    };
    apply();
    if (pref !== 'system' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);

  const setTheme = useCallback((next) => {
    if (!THEMES.includes(next)) return;
    setPrefState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ theme: pref, resolved, setTheme }), [pref, resolved, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
