import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { usePresence } from './presence';

type ShowToast = (message: string) => void;

const ToastCtx = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
  return useContext(ToastCtx);
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  const presence = usePresence(toast);
  const timer = useRef(0);

  const show = useCallback<ShowToast>(message => {
    window.clearTimeout(timer.current);
    setToast(message);
    timer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {presence.shown && (
        <div
          key={presence.shown}
          className={`toast${presence.exiting ? ' toast--out' : ''}`}
          role="status"
        >
          {presence.shown}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
