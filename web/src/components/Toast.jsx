import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Icon from './Icon';

const ToastContext = createContext(null);

/**
 * toast('Objectif enregistré') · toast({ text, icon, action: { label, onClick }, tone: 'dark'|'error', duration })
 */
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => setItems((list) => list.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (input) => {
      const opts = typeof input === 'string' ? { text: input } : input;
      const id = (seq.current += 1);
      setItems((list) => [...list.slice(-2), { id, ...opts }]);
      setTimeout(() => dismiss(id), opts.duration || (opts.action ? 5000 : 3200));
      return id;
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {items.map((it) => (
          <div key={it.id} className={`toast ${it.tone || ''}`} role={it.tone === 'error' ? 'alert' : 'status'}>
            {it.icon ? <Icon name={it.icon} size={20} /> : null}
            <span className="grow">{it.text}</span>
            {it.action ? (
              <button
                type="button"
                onClick={() => {
                  it.action.onClick();
                  dismiss(it.id);
                }}
              >
                {it.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
