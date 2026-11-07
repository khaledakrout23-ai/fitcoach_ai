import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Charge des données de l'API avec chargement, erreur et rechargement.
 * const { data, loading, error, reload, setData } = useLoad(() => api.get('/x'), [dep])
 */
export function useLoad(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(() => loaderRef.current())
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((error) => alive && setState((s) => ({ data: s.data, loading: false, error })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((x) => x + 1), []);
  const setData = useCallback((data) => setState((s) => ({ ...s, data: typeof data === 'function' ? data(s.data) : data })), []);
  return { ...state, reload, setData };
}

/** true si le navigateur a du réseau */
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Appelle fn toutes les ms millisecondes (null = arrêt) ; s'arrête quand l'onglet est caché */
export function useInterval(fn, ms) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (ms == null) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState !== 'hidden') ref.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms]);
}

/** Heure courante, mise à jour toutes les ms millisecondes */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), ms);
  return now;
}

/** Valeur retardée (recherche pendant la frappe) */
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Valeur gardée dans le stockage local (préférences de confort seulement, jamais de données sensibles) */
export function useStoredState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* stockage indisponible */
    }
  }, [key, value]);
  return [value, setValue];
}

/** Date locale AAAA-MM-JJ (la conversion en UTC décalerait d'un jour) */
export function localDate(d = new Date()) {
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 0 = lundi … 6 = dimanche */
export function weekdayIndex(d = new Date()) {
  return (d.getDay() + 6) % 7;
}
