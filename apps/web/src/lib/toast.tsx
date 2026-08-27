import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { dur } from '../motion/tokens.ts';

type ShowToast = (message: string) => void;

const ToastCtx = createContext<ShowToast>(() => {});

/**
 * How long the slip takes to leave. Carried over from the hand-rolled presence
 * hook this host used to keep the last message mounted with.
 */
const TOAST_OUT_S = 0.28;

const EASE = [0.4, 0, 0.2, 1] as const;

export function useToast(): ShowToast {
  return useContext(ToastCtx);
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef(0);
  const reduce = !!useReducedMotion();

  const show = useCallback<ShowToast>(message => {
    window.clearTimeout(timer.current);
    setToast(message);
    timer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {/* `mode="wait"`: the slip is fixed to one spot, so a second message
          arriving before the first has left would print over it. */}
      <AnimatePresence mode="wait">
        {toast && (
          <motion.div
            key={toast}
            className="toast"
            role="status"
            initial={{ opacity: 0, y: reduce ? 0 : 6 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: reduce ? 0.12 : dur.fade, ease: EASE }
            }}
            exit={{
              opacity: 0,
              y: reduce ? 0 : 8,
              transition: { duration: reduce ? 0.12 : TOAST_OUT_S, ease: EASE }
            }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </ToastCtx.Provider>
  );
}
